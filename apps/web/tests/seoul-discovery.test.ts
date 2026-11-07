// 서울 매일 발굴 (ADR-0123, review/seoul-discovery/criteria-01.md): the engine's pure rules (ledger, the day's cap, same
// brand once, the sweep, pictures, the audit gate), the new places on 새로 생긴 곳 for 8 weeks and then their shelf or gone,
// and the cards' pictures straight from their source pages (lazy, no referrer, the station-sign tile when there is none or
// it fails).
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import FOUND from '../data/seoul/discovery-seoul.json';
import FUN from '../data/seoul/fun-seoul.json';
import { ORDER, SHELVES, buildShelves, directUrl } from '../src/seoul/browse';
import { browseCardSheet, homeShelvesView } from '../src/seoul/browse-view';
import type { Now } from '../src/culture/culture';
import { foundPlaces, funItems, hoursOf, type FunItem } from '../src/seoul/fun';
import { weeklyItems, type FoundRow } from '../src/seoul/weekly';
import * as L from '../scripts/seoul-discovery/lib.mjs';

const D = '2026-11-06';
const ledger = (names: Record<string, string> = {}) => ({ names: Object.fromEntries(Object.entries(names).map(([k, s]) => [L.norm(k), { status: s, day: D }])), kakao: {}, posts: {}, audits: [], lastAudit: null });
const cand = (name: string, kind: string, n = 1, word = '') => ({ name, kind, word, first: Array.from({ length: n }, (_, i) => ({ title: name, day: D, link: `${name}${i}` })) });
const found = (over: Partial<FoundRow>): FoundRow => ({ id: 'dc-1-20261101', name: '새 카페', kind: '새로 연 곳', word: '베이커리', start: '2026-11-01', end: L.addDays('2026-11-01', 55), time: '', place: '새 카페', lat: 37.5446, lng: 127.0559, kakao: 'https://place.map.kakao.com/1', src: 'https://news.example.com/1', reserve: 'none', line: '베이커리 · 성수', hood: '성수', gu: '성동구', added: D, ...over });
const now = (day: string, h: number): Now => ({ day, weekday: new Date(`${day}T00:00:00Z`).getUTCDay(), minute: h * 60 });
const 성수 = { lat: 37.5446, lng: 127.0559 };

