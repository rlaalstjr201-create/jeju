// 오늘 서울 둘러보기 (ADR-0114, ADR-0115): the shelves from the day's list and the curated places — one shelf per item, at
// most 12, none empty, nothing shut now, the hour's shelves first, 동네 cards; the picture and link addresses; 머문 시간 in fives.
import { describe, expect, it } from 'vitest';
import { cultureItems, type CultureItem, type SeoulRow } from '../functions/_lib/culture-filter';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FULL, HOME_ROWS, HOOD_MIN, MOOD_SHELVES, ORDER, PER_SHELF, browseCard, buildShelves, homeOrder, homeShelves, homeShown, imageUrl, inHood, linkUrl, RESIZE, todayTimes, type ShelfKey } from '../src/browse';
import { normalizeSpots } from '../src/data';
import { moodShelf } from '../src/home';
import { initialState, viewingShut } from '../src/state';
import type { Spot } from '../src/pick';
import { openNow, type Now } from '../src/culture';
import { bandOf, funItems, hoursOf, isFun, likelyOpen, realItems, type FunItem } from '../src/fun';
import { distanceKm } from '../src/pick';
import { sunsetMinutes } from '../src/sun';
import { dwellBucket } from '../src/track';
import rows from './fixtures/seoul-culture-20261104.json';

const DAY = '2026-11-04'; // a Wednesday
const at = (h: number, m = 0): Now => ({ day: DAY, weekday: 3, minute: h * 60 + m });
const events = cultureItems(rows as SeoulRow[], DAY);
const fun = funItems(DAY);
const items = [...events, ...fun];
const 경복궁 = { lat: 37.5796, lng: 126.977 };
const 망원 = { lat: 37.5563, lng: 126.9056 };
const 성수 = { lat: 37.5446, lng: 127.0559 };
const SUNSET = sunsetMinutes(경복궁, DAY); // about 17:25
const item = (over: Partial<CultureItem>): CultureItem => ({
  id: 'sc-x',
  title: '전시',
  kind: '전시/미술',
  place: '갤러리',
  gu: '종로구',
  lat: 37.58,
  lng: 126.98,
  start: '2026-11-01',
  end: '2026-11-30',
  time: '10:00~20:00',
  free: false,
  forAll: true,
  link: '',
  image: '',
  ...over,
});
const place = (over: Partial<FunItem> & { g: FunItem['fun']['g']; word: string; walkin?: boolean }): FunItem => {
  const { g, word, walkin = true, ...rest } = over;
  return { ...item({ id: 'kk-1', title: '곳', kind: word, place: `${word} · 망원`, time: '', start: DAY, end: DAY, ...rest }), fun: { g, word, walkin } } as FunItem;
};
const ids = (s: ReturnType<typeof buildShelves>) => s.flatMap((x) => x.cards.map((c) => c.item.id));
// a museum, a memorial, a palace, a historic site (「○○ 터」) — not 씨어터·센터·챕터
const MUSEUM = /박물관|기념관|역사관|고궁|사적|[^어센챕]터$/;

describe('the curated places (ADR-0115)', () => {
  it('ride along with the day: places and 동네, the day\'s own list without them', () => {
    expect(fun.filter((f) => f.fun.g === 'hood').length).toBe(20);
    expect(fun.filter((f) => f.fun.g !== 'hood').length).toBeGreaterThan(150);
    for (const f of fun) expect(isFun(f)).toBe(true);
    expect(realItems(items)).toEqual(events);
    for (const f of fun) if (f.fun.g !== 'hood') expect(f.link).toMatch(/^https:\/\/place\.map\.kakao\.com\/\d+$/);
  });
  it("a kind's usual hours: a bar in the evening, a market in the day, 찜질방 all night, 야구 in its season", () => {
    expect(hoursOf('LP바')).toEqual([18 * 60, 26 * 60]);
    expect(likelyOpen(place({ g: 'G2', word: '포차거리' }), 10 * 60, 0, 11)).toBe(false);
    expect(likelyOpen(place({ g: 'G2', word: '포차거리' }), 22 * 60, 0, 11)).toBe(true);
    // past midnight, before its 2:00 close less half an hour
    expect(likelyOpen(place({ g: 'G2', word: '포차거리' }), 60, 0, 11)).toBe(true);
    expect(likelyOpen(place({ g: 'G2', word: '전통시장' }), 21 * 60, 0, 11)).toBe(false);
    expect(likelyOpen(place({ g: 'G5', word: '찜질방' }), 3 * 60, 0, 11)).toBe(true);
    expect(likelyOpen(place({ g: 'G6', word: '야구장' }), 18 * 60, 0, 11)).toBe(false);
    expect(likelyOpen(place({ g: 'G6', word: '야구장' }), 18 * 60, 0, 7)).toBe(true);
    // the time to get there counts
    expect(likelyOpen(place({ g: 'G5', word: '방탈출' }), 22 * 60, 40, 11)).toBe(false);
  });
  it('the hour: late, morning, day, dusk around the sunset, night', () => {
    expect(bandOf(3 * 60, 1045)).toBe('late');
    expect(bandOf(9 * 60, 1045)).toBe('morning');
    expect(bandOf(14 * 60, 1045)).toBe('day');
    expect(bandOf(1045 - 30, 1045)).toBe('dusk');
    expect(bandOf(1045 + 30, 1045)).toBe('dusk');
    expect(bandOf(21 * 60, 1045)).toBe('night');
  });
});

