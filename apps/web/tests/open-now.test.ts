// 지금 못 가는 곳은 고르지 않는다 (specs/open-now.md): the hours read from TourAPI's words, shutAt, and the picks.
import { describe, expect, it } from 'vitest';
import { areaByName } from '../src/areas';
import { normalizeSpots } from '../src/data';
import { shutAt, weekdayOf } from '../src/hours';
import { pickCards, type Mood, type Spot } from '../src/pick';
import { hoursOf, parseClosed, parseOpen } from '../scripts/hours/parse.mjs';
import { matchSpots } from '../scripts/hours/collect.mjs';
import { fileSpots } from './fixtures';

const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const TUE = '2026-11-03';

describe('읽기 (specs/open-now.md 2)', () => {
  it('open hours: one span, 준비시간·마지막 주문·입장 마감 and ※ left out, past midnight, 상시 개방', () => {
    expect(parseOpen('09:00~20:30 (마지막 주문 19:30)')).toEqual([540, 1230]);
    expect(parseOpen('- 11:00~21:00 - 준비시간 15:00~17:00 - 마지막 주문 20:00')).toEqual([660, 1260]);
    expect(parseOpen('09:00~20:00 브레이크타임 14:30~16:30라스트오더 19:30')).toEqual([540, 1200]);
    expect(parseOpen('16:00~04:00 (마지막 주문 03:00)')).toEqual([960, 1680]);
    expect(parseOpen('09:00 ~ 21:00')).toEqual([540, 1260]);
    expect(parseOpen('[하절기]<br> - 08:30~18:00<br> [동절기]<br> - 09:00~17:30')).toEqual([510, 1080]);
    expect(parseOpen('상시 개방※ 일부 통제될 수 있음')).toEqual([0, 1440]);
    expect(parseOpen('09:00~18:00 (매표 마감 17:30)※ 동절기(11월~2월)에는 17시까지')).toEqual([540, 1080]);
  });

  it('상시 개방 anywhere wins; 12:00~12:00 is not read; 격주 or N째 words keep only the 매주 pieces', () => {
    expect(parseOpen('체험 09:00~18:00 / 상시 개방')).toEqual([0, 1440]);
    expect(parseOpen('12:00~12:00')).toBeNull();
    expect(parseClosed('격주 월, 화요일')).toBeNull();
    expect(parseClosed('매월 첫째 월요일, 화요일')).toBeNull();
    expect(parseClosed('매주 화요일 / 매월 첫째 월요일')).toEqual([2]);
  });

  it('open hours not read: times of departure, words only, nothing', () => {
    for (const t of ['10:00 / 14:00', '체험별로 상이함', '※ 일부 통제될 수 있으므로 방문 시 전화문의 요망', '', undefined]) expect(parseOpen(t), String(t)).toBeNull();
  });

  it('closed days: 매주 only, 연중무휴 none, the rest unknown', () => {
    expect(parseClosed('매주 화요일')).toEqual([2]);
    expect(parseClosed('매주 일요일, 월요일')).toEqual([0, 1]);
    expect(parseClosed('매주 월요일 / 설·추석 연휴')).toEqual([1]);
    expect(parseClosed('매주 월요일 (단, 월요일이 공휴일인 경우 그 다음 평일 휴관) / 1월 1일 / 설·추석 당일')).toEqual([1]);
    expect(parseClosed('매주 일요일~월요일')).toEqual([0, 1]);
    expect(parseClosed('주말')).toEqual([0, 6]);
    expect(parseClosed('연중무휴')).toEqual([]);
    expect(parseClosed('설·추석 당일')).toBeNull();
    // a second or fourth Thursday is not every week; 문의·비정기 say nothing sure
    for (const t of ['매월 둘째, 넷째 목요일', '매장 문의', '※ 비정기적 휴무가 있을 수 있으므로 전화 문의 요망', '연중무휴(전화문의)']) expect(parseClosed(t), t).toBeNull();
  });

  it('an item: the fields of its kind; 연중무휴 alone says nothing to keep', () => {
    expect(hoursOf({ contenttypeid: '39', opentimefood: '11:00~22:00', restdatefood: '매주 화요일' })).toEqual({ c: [2], o: [660, 1320] });
    expect(hoursOf({ contenttypeid: '14', usetimeculture: '09:00~18:00', restdateculture: '연중무휴' })).toEqual({ o: [540, 1080] });
    expect(hoursOf({ contenttypeid: '12', usetime: '체험별로 상이함', restdate: '연중무휴' })).toBeNull();
  });

  it('matching: 먹기 with 음식점 only, the rest never with one; a short name inside a long one is not it', () => {
    const food = { id: 'f', name: '원조마라도짜장면', mood: 'food', lat: 33.12, lng: 126.27 } as Spot;
    const isle = { contentid: '1', contenttypeid: '12', title: '마라도', mapx: '126.27', mapy: '33.12' };
    const shop = { contentid: '2', contenttypeid: '39', title: '원조 마라도 짜장면', mapx: '126.2701', mapy: '33.1201' };
    expect(matchSpots([food], [isle]).map((m) => m.contentid)).toEqual([]);
    expect(matchSpots([food], [isle, shop]).map((m) => m.contentid)).toEqual(['2']);
    const beach = { id: 'b', name: '마라도', mood: 'rest', lat: 33.12, lng: 126.27 } as Spot;
    expect(matchSpots([beach], [shop, isle]).map((m) => m.contentid)).toEqual(['1']);
  });

  it('the app keeps hours it can read and drops any other, the place staying', () => {
    const s = fileSpots.find((x) => x.hours)!;
    const [ok, bad7, badSpan, empty] = normalizeSpots([s, { ...s, id: 'a', hours: { c: [0, 1, 2, 3, 4, 5, 6] } }, { ...s, id: 'b', hours: { o: [600, 500] } }, { ...s, id: 'c', hours: {} }]);
    expect(ok).toBe(s);
    for (const x of [bad7, badSpan, empty]) expect('hours' in x).toBe(false);
  });
});

