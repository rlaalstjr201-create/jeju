// S1' 데이터 (plans/tomorrow-picker.md "전 항목 검수", ADR-0028) — spots.json 자체와, build-spots.mjs가
// review/input 대비 완전성을 지켰는지를 검사한다. 옛 S1(총 400개 이상 등)은 275곳 실패로 S1'가 대체했다.
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cardTextProblem, PRICE_HOURS } from '../src/card-text';
import { cleanReason, createSpotSource, normalizeSpots } from '../src/data';
import { kakaoUrl, naverSearchUrl } from '../src/links';
import { distanceKm } from '../src/pick';
import { applyCorrections, loadCorrections } from '../scripts/apply-corrections.mjs';
import { applyIndoor, indoorOf, loadIndoorCalls } from '../scripts/indoor.mjs';
import { applyNewSub, loadCategories, loadNewSubCalls, newSub } from '../scripts/new-sub.mjs';
import { applyMarketDays, loadMarketDays, loadMarketVerdicts } from '../scripts/markets.mjs';
import { fileSpots } from './fixtures';

const root = resolve(__dirname, '..');
const FIELDS = ['bookable', 'id', 'image', 'indoor', 'kakaoPlaceId', 'lat', 'lng', 'mood', 'name', 'reason', 'score'];
const FOOD_FIELDS = [...FIELDS, 'sub'];
const DAY_WORDS = /월요일|화요일|수요일|목요일|금요일|토요일|일요일|매주|정기휴무/;

