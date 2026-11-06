// 부산 출하 파일 B8 (plans/busan.md S4, specs/busan.md 3.2·3.4·B8, 규칙 docs/research/busan-popularity/criteria-01.md 6~8절).
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardTextProblem, PRICE_HOURS } from '../src/pick/card-text';
import { normalizeSpots } from '../src/pick/data';
import type { Spot } from '../src/pick/pick';
import { REASON_BANNED } from '../scripts/check-slop';
import { positionProblems } from '../scripts/positions.mjs';
import { reasonPunctuationProblem } from '../scripts/reason.mjs';
import { bookingOf, build, famousIds, kakaoIds, loadInputs, OWNER_FAMOUS, quintileScores } from '../scripts/busan/build.mjs';
import { BUSAN_RECORD_BOX, JEJU_RECORD_BOX, recordProblems } from './spot-record';

const root = resolve(__dirname, '..');
const text = readFileSync(resolve(root, 'public/spots-busan.json'), 'utf8');
const spots = JSON.parse(text) as Spot[];
const inputs = loadInputs();
const item = new Map(inputs.items.map((i) => [i.id, i]));
const volume = new Map(inputs.pop.map((r) => [r.id, r.volume as number]));
const DAY_WORDS = /월요일|화요일|수요일|목요일|금요일|토요일|일요일|매주|정기휴무/;
const keep = [...inputs.verdicts.values()].filter((v) => v.keep);

describe('B8 레코드', () => {
  it("모든 곳이 S1' 형식(제주와 같은 검사, 부산 상자, 사진 없음은 빈 값)", () => {
    expect(recordProblems(spots, BUSAN_RECORD_BOX, { noPhoto: true })).toEqual([]);
    expect(spots.filter((s) => s.image === '').length).toBe(192);
    expect(spots.filter((s) => JEJU_RECORD_BOX(s))).toEqual([]);
  });
  it('id는 bs-<contentid>, 겹치지 않음, kakaoPlaceId도 겹치지 않음', () => {
    expect(spots.every((s) => /^bs-\d+$/.test(s.id))).toBe(true);
    expect(new Set(spots.map((s) => s.id)).size).toBe(spots.length);
    const k = spots.map((s) => s.kakaoPlaceId).filter((x): x is string => x !== null);
    expect(new Set(k).size).toBe(k.length);
  });
  it('3.2에서 뺀 분류 0곳: 관광지·문화시설·레포츠·음식점과 전통시장(SH060100·SH060200)만', () => {
    const bad = spots.filter((s) => {
      const it = item.get(s.id);
      return !it || !([12, 14, 28, 39].includes(it.contenttypeid) || (it.contenttypeid === 38 && ['SH060100', 'SH060200'].includes(it.lclsSystm3)));
    });
    expect(bad.map((s) => s.id)).toEqual([]);
  });
  it('keep 995곳 가운데 위치를 모르는 1곳(bs-2907087)만 빠진다', () => {
    expect(keep).toHaveLength(995);
    const shipped = new Set(spots.map((s) => s.id));
    expect(keep.filter((v) => !shipped.has(v.id)).map((v) => v.id)).toEqual(['bs-2907087']);
    expect(spots.every((s) => inputs.verdicts.get(s.id)?.keep === true)).toBe(true);
  });
  it("이유 문장: 15~70자, 가격·시간·요일·평점 없음, 마침표·금지 표현 없음(S1')", () => {
    const bad = spots.filter((s) => {
      const n = [...s.reason].length;
      return n < 15 || n > 70 || PRICE_HOURS.test(s.reason) || DAY_WORDS.test(s.reason) || cardTextProblem(s) !== null || reasonPunctuationProblem(s.reason) !== null || REASON_BANNED.test(s.reason);
    });
    expect(bad.map((s) => `${s.id} ${s.reason}`)).toEqual([]);
  });
  it('이름에 앞뒤·겹친 공백 없음, 위치가 대체점·한 점에 몰리지 않음, 앱이 그대로 읽는다', () => {
    expect(spots.filter((s) => s.name !== s.name.trim() || /\s{2,}|[\t　]/.test(s.name))).toEqual([]);
    expect(positionProblems(spots)).toEqual([]);
    expect(normalizeSpots(spots)).toEqual(spots);
  });
  it('개요·근거 원문이 없다: 원문 칸이 없고, 개요를 40자 넘게 그대로 옮긴 이유 문장이 없다', () => {
    expect(text).not.toMatch(/"(overview|basis|confidence|addr1|placeUrl|cpyrhtDivCd)"/);
    const overview = new Map(
      readdirSync(resolve(root, 'review/busan/judge-01'))
        .filter((f) => /^input-\d{2}\.json$/.test(f))
        .flatMap((f) => JSON.parse(readFileSync(resolve(root, 'review/busan/judge-01', f), 'utf8')) as { id: string; overview: string }[])
        .map((x) => [x.id, x.overview]),
    );
    const copied = spots.filter((s) => {
      const o = overview.get(s.id) ?? '';
      const r = [...s.reason];
      return r.some((_, i) => i + 40 <= r.length && o.includes(r.slice(i, i + 40).join('')));
    });
    expect(copied.map((s) => s.id)).toEqual([]);
  });
  it('fixes-01의 고친 이유 문장이 실렸다', () => {
    for (const f of inputs.fixes) expect(spots.find((s) => s.id === f.id)?.reason).toBe(f.after);
  });
});

