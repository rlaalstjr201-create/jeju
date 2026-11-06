// 체험 예약 경로 (ADR-0074, specs/booking-routes.md): every 체험 shown has one verified route; the rest leave the picks.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyBooking, loadBookingCalls, loadBookRoutes } from '../scripts/booking.mjs';
import { assignSlugs, buildSite } from '../scripts/landing';
import { AREAS } from '../src/region/areas';
import { normalizeSpots } from '../src/pick/data';
import { bookLink } from '../src/pick/links';
import { REACHES, listed, pickCards, withinReach, type Spot } from '../src/pick/pick';
import { fileSpots } from './fixtures';

const root = resolve(__dirname, '..');
const doo = fileSpots.filter((s) => s.mood === 'new' && s.sub === 'do');

describe('B1 데이터: 체험마다 확인된 경로 하나, 아니면 기록된 이유', () => {
  const routes = loadBookRoutes();
  const calls = loadBookingCalls();

  // ADR-0105 다시 나누기 v5: 목장·농장 5곳이 놀거리로 들어와(아침미소목장은 홈페이지 경로), 경로 없는 21곳 중 11곳은 예약 없이 가는 곳(walkin)
  it('318 체험: 271 with book (naver 124 · mrt 9 · visitjeju 1 · homepage 23 · phone 114), 26 closed, 11 walkin, 10 without a route', () => {
    expect(doo).toHaveLength(318);
    const kinds: Record<string, number> = {};
    for (const s of doo) if (s.book) kinds[s.book.k] = (kinds[s.book.k] ?? 0) + 1;
    expect(kinds).toEqual({ naver: 124, mrt: 9, visitjeju: 1, homepage: 23, phone: 114 });
    expect(doo.filter((s) => s.hide === 'closed')).toHaveLength(26);
    expect(doo.filter((s) => !s.book && !s.hide && s.walkin)).toHaveLength(11);
    expect(doo.filter((s) => !s.book && !s.hide && !s.walkin)).toHaveLength(10);
    expect(fileSpots.filter((s) => s.walkin).every((s) => s.mood === 'new' && s.sub === 'do' && !s.book)).toBe(true);
    expect(fileSpots.filter((s) => s.book || s.hide).every((s) => s.mood === 'new' && s.sub === 'do')).toBe(true);
  });

  it("each book is the routes.json best, accepted; each 체험 without one has a recorded call with reason and evidence", () => {
    for (const s of doo) {
      if (s.book) expect(s.book, s.name).toEqual(routes.get(s.id));
      else expect(calls.get(s.id), s.name).toBe(s.hide === 'closed' ? 'closed' : s.walkin ? 'walkin' : 'noroute');
    }
    const raw = JSON.parse(readFileSync(resolve(root, 'review/booking/routes.json'), 'utf8')).spots as Record<string, { best: string | null; routes: { kind: string; url: string; verdict: string }[] }>;
    for (const [id, b] of routes) expect(raw[id].routes.some((r) => r.kind === b.k && r.url === b.u && r.verdict === 'accepted')).toBe(true);
    for (const s of doo.filter((x) => x.book)) expect(s.book!.u).not.toContain('myrealtrip.com/search');
  });

  it('the rule is idempotent on the shipped file, build-spots.mjs applies it last, and an unjudged 체험 stops it', () => {
    expect(JSON.stringify(applyBooking(fileSpots))).toBe(readFileSync(resolve(root, 'public/spots.json'), 'utf8'));
    expect(readFileSync(resolve(root, 'scripts/build-spots.mjs'), 'utf8')).toMatch(/kept = applyBooking\(kept/);
    const x = { id: 'x', name: 'x', mood: 'new', sub: 'do' };
    expect(() => applyBooking([x], new Map(), new Map())).toThrow(/no booking route/);
    expect(applyBooking([{ ...x, book: { k: 'phone', u: 'tel:0640000000' } }, { ...x, id: 'r', mood: 'rest', hide: 'closed' }], new Map(), new Map([['x', 'noroute']]))).toEqual([x, { ...x, id: 'r', mood: 'rest' }]);
  });
});

describe('B2 앱: 보이는 체험 카드는 모두 경로가 있다', () => {
  it('closed places are dropped at load; a malformed route is dropped (the 체험 then leaves the picks)', () => {
    const loaded = normalizeSpots(fileSpots);
    expect(loaded).toHaveLength(fileSpots.length - 26);
    expect(loaded.some((s) => s.hide)).toBe(false);
    const s = doo.find((x) => x.book)!;
    const [bad, tel] = normalizeSpots([{ ...s, book: { k: 'phone', u: 'javascript:alert(1)' } }, { ...s, id: 't', book: { k: 'naver', u: 'tel:0640000000' } }]);
    expect('book' in bad).toBe(false);
    expect(listed(bad)).toBe(false);
    expect('book' in tel).toBe(false);
  });

  it('15 areas × 3 ranges: 체험 shows 3 cards, every one with a route; 섞어서 and 아무거나 never show a 체험 without one', () => {
    for (const a of AREAS) {
      for (const reach of REACHES) {
        const doTab = pickCards(fileSpots, a, 'new', {}, 'do', reach).cards;
        expect(doTab, `${a.name} ${reach}`).toHaveLength(3);
        expect(doTab.every((c) => (c.spot.book && bookLink(c.spot)) || (c.spot.walkin && !c.spot.book && !bookLink(c.spot))), `${a.name} ${reach}`).toBe(true);
        let h = {};
        for (let i = 0; i < 4; i++) {
          for (const [b, tab] of [['new', 'mix'], ['any', undefined]] as const) {
            const r = pickCards(fileSpots, a, b, h, tab, reach);
            h = r.histories;
            expect(r.cards.every((c) => listed(c.spot)), `${a.name} ${reach} ${b}`).toBe(true);
          }
        }
      }
    }
  });

  it('within reach: 차로 30분 ≥ 28 체험 in every area, 차로 1시간 ≥ 97 (우도 lowest); 걸어서 uses the nearest-3 rule', () => {
    const shown = doo.filter(listed);
    // 271 with a route + 11 예약 없이 가는 곳 (ADR-0074 Amendment 1)
    expect(shown).toHaveLength(282);
    const min = (reach: (typeof REACHES)[number]) => Math.min(...AREAS.map((a) => shown.filter((s) => withinReach(reach, a, s)).length));
    expect(min('drive30')).toBe(28);
    expect(min('drive60')).toBe(97);
  });

  it('honest words per kind; 비짓제주 said by where it leads', () => {
    const s = doo.find((x) => x.book)! as Spot;
    const words = (k: string, u: string) => bookLink({ ...s, name: '가게', book: { k, u } as Spot['book'] })!;
    expect(words('naver', 'https://m.booking.naver.com/booking/5/bizes/1').text).toBe('네이버로 예약하기');
    expect(words('mrt', 'https://experiences.myrealtrip.com/products/1').text).toBe('마이리얼트립에서 예약');
    expect(words('visitjeju', 'https://m.booking.naver.com/booking/12/bizes/242281?area=bmp').text).toBe('네이버로 예약하기');
    expect(words('homepage', 'https://example.com').text).toBe('홈페이지에서 예약 확인');
    expect(words('phone', 'tel:0647393333')).toEqual({ href: 'tel:0647393333', text: '전화로 예약', aria: '가게, 전화로 예약' });
    expect(bookLink({ ...s, book: undefined })).toBeNull();
  });
});

describe('B3 랜딩: 체험 장소 쪽은 같은 경로, 경로 없는 체험은 쪽이 없다', () => {
  const base = { lat: 33.462, lng: 126.31, mood: 'new', sub: 'do', image: 'https://api.cdn.visitjeju.net/x.webp', kakaoPlaceId: null, bookable: true, score: 3, indoor: true } as const;
  const spots: Spot[] = [
    { ...base, id: 'b1', name: '애월 공방', reason: '나무로 작은 소품을 직접 만들어 가요', book: { k: 'phone', u: 'tel:0647393333' } },
    { ...base, id: 'b2', name: '애월 도자기', reason: '물레를 돌려 컵 하나를 빚어 봐요' },
    { ...base, id: 'b3', name: '애월 승마', reason: '바다를 보며 말을 타고 천천히 걸어요', sub: 'sight', mood: 'new' },
  ];
  it('the route link sits with the map links (rel=noopener, named); a 체험 without one gets no page', () => {
    const { pages, places } = buildSite({ spots, slugs: assignSlugs(spots, {}), site: '', photos: false, dataDate: null });
    expect(places.map((p) => p.spot.id).sort()).toEqual(['b1', 'b3']);
    const html = pages.find((p) => p.id === 'b1')!.html;
    expect(html).toContain('<a class="tbtn" href="tel:0647393333" rel="noopener" aria-label="애월 공방, 전화로 예약">전화로 예약</a>');
    expect(pages.find((p) => p.id === 'b3')!.html).not.toContain('예약');
  });
});