describe("S1' 레코드 형식", () => {
  it('every record has exactly the 11 fields (food, new: +sub; 오일장: +market; 체험: +book or +hide, ADR-0074), coords in Jeju, https image, mood ∈ {rest,walk,new,food}', () => {
    const bad = fileSpots.filter((s) => {
      const expectedFields = [
        ...(s.mood === 'food' || s.mood === 'new' ? FOOD_FIELDS : FIELDS),
        ...('market' in s ? ['market'] : []),
        ...('book' in s ? ['book'] : []),
        ...('hide' in s ? ['hide'] : []),
      ];
      return (
        Object.keys(s).sort().join() !== [...expectedFields].sort().join() ||
        !(s.lat >= 33.1 && s.lat <= 33.6 && s.lng >= 126.1 && s.lng <= 127.0) ||
        !s.image.startsWith('https://') ||
        !['rest', 'walk', 'new', 'food'].includes(s.mood) ||
        typeof s.bookable !== 'boolean' ||
        (s.kakaoPlaceId !== null && typeof s.kakaoPlaceId !== 'string')
      );
    });
    expect(bad.map((s) => s.id)).toEqual([]);
  });

  it('만족도 점수 (ADR-0060): all 2,964 have an integer score 1–5, the one in review/score/score-NN.json (or a fact-check correction)', () => {
    expect(fileSpots).toHaveLength(2964);
    const bad = fileSpots.filter((s) => !Number.isInteger(s.score) || s.score < 1 || s.score > 5);
    expect(bad.map((s) => s.id)).toEqual([]);
    const recorded = new Map<string, number>();
    for (const f of readdirSync(resolve(root, 'review/score')).filter((f) => /^score-\d{2}\.json$/.test(f)).sort()) {
      for (const v of JSON.parse(readFileSync(resolve(root, 'review/score', f), 'utf8')) as { id: string; score: number }[]) recorded.set(v.id, v.score);
    }
    for (const c of loadCorrections()) if (typeof c.fields.score === 'number') recorded.set(c.id, c.fields.score);
    expect(fileSpots.filter((s) => recorded.get(s.id) !== s.score).map((s) => s.id)).toEqual([]);
  });

  it('a malformed 오일장 rule is dropped at load (the place stays, without 장날); a valid one is kept (ADR-0066)', () => {
    const m = fileSpots.find((s) => s.market)!;
    const [ok, noLabel, badDays] = normalizeSpots([m, { ...m, id: 'x', market: { days: [2] } }, { ...m, id: 'y', market: { days: ['2'], label: '2·7일' } }]);
    expect(ok.market).toEqual(m.market);
    expect(ok).toBe(m);
    expect('market' in noLabel).toBe(false);
    expect('market' in badDays).toBe(false);
  });

  it('a record whose score is missing or out of range loads as 3 (모르면 3); a valid one is kept', () => {
    const base = fileSpots[0];
    const [kept, missing, wrong] = normalizeSpots([base, { ...base, id: 'x', score: undefined }, { ...base, id: 'y', score: 9 }]);
    expect(kept.score).toBe(base.score);
    expect(missing.score).toBe(3);
    expect(wrong.score).toBe(3);
  });

  it("food spots all have sub ∈ {meal, cafe}; rest·walk spots have no sub field", () => {
    const badFood = fileSpots.filter((s) => s.mood === 'food' && s.sub !== 'meal' && s.sub !== 'cafe');
    expect(badFood.map((s) => s.id)).toEqual([]);
    const badNonFood = fileSpots.filter((s) => (s.mood === 'rest' || s.mood === 'walk') && 'sub' in s);
    expect(badNonFood.map((s) => s.id)).toEqual([]);
    expect(fileSpots.some((s) => s.sub === 'meal')).toBe(true);
    expect(fileSpots.some((s) => s.sub === 'cafe')).toBe(true);
  });

  it('N1 (ADR-0064): all 517 새로운 거 spots have sub sight|do — experience → do, sightseeing·cultural_space·shopping(오일장, ADR-0066) → sight, cafe·restaurant as review/copy/new-sub.json', () => {
    const news = fileSpots.filter((s) => s.mood === 'new');
    expect(news).toHaveLength(517);
    expect(news.filter((s) => s.sub !== 'sight' && s.sub !== 'do').map((s) => s.id)).toEqual([]);
    const categories = loadCategories();
    const calls = loadNewSubCalls();
    // 46 cafe·restaurant calls + 9 experience places with no operator moved to 구경 (ADR-0074)
    expect(calls.size).toBe(55);
    const expected = (id: string) => {
      const c = categories.get(id);
      return calls.get(id) ?? (c === 'experience' ? 'do' : c === 'sightseeing' || c === 'cultural_space' || c === 'shopping' ? 'sight' : undefined);
    };
    expect(news.filter((s) => s.sub !== expected(s.id)).map((s) => s.id)).toEqual([]);
    // every cafe·restaurant new spot has a recorded call (with its basis); the other calls are the 9 moves
    const handCalled = news.filter((s) => !['experience', 'sightseeing', 'cultural_space', 'shopping'].includes(categories.get(s.id)!));
    expect(handCalled.map((s) => s.id).filter((id) => !calls.has(id))).toEqual([]);
    const moved = [...calls.keys()].filter((id) => categories.get(id) === 'experience');
    expect(moved).toHaveLength(9);
    expect(moved.every((id) => calls.get(id) === 'sight')).toBe(true);
    expect(handCalled.length + moved.length).toBe(calls.size);
    const raw = JSON.parse(readFileSync(resolve(root, 'review/copy/new-sub.json'), 'utf8')) as { basis: string }[];
    expect(raw.filter((v) => !v.basis?.trim())).toEqual([]);
    expect(news.some((s) => s.sub === 'sight') && news.some((s) => s.sub === 'do')).toBe(true);
  });

  it('N1: the new-sub rule is idempotent on the shipped file, build-spots.mjs applies it, and an unknown case stops it', () => {
    expect(JSON.stringify(applyNewSub(fileSpots))).toBe(readFileSync(resolve(root, 'public/spots.json'), 'utf8'));
    expect(readFileSync(resolve(root, 'scripts/build-spots.mjs'), 'utf8')).toMatch(/if \(v\.mood === 'new'\) spot\.sub = newSub\(/);
    expect(() => newSub('x', 'cafe', new Map())).toThrow(/no sub/);
    expect(newSub('x', 'experience', new Map())).toBe('do');
    expect(newSub('x', 'experience', new Map([['x', 'sight']]))).toBe('sight');
    expect(newSub('x', 'cultural_space', new Map())).toBe('sight');
    expect(newSub('x', 'shopping', new Map())).toBe('sight');
  });

  it('I1 (ADR-0065): all 2,964 spots have indoor true|false — cafe·restaurant indoor unless review/copy/indoor.json says otherwise, every other place by a recorded call', () => {
    expect(fileSpots.filter((s) => typeof s.indoor !== 'boolean').map((s) => s.id)).toEqual([]);
    const categories = loadCategories();
    const calls = loadIndoorCalls();
    const expected = (id: string) => calls.get(id) ?? (categories.get(id) === 'cafe' || categories.get(id) === 'restaurant');
    expect(fileSpots.filter((s) => s.indoor !== expected(s.id)).map((s) => s.id)).toEqual([]);
    // every sightseeing·experience·cultural_space spot has its own call, and each call has a basis from the source
    const unCalled = fileSpots.filter((s) => !['cafe', 'restaurant'].includes(categories.get(s.id)!) && !calls.has(s.id));
    expect(unCalled.map((s) => s.id)).toEqual([]);
    const raw = JSON.parse(readFileSync(resolve(root, 'review/copy/indoor.json'), 'utf8')) as { id: string; indoor: unknown; basis: string }[];
    expect(raw.filter((v) => typeof v.indoor !== 'boolean' || !v.basis?.trim())).toEqual([]);
    expect(raw.every((v) => fileSpots.some((s) => s.id === v.id))).toBe(true);
    expect(fileSpots.filter((s) => s.indoor)).toHaveLength(2080);
    expect(fileSpots.filter((s) => !s.indoor)).toHaveLength(884);
  });

  it('I1: the indoor rule is idempotent on the shipped file, build-spots.mjs applies it, and an uncalled place stops it', () => {
    expect(JSON.stringify(applyIndoor(fileSpots))).toBe(readFileSync(resolve(root, 'public/spots.json'), 'utf8'));
    expect(readFileSync(resolve(root, 'scripts/build-spots.mjs'), 'utf8')).toMatch(/kept = applyIndoor\(kept/);
    expect(() => indoorOf('x', 'sightseeing', new Map())).toThrow(/no indoor call/);
    expect(indoorOf('x', 'cafe', new Map())).toBe(true);
    expect(indoorOf('x', 'restaurant', new Map([['x', false]]))).toBe(false);
    expect(indoorOf('x', 'experience', new Map([['x', true]]))).toBe(true);
  });

  it("reason is 15~70 chars and has no price/hours/weekday/rating wording (S1')", () => {
    const bad = fileSpots.filter((s) => {
      const n = [...s.reason].length;
      return n < 15 || n > 70 || PRICE_HOURS.test(s.reason) || DAY_WORDS.test(s.reason) || cardTextProblem(s) !== null;
    });
    expect(bad.map((s) => s.id)).toEqual([]);
  });

  it('id is unique; kakaoPlaceId is unique among non-null values', () => {
    expect(new Set(fileSpots.map((s) => s.id)).size).toBe(fileSpots.length);
    const withKakao = fileSpots.map((s) => s.kakaoPlaceId).filter((k): k is string => k !== null);
    expect(new Set(withKakao).size).toBe(withKakao.length);
  });

  it('bookable is true iff the source item was category=experience', () => {
    // Cross-check against review/input: bookable can only be true for ids whose input category is 'experience'.
    const expByInput = new Map<string, boolean>();
    for (const f of readdirSync(resolve(root, 'review/input')).filter((f) => /^batch-\d{3}\.json$/.test(f))) {
      for (const item of JSON.parse(readFileSync(resolve(root, 'review/input', f), 'utf8'))) {
        expByInput.set(item.id, item.category === 'experience');
      }
    }
    const bad = fileSpots.filter((s) => expByInput.get(s.id) !== s.bookable);
    expect(bad.map((s) => s.id)).toEqual([]);
  });

  it('the two faithfulness-audit ids are excluded', () => {
    for (const id of ['441cd149-a579-40bf-b83c-49701ee287a4', '0d356242-13ce-4c6c-9b9b-3a69888a4cf5']) {
      expect(fileSpots.find((s) => s.id === id)).toBeUndefined();
    }
  });
});

describe('M1 오일장 (ADR-0066, specs/market-days.md)', () => {
  const markets = fileSpots.filter((s) => 'market' in s);
  const doc = JSON.parse(readFileSync(resolve(root, 'review/copy/market-days.json'), 'utf8')) as {
    accessed: string;
    markets: { id: string; name: string; source: string; days: number[]; label: string; noFirstAfter31?: boolean; kakao: { url: string; status: string; distanceM: number } }[];
  };
  const input = JSON.parse(readFileSync(resolve(root, 'review/input/batch-900.json'), 'utf8')) as { id: string; category: string; source: string }[];

  it('9 markets ship, all 새로운 거 · 구경, outdoor, not bookable, scored, from the VisitJeju shopping batch', () => {
    expect(markets.map((s) => s.name).sort()).toEqual(
      ['고성오일시장', '대정오일시장', '서귀포향토오일시장', '세화해녀민속오일시장', '제주민속오일시장', '중문향토오일시장', '표선오일시장', '한림민속오일시장', '함덕민속오일시장'].sort(),
    );
    expect(markets.map((s) => s.id).sort()).toEqual(input.map((i) => i.id).sort());
    for (const s of markets) {
      expect([s.mood, s.sub, s.indoor, s.bookable], s.name).toEqual(['new', 'sight', false, false]);
      expect(s.score, s.name).toBeGreaterThanOrEqual(1);
    }
    expect(input.every((i) => i.category === 'shopping' && i.source.startsWith('https://www.visitjeju.net/kr/detail/view?contentsid='))).toBe(true);
  });

  it('each market carries the rule in review/copy/market-days.json, with its VisitJeju URL, access date and Kakao check', () => {
    expect(doc.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(doc.markets).toHaveLength(9);
    for (const m of doc.markets) {
      const s = markets.find((x) => x.id === m.id)!;
      expect(s.market, m.name).toEqual({ days: m.days, label: m.label, ...(m.noFirstAfter31 ? { noFirstAfter31: true } : {}) });
      expect(m.source).toBe(input.find((i) => i.id === m.id)!.source);
      expect(m.kakao.url).toBe(`https://place.map.kakao.com/${s.kakaoPlaceId}`);
      expect(m.kakao.status).toBe('Y');
      expect(m.kakao.distanceM).toBeLessThan(150);
      expect(m.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 31)).toBe(true);
    }
    // only 대정 has the 31st exception
    expect(doc.markets.filter((m) => m.noFirstAfter31).map((m) => m.name)).toEqual(['대정오일시장']);
  });

  it('the market rule is idempotent on the shipped file, build-spots.mjs applies it, and a missing or unshipped rule stops it', () => {
    expect(JSON.stringify(applyMarketDays(fileSpots))).toBe(readFileSync(resolve(root, 'public/spots.json'), 'utf8'));
    expect(readFileSync(resolve(root, 'scripts/build-spots.mjs'), 'utf8')).toMatch(/kept = applyMarketDays\(kept/);
    const rules = loadMarketDays();
    const market = markets[0];
    expect(() => applyMarketDays(fileSpots, new Map([...rules].filter(([id]) => id !== market.id)))).toThrow(/no market-days rule/);
    expect(() => applyMarketDays(fileSpots.filter((s) => s.id !== market.id), rules)).toThrow(/not shipped/);
  });
});

describe("S1' 완전성 (review/input 대비)", () => {
  const inputIds = new Set<string>();
  for (const f of readdirSync(resolve(root, 'review/input')).filter((f) => /^batch-\d{3}\.json$/.test(f))) {
    for (const item of JSON.parse(readFileSync(resolve(root, 'review/input', f), 'utf8'))) inputIds.add(item.id);
  }

  it('every kept spot exists as a prefilter-passing input item', () => {
    expect(fileSpots.every((s) => inputIds.has(s.id))).toBe(true);
    expect(inputIds.size).toBeGreaterThan(0);
  });

  // review/out (the verdicts) is not committed: on a clean checkout only this check is skipped.
  it.skipIf(!existsSync(resolve(root, 'review/out')))('every prefilter-passing input item has a verdict (batch or adj) — 0 missing (plan S1\' 100% coverage)', () => {
    // Same merge order as build-spots.mjs: batch verdicts first, then adj overrides by id.
    const verdictIds = new Set<string>();
    for (const f of readdirSync(resolve(root, 'review/out')).filter((f) => /^batch-\d{3}\.json$/.test(f)).sort()) {
      for (const v of JSON.parse(readFileSync(resolve(root, 'review/out', f), 'utf8'))) verdictIds.add(v.id);
    }
    for (const f of readdirSync(resolve(root, 'review/out')).filter((f) => /^adj-\d{3}\.json$/.test(f)).sort()) {
      for (const v of JSON.parse(readFileSync(resolve(root, 'review/out', f), 'utf8'))) verdictIds.add(v.id);
    }
    for (const v of loadMarketVerdicts()) verdictIds.add(v.id); // 오일장 (ADR-0066): their verdicts are committed
    const missing = [...inputIds].filter((id) => !verdictIds.has(id)).sort();
    expect(missing).toEqual([]);
  });
});

describe("S1' 기분별 분포", () => {
  const count = (mood: string) => fileSpots.filter((s) => s.mood === mood).length;
  it.each(['rest', 'walk', 'new', 'food'])('%s has at least one spot', (mood) => {
    expect(count(mood)).toBeGreaterThan(0);
  });
  it('food (맛집) is included, per ADR-0028', () => {
    expect(count('food')).toBeGreaterThan(0);
  });
});

describe('spots.json size', () => {
  it('gzip size is reported (no hard cap in S1\' — dataset intentionally grew from ~275 to full review)', () => {
    const kb = gzipSync(readFileSync(resolve(root, 'public/spots.json'))).length / 1024;
    expect(kb).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(`spots.json gzip: ${kb.toFixed(1)} KB`);
  });
});

describe('S32 이름 공백', () => {
  it('no shipped name has leading/trailing or repeated whitespace (tabs, U+3000)', () => {
    const bad = fileSpots.filter((s) => s.name !== s.name.trim() || /\s{2,}|[\t\u3000]/.test(s.name));
    expect(bad.map((s) => JSON.stringify(s.name))).toEqual([]);
  });

  it('the app cleans names on load too, and map/booking URLs never carry encoded whitespace at the ends', () => {
    const raw = [{ ...fileSpots[0], name: '아일랜드 터프팅\t\t\t', kakaoPlaceId: null }, { ...fileSpots[1], name: ' 뚱보조개\u3000' }];
    const [a, b] = normalizeSpots(raw);
    expect(a.name).toBe('아일랜드 터프팅');
    expect(b.name).toBe('뚱보조개');
    for (const url of [kakaoUrl(raw[0]), naverSearchUrl(raw[0]), naverSearchUrl(raw[1])]) {
      expect(url).not.toMatch(/(%09|%20|%E3%80%80)+($|&)/);
      expect(url).not.toMatch(/=(%20|%09)/);
    }
  });

  it('records the app cannot render are dropped, the rest kept (only the reason gets its full stop)', () => {
    const good = fileSpots.find((s) => s.mood !== 'food')!;
    // x3: a food spot without its 식사/카페 sub can't be placed under either tab
    const out = normalizeSpots([good, { ...good, id: 'x1', lat: 'n/a' }, { ...good, id: 'x2', mood: 'swim' }, null, { ...good, id: 'x3', mood: 'food' }]);
    expect(out).toEqual([{ ...good, reason: cleanReason(good.reason) }]);
    expect(() => normalizeSpots({})).toThrow();
  });
});

describe('이유 문장 마침표 (design/SPEC.md §10·§12.4)', () => {
  it('no final full stop whatever the ending (3판); 돈까스 → 돈가스; whitespace is cleaned', () => {
    // 3판: no full stop after 요 either (was: "…둘러봐요.")
    expect(cleanReason('카페와 아트샵을 한 공간에서 둘러봐요')).toBe('카페와 아트샵을 한 공간에서 둘러봐요');
    expect(cleanReason('카페와 아트샵을 한 공간에서 둘러봐요..')).toBe('카페와 아트샵을 한 공간에서 둘러봐요');
    expect(cleanReason('겉은 바삭한 돈까스')).toBe('겉은 바삭한 돈가스');
    expect(cleanReason('  봄마다 벚꽃 축제가 열리는  길. ')).toBe('봄마다 벚꽃 축제가 열리는 길');
    expect(cleanReason('애월 하가리의 전망 좋은 카페')).toBe('애월 하가리의 전망 좋은 카페');
  });

  it('every shipped reason, as drawn, follows the rule (3판: no final full stop, as the build ships it)', () => {
    for (const s of normalizeSpots(fileSpots)) expect(s.reason, s.reason).not.toMatch(/[.。]$/);
  });
});

describe('3판 이유 문장 — 빌드 규칙 (design/SPEC.md §10·§12.4, 0.3 #16)', () => {
  it('shipReason: no final full stop whatever the ending, 돈까스 → 돈가스, whitespace cleaned, idempotent', async () => {
    const { shipReason } = await import('../scripts/reason.mjs');
    expect(shipReason('돌담과 귤밭 사이에서 크로플을 먹어요.')).toBe('돌담과 귤밭 사이에서 크로플을 먹어요');
    expect(shipReason('  봄마다 벚꽃 축제가 열리는  길 . ')).toBe('봄마다 벚꽃 축제가 열리는 길');
    expect(shipReason('수제 돈까스와 우동집이에요。')).toBe('수제 돈가스와 우동집이에요');
    expect(shipReason('약 17.5km 이어지는 올레길')).toBe('약 17.5km 이어지는 올레길');
    for (const s of fileSpots) expect(shipReason(s.reason), s.id).toBe(s.reason);
  });

  it('the build uses it and refuses a two-sentence reason', async () => {
    const build = readFileSync(resolve(root, 'scripts/build-spots.mjs'), 'utf8');
    expect(build).toMatch(/const bareReason = shipReason;/);
    expect(build).not.toMatch(/punctuate/);
    expect(build).toMatch(/reasonPunctuationProblem\(s\.reason\)/);
    const { reasonPunctuationProblem } = await import('../scripts/reason.mjs');
    expect(reasonPunctuationProblem('딱새우김밥과 양념새우컵밥. 포장해 가도 돼요')).toBe('full stop mid-sentence');
    expect(reasonPunctuationProblem('기념관 영상과 전시로 4.3의 역사를 기억해요')).toBeNull();
  });

  it('every shipped reason: no full stop at the end or mid-sentence, no 돈까스, no 3판 banned form', async () => {
    const { reasonPunctuationProblem } = await import('../scripts/reason.mjs');
    const { REASON_BANNED } = await import('../scripts/check-slop');
    const bad = fileSpots.filter((s) => reasonPunctuationProblem(s.reason) || /돈까스|겉바속촉|아름다운|여유를 누려요|공간이에요/.test(s.reason) || REASON_BANNED.test(s.reason));
    expect(bad.map((s) => `${s.id}: ${s.reason}`)).toEqual([]);
  });

  it('every review/copy/fix-02.json rewrite ships as written and replaces a sentence that broke the 3판 rule', async () => {
    const { REASON_BANNED } = await import('../scripts/check-slop');
    const { reasonPunctuationProblem, shipReason } = await import('../scripts/reason.mjs');
    const fix = JSON.parse(readFileSync(resolve(root, 'review/copy/fix-02.json'), 'utf8')) as { id: string; reason: string; was: string }[];
    const byId = new Map(fileSpots.map((s) => [s.id, s] as const));
    for (const f of fix) {
      expect(byId.get(f.id)?.reason, f.id).toBe(shipReason(f.reason));
      expect(REASON_BANNED.test(f.was) || reasonPunctuationProblem(shipReason(f.was)) !== null, f.was).toBe(true);
    }
  });

  it('every review/copy/fix-03.json rewrite (S9-3 audit borderline + 할망밥상 branches) ships as written and differs from what it replaced', async () => {
    const { REASON_BANNED } = await import('../scripts/check-slop');
    const { reasonPunctuationProblem, shipReason } = await import('../scripts/reason.mjs');
    const fix = JSON.parse(readFileSync(resolve(root, 'review/copy/fix-03.json'), 'utf8')) as { id: string; reason: string; was: string; basis: string }[];
    expect(fix).toHaveLength(7);
    const byId = new Map(fileSpots.map((s) => [s.id, s] as const));
    for (const f of fix) {
      expect(byId.get(f.id)?.reason, f.id).toBe(shipReason(f.reason));
      expect(shipReason(f.was), f.id).not.toBe(shipReason(f.reason));
      expect(REASON_BANNED.test(f.reason) || reasonPunctuationProblem(shipReason(f.reason)) !== null, f.reason).toBe(false);
      expect(f.basis.length, f.id).toBeGreaterThan(0);
    }
  });
});

describe('팩트체크 수정 (ADR-0063 5, review/copy/corrections-NN.json, review/audit/factcheck-01.md)', () => {
  const corrections = loadCorrections();
  const byId = new Map(fileSpots.map((s) => [s.id, s] as const));

  it('every correction is applied: removed ids are gone, set fields ship as recorded', () => {
    expect(corrections.length).toBeGreaterThan(0);
    for (const c of corrections) {
      if (c.action === 'remove') expect(byId.has(c.id), c.id).toBe(false);
      else expect(byId.get(c.id), c.id).toMatchObject(c.fields);
      expect(c.reason.length, c.id).toBeGreaterThan(0);
      expect(c.evidence, c.id).toMatch(/^https:\/\//);
    }
  });

  it('corrections-01: 4 removed (제주오누이·이중섭미술관·대향연탄구이·함덕백사장 & 서우봉), 박물관은 살아있다 renamed 3, 한림바다체험마을 placeId', () => {
    for (const id of ['5c45ab11-a6e8-467e-875e-476249a75af8', 'a18eacff-7684-4936-aa11-a778dda648c4', 'bacecf0d-3a2c-4168-9135-51e1895df54f', '1444066b-5005-482b-9ee3-26601b74c664']) {
      expect(byId.has(id), id).toBe(false);
    }
    expect(byId.get('7896e435-5d0d-444e-a815-eb1622f4ab55')).toMatchObject({ name: '박물관은 살아있다', score: 3 });
    expect(byId.get('e90d95bc-3a57-4d72-b0b5-3e212c97f378')?.kakaoPlaceId).toBe('688113173');
  });

  it('applying them again changes nothing (idempotent); 2,959 shipped before, minus the removals, plus the 9 오일장 (ADR-0066)', () => {
    expect(applyCorrections(fileSpots, corrections)).toEqual(fileSpots);
    expect(fileSpots).toHaveLength(2959 - corrections.filter((c) => c.action === 'remove').length + 9);
  });
});

describe('S24 목록 로드 — 실패는 기억하지 않는다 (audit MAJOR)', () => {
  it('a failed load is retried on the next get(); success is memoized', async () => {
    let calls = 0;
    const src = createSpotSource(() => (++calls === 1 ? Promise.reject(new Error('503')) : Promise.resolve(fileSpots.slice(0, 3))));
    await expect(src.get()).rejects.toThrow('503');
    expect(src.peek()).toBeNull();
    await expect(src.get()).resolves.toHaveLength(3);
    await src.get();
    expect(calls).toBe(2);
    src.dispose();
  });

  it('concurrent callers share one request', async () => {
    let calls = 0;
    const src = createSpotSource(() => {
      calls++;
      return Promise.resolve(fileSpots.slice(0, 1));
    });
    await Promise.all([src.get(), src.get(), src.get()]);
    expect(calls).toBe(1);
  });

  it('a hanging request times out (then can be retried)', async () => {
    let calls = 0;
    const src = createSpotSource(() => (++calls === 1 ? new Promise(() => undefined) : Promise.resolve(fileSpots.slice(0, 1))), 20);
    await expect(src.get()).rejects.toThrow('timeout');
    await expect(src.get()).resolves.toHaveLength(1);
  });

  describe('QA 2026-09-30 — a download that outlives its timeout is kept (weak rural network)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });
    const after = <T,>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));

    it('the wait times out at 20ms, the copy landing at 60ms is memoized and reported; no second download', async () => {
      vi.useFakeTimers();
      let calls = 0;
      const onLoad = vi.fn();
      const src = createSpotSource(() => (calls++, after(60, fileSpots.slice(0, 2))), 20, onLoad);
      const first = src.get();
      first.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(20);
      await expect(first).rejects.toThrow('timeout');
      expect(src.peek()).toBeNull();
      await vi.advanceTimersByTimeAsync(60);
      expect(src.peek()).toHaveLength(2);
      expect(onLoad).toHaveBeenCalledTimes(1);
      await expect(src.get()).resolves.toHaveLength(2);
      expect(calls).toBe(1);
    });

    it('a retry after the timeout gets whichever download lands first — the slow first one, though its own hangs', async () => {
      vi.useFakeTimers();
      let calls = 0;
      const src = createSpotSource(() => (++calls === 1 ? after(60, fileSpots.slice(0, 3)) : new Promise(() => undefined)), 50);
      const first = src.get();
      first.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(50);
      await expect(first).rejects.toThrow('timeout');
      const retry = src.get(); // 다시 불러오기
      await vi.advanceTimersByTimeAsync(10);
      expect(calls).toBe(2); // a hung request is never the only hope
      await expect(retry).resolves.toHaveLength(3);
    });

    it('nothing is reported after dispose (an unmounted app)', async () => {
      vi.useFakeTimers();
      const onLoad = vi.fn();
      const src = createSpotSource(() => after(60, fileSpots.slice(0, 1)), 20, onLoad);
      src.get().catch(() => undefined);
      src.dispose();
      await vi.advanceTimersByTimeAsync(100);
      expect(onLoad).not.toHaveBeenCalled();
    });
  });

  describe('design.md M2 — the data wait gives up at 10s, not 15s (Nielsen 10s limit)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('the app passes 10000ms', async () => {
      const { DELAYS } = await import('../src/app');
      expect(DELAYS.dataTimeout).toBe(10_000);
    });

    it('the default wait is 10s: still waiting at 9999ms, timed out at 10000ms; a copy landing at 12s is still kept', async () => {
      vi.useFakeTimers();
      const onLoad = vi.fn();
      const src = createSpotSource(() => new Promise((r) => setTimeout(() => r(fileSpots.slice(0, 2)), 12_000)), undefined, onLoad);
      let settled = false;
      const first = src.get();
      first.then(
        () => (settled = true),
        () => (settled = true),
      );
      await vi.advanceTimersByTimeAsync(9_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(first).rejects.toThrow('timeout');
      await vi.advanceTimersByTimeAsync(2_000);
      expect(onLoad).toHaveBeenCalledTimes(1);
      expect(src.peek()).toHaveLength(2);
      src.dispose();
    });
  });
});

