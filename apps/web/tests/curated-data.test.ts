// 큐레이팅 도시 출하 파일 (강릉): review/gangwon/pop-criteria.md 6~8절, 부산 tests/busan-data.test.ts의 핵심을 도시 인자로 옮긴 것.
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardTextProblem, PRICE_HOURS } from '../src/card-text';
import { normalizeSpots } from '../src/data';
import type { Spot } from '../src/pick';
import { REASON_BANNED } from '../scripts/check-slop';
import { positionProblems } from '../scripts/positions.mjs';
import { reasonPunctuationProblem } from '../scripts/reason.mjs';
import { build, dedupe, famousCount, famousIds, inBox, kakaoIds, loadInputs, quintileScores, townOf } from '../scripts/curated/build.mjs';
import { BROAD, keywordsOf, plan, targets as popTargets } from '../scripts/curated/measure.mjs';
import { nameRule, pick, targets as kakaoTargets } from '../scripts/curated/kakao.mjs';
import { JEJU_RECORD_BOX, recordProblems } from './spot-record';

const root = resolve(__dirname, '..');
const text = readFileSync(resolve(root, 'data/gangwon/spots-gangwon.json'), 'utf8');
type Rec = Spot & { area: string };
const file = JSON.parse(text) as Rec[];
// 강릉 시험은 강릉 레코드만 본다(파일에는 속초·춘천도 있다, pop-criteria 10절)
const all = file.filter((s) => s.area === '강릉');
// 출하 레코드 11칸 형식 검사는 부산과 같은 함수(tests/spot-record.ts)로, `area`(도시 이름, 동네 나누기 전)는 따로 본다.
const spots = all.map(({ area: _area, ...s }) => s as Spot);
const GANGNEUNG_BOX = (p: { lat: number; lng: number }) => inBox('강릉', p);
const inputs = loadInputs('gangwon', ['강릉']);
const CITIES = ['강릉', '속초', '춘천', '양양', '평창'];
// 양양·평창 이름과 겹쳐 파일 전체 규칙(pop-criteria 8절 (b))으로 읍·면을 붙인 강릉·춘천 곳: 그 도시만 지으면 붙지 않는다
const RENAMED_BY_YANGYANG = new Map([['nt-125748', '남대천 (성산면)']]);
const RENAMED_BY_PYEONGCHANG = new Map([['nt-623201', '대관령황태촌 (주문로)'], ['nt-2903398', '시골식당 (헌화로)'], ['nt-135934', '메밀촌 (동면)']]);
const RENAMED_BY_OTHERS = new Map([...RENAMED_BY_YANGYANG, ...RENAMED_BY_PYEONGCHANG]);
// 이름 꼴만 다른 중복 등록(8절 (a) 이름 꼴, 배포 전 리뷰 4 m-3): 효석달빛언덕, 알펜시아리조트대관령스키역사관
const DUP_PYEONGCHANG = ['nt-3352979', 'nt-3448238'];
const item = new Map(inputs.items.map((i) => [i.id, i]));
const volume = new Map(inputs.pop.map((r) => [r.id, r.volume as number]));
const DAY_WORDS = /월요일|화요일|수요일|목요일|금요일|토요일|일요일|매주|정기휴무/;
const keep = [...inputs.verdicts.values()].filter((v) => v.keep);