describe('buildShelves (ADR-0114 2·3, ADR-0115 6)', () => {
  it.each([
    [14, 경복궁],
    [14, 망원],
    [14, 성수],
    [19, 경복궁],
    [19, 망원],
    [19, 성수],
    [22, 경복궁],
    [22, 망원],
    [22, 성수],
  ])('the 11-04 list at %i:00: the hour\'s order, none empty, ≤ 12, each item once, nothing shut, no museum in the first three', (h, o) => {
    const shelves = buildShelves(items, at(h), o, SUNSET);
    const keys = shelves.map((s) => s.key);
    // full shelves (≥ FULL cards) first, each part in the hour's order
    const rank = ORDER[bandOf(h * 60, SUNSET)];
    const full = shelves.filter((s) => s.cards.length >= FULL).map((s) => s.key);
    const short = shelves.filter((s) => s.cards.length < FULL).map((s) => s.key);
    expect(keys).toEqual([...full, ...short]);
    expect(full).toEqual([...full].sort((a, b) => rank.indexOf(a) - rank.indexOf(b)));
    expect(short).toEqual([...short].sort((a, b) => rank.indexOf(a) - rank.indexOf(b)));
    // ADR-0115 성공 기준 (Amendment 3): four full shelves or more besides 전시·박물관, and they lead
    expect(full.filter((k) => k !== 'exhibit').length).toBeGreaterThanOrEqual(4);
    for (const s of shelves) {
      expect(s.cards.length).toBeGreaterThan(0);
      expect(s.cards.length).toBeLessThanOrEqual(PER_SHELF);
    }
    const all = ids(shelves);
    expect(new Set(all).size).toBe(all.length);
    for (const s of shelves)
      for (const c of s.cards) {
        if (isFun(c.item)) {
          if (c.item.fun.g !== 'hood') expect(likelyOpen(c.item, h * 60, c.trip?.minutes ?? 0, 11)).toBe(true);
        } else expect(openNow(c.item, at(h), undefined, c.trip?.minutes ?? 0)).not.toBe('shut');
      }
    for (const s of shelves.slice(0, 3)) {
      expect(s.key).not.toBe('exhibit');
      for (const c of s.cards) expect(c.item.title).not.toMatch(MUSEUM);
    }
  });

  it("the hour's order itself: with every shelf full, the shelves come exactly as ORDER says", () => {
    const many = (k: string, n: number, over: (i: number) => Partial<CultureItem>) => Array.from({ length: n }, (_, i) => item({ id: `${k}${i}`, lat: 37.58, lng: 126.98, ...over(i) }));
    const kinds: [FunItem['fun']['g'], string][] = [['G1', '한강공원'], ['G2', '포차거리'], ['G5', '찜질방'], ['G7', '소극장']];
    const set = [
      ...kinds.flatMap(([g, word]) => Array.from({ length: 6 }, (_, i) => place({ id: `kk-${g}${i}`, g, word, lat: 37.58, lng: 126.98 }))),
      ...many('s', 6, () => ({ kind: '연극', time: '수요일 23:00' })),
      ...many('t', 6, () => ({ kind: '전시/미술', end: DAY, time: '10:00~23:30' })),
    ];
    // 22:00 is night: 무대, 라이브, 포차, 한강, 놀거리 … 오늘만 (no 동네·전시 here)
    expect(buildShelves(set, at(22), null, SUNSET).map((s) => s.key)).toEqual(ORDER.night.filter((k) => ['stage', 'g7', 'g2', 'g1', 'g5', 'today'].includes(k)));
    expect(ORDER.night.slice(0, 3)).toEqual(['stage', 'g7', 'g2']);
    expect(ORDER.dusk[0]).toBe('g1');
    expect(ORDER.late[0]).toBe('g5');
    for (const band of Object.values(ORDER)) expect(band.indexOf('exhibit')).toBe(band.length - 1);
  });

  it('찜질방 all night; a bar open past midnight', () => {
    expect(likelyOpen(place({ g: 'G5', word: '찜질방' }), 23 * 60 + 45, 20, 11)).toBe(true);
    expect(likelyOpen(place({ g: 'G2', word: '포차거리' }), 23 * 60 + 50, 30, 11)).toBe(true);
    expect(likelyOpen(place({ g: 'G2', word: '포차거리' }), 60 + 40, 0, 11)).toBe(false);
  });

  it('the curated shelves: nearest first, with how far; 6 cards or more at 14:00 near the busy 동네', () => {
    const shelves = buildShelves(items, at(14), 망원, SUNSET);
    for (const key of ['g4', 'g5', 'g7'] as ShelfKey[]) {
      const s = shelves.find((x) => x.key === key);
      if (!s) continue;
      const km = s.cards.map((c) => distanceKm(망원, c.item));
      expect(km).toEqual([...km].sort((a, b) => a - b));
      for (const c of s.cards) expect(c.trip).not.toBeNull();
    }
    expect(shelves.find((x) => x.key === 'g7')!.cards.length).toBeGreaterThanOrEqual(6);
  });

  it('동네: those with ≥ 2 things in them now, nearest first, each with its count', () => {
    const hoods = buildShelves(items, at(14), 망원, SUNSET).find((s) => s.key === 'hood')!;
    expect(hoods.cards.length).toBeGreaterThan(0);
    const km = hoods.cards.map((c) => distanceKm(망원, c.item));
    expect(km).toEqual([...km].sort((a, b) => a - b));
    for (const c of hoods.cards) {
      expect(c.count).toBeGreaterThanOrEqual(HOOD_MIN);
      expect(c.count).toBe(inHood(c.item, items, at(14), 망원).length);
    }
  });

  it('an item takes its own kind\'s shelf; the day\'s list: 무대, 오늘만·이번 주까지, 전시 in that order of taking', () => {
    const a = item({ id: 'a', kind: '연극', end: DAY, time: '수요일 19:00', lat: 37.5, lng: 127.1 });
    const b = item({ id: 'b', kind: '전시/미술', end: '2026-11-07', lat: 37.5, lng: 127.1 });
    const c = item({ id: 'c', kind: '전시/미술', lat: 37.5, lng: 127.1 });
    const d = place({ id: 'kk-d', g: 'G7', word: '소극장', lat: 37.5, lng: 127.1 });
    const shelves = buildShelves([c, b, a, d], at(14), 경복궁, SUNSET);
    expect(Object.fromEntries(shelves.map((s) => [s.key, s.cards.map((x) => x.item.id)]))).toEqual({ g7: ['kk-d'], stage: ['a'], today: ['b'], exhibit: ['c'] });
    // a curated place's card line is its why
    expect(shelves.find((s) => s.key === 'g7')!.cards[0].why).toBe('소극장 · 망원');
  });

  it('a show that has started, a place shut for the day, a bar in the morning: left out', () => {
    const started = item({ id: 's', kind: '연극', time: '수요일 13:00' });
    const closed = item({ id: 'c', time: '10:00~13:00' });
    const later = item({ id: 'l', kind: '연극', time: '수요일 19:30' });
    const bar = place({ id: 'kk-b', g: 'G4', word: 'LP바' });
    const shelves = buildShelves([started, closed, later, bar], at(14), 경복궁, SUNSET);
    expect(ids(shelves)).toEqual(['l']);
    expect(shelves[0].cards[0].why).toBe('19:30 시작');
  });

  it('no basis: no distance; 동네 by how much is in them', () => {
    const shelves = buildShelves(items, at(14), null, SUNSET);
    for (const s of shelves) for (const c of s.cards) expect(c.trip).toBeNull();
    const counts = shelves.find((s) => s.key === 'hood')!.cards.map((c) => c.count!);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('nothing open: no shelves at all', () => {
    expect(buildShelves([item({ time: '10:00~13:00' })], at(14), 경복궁, SUNSET)).toEqual([]);
    expect(buildShelves([], at(14), 경복궁, SUNSET)).toEqual([]);
  });

  it("browseCard: the shelf's why and distance; null when shut", () => {
    const it0 = item({ id: 'a', end: DAY, time: '10:00~18:00' });
    expect(browseCard(it0, at(14), 경복궁)).toMatchObject({ why: '오늘까지 · 지금 열림 · 18:00까지', trip: { walk: true } });
    expect(browseCard(it0, at(19), 경복궁)).toBeNull();
  });
});

// 서울 홈의 선반 (ADR-0117 성공 기준, specs/seoul-home-shelves.md 테스트): the four 기준점 × 14·19·22시 on the 11-04 list
describe('서울 홈의 선반 (ADR-0117)', () => {
  const seoul = normalizeSpots(JSON.parse(readFileSync(resolve(__dirname, '../data/seoul/spots-seoul.json'), 'utf8')));
  const HERE = { 용산: { lat: 37.5299, lng: 126.9648 }, 노원: { lat: 37.6551, lng: 127.0613 }, 망원, 역삼: { lat: 37.5006, lng: 127.0364 } };
  const home = (p: { lat: number; lng: number }, h: number) => {
    const s = initialState({ dest: 'seoul', basis: 'gps', today: DAY, region: null, stay: null, saved: [], hintSeen: true, offline: false, clock: h * 60 });
    const origin = { key: 'gps', point: p, isPoint: true, from: '' };
    const sunset = sunsetMinutes(p, DAY);
    const moods = Object.fromEntries(MOOD_SHELVES.map((m) => [m, moodShelf(s, seoul, origin, m)]));
    return homeShelves(buildShelves(items, at(h), p, sunset), moods, h * 60, sunset);
  };
  const size = (sh: ReturnType<typeof home>[number]) => ('spots' in sh ? sh.spots : sh.cards).length;

  it.each(Object.entries(HERE).flatMap(([name, p]) => [14, 19, 22].map((h) => [name, h, p] as const)))('%s at %i:00: ≥ 4 shelves of ≥ 6, ≤ 12 each, none shut, each place once, the order table', (_, h, p) => {
    const list = home(p, h);
    // within those shown before 선반 더 보기 (Amendment 4): at most HOME_ROWS, the five moods' always among them
    const shown = homeShown(list);
    const seen = list.filter((_, i) => shown[i]);
    expect(seen.length).toBeLessThanOrEqual(HOME_ROWS);
    expect(seen.filter((sh) => size(sh) >= FULL).length).toBeGreaterThanOrEqual(4);
    for (const m of MOOD_SHELVES) expect(seen.map((sh) => sh.key)).toContain(m);
    for (const sh of list) {
      expect(size(sh)).toBeGreaterThan(0);
      expect(size(sh)).toBeLessThanOrEqual(PER_SHELF);
    }
    // nothing shut now: the day's list and the curated places by their hours; a mood's places by 서울's usual viewing hours
    // (Amendment 4: no 박물관·미술관 at 22:00)
    for (const sh of list) if ('cards' in sh) for (const c of sh.cards) expect(browseCard(c.item, at(h), p)).not.toBeNull();
    for (const sh of list) if ('spots' in sh) for (const x of sh.spots) expect(viewingShut(x, h * 60)).toBe(false);
    if (h === 22) for (const sh of list) if ('spots' in sh) for (const x of sh.spots) expect(x.name).not.toMatch(/박물관|미술관/);
    // each place once: by name, and a curated place that is a mood's place too (the same 카카오 id) once
    const names = list.flatMap((sh) => ('spots' in sh ? sh.spots.map((x) => x.name) : sh.cards.map((c) => c.item.title)));
    expect(new Set(names).size).toBe(names.length);
    const kakao = list.flatMap((sh) => ('spots' in sh ? sh.spots.map((x) => x.kakaoPlaceId) : sh.cards.map((c) => /kakao\.com\/(\d+)/.exec(c.item.link)?.[1]))).filter(Boolean);
    expect(new Set(kakao).size).toBe(kakao.length);
    // the order: the full ones first, each part in homeOrder of the hour's shelves
    const rank = ORDER[bandOf(h * 60, sunsetMinutes(p, DAY))];
    const funKeys = buildShelves(items, at(h), p, sunsetMinutes(p, DAY)).map((sh) => sh.key).sort((a, b) => rank.indexOf(a) - rank.indexOf(b));
    const keys = list.map((sh) => sh.key);
    const want = homeOrder(funKeys, h * 60).filter((k) => keys.includes(k));
    const full = want.filter((k) => size(list.find((sh) => sh.key === k)!) >= FULL);
    expect(keys).toEqual([...full, ...want.filter((k) => !full.includes(k))]);
    // all five moods have a shelf of their own here
    for (const m of MOOD_SHELVES) expect(keys).toContain(m);
  });

  it('shown before 선반 더 보기: the five moods always, the others in order up to HOME_ROWS (Amendment 4)', () => {
    const keys = ['hood', 'g4', 'famous', 'g5', 'new', 'g7', 'g1', 'today', 'stage', 'g2', 'exhibit', 'food', 'rest', 'walk'] as const;
    const shown = homeShown(keys.map((key) => ({ key })));
    expect(keys.filter((_, i) => shown[i])).toEqual(['hood', 'g4', 'famous', 'g5', 'new', 'g7', 'food', 'rest', 'walk']);
    expect(homeShown([{ key: 'famous' }, { key: 'rest' }]).every(Boolean)).toBe(true);
  });

  it('지금 여기서\'s place is on no shelf again (a curated place of the same name or 카카오 id too)', () => {
    const here = { id: 'h', name: '시장0', kakaoPlaceId: '102' } as Spot;
    const cards = Array.from({ length: 6 }, (_, i) => ({ item: place({ id: `kk-${i}`, g: 'G2', word: '전통시장', title: `시장${i}`, link: `https://place.map.kakao.com/${100 + i}` }), why: '', trip: null }));
    const out = homeShelves([{ key: 'g2', cards }], { famous: [here, { id: 'x', name: '궁', kakaoPlaceId: null } as Spot] }, 15 * 60, SUNSET, here);
    const g2 = out.find((sh) => sh.key === 'g2')!;
    expect('cards' in g2 && g2.cards.map((c) => c.item.title)).toEqual(['시장1', '시장3', '시장4', '시장5']);
    expect(out.flatMap((sh) => ('spots' in sh ? sh.spots.map((x) => x.id) : []))).toEqual(['x']);
  });

  it("서울's viewing places keep 10:00–18:00 (Amendment 4): out from 17:30 and before 10:00; food and the rest never", () => {
    const sp = (name: string, mood = 'new') => ({ id: name, name, mood }) as Spot;
    expect(viewingShut(sp('국립중앙박물관'), 14 * 60)).toBe(false);
    expect(viewingShut(sp('국립중앙박물관'), 17 * 60 + 30)).toBe(true);
    expect(viewingShut(sp('리움미술관'), 9 * 60)).toBe(true);
    expect(viewingShut(sp('경복궁'), 22 * 60)).toBe(true);
    expect(viewingShut(sp('궁중족발', 'food'), 22 * 60)).toBe(false);
    expect(viewingShut(sp('남산 야외식물원', 'walk'), 22 * 60)).toBe(false);
  });

  it("the order table: 먹기 second at 밥때 (else after the hour's), 유명한 데 third, 놀러 fifth, 쉬기·걷기 last", () => {
    const k: ShelfKey[] = ['hood', 'g4', 'g5', 'g7'];
    expect(homeOrder(k, 12 * 60)).toEqual(['hood', 'food', 'famous', 'g4', 'new', 'g5', 'g7', 'rest', 'walk']);
    expect(homeOrder(k, 18 * 60)).toEqual(['hood', 'food', 'famous', 'g4', 'new', 'g5', 'g7', 'rest', 'walk']);
    expect(homeOrder(k, 15 * 60)).toEqual(['hood', 'g4', 'famous', 'g5', 'new', 'g7', 'food', 'rest', 'walk']);
    expect(homeOrder(k, 21 * 60)).toEqual(['hood', 'g4', 'famous', 'g5', 'new', 'g7', 'food', 'rest', 'walk']);
    // no list: the moods alone
    expect(homeOrder([], 15 * 60)).toEqual(['famous', 'new', 'food', 'rest', 'walk']);
    expect(homeOrder([], 12 * 60)).toEqual(['food', 'famous', 'new', 'rest', 'walk']);
  });

  it('a place a shelf before took is passed over (id, name, 카카오 id); an empty mood shelf is not there; a short one goes to the back', () => {
    const sp = (id: string, name: string, kakao: string | null = null) => ({ id, name, kakaoPlaceId: kakao }) as Spot;
    const cards = Array.from({ length: 6 }, (_, i) => ({ item: place({ id: `kk-${i}`, g: 'G2', word: '전통시장', title: `시장${i}`, link: `https://place.map.kakao.com/${100 + i}` }), why: '', trip: null }));
    const out = homeShelves([{ key: 'g2', cards }], { food: [sp('a', '시장0'), sp('b', '딴집', '101'), sp('c', '국밥'), sp('e', '냉면')], famous: [sp('c', '국밥'), sp('d', '궁')], rest: [sp('a', '시장0')] }, 15 * 60, SUNSET);
    // 15:00: g2, 유명한 데, 먹기 (after the hour's), 쉬기 empty
    expect(out.map((sh) => sh.key)).toEqual(['g2', 'famous', 'food']);
    expect(out.slice(1).map((sh) => ('spots' in sh ? sh.spots.map((x) => x.id) : []))).toEqual([['c', 'd'], ['e']]);
    // a full mood shelf before a short curated one
    const many = Array.from({ length: 7 }, (_, i) => sp(`f${i}`, `곳${i}`));
    expect(homeShelves([{ key: 'g2', cards: cards.slice(0, 2) }], { famous: many }, 15 * 60, SUNSET).map((sh) => sh.key)).toEqual(['famous', 'g2']);
  });
});

describe('the card sheet and the addresses (ADR-0114 4·5)', () => {
  it("todayTimes: today's read times, '' when not read", () => {
    expect(todayTimes(item({ time: '화-토요일 11:00~18:00(월, 일요일 휴관)' }), at(14))).toBe('11:00~18:00');
    expect(todayTimes(item({ time: '평일 19:30, 주말 15:00' }), at(14))).toBe('19:30');
    expect(todayTimes(item({ time: '상시' }), at(14))).toBe('');
  });

  it('pictures: https only, http asked for over https', () => {
    // resized on this site's zone (Amendment 1), KOPIS's www. dropped (it only redirects)
    expect(RESIZE).toBe('https://yeochana.com/cdn-cgi/image/width=256,quality=75,format=auto/');
    expect(imageUrl('http://www.kopis.or.kr/upload/pfmPoster/PF_1.jpg')).toBe(`${RESIZE}https://kopis.or.kr/upload/pfmPoster/PF_1.jpg`);
    expect(imageUrl('https://kopis.or.kr/upload/a.png')).toBe(`${RESIZE}https://kopis.or.kr/upload/a.png`);
    // the Seoul events site never answers Cloudflare's fetch: the text card at once
    expect(imageUrl('https://culture.seoul.go.kr/cmmn/file/getImage.do?atchFileId=1&thumb=Y')).toBeNull();
    for (const bad of ['', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '//x.kr/a.jpg', 'ftp://x.kr/a.jpg', undefined]) expect(imageUrl(bad), String(bad)).toBeNull();
  });

  it('자세히: http(s) only', () => {
    expect(linkUrl('https://www.tinyticket.net/event/EV1')).toBe('https://www.tinyticket.net/event/EV1');
    expect(linkUrl(' http://galleryplanet.co.kr/a ')).toBe('http://galleryplanet.co.kr/a');
    for (const bad of ['', 'javascript:alert(1)', 'JavaScript:alert(1)', 'www.example.com', 'mailto:a@b.kr', 'tel:0212345678', undefined]) expect(linkUrl(bad), String(bad)).toBeNull();
  });
});

describe('머문 시간 (ADR-0114 7)', () => {
  it('in fives of seconds, 600 for ten minutes or more', () => {
    // fives (Amendment 1): 45 s is a bin's edge, so the verdict's 45-second line is read exactly
    expect([0, 4_999, 5_000, 44_999, 45_000, 49_999, 599_999, 600_000, 3_600_000, -5].map(dwellBucket)).toEqual([0, 0, 5, 40, 45, 45, 595, 600, 600, 0]);
  });
});