describe('QA 2026-09-30 중복 — 한 곳이 두 번 나가지 않는다', () => {
  it('each place listed twice ships once: the left-out record is gone, the kept one ships (물질식육식당, not 몰질식육식당)', async () => {
    const { DUPLICATES } = await import('../scripts/duplicates.mjs');
    const ids = new Set(fileSpots.map((s) => s.id));
    expect(DUPLICATES.size).toBeGreaterThan(0);
    for (const [gone, { keep }] of DUPLICATES) {
      expect(ids.has(gone), gone).toBe(false);
      expect(ids.has(keep), keep).toBe(true);
    }
    expect(fileSpots.filter((s) => /[물몰]질식육식당/.test(s.name)).map((s) => s.name)).toEqual(['물질식육식당']);
  });

  it('no two shipped spots share a name within 500 m (the same place imported twice)', () => {
    const byName = new Map<string, typeof fileSpots>();
    for (const s of fileSpots) {
      const k = s.name.replace(/\s+/g, '');
      byName.set(k, [...(byName.get(k) ?? []), s]);
    }
    const near: string[] = [];
    for (const [name, group] of byName) {
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) if (distanceKm(group[i], group[j]) < 0.5) near.push(name);
    }
    expect(near).toEqual([]);
  });

  it('the build applies the rule, and the rule never drops both copies of a place', async () => {
    const { DUPLICATES, dropDuplicates } = await import('../scripts/duplicates.mjs');
    expect(readFileSync(resolve(root, 'scripts/build-spots.mjs'), 'utf8')).toMatch(/dropDuplicates\(kept\)/);
    const [gone, { keep }] = [...DUPLICATES][0];
    expect(dropDuplicates([{ id: gone }, { id: keep }, { id: 'x' }]).map((s) => s.id)).toEqual([keep, 'x']);
    expect(() => dropDuplicates([{ id: gone }, { id: 'x' }])).toThrow(keep);
  });
});