describe('the shipped files', () => {
  it('discovery-seoul.json: every row in shape (kind, dates, Seoul, https, a new place 8 weeks with its word), pictures https', () => {
    for (const r of FOUND.items as FoundRow[]) {
      expect(L.KINDS).toContain(r.kind);
      expect(r.start <= r.end).toBe(true);
      expect(r.lat > 37.4 && r.lat < 37.72 && r.lng > 126.76 && r.lng < 127.19).toBe(true);
      expect(r.kakao).toMatch(/^https:\/\/place\.map\.kakao\.com\/\d+$/);
      expect(r.src).toMatch(/^https:\/\//);
      if (r.kind === '새로 연 곳') {
        expect(L.WORDS).toContain(r.word);
        expect(r.end).toBe(L.addDays(r.start, 55));
      }
      if (r.img) expect(directUrl(r.img)).toBe(r.img);
    }
  });
  it('fun-seoul.json pictures (the one batch): https, a source name and its page, never a blog, SNS or map page', () => {
    const withImg = (FUN.places as { img?: string; imgFrom?: string; imgPage?: string }[]).filter((p) => p.img);
    expect(withImg.length).toBeGreaterThan(0);
    for (const p of withImg) {
      expect(p.img).toMatch(/^https:\/\//);
      expect(p.imgFrom).toBeTruthy();
      expect(L.okPage(p.imgPage!)).toBe(true);
      expect(L.badImage(p.img!, { w: 1200, h: 630 }, 1)).toBe('');
    }
    expect(new Set(withImg.map((p) => p.img)).size).toBe(withImg.length);
  });
});

describe('the day (criteria-01 3절)', () => {
  it('what the ledger has, a big chain and a 유흥 name never go to the judge; at most the cap, the lanes in turn, the rest queued', () => {
    const r = L.pickDay([cand('본 팝업', '팝업', 3), cand('스타벅스 성수점', '새로 연 곳', 5, '카페'), cand('헌팅포차 홍대', '새로 연 곳', 1, '바'), cand('A 팝업', '팝업', 4), cand('B 팝업', '팝업', 2), cand('C 베이커리', '새로 연 곳', 1, '베이커리')], [], ledger({ '본 팝업': 'dropped' }), D, 2);
    expect(r.skipped).toMatchObject({ ledger: 1, mass: 1, adult: 1 });
    expect(r.pick.map((c) => c.name)).toEqual(['A 팝업', 'C 베이커리']);
    expect(r.rest.map((c) => c.name)).toEqual(['B 팝업']);
  });
  it('a queued one stays 7 days, then goes', () => {
    const q = [{ ...cand('옛 팝업', '팝업'), firstSeen: L.addDays(D, -7) }, { ...cand('어제 팝업', '팝업'), firstSeen: L.addDays(D, -1) }];
    const r = L.pickDay([], q, ledger(), D, 60);
    expect(r.pick.map((c) => c.name)).toEqual(['어제 팝업']);
    expect(r.skipped.old).toBe(1);
  });
  it('a keep in shape only: a new place ends 55 days after it opened, opened D−28..D+7; an event still on and begun by D+7', () => {
    const k = { kakao: { address: '서울 성동구 성수동' } };
    const base = { kind: '새로 연 곳', word: '카페', start: '2026-11-01', end: L.addDays('2026-11-01', 55), reserve: 'none', src: 'https://x.kr/1' };
    expect(L.badKeep(base, k, D)).toBe('');
    expect(L.badKeep({ ...base, end: '2026-12-31' }, k, D)).toMatch(/55/);
    expect(L.badKeep({ ...base, start: '2026-09-01', end: L.addDays('2026-09-01', 55) }, k, D)).toMatch(/outside/);
    expect(L.badKeep({ ...base, word: '식당' }, k, D)).toBe('word');
    const ev = { kind: '팝업', word: '', start: '2026-11-01', end: '2026-11-05', reserve: 'none', src: 'https://x.kr/1' };
    expect(L.badKeep(ev, k, D)).toBe('not this week');
    expect(L.badKeep({ ...ev, end: '2026-11-20' }, k, D)).toBe('');
    expect(L.badKeep({ ...ev, end: '2026-11-20' }, { kakao: { address: '경기 하남시' } }, D)).toBe('not Seoul');
  });
  it('same brand once: one branch a day, none when the brand is already shipped (unless a flagship)', () => {
    const out = L.sameBrandOnce(
      [
        { cid: '1', name: '새카페 연남점', kind: '새로 연 곳', total: 3 },
        { cid: '2', name: '새카페 망원점', kind: '새로 연 곳', total: 9 },
        { cid: '3', name: '프릳츠 원서점', kind: '새로 연 곳' },
        { cid: '4', name: '프릳츠 플래그십', kind: '새로 연 곳' },
      ],
      [{ name: '프릳츠 도화점' }],
    );
    expect(Object.keys(out).sort()).toEqual(['1', '3']);
  });
});

describe('the place check (criteria-02 4절)', () => {
  const hoods = [{ name: '성수', lat: 37.5424, lng: 127.0564 }, { name: '합정·상수', lat: 37.549, lng: 126.914 }];
  it('the post area from its place words first, else its posts: 구, 동 (「성수동2가」 is 성수), 동네', () => {
    expect(L.areaOf('성동구 서울숲2길 43', [{ title: '마포구 홍대', day: D, link: 'x' }], hoods)).toEqual({ gus: ['성동'], dongs: [], hoods: [] });
    expect(L.areaOf('', [{ title: '상수 신상 카페', day: D, link: 'x' }], hoods).hoods).toEqual(['합정·상수']);
    expect(L.areaOf('더현대 서울', [], hoods)).toEqual({ gus: [], dongs: [], hoods: [] });
  });
  it('a Kakao result counts only where its 구, its 동 or its 700 m around a 동네 is the post one', () => {
    const a = L.areaOf('', [{ title: '성수동 팝업', day: D, link: 'x' }], hoods);
    const seongsu = { address: '서울 성동구 연무장길 1', jibun: '서울 성동구 성수동2가 1', lat: 37.543, lng: 127.056 };
    const mapo = { address: '서울 마포구 와우산로 1', jibun: '서울 마포구 서교동 1', lat: 37.551, lng: 126.922 };
    expect(L.areaMatch(seongsu, a, hoods)).toBe(true);
    expect(L.areaMatch(mapo, a, hoods)).toBe(false);
    expect(L.placeOf([mapo, seongsu], a, hoods)).toBe(seongsu);
    expect(L.placeOf([mapo], a, hoods)).toBeNull();
    expect(L.areaMatch(mapo, { gus: ['마포'], dongs: [], hoods: [] }, hoods)).toBe(true);
  });
});

describe('the sweep (9절)', () => {
  it('an event goes the day after it ends; a new place is checked at 8 weeks, kept after its shelf is set', () => {
    expect(L.sweepOf({ kind: '팝업', start: '2026-11-01', end: '2026-11-05' }, D)).toBe('ended');
    expect(L.sweepOf({ kind: '팝업', start: '2026-11-01', end: D }, D)).toBe('keep');
    const p = { kind: '새로 연 곳', start: '2026-09-11', end: L.addDays('2026-09-11', 55) };
    expect(L.sweepOf(p, D)).toBe('check');
    expect(L.sweepOf({ ...p, start: '2026-09-12' }, D)).toBe('keep');
    expect(L.sweepOf({ ...p, stay: 'G8' }, D)).toBe('keep');
  });
  it('still loved: 3 posts naming it in 30 days, none about closing; the shelf by its word (shops have none yet)', () => {
    const posts = (n: number, t = '새카페 다녀옴') => Array.from({ length: n }, () => ({ day: '2026-10-30', title: t }));
    expect(L.stillLoved({ name: '새카페' }, posts(3), D)).toBe(true);
    expect(L.stillLoved({ name: '새카페' }, posts(2), D)).toBe(false);
    expect(L.stillLoved({ name: '새카페' }, [...posts(3), { day: '2026-11-01', title: '새카페 폐업 소식' }], D)).toBe(false);
    expect([L.stayOf('베이커리'), L.stayOf('서점'), L.stayOf('칵테일바'), L.stayOf('소품샵')]).toEqual(['G8', 'G4', 'G10', null]);
  });
  it('closed: its kakao id gone from a search by name, or a post naming it with 폐업·영업종료·휴업·이전', () => {
    const it0 = { name: '새카페 성수점', kakao: 'https://place.map.kakao.com/42' };
    expect(L.closedSignal(it0, ['42'], ['새카페 신메뉴'])).toBe('');
    expect(L.closedSignal(it0, ['7'], [])).toMatch(/kakao/);
    expect(L.closedSignal(it0, ['42'], ['새카페 영업종료 안내'])).toMatch(/blog/);
    expect(L.closedSignal(it0, ['42'], ['다른집 폐업'])).toBe('');
  });
});

describe('pictures (10절)', () => {
  it('never a blog, SNS, map or booking page', () => {
    for (const u of ['https://blog.naver.com/a/1', 'https://m.blog.naver.com/a', 'https://www.instagram.com/x', 'https://place.map.kakao.com/1', 'https://map.naver.com/p', 'https://linktr.ee/x', 'https://x.tistory.com/1']) expect(L.okPage(u)).toBe(false);
    expect(L.okPage('https://www.yna.co.kr/view/AKR1')).toBe(true);
  });
  it('og:image read whatever the attribute order, relative to the page, upgraded to https', () => {
    expect(L.ogOf('<meta content="/a.jpg" property="og:image"><meta property="og:site_name" content="노들섬">', 'http://nodeul.org/x')).toEqual({ image: 'https://nodeul.org/a.jpg', site: '노들섬' });
    expect(L.ogOf('<meta name="twitter:image" content="https://i.kr/b.png">', 'https://i.kr/').image).toBe('https://i.kr/b.png');
  });
  it('a picture big enough, not a logo, not over 1.5 MB, a sane shape; its size read from its bytes', () => {
    const png = new Uint8Array(32);
    new DataView(png.buffer).setUint32(0, 0x89504e47);
    new DataView(png.buffer).setUint32(16, 1200);
    new DataView(png.buffer).setUint32(20, 630);
    expect(L.imageSize(png)).toEqual({ type: 'png', w: 1200, h: 630 });
    expect(L.badImage('https://a.kr/p.png', { w: 1200, h: 630 }, 1000)).toBe('');
    expect(L.badImage('https://a.kr/logo.png', { w: 1200, h: 630 }, 1000)).toBeTruthy();
    expect(L.badImage('https://a.kr/p.png', { w: 300, h: 200 }, 1000)).toBe('too small');
    expect(L.badImage('https://a.kr/p.png', { w: 3000, h: 600 }, 1000)).toBe('odd shape');
    expect(L.badImage('https://a.kr/p.png', { w: 1200, h: 630 }, L.MAX_IMAGE + 1)).toBeTruthy();
    expect(L.badImage('http://a.kr/p.png', { w: 1200, h: 630 }, 1)).toBe('not https');
  });
  it('criteria-02: a logo-like picture is no picture — share-image, kakao share, a small square', () => {
    expect(L.badImage('https://a.kr/web/upload/share-image-1-ab.jpg', { w: 1200, h: 630 }, 1)).toBeTruthy();
    expect(L.badImage('https://a.kr/kakao1.jpg', { w: 1200, h: 630 }, 1)).toBeTruthy();
    expect(L.badImage('https://a.kr/p.png', { w: 500, h: 500 }, 1)).toMatch(/square/);
    expect(L.badImage('https://a.kr/p.png', { w: 1080, h: 1080 }, 1)).toBe('');
    // Amendment 2: a Notion proxy, a shop's product thumbnail, a site's own screen capture
    expect(L.badImage('https://oopy.lazyrockets.com/api/v2/notion/image?src=x', { w: 1200, h: 630 }, 1)).toMatch(/platform/);
    expect(L.badImage('https://fritz.co.kr/web/product/small/a.png', { w: 1200, h: 630 }, 1)).toBeTruthy();
    expect(L.badImage('https://storage.googleapis.com/cr/yegreen-screen-thumb.png', { w: 1200, h: 630 }, 1)).toBeTruthy();
  });
  it('a news article is a picture source only when its title has the name\'s core word', () => {
    expect(L.coreWord('2026 코치 LIVE YOUR STORY 팝업')).toBe('코치');
    expect(L.coreWord('성수 팝업스토어')).toBe('');
  });
});

describe('the weekly audit (8절)', () => {
  it('a fixed sample by the day; the gate is 90% of the shipped sample agreeing', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `c${String(i).padStart(2, '0')}`);
    expect(L.sampleOf(ids, 40, 20261106)).toEqual(L.sampleOf(ids, 40, 20261106));
    expect(L.sampleOf(ids, 40, 20261106)).toHaveLength(40);
    const keep = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    expect(L.gateOf(keep, ['z'], Object.fromEntries(keep.map((k, i) => [k, i ? 'keep' : 'drop']))).pass).toBe(true);
    expect(L.gateOf(keep, ['z'], Object.fromEntries(keep.map((k, i) => [k, i > 1 ? 'keep' : 'drop']))).pass).toBe(false);
    expect(L.gateOf([], [], {}).pass).toBe(false);
  });
});