describe('shutAt (specs/open-now.md 2·3)', () => {
  const food = (hours?: Spot['hours']) => ({ mood: 'food', indoor: true, hours });
  it('known hours: open inside them, shut outside; a closed weekday all day; past midnight from the day before', () => {
    expect(weekdayOf(TUE)).toBe(2);
    expect(shutAt(food({ o: [660, 1320] }), TUE, hm('12:00'))).toBe(false);
    expect(shutAt(food({ o: [660, 1320] }), TUE, hm('22:00'))).toBe(true);
    expect(shutAt(food({ o: [660, 1320] }), TUE, hm('10:59'))).toBe(true);
    expect(shutAt(food({ c: [2], o: [660, 1320] }), TUE, hm('12:00'))).toBe(true);
    expect(shutAt(food({ o: [960, 1680] }), TUE, hm('03:00'))).toBe(false); // 16:00~04:00, Monday's night
    expect(shutAt(food({ c: [1], o: [960, 1680] }), TUE, hm('03:00'))).toBe(true); // Monday it did not open
    expect(shutAt(food({ o: [0, 1440] }), TUE, hm('03:00'))).toBe(false);
  });
  it('unknown hours: 먹기 22:00–07:00, indoor and 놀러 19:00–09:00, outdoors never', () => {
    expect(shutAt(food(), TUE, hm('21:59'))).toBe(false);
    expect(shutAt(food(), TUE, hm('22:00'))).toBe(true);
    expect(shutAt(food(), TUE, hm('06:59'))).toBe(true);
    expect(shutAt(food(), TUE, hm('07:00'))).toBe(false);
    expect(shutAt({ mood: 'rest', indoor: true }, TUE, hm('19:00'))).toBe(true);
    expect(shutAt({ mood: 'new', indoor: false }, TUE, hm('20:00'))).toBe(true);
    expect(shutAt({ mood: 'new', indoor: false }, TUE, hm('09:00'))).toBe(false);
    expect(shutAt({ mood: 'walk', indoor: false }, TUE, hm('03:00'))).toBe(false);
    expect(shutAt({ mood: 'rest', indoor: false, hours: { c: [2] } }, TUE, hm('03:00'))).toBe(true);
  });
  it('another day (no minute): its closed weekday only', () => {
    expect(shutAt(food(), TUE)).toBe(false);
    expect(shutAt(food({ o: [660, 1320] }), TUE)).toBe(false);
    expect(shutAt(food({ c: [2] }), TUE)).toBe(true);
  });
});