describe('S60 이유 문장 어미 (S9-3 파이프라인 몫, design/SPEC.md §10)', () => {
  // The reason sentences are rewritten by the S9-3 pipeline (model rewrite + faithfulness audit), not by
  // app code. Baseline 77.2% end in "~수 있어요"; the S9-3 gate is ≤20%. The "no ending above 25%"
  // metric was dropped (ADR-0058).
  // Classifier: strip trailing space/punctuation, match the common 해요체 endings first (longest — "수
  // 있어요" — before its own suffix "있어요"), else bucket by the reason's last syllable (mostly noun
  // endings: "~집", "~카페", "~길" …).
  const ENDING = /(수 있어요|있어요|이에요|예요|해요|좋아요|어요|아요|네요|죠)$/;
  function ending(reason: string): string {
    const bare = reason.trim().replace(/[.。]+$/, '');
    return bare.match(ENDING)?.[1] ?? bare.slice(-1);
  }

  it('"~수 있어요" is at most 20% of all reasons', () => {
    const shares = new Map<string, number>();
    for (const s of fileSpots) shares.set(ending(s.reason), (shares.get(ending(s.reason)) ?? 0) + 1);
    const total = fileSpots.length;
    expect(total).toBeGreaterThan(0);
    const soIsseoyo = shares.get('수 있어요') ?? 0;
    expect(soIsseoyo / total).toBeLessThanOrEqual(0.2);
  });

  it('no reason carries an emoji/symbol icon, exclamation mark, or em/en dash (design/SPEC.md §9, §14 rule 2·3)', () => {
    const SYMBOLS = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2728}\u{2665}\u{2661}\u{21C4}]/u;
    const EXCLAIM_DASH = /[!—–]/;
    const bad = fileSpots.filter((s) => SYMBOLS.test(s.reason) || EXCLAIM_DASH.test(s.reason));
    expect(bad.map((s) => `${s.id}: ${s.reason}`)).toEqual([]);
  });
});