describe('강릉 레코드', () => {
  it("모든 곳이 S1' 형식(제주와 같은 검사, 강릉 상자, 사진 없음은 빈 값)", () => {
    expect(recordProblems(spots, GANGNEUNG_BOX, { noPhoto: true })).toEqual([]);
    expect(spots.filter((s) => JEJU_RECORD_BOX(s))).toEqual([]);
    expect(spots.filter((s) => s.image === '').length).toBe(all.filter((s) => !item.get(s.id)!.image).length);
  });
  it('area는 도시 이름(동네 나누기 전), id는 nt-<contentid>, 겹치지 않음, kakaoPlaceId도 겹치지 않음', () => {
    expect(all.every((s) => s.area === '강릉')).toBe(true);
    expect(all.every((s) => /^nt-\d+$/.test(s.id))).toBe(true);
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    const k = all.map((s) => s.kakaoPlaceId).filter((x): x is string => x !== null);
    expect(new Set(k).size).toBe(k.length);
    expect(new Set(all.map((s) => s.name)).size).toBe(all.length);
  });
  it('keep 550곳 가운데 위치를 모르는 1곳(노인봉 TourAPI 좌표 오류)과 중복 등록 1곳만 빠진다', () => {
    expect(keep).toHaveLength(550);
    const shipped = new Set(all.map((s) => s.id));
    expect(keep.filter((v) => !shipped.has(v.id)).map((v) => v.id).sort()).toEqual(['nt-125619', 'nt-3537624']);
    expect(all.every((s) => inputs.verdicts.get(s.id)?.keep === true)).toBe(true);
    expect(all.every((s) => item.get(s.id)!.city === '강릉')).toBe(true);
  });
  it('분류는 관광지·문화시설·레포츠·음식점과 전통시장만', () => {
    const bad = all.filter((s) => {
      const it = item.get(s.id)!;
      return ![12, 14, 28, 38, 39].includes(it.contenttypeid);
    });
    expect(bad.map((s) => s.id)).toEqual([]);
  });
  it("이유 문장: 15~70자, 가격·시간·요일·평점 없음, 마침표·금지 표현 없음(S1')", () => {
    const bad = all.filter((s) => {
      const n = [...s.reason].length;
      return n < 15 || n > 70 || PRICE_HOURS.test(s.reason) || DAY_WORDS.test(s.reason) || cardTextProblem(s) !== null || reasonPunctuationProblem(s.reason) !== null || REASON_BANNED.test(s.reason);
    });
    expect(bad.map((s) => `${s.id} ${s.reason}`)).toEqual([]);
  });
  it('이름에 앞뒤·겹친 공백 없음, 이름 끝 「(강릉)」 없음, 위치가 한 점에 몰리지 않음, 앱이 그대로 읽는다', () => {
    expect(all.filter((s) => s.name !== s.name.trim() || /\s{2,}|[\t　]/.test(s.name))).toEqual([]);
    expect(all.filter((s) => /\(강릉\)$/.test(s.name))).toEqual([]);
    // 해안로 280 한 건물의 음식점 셋(같은 주소)이 한 점을 나눈다: 경성포차만 카카오 ID가 없어 확인한 곳으로 둔다
    expect(positionProblems(spots, new Set(['nt-3537135']))).toEqual([]);
    expect(normalizeSpots(spots)).toEqual(spots);
  });
  it('개요·근거 원문이 없다: 원문 칸이 없고, 개요를 40자 넘게 그대로 옮긴 이유 문장이 없다', () => {
    expect(text).not.toMatch(/"(overview|basis|confidence|addr1|placeUrl|cpyrhtDivCd)"/);
    const dir = resolve(root, 'review/gangwon/judge-강릉-01');
    const overview = new Map(
      readdirSync(dir)
        .filter((f) => /^input-\d{2}\.json$/.test(f))
        .flatMap((f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as { id: string; overview: string }[])
        .map((x) => [x.id, x.overview]),
    );
    const copied = all.filter((s) => {
      const o = overview.get(s.id) ?? '';
      const r = [...s.reason];
      return r.some((_, i) => i + 40 <= r.length && o.includes(r.slice(i, i + 40).join('')));
    });
    expect(copied.map((s) => s.id)).toEqual([]);
  });
});

describe('강릉 만족도·유명한 곳 (pop-criteria 6·7절)', () => {
  it('score: 먹기와 그 밖 따로, 검색수 순위 5등분(같은 값은 같은 점수)', () => {
    for (const food of [true, false]) {
      const group = all.filter((s) => (s.mood === 'food') === food);
      const n = group.length;
      for (const s of group) {
        const higher = group.filter((x) => volume.get(x.id)! > volume.get(s.id)!).length;
        expect(s.score, s.id).toBe(5 - Math.floor((5 * higher) / n));
      }
    }
    expect(quintileScores(new Map([['a', 9], ['b', 9], ['c', 1], ['d', 0], ['e', 0]]))).toEqual(new Map([['a', 5], ['b', 5], ['c', 3], ['d', 2], ['e', 2]]));
  });
  it('famous 개수는 round(60 × keep ÷ 995) = 33, 관광지·먹기 아님·카페 낱말 없는 곳 가운데 검색수 상위와 정확히 같다', () => {
    expect(famousCount(550)).toBe(33);
    expect(famousCount(995)).toBe(60);
    const candidates = all
      .filter((s) => item.get(s.id)!.contenttypeid === 12 && s.mood !== 'food' && !/카페|커피|빵|베이커리|디저트/.test(s.name))
      .sort((a, b) => volume.get(b.id)! - volume.get(a.id)! || (a.id < b.id ? -1 : 1));
    expect(all.filter((s) => s.famous === true).map((s) => s.id).sort()).toEqual(candidates.slice(0, 33).map((s) => s.id).sort());
    expect(volume.get(candidates[32].id)).toBeGreaterThan(volume.get(candidates[33].id)!);
    const pops = all.filter((s) => s.famous).map((s) => s.pop!);
    expect(Math.max(...pops)).toBe(1);
    expect(Math.min(...pops)).toBe(0);
    expect(famousIds(['a', 'b', 'c'], new Map([['a', 1], ['b', 5], ['c', 5]]), 2)).toEqual(['b', 'c']);
  });
});

describe('강릉 카카오 ID', () => {
  it('matched만 ID를 갖고(같은 ID를 나눠 가진 곳은 exact 한 곳만), 폐업·미일치는 null', () => {
    const rows = new Map(inputs.kakao.map((r) => [r.id, r]));
    for (const s of all) {
      if (s.kakaoPlaceId !== null) expect(rows.get(s.id)).toMatchObject({ status: 'matched', kakaoPlaceId: s.kakaoPlaceId });
      else {
        const row = rows.get(s.id)!;
        // null인 곳: 못 맞췄거나, 같은 ID를 다른 곳(중복 등록으로 빠진 곳 포함)과 나눠 가졌다
        expect(row.status !== 'matched' || inputs.kakao.filter((r) => r.kakaoPlaceId === row.kakaoPlaceId).length > 1).toBe(true);
      }
    }
    expect(all.filter((s) => s.kakaoPlaceId).length).toBeGreaterThan(400);
    const r = [
      { id: 'a', status: 'matched', rule: 'exact', kakaoPlaceId: '1' },
      { id: 'b', status: 'matched', rule: 'contains', kakaoPlaceId: '1' },
      { id: 'c', status: 'unmatched', rule: 'none', kakaoPlaceId: null },
    ];
    expect(kakaoIds(r, new Set(['a', 'b', 'c']))).toEqual(new Map([['a', '1'], ['b', null]]));
  });
  it('카카오 폐업(closed)이면 싣지 않는다', () => {
    const [first, second] = [...inputs.kakao];
    const closed = { ...inputs, kakao: [{ ...first, status: 'closed' }, ...inputs.kakao.slice(1)] };
    const out = build(closed);
    expect(out.closed).toEqual([first.id]);
    expect(out.spots.find((s) => s.id === first.id)).toBeUndefined();
    expect(second).toBeDefined();
  });
  it('이름 규칙은 도시 이름 머리말을 뗀다(강릉 경포대 = 경포대), 시설 꼬리 이름은 품기로 맞지 않는다', () => {
    expect(nameRule('강릉 경포대', '경포대', '강릉')).toBe('exact');
    expect(nameRule('경포대', '강릉시 경포대', '강릉')).toBe('exact');
    expect(nameRule('경포해변', '경포해변주차장', '강릉')).toBeNull();
    expect(nameRule('경포', '경포해변', '강릉')).toBe('contains');
    const docs = [{ id: '9', place_name: '경포대', x: '128.9', y: '37.79', category_group_code: 'AT4', place_url: 'http://place.map.kakao.com/9' }];
    expect(pick({ title: '강릉 경포대', lat: 37.79, lng: 128.9, contenttypeid: 12, mood: 'walk' }, docs, '강릉')).toMatchObject({ status: 'matched', rule: 'exact', kakaoPlaceId: '9' });
    expect(pick({ title: '경포대', lat: 37.79, lng: 128.9, contenttypeid: 12, mood: 'walk' }, [{ ...docs[0], place_name: '경포대(폐업)' }], '강릉').status).toBe('closed');
  });
});

describe('강릉 키워드·대상 (pop-criteria 1~3절)', () => {
  it('대상은 도시의 keep 550곳이고 카카오·검색수 파일과 같은 곳이다', () => {
    const dir = resolve(root, 'review/gangwon');
    expect(kakaoTargets(dir, '강릉').map((p) => p.id)).toEqual(popTargets(dir, '강릉').map((p) => p.id));
    expect(popTargets(dir, '강릉')).toHaveLength(550);
    expect(inputs.kakao.map((r) => r.id).sort()).toEqual(keep.map((v) => v.id).sort());
    expect(inputs.pop.every((r) => Number.isInteger(r.volume))).toBe(true);
  });
  it('K1~K5와 뺄 말: 강릉 + 이름, 앞 「강릉」 뗌, 괄호 안 다른 이름, 본점, 동네 이름은 재지 않음', () => {
    const ks = (title: string, contenttypeid = 12) => keywordsOf({ title, contenttypeid }, '강릉').map((x) => x.k);
    expect(ks('보현사(강릉)')).toEqual(['강릉보현사']);
    expect(ks('할매집', 39)).toEqual(['강릉할매집']);
    expect(ks('강릉 경포대')).toEqual(['강릉경포대', '경포대']);
    expect(ks('경포해수욕장')).toEqual(['경포해수욕장']); // 경포는 뺄 말
    expect(ks('연곡해변(연곡해수욕장)')).toEqual(['연곡해변', '연곡해수욕장']);
    expect(ks('마시와 본점', 39)).toEqual(['마시와본점', '강릉마시와']);
    expect(BROAD['강릉'].size).toBe(38);
    expect(plan(popTargets(resolve(root, 'review/gangwon'), '강릉'), '강릉').map((r) => r.keywords.map((k) => k.keyword))).toEqual(
      JSON.parse(readFileSync(resolve(root, 'review/gangwon/pop-강릉-01-plan.json'), 'utf8')).rows.map((r: { keywords: { keyword: string }[] }) => r.keywords.map((k) => k.keyword)),
    );
  });
});

describe('강릉 이름 겹침 (pop-criteria 8절)', () => {
  it('같은 곳의 중복 등록은 id가 작은 하나만, 다른 곳은 읍·면을 붙여 가른다', () => {
    expect(all.find((s) => s.id === 'nt-2820641')?.name).toBe('도깨비젤라또');
    expect(all.find((s) => s.id === 'nt-3537624')).toBeUndefined();
    expect(all.find((s) => s.id === 'nt-129268')?.name).toBe('영진항 (연곡면)');
    expect(all.find((s) => s.id === 'nt-3544610')?.name).toBe('영진항 (주문진읍)');
    expect(townOf({ addr1: '강원특별자치도 강릉시 남부로 222 (노암동)', city: '강릉' })).toBe('노암동');
    const mk = (id: string, addr1: string, lat: number, mood = 'food') => ({ item: { id, title: '가게', addr1, city: '강릉', lat, lng: 128.9 }, v: { mood } });
    const same = dedupe([mk('a', '강릉시 주문진읍 1', 37.8), mk('b', '강릉시 주문진읍 2', 37.8003)]);
    expect(same.rest.map((k) => k.item.id)).toEqual(['a']);
    expect(() => dedupe([mk('a', '강릉시 주문진읍 1', 37.8), mk('b', '강릉시 주문진읍 2', 37.85)])).toThrow(/same town/);
  });
  it('이름 꼴(띄어쓰기, 4자 이상 이름 앞에 붙은 말)만 다른 같은 곳도 하나만 — 빠지는 곳은 다섯뿐(평창 2곳이 새로)', () => {
    const mk = (id: string, title: string, lat: number, mood = 'new') => ({ item: { id, title, addr1: `평창군 ${id}`, city: '평창', lat, lng: 128.4 }, v: { mood } });
    const ids = (ks: ReturnType<typeof mk>[]) => dedupe(ks).rest.map((k: { item: { id: string } }) => k.item.id);
    expect(ids([mk('a', '효석 달빛언덕', 37.6), mk('b', '효석달빛언덕', 37.6001)])).toEqual(['a']);
    expect(ids([mk('a', '대관령 스키 역사관', 37.6), mk('b', '알펜시아리조트대관령스키역사관', 37.6005)])).toEqual(['a']);
    // 멀거나(100m 넘게), 기분이 다르거나, 3자 이하 이름으로 끝나거나, 뒤에 말이 붙으면 다른 곳
    expect(ids([mk('a', '효석 달빛언덕', 37.6), mk('b', '효석달빛언덕', 37.602)])).toEqual(['a', 'b']);
    expect(ids([mk('a', '효석 달빛언덕', 37.6), mk('b', '효석달빛언덕', 37.6001, 'walk')])).toEqual(['a', 'b']);
    expect(ids([mk('a', '다래', 37.6, 'food'), mk('b', '평창한우다래', 37.6, 'food')])).toEqual(['a', 'b']);
    expect(ids([mk('a', '구봉산', 37.6), mk('b', '구봉산 전망대', 37.6)])).toEqual(['a', 'b']);
    expect(build(loadInputs('gangwon', CITIES)).merged.map((m: { dropped: string }) => m.dropped)).toEqual(['nt-3537624', 'nt-3434330', 'nt-3353336', ...DUP_PYEONGCHANG]);
    expect(file.find((s) => s.id === 'nt-2733486')?.name).toBe('효석 달빛언덕');
    expect(file.find((s) => s.id === 'nt-2772349')?.name).toBe('대관령 스키 역사관');
  });
});

describe('강릉 멱등·크기', () => {
  it('같은 입력으로 다시 지으면 바이트가 같고, 강릉 레코드는 강릉만 지은 것과 같다', () => {
    expect(JSON.stringify(build(loadInputs('gangwon', CITIES)).spots)).toBe(text);
    expect(build(inputs).spots.map((s) => (RENAMED_BY_OTHERS.has(s.id) ? { ...s, name: RENAMED_BY_OTHERS.get(s.id) } : s))).toEqual(all);
  });
  it('파일 크기를 적는다', () => {
    const gz = gzipSync(text).length;
    // eslint-disable-next-line no-console
    console.log(`spots-gangwon.json: ${file.length} places, ${Buffer.byteLength(text)} B, gzip ${gz} B`);
    expect(gz).toBeGreaterThan(0);
  });
});

describe('속초·춘천 (pop-criteria 10절)', () => {
  const dir = resolve(root, 'review/gangwon');
  const every = loadInputs('gangwon', CITIES);
  const vol = new Map(every.pop.map((r) => [r.id, r.volume as number]));
  const cityOf = new Map(every.items.map((i) => [i.id, i]));
  const cases = [
    { city: '속초', keep: 196, out: ['nt-2549932'], famous: 12, broad: 11 },
    { city: '춘천', keep: 273, out: ['nt-3353336'], famous: 16, broad: 15 },
    { city: '양양', keep: 172, out: ['nt-3434330'], famous: 10, broad: 29 },
    { city: '평창', keep: 466, out: ['nt-3448238', 'nt-3352979'], famous: 28, broad: 21 },
  ];
  for (const { city, keep: n, out, famous, broad } of cases) {
    it(`${city}: keep ${n}곳 가운데 ${out.join('·')}만 빠지고, 상자 안·형식·도시 이름`, () => {
      const recs = file.filter((s) => s.area === city);
      const kept = [...every.verdicts.values()].filter((v) => v.keep && cityOf.get(v.id)?.city === city);
      expect(kept).toHaveLength(n);
      const shipped = new Set(recs.map((s) => s.id));
      expect(kept.filter((v) => !shipped.has(v.id)).map((v) => v.id)).toEqual(out);
      expect(recs.every((s) => cityOf.get(s.id)!.city === city)).toBe(true);
      expect(recordProblems(recs.map(({ area: _a, ...s }) => s as Spot), (p) => inBox(city, p), { noPhoto: true })).toEqual([]);
    });
    it(`${city}: 유명한 곳 ${famous}곳은 도시 안 후보의 검색수 상위, 만족도도 도시 안에서`, () => {
      expect(famousCount(n)).toBe(famous);
      const recs = file.filter((s) => s.area === city);
      const candidates = recs
        .filter((s) => cityOf.get(s.id)!.contenttypeid === 12 && s.mood !== 'food' && !/카페|커피|빵|베이커리|디저트/.test(s.name))
        .sort((a, b) => vol.get(b.id)! - vol.get(a.id)! || (a.id < b.id ? -1 : 1));
      expect(recs.filter((s) => s.famous).map((s) => s.id).sort()).toEqual(candidates.slice(0, famous).map((s) => s.id).sort());
      for (const food of [true, false]) {
        const group = recs.filter((s) => (s.mood === 'food') === food);
        for (const s of group) expect(s.score, s.id).toBe(5 - Math.floor((5 * group.filter((x) => vol.get(x.id)! > vol.get(s.id)!).length) / group.length));
      }
    });
    it(`${city}: 뺄 말 ${broad}개, 계획 파일은 지금 규칙 그대로, 카카오·검색수 대상이 같다`, () => {
      expect(BROAD[city].size).toBe(broad);
      expect(plan(popTargets(dir, city), city)).toEqual(JSON.parse(readFileSync(resolve(dir, `pop-${city}-01-plan.json`), 'utf8')).rows);
      expect(kakaoTargets(dir, city).map((p) => p.id)).toEqual(popTargets(dir, city).map((p) => p.id));
      expect(every.pop.filter((r) => cityOf.get(r.id)?.city === city).every((r) => Number.isInteger(r.volume))).toBe(true);
    });
  }
  it('양양은 01이 감사에서 떨어지고, 03(criteria-03.md, 01·02 표본 밖에서 감사)이 통과해 03 판정으로 싣는다', () => {
    expect(JSON.parse(readFileSync(resolve(dir, 'audit-양양-01.json'), 'utf8')).pass).toBe(false);
    const a3 = JSON.parse(readFileSync(resolve(dir, 'audit-양양-03.json'), 'utf8'));
    expect(a3.pass).toBe(true);
    const prior = new Set(['01', '02'].flatMap((r) => JSON.parse(readFileSync(resolve(dir, `audit-양양-${r}-sample.json`), 'utf8')).items.map((i: { id: string }) => i.id)));
    expect(a3.rows.filter((r: { id: string }) => prior.has(r.id))).toEqual([]);
    expect(file.filter((s) => s.area === '양양').every((s) => every.verdicts.get(s.id)?.keep === true)).toBe(true);
    expect(file.some((s) => s.id === 'nt-2808938') && !file.some((s) => s.id === 'nt-2714824')).toBe(true);
  });
  it('양양을 더해도 강릉·속초·춘천 레코드는 양양 전 세 도시 빌드와 같다(같은 이름 규칙으로 바뀐 이름 1곳만 다름)', () => {
    const three = build(loadInputs('gangwon', ['강릉', '속초', '춘천'])).spots;
    const others = file.filter((s) => s.area !== '양양' && s.area !== '평창');
    expect(others.map((s) => s.id)).toEqual(three.map((s) => s.id));
    for (let i = 0; i < three.length; i++) {
      const want = RENAMED_BY_OTHERS.has(three[i].id) ? { ...three[i], name: RENAMED_BY_OTHERS.get(three[i].id) } : three[i];
      expect(JSON.stringify(others[i]), three[i].id).toBe(JSON.stringify(want));
    }
  });
});

describe('평창 (criteria-04.md, pop-criteria 13절)', () => {
  const dir = resolve(root, 'review/gangwon');
  it('04 감사가 통과했고(표본 120곳), 평창을 더해도 다른 네 도시 레코드는 같은 이름 규칙으로 바뀐 이름 3곳만 다르다', () => {
    const a = JSON.parse(readFileSync(resolve(dir, 'audit-평창-04.json'), 'utf8'));
    expect(a.pass).toBe(true);
    expect(a.metrics.n).toBe(120);
    const four = build(loadInputs('gangwon', ['강릉', '속초', '춘천', '양양'])).spots;
    const others = file.filter((s) => s.area !== '평창');
    expect(others.map((s) => s.id)).toEqual(four.map((s) => s.id));
    const changed = others.filter((s, i) => JSON.stringify(s) !== JSON.stringify(four[i]));
    expect(changed.map((s) => s.id).sort()).toEqual([...RENAMED_BY_PYEONGCHANG.keys()].sort());
    for (const s of changed) expect(JSON.stringify(s)).toBe(JSON.stringify({ ...four.find((x) => x.id === s.id), name: RENAMED_BY_PYEONGCHANG.get(s.id) }));
  });
  it('출하된 평창 466곳의 이유 문장을 빠짐없이 사실 확인했고(factcheck-평창-04), 오류로 고친 곳만 fixes에 있다', () => {
    const fc = resolve(dir, 'factcheck-평창-04');
    const read = (p: string) => readdirSync(fc).filter((f) => new RegExp(`^${p}-\\d{2}\\.json$`).test(f)).sort().flatMap((f) => JSON.parse(readFileSync(resolve(fc, f), 'utf8')));
    const pc = file.filter((s) => s.area === '평창');
    const input = read('input') as { id: string; reason: string }[];
    const facts = read('facts') as { id: string; factError: boolean }[];
    // 확인은 466곳 그대로(이름 꼴 중복 2곳을 빼기 전, 배포 전 리뷰 4 m-3)
    const shipped = new Set(pc.map((s) => s.id));
    expect(input.filter((x) => !shipped.has(x.id)).map((x) => x.id).sort()).toEqual(DUP_PYEONGCHANG);
    expect(input.filter((x) => shipped.has(x.id)).map((x) => x.id)).toEqual(pc.map((s) => s.id));
    expect(facts.filter((x) => shipped.has(x.id)).map((x) => x.id)).toEqual(pc.map((s) => s.id));
    const every = loadInputs('gangwon', CITIES);
    const ours = every.fixes.filter((f) => (f as { source?: string }).source === 'factcheck-평창-04');
    expect(ours.map((f) => f.id).sort()).toEqual(facts.filter((x) => x.factError).map((x) => x.id).sort());
    const fixedIds = new Set(ours.map((f) => f.id));
    expect(pc.filter((s) => !fixedIds.has(s.id)).map((s) => s.reason)).toEqual(input.filter((x) => shipped.has(x.id) && !fixedIds.has(x.id)).map((x) => x.reason));
  });
});

describe('주인 덮어쓰기 (review/gangwon/owner-overrides.json)', () => {
  const every = loadInputs('gangwon', CITIES);
  const ids = ['nt-2383582', 'nt-125668'];
  it('판정 파일은 rest 그대로이고, 덮어쓰기는 이 두 곳의 mood만 walk로 바꾼다', () => {
    expect((every.overrides ?? []).map((o: { id: string }) => o.id).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(every.verdicts.get(id)?.mood).toBe('rest');
    const plain = build({ ...every, overrides: [] }).spots;
    const owned = build(every).spots;
    expect(owned.length).toBe(plain.length);
    const changed = owned.filter((s, i) => JSON.stringify(s) !== JSON.stringify(plain[i]));
    expect(changed.map((s) => s.id).sort()).toEqual([...ids].sort());
    for (const s of changed) {
      expect(s.mood).toBe('walk');
      expect('sub' in s).toBe(false);
      expect({ ...s, mood: 'rest' }).toEqual(plain.find((p) => p.id === s.id));
    }
    expect(JSON.stringify(owned)).toBe(text);
  });
  it('before가 판정과 다르면 멈춘다', () => {
    expect(() => build({ ...every, overrides: [{ id: ids[0], field: 'mood', before: 'food', after: 'walk' }] })).toThrow(/owner override/);
  });
});

describe('양양 이유 문장 전수 사실 확인 (review/gangwon/factcheck-양양-03.md)', () => {
  const dir = resolve(root, 'review/gangwon/factcheck-양양-03');
  const every = loadInputs('gangwon', CITIES);
  const read = (p: string) => readdirSync(dir).filter((f) => new RegExp(`^${p}-\\d{2}\\.json$`).test(f)).sort().flatMap((f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')));
  it('출하된 양양 171곳의 이유 문장을 빠짐없이 봤고, 오류로 고친 곳은 이유 문장만 바뀐다', () => {
    const yy = file.filter((s) => s.area === '양양');
    const input = read('input') as { id: string; reason: string }[];
    const facts = read('facts') as { id: string; factError: boolean }[];
    expect(input.map((x) => x.id)).toEqual(yy.map((s) => s.id));
    expect(facts.map((x) => x.id)).toEqual(yy.map((s) => s.id));
    const ours = every.fixes.filter((f) => (f as { source?: string }).source === 'factcheck-양양-03');
    expect(ours.map((f) => f.id).sort()).toEqual(facts.filter((x) => x.factError).map((x) => x.id).sort());
    const before = build({ ...every, fixes: every.fixes.filter((f) => !ours.includes(f)) }).spots;
    const after = build(every).spots;
    const changed = after.filter((s, i) => JSON.stringify(s) !== JSON.stringify(before[i]));
    expect(changed.map((s) => s.id).sort()).toEqual(ours.map((f) => f.id).sort());
    for (const s of changed) {
      expect(s.area).toBe('양양');
      expect({ ...s, reason: '' }).toEqual({ ...before.find((p) => p.id === s.id), reason: '' });
    }
    expect(JSON.stringify(after)).toBe(text);
  });
});