describe('B8 만족도·유명한 곳 (criteria-01 6·7절)', () => {
  it('score: 먹기와 그 밖 따로, 검색수 순위 5등분(같은 값은 같은 점수)', () => {
    for (const food of [true, false]) {
      const group = spots.filter((s) => (s.mood === 'food') === food);
      const n = group.length;
      for (const s of group) {
        const higher = group.filter((x) => volume.get(x.id)! > volume.get(s.id)!).length;
        expect(s.score, s.id).toBe(5 - Math.floor((5 * higher) / n));
      }
      const per = [1, 2, 3, 4, 5].map((k) => group.filter((s) => s.score === k).length);
      expect(Math.max(...per) - Math.min(...per)).toBeLessThanOrEqual(Math.ceil(n * 0.05));
    }
    expect(quintileScores(new Map([['a', 9], ['b', 9], ['c', 1], ['d', 0], ['e', 0]]))).toEqual(new Map([['a', 5], ['b', 5], ['c', 3], ['d', 2], ['e', 2]]));
  });
  it('famous: 관광지·먹기 아님·카페 낱말 없는 곳 가운데 검색수 상위 60곳 + 주인 지정(광안대교)과 정확히 같다', () => {
    const candidates = spots
      .filter((s) => item.get(s.id)!.contenttypeid === 12 && s.mood !== 'food' && !/카페|커피|빵|베이커리|디저트/.test(s.name))
      .sort((a, b) => volume.get(b.id)! - volume.get(a.id)! || (a.id < b.id ? -1 : 1));
    expect(OWNER_FAMOUS).toEqual(['bs-128164']);
    const want = [...candidates.slice(0, 60).map((s) => s.id), ...OWNER_FAMOUS].sort();
    expect(spots.filter((s) => s.famous === true).map((s) => s.id).sort()).toEqual(want);
    expect(volume.get(candidates[59].id)).toBeGreaterThan(volume.get(candidates[60].id)!);
    const pops = spots.filter((s) => s.famous).map((s) => s.pop!);
    expect(Math.max(...pops)).toBe(1);
    expect(Math.min(...pops)).toBe(0);
    // 주인 지정 곳의 pop = 규칙 60번째 곳의 pop(ADR-0094 Amendment 2)
    expect(spots.find((s) => s.id === 'bs-128164')!.pop).toBe(spots.find((s) => s.id === candidates[59].id)!.pop);
    expect(famousIds(['a', 'b', 'c'], new Map([['a', 1], ['b', 5], ['c', 5]]), 2)).toEqual(['b', 'c']);
  });
});

describe('B8 카카오 ID (criteria-01 8절)', () => {
  it('같은 ID를 나눠 가진 3쌍: exact 한 곳만 갖고 나머지는 null, 둘 다 exact가 아니면 둘 다 null', () => {
    const k = (id: string) => spots.find((s) => s.id === id)!.kakaoPlaceId;
    expect([k('bs-2614727'), k('bs-2875849')]).toEqual([null, null]); // 장산·대천공원(둘 다 contains)
    expect([k('bs-2614714'), k('bs-630874')]).toEqual([null, '63050831']); // 낙동강하구·낙동강하구에코센터
    expect([k('bs-2650232'), k('bs-3017067')]).toEqual([null, '1643714726']); // 산복도로·망양로 산복도로전시관
    const matched = inputs.kakao.filter((r) => r.status === 'matched').length;
    expect(spots.filter((s) => s.kakaoPlaceId).length).toBe(matched - 4);
    const rows = [
      { id: 'a', status: 'matched', rule: 'exact', kakaoPlaceId: '1' },
      { id: 'b', status: 'matched', rule: 'contains', kakaoPlaceId: '1' },
      { id: 'c', status: 'unmatched', rule: 'none', kakaoPlaceId: null },
    ];
    expect(kakaoIds(rows, new Set(['a', 'b', 'c']))).toEqual(new Map([['a', '1'], ['b', null]]));
    expect(kakaoIds(rows, new Set(['b']))).toEqual(new Map([['b', '1']]));
  });
});