describe('QA 2026-09-30 위치 — 지오코딩 대체 좌표가 다시 나가지 않는다', () => {
  it('no spot on the city-hall fallback point; no 3+ spots on one point unless each is a Kakao place or re-checked', async () => {
    const { positionProblems, FALLBACK_POINTS } = await import('../scripts/positions.mjs');
    const geo = [
      ...JSON.parse(readFileSync(resolve(root, 'review/geo/regeocode.json'), 'utf8')),
      ...JSON.parse(readFileSync(resolve(root, 'review/geo/manual.json'), 'utf8')),
    ] as { id: string; status: string }[];
    const verified = new Set(geo.filter((g) => g.status === 'matched').map((g) => g.id));
    expect(positionProblems(fileSpots, verified)).toEqual([]);
    // the checker itself catches both cases
    const at = FALLBACK_POINTS[0];
    const fake = (id: string, lat = at.lat, lng = at.lng) => ({ id, name: id, lat, lng, kakaoPlaceId: null });
    expect(positionProblems([fake('a')])).toHaveLength(1);
    expect(positionProblems([fake('b', 33.4, 126.6), fake('c', 33.4, 126.6), fake('d', 33.4, 126.6)])).toHaveLength(1);
    expect(positionProblems([fake('b', 33.4, 126.6), fake('c', 33.4, 126.6), fake('d', 33.4, 126.6)], new Set(['b', 'c', 'd']))).toEqual([]);
  });

  it('every re-checked spot ships at its checked point; the unresolved ones are left out (확인 실패, not "없는 곳")', () => {
    const byId = new Map(fileSpots.map((s) => [s.id, s] as const));
    const geo = new Map<string, { status: string; lat?: number; lng?: number }>();
    for (const f of ['regeocode.json', 'manual.json']) for (const g of JSON.parse(readFileSync(resolve(root, 'review/geo', f), 'utf8'))) geo.set(g.id, g);
    for (const [id, g] of geo) {
      const s = byId.get(id);
      if (g.status === 'matched') expect(s && [s.lat, s.lng], id).toEqual([g.lat, g.lng]);
      else expect(s, id).toBeUndefined();
    }
  });

  it('an island place re-checked from the fallback now says it needs a boat (was "여기서 걸어서 약 5분" from the city hall)', () => {
    const 돛오름 = fileSpots.find((s) => s.name === '돛오름')!;
    expect(distanceKm(돛오름, { lat: 33.499622, lng: 126.53119 })).toBeGreaterThan(20);
    expect(distanceKm(돛오름, { lat: 33.4811, lng: 126.8015 })).toBeLessThan(0.2); // 돝오름, by 비자림
  });
});