describe('새로 생긴 곳 (ADR-0123 4·5)', () => {
  it('none before it opens, NEW to its end (opening + 55 days), then its shelf when the sweep set one, else gone', () => {
    const r = found({});
    expect(foundPlaces('2026-10-31', [r])).toEqual([]);
    expect(foundPlaces('2026-11-01', [r])[0].g).toBe('NEW');
    expect(foundPlaces(r.end, [r])[0].g).toBe('NEW');
    expect(foundPlaces(L.addDays(r.end, 1), [r])).toEqual([]);
    expect(foundPlaces(L.addDays(r.end, 1), [{ ...r, stay: 'G8' }])[0].g).toBe('G8');
    // a dated row is the week's, never a new place
    expect(foundPlaces(D, [found({ kind: '팝업', word: '' })])).toEqual([]);
    expect(weeklyItems(D, [], [found({ kind: '행사', word: '', end: '2026-11-20' })])[0].time).toBe('11:00~20:00');
  });
  it('a new shop by the shops\' hours (12–20)', () => {
    for (const w of ['소품샵', '문구점', '향', '리빙숍', '빈티지숍', '편집숍', '플래그십', '서점', '레코드숍']) expect(hoursOf(w)).toEqual([720, 1200]);
  });
  it('its own shelf, third by day (이번 주 서울 and 카페·디저트 first), sixth at night (밤 놀거리 fourth kept)', () => {
    expect(SHELVES).toContain('fresh');
    expect(ORDER.day.slice(0, 3)).toEqual(['week', 'g8', 'fresh']);
    expect(ORDER.night.indexOf('g10')).toBe(3);
    expect(ORDER.night.indexOf('fresh')).toBe(5);
    for (const b of Object.values(ORDER)) expect(b).toContain('fresh');
    const items = funItems(D).filter((i) => i.fun.g === 'G8').slice(0, 1).map((i) => ({ ...i, id: 'dc-x', fun: { ...i.fun, g: 'NEW' as const } }) as FunItem);
    const s = buildShelves(items, now(D, 14), null, 17 * 60 + 25);
    expect(s.map((x) => x.key)).toEqual(['fresh']);
  });
});