describe('S4b 체험 예약 경로 (ADR-0074, review/busan/booking/criteria.md)', () => {
  const routes = inputs.booking;
  const doSpots = spots.filter((s) => s.mood === 'new' && s.sub === 'do');
  // 「장소형」 5곳은 구경으로 옮겼다(review/busan/booking/place-type.json, ADR-0074 2와 같은 처리, S5)
  const placeType = inputs.placeType ?? [];
  // ADR-0105 다시 나누기 v5(review/remap/busan.json): 계곡·낚시 3곳이 놀거리로 들어오고, 예약 없이 가는 곳은 walkin
  it('체험 50곳은 모두 book이거나 hide: closed이거나 walkin이거나 routes.json에 noroute 판정이 있다', () => {
    expect(doSpots).toHaveLength(50);
    const bad = doSpots.filter((s) => !s.book && s.hide !== 'closed' && !s.walkin && routes[s.id]?.call !== 'noroute');
    expect(bad.map((s) => s.id)).toEqual([]);
    const judged = doSpots.filter((s) => routes[s.id] || !s.walkin);
    expect(Object.keys(routes).sort()).toEqual([...judged.map((s) => s.id), ...placeType].sort());
  });
  it('「장소형」 5곳은 구경이고 예약 링크가 없다', () => {
    expect(placeType).toHaveLength(5);
    const moved = spots.filter((s) => placeType.includes(s.id));
    expect(moved.map((s) => [s.mood, s.sub, 'book' in s])).toEqual(moved.map(() => ['new', 'sight', false]));
  });
  it('이름 끝의 측정용 「(부산)」을 떼고(괄호 안 다른 말은 그대로), 두 곳이 같은 이름이 되지 않는다', () => {
    expect(spots.filter((s) => /\(부산\)$/.test(s.name))).toEqual([]);
    expect(spots.find((s) => s.id === 'bs-126148')?.name).toBe('범어사');
    expect(spots.find((s) => s.id === 'bs-126088')?.name).toBe('오륙도 (부산 국가지질공원)');
    expect(new Set(spots.map((s) => s.name)).size).toBe(spots.length);
  });
  it('book은 routes.json best 종류의 첫 accepted 경로와 같고, 체험이 아닌 곳에는 book·hide가 없다', () => {
    for (const s of doSpots.filter((x) => x.book)) {
      const r = routes[s.id];
      expect(s.book, s.id).toEqual({ k: r.best, u: r.routes.find((x) => x.kind === r.best && x.verdict === 'accepted')!.url });
    }
    expect(spots.filter((s) => !(s.mood === 'new' && s.sub === 'do') && ('book' in s || 'hide' in s || 'walkin' in s))).toEqual([]);
    const kinds: Record<string, number> = {};
    const kindOf = (s: (typeof doSpots)[number]) => s.book?.k ?? s.hide ?? (s.walkin ? 'walkin' : 'noroute');
    for (const s of doSpots) kinds[kindOf(s)] = (kinds[kindOf(s)] ?? 0) + 1;
    expect(kinds).toEqual({ naver: 14, homepage: 9, phone: 22, walkin: 4, noroute: 1 });
  });
  it('판정 없는 체험·accepted 없는 best는 빌드를 멈춘다', () => {
    expect(bookingOf('x', undefined).problem).toMatch(/without a booking call/);
    expect(bookingOf('x', { name: 'x', routes: [], best: 'naver' }).problem).toMatch(/no accepted route/);
    expect(bookingOf('x', { name: 'x', routes: [], best: null, call: 'closed' }).fields).toEqual({ hide: 'closed' });
    const noBooking = { ...inputs, booking: {} };
    expect(() => build(noBooking)).toThrow(/without a booking call/);
  });
});

describe('B8 멱등·크기', () => {
  it('같은 입력으로 다시 지으면 바이트가 같다', () => {
    expect(JSON.stringify(build(inputs).spots)).toBe(text);
  });
  it('파일 크기를 적는다', () => {
    const gz = gzipSync(text).length;
    // eslint-disable-next-line no-console
    console.log(`spots-busan.json: ${spots.length} places, ${Buffer.byteLength(text)} B, gzip ${gz} B`);
    expect(gz).toBeGreaterThan(0);
  });
});