describe('QA 2026-09-30 이유 문장 — §10 금지 어형 0건', () => {
  it('no "~하기 좋아요 / ~하기 좋은", 인생샷, 힐링, 다양한, 특별한 … in any shipped reason', async () => {
    const { REASON_BANNED } = await import('../scripts/check-slop');
    const bad = fileSpots.filter((s) => REASON_BANNED.test(s.reason)).map((s) => `${s.name}: ${s.reason}`);
    expect(bad).toEqual([]);
    // and the pattern is not so wide that plain sentences trip it
    for (const ok of ['공기 좋은 곳의 조용한 캠핑장이에요.', '반려견 카페부터 호텔까지 한곳에 있어요.']) expect(REASON_BANNED.test(ok), ok).toBe(false);
    for (const no of ['브런치 즐기기 좋아요.', '사진 찍기 좋은 카페', '인생샷 명소']) expect(REASON_BANNED.test(no), no).toBe(true);
  });
});

describe('S51 홈 화면(PWA) 실행 — 매니페스트', () => {
  it('opens standalone at the app root, within scope, with both icons present; dark splash (D6)', () => {
    const m = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'));
    expect(m.display).toBe('standalone');
    expect(new URL(m.start_url, 'https://x.test/app/').href.startsWith(new URL(m.scope, 'https://x.test/app/').href)).toBe(true);
    expect(m.name).toBe('여행계획짜기 귀찮아:제주');
    expect(m.short_name).toBe('계획귀찮아'); // under the home-screen icon: short (ADR-0068)
    expect(m.background_color).toBe('#0f1319');
    for (const i of m.icons) expect(existsSync(resolve(root, 'public', i.src)), i.src).toBe(true);
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />'); // absolute: any page address (ADR-0063)
  });
});