describe('the card (ADR-0123 6·7)', () => {
  const doc = () => new JSDOM('<!doctype html><body></body>').window.document;
  const item = (img: string): FunItem => ({ id: 'kk-9', title: '어느 빵집', kind: '베이커리', place: '베이커리 · 망원', gu: '', lat: 37.5559, lng: 126.9063, start: D, end: D, time: '', free: false, forAll: true, link: 'https://place.map.kakao.com/9', image: img, fun: { g: 'G8', word: '베이커리', walkin: true, hood: '망원', ...(img ? { from: '어느 빵집' } : {}) } });
  const shelf = (it: FunItem) => homeShelvesView(doc(), buildShelves([it], now(D, 14), null, 17 * 60 + 25), { rest: '', walk: '', new: '', famous: '', food: '' }, []).querySelector('.bcard')!;
  it('with a picture: from its source as it is (not resized), lazily, no referrer; the tile under it; the name and the kind under', () => {
    const card = shelf(item('https://bread.kr/og.jpg'));
    const img = card.querySelector('.bpic.pl img')!;
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect((img as HTMLImageElement).dataset.src ?? img.getAttribute('src')).toBe('https://bread.kr/og.jpg');
    expect(card.querySelector('.bpic')!.classList.contains('noimg')).toBe(false);
    expect(card.querySelector('.btile .bh')!.textContent).toBe('망원');
    expect(card.querySelector('.nm')!.textContent).toBe('어느 빵집');
    expect(card.querySelector('.meta')!.textContent).toBe('베이커리');
  });
  it('a picture that fails: the tile (the box keeps its size)', () => {
    const card = shelf(item('https://bread.kr/og.jpg'));
    card.querySelector('img')!.dispatchEvent(new card.ownerDocument.defaultView!.Event('error'));
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector('.bpic.pl')!.classList.contains('noimg')).toBe(true);
    // the sign now names it: the name line under it is for the screen reader only
    expect(card.querySelector('.nm')!.classList.contains('sr')).toBe(true);
  });
  it('none (or not https): the station sign (ADR-0127 2) — the 동네 on the band, the name large, no icon; the kind under it', () => {
    for (const u of ['', 'http://bread.kr/og.jpg', 'javascript:alert(1)']) {
      const card = shelf(item(u));
      expect(card.querySelector('img')).toBeNull();
      const sign = card.querySelector('.bpic.noimg .btile.t-g8')!;
      expect(sign.querySelector('.bband .bh')!.textContent).toBe('망원');
      expect(sign.querySelector('.bname')!.textContent).toBe('어느 빵집');
      expect(sign.querySelector('svg')).toBeNull();
      // its kind once: the card's line, not the sign
      expect(sign.textContent).not.toContain('베이커리');
      expect([...card.querySelectorAll('.meta')].map((m) => m.textContent)).toContain('베이커리');
      // the name stays under the sign for the screen reader (the sign is aria-hidden)
      expect(card.querySelector('.nm')!.textContent).toBe('어느 빵집');
    }
  });
  it('the sheet names the picture\'s source', () => {
    const it0 = item('https://bread.kr/og.jpg');
    const sheet = browseCardSheet(doc(), [it0], it0.id, now(D, 14), 성수, 'naver', (n) => n, [])!;
    expect([...sheet.querySelectorAll('.bc-facts li')].map((l) => l.textContent)).toContain('그림: 어느 빵집');
  });
});