describe('the picks on the shipped data (specs/open-now.md 4)', () => {
  const pick = (area: string, mood: Mood | 'any', min: number | null, day = TUE) =>
    pickCards(fileSpots, areaByName(area as never)!, mood, {}, mood === 'food' ? 'meal' : undefined, 'drive30', false, day, false, undefined, min).cards.map((c) => c.spot);
  const AREAS = ['구제주', '신제주', '애월', '한림', '중문', '서귀포시내', '성산', '표선'];

  it('at 03:00, no 먹기 place that is not known to be open then, anywhere', () => {
    for (const area of AREAS) for (const s of pick(area, 'food', hm('03:00'))) expect(s.hours?.o, `${area} ${s.name}`).toBeDefined();
    for (const area of AREAS) for (const s of pick(area, 'food', hm('03:00'))) expect(shutAt(s, TUE, hm('03:00')), `${area} ${s.name}`).toBe(false);
  });

  it('on a Tuesday, never a place closed every Tuesday — 지금 or that day chosen', () => {
    for (const area of AREAS) {
      for (const mood of ['food', 'rest', 'walk', 'new', 'any'] as const) {
        for (const min of [hm('12:00'), null]) for (const s of pick(area, mood, min)) expect(s.hours?.c?.includes(2) ?? false, `${area} ${mood} ${s.name}`).toBe(false);
      }
    }
  });

  it('at noon the unknown ones stay: the same three as with no hours in the data, where none of the three keeps hours', () => {
    const bare = fileSpots.map(({ hours: _h, ...s }) => s as Spot);
    let same = 0;
    let all = 0;
    for (const area of AREAS) {
      for (const mood of ['food', 'rest', 'walk', 'new'] as const) {
        const tab = mood === 'food' ? 'meal' : undefined;
        const a = pickCards(fileSpots, areaByName(area as never)!, mood, {}, tab, 'drive30', false, '2026-11-04', false, undefined, hm('12:00')).cards.map((c) => c.spot.id);
        const b = pickCards(bare, areaByName(area as never)!, mood, {}, tab, 'drive30', false, '2026-11-04', false, undefined, hm('12:00')).cards.map((c) => c.spot.id);
        all++;
        if (a.join() === b.join()) same++;
      }
    }
    // a Wednesday noon: only places closed on Wednesdays or not yet open at noon differ
    expect(same / all).toBeGreaterThanOrEqual(0.8);
  });
});

describe('only in Jeju, and the home keeps up (ADR-0111 6·7)', () => {
  it('minuteNow: 지금 in Jeju only; another destination or another day, none', async () => {
    const { initialState, minuteNow, openPhase } = await import('../src/state');
    const s = { ...initialState({ basis: 'gps', region: null, stay: null, saved: [], hintSeen: true, offline: false, today: TUE }), clock: hm('03:00') };
    expect(minuteNow(s)).toBe(hm('03:00'));
    expect(minuteNow({ ...s, dest: 'busan' })).toBeNull();
    expect(minuteNow({ ...s, when: '2026-11-05' })).toBeNull();
    expect(openPhase(s, hm('21:59'))).not.toBe(openPhase(s, hm('22:00')));
    expect(openPhase({ ...s, dest: 'nation' }, hm('22:00'))).toBeNull();
  });
});
