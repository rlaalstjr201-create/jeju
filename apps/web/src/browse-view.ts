// 오늘 서울 둘러보기 (ADR-0114): the whole-screen view (1·2) and the card sheet over it (4), in the culture chunk
// (culture-view.ts, ADR-0100: never in the entry). Its stylesheet comes with that chunk. The shelves are browse.ts's;
// the pictures load from the event and show sites themselves (5), lazily, over https, and a picture that fails becomes a
// text card. Titles, places, kinds and time words stay as the list gives them (Korean).
import './browse.css';
import { browseCard, buildShelves, homeShown, imageUrl, inHood, linkUrl, todayTimes, type BrowseCard, type MoodShelf, type Shelf, type ShelfKey } from './browse';
import type { CultureItem, Now } from './culture';
import { isFun } from './fun';
import { isWeek } from './weekly';
import { sunsetMinutes } from './sun';
import type { Day } from './dates';

const CITY_HALL = { lat: 37.5663, lng: 126.9779 };
import { GO_TEXT, goLink, type MapApp } from './links';
import { TRAVEL_TEXT, formatMinutes, type Spot } from './pick';
import { COPY } from './render';

/** Its words (ADR-0093: another language's come in through culture-view.ts words, as one table). */
export const BROWSE_COPY = {
  /** the way in on 서울's home, and the screen's title */
  open: '오늘 서울 둘러보기',
  note: '지금 갈 수 있는 것만, 지금 시간에 맞는 것부터 모았어요.',
  shelf: { hood: '걸어 볼 동네', g1: '한강·노을·야경', g2: '시장·포차', g4: '서점·LP·레코드', g5: '몸으로 놀기', g6: '야구 직관', g7: '라이브·인디', week: '이번 주 서울', stage: '오늘 무대', today: '오늘만·이번 주까지', exhibit: '전시·박물관' } satisfies Record<ShelfKey, string>,
  /** a 동네 card: what is in it now */
  hoodCount: (n: number) => `지금 갈 곳 ${n}`,
  /** a curated place's sheet: no reservation known */
  booking: '예약이 필요할 수 있어요',
  /** a curated place's sheet: hours are not in our data */
  hours: '영업시간은 카카오맵에서 확인해 주세요',
  kakao: '카카오맵에서 보기',
  fromKakao: '장소 정보: 카카오맵',
  /** the 동네 sheet's heading over its list */
  inHood: '지금 이 동네에서',
  /** 서울 홈 (ADR-0117 Amendment 3): the shelves past the first HOME_SHELVES */
  moreShelves: '선반 더 보기',
  /** a mood's shelf with no place in reach now (Amendment 5): its heading still goes to the results */
  noneNear: '지금 닿는 곳에 없어요',
  none: '지금 둘러볼 것이 없어요.',
  /** 오늘 시간 on the card sheet: 「오늘 11:00~18:00」 */
  today: (times: string) => `오늘 ${times}`,
  more: '자세히(예매·안내)',
  /** 이번 주 서울 (ADR-0118): the card sheet's dates 「11.1~11.16」, a queue that may be there, its source post, the source line */
  period: (from: string, to: string) => `${from}~${to}`,
  onsite: '현장 대기가 있을 수 있어요',
  post: '출처 글 보기',
  fromWeek: '정보: 네이버 블로그·뉴스 · 장소: 카카오맵',
};

function el(doc: Document, tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

const tripText = (c: BrowseCard) => (c.trip ? (c.trip.walk ? TRAVEL_TEXT.walk : TRAVEL_TEXT.drive)(undefined, formatMinutes(c.trip.minutes)) : '');

/** The picture box: the poster resized (browse.ts imageUrl), or (none, or one that fails: never the full-size original) the
 * kind as a text card. With `later` its address is set only once the box is in view (the screen's watcher): the browser's
 * own lazy loading still asks for dozens of a shelf's hidden cards at once. */
function pic(doc: Document, it: CultureItem, later?: IntersectionObserver): HTMLElement {
  // a curated place or a 동네 has no picture: a short tile in its kind's colour, the name large on it (ADR-0115); the week's
  // too, its kind over its name (ADR-0118 Amendment 1)
  if (isFun(it) || isWeek(it)) {
    const tile = el(doc, 'span', { class: `btile t-${isFun(it) ? it.fun.g.toLowerCase() : 'week'}`, 'aria-hidden': 'true' });
    tile.append(el(doc, 'span', { class: 'bk' }, !isFun(it) || it.fun.g === 'hood' ? it.kind : it.place.split(' · ')[0]), el(doc, 'span', { class: 'bt' }, it.title));
    return tile;
  }
  const box = el(doc, 'span', { class: 'bpic' });
  const src = imageUrl(it.image);
  box.append(el(doc, 'span', { class: 'balt', 'aria-hidden': 'true' }, it.kind.replace(/\//g, '·')));
  // no-referrer: the event site is told nothing of this page; the box (browse.css, 5:7) holds its size before it loads
  if (src) {
    const img = el(doc, 'img', { alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' }) as HTMLImageElement;
    // listened to before the address is set: a failure is never missed
    img.addEventListener('error', () => brokenPicture(img), { once: true });
    if (later) {
      img.dataset.src = src;
      later.observe(img);
    } else img.setAttribute('src', src);
    box.append(img);
  } else box.classList.add('noimg');
  return box;
}

/** A shelf's card: the picture or tile, the title, why now, how far; pressed, its sheet. */
function cardLi(doc: Document, c: BrowseCard, later?: IntersectionObserver): HTMLElement {
  const b = el(doc, 'button', { type: 'button', class: 'bcard', 'data-action': 'browse-card', 'data-id': c.item.id });
  const tile = isFun(c.item) || isWeek(c.item);
  b.append(pic(doc, c.item, later), el(doc, 'span', { class: tile ? 'nm sr' : 'nm' }, c.item.title));
  // a curated place's tile says its kind already: under it, the rest of its line (where, or how many shows)
  const why = c.count !== undefined ? BROWSE_COPY.hoodCount(c.count) : isFun(c.item) ? c.why.split(' · ').slice(1).join(' · ') || c.why : c.why;
  const trip = tripText(c);
  // the week's: one short line, 「토요일까지 · 걸어서 약 20분」
  if (isWeek(c.item)) {
    const line = [why, trip].filter(Boolean).join(' · ');
    if (line) b.append(el(doc, 'span', { class: 'meta' }, line));
  } else {
    if (why) b.append(el(doc, 'span', { class: 'meta' }, why));
    if (trip) b.append(el(doc, 'span', { class: 'meta' }, trip));
  }
  const li = el(doc, 'li');
  li.append(b);
  return li;
}

/** A mood shelf's place (서울 홈, ADR-0117): its photo, name and how far. */
export interface MoodCard {
  id: string;
  name: string;
  image: string;
  trip: string;
}
export type HomeRow = Shelf | { key: MoodShelf; cards: MoodCard[] };

let homeWatch: IntersectionObserver | undefined;
/** 선반 더 보기 pressed: open for the rest of the visit (a redraw, the list's minute moving on, keeps it open) */
let allShelves = false;
/** 서울 홈의 선반 (ADR-0117, specs/seoul-home-shelves.md): each shelf a heading — a mood's is its button (the same as the mood
 * button: its results) — and its cards side by side. A mood card is that mood's results with the place first (Amendment 1).
 * The pictures are asked for once in view, and while the 시작 화면 covers the home held back for it (later.ts, ADR-0116). */
export function homeShelvesView(doc: Document, shelves: readonly HomeRow[], labels: Record<MoodShelf, string>, sources: HTMLElement[]): HTMLElement {
  const box = el(doc, 'div', { id: 'shelves', class: 'shelves' });
  const view = doc.defaultView;
  const start = () => doc.documentElement.classList.contains('yc-start');
  const later =
    view && 'IntersectionObserver' in view
      ? new view.IntersectionObserver((seen, obs) => {
          for (const e of seen) {
            if (!e.isIntersecting) continue;
            const img = e.target as HTMLImageElement;
            obs.unobserve(img);
            if (img.dataset.src) img.setAttribute(start() ? 'data-later' : 'src', img.dataset.src);
          }
        })
      : undefined;
  homeWatch?.disconnect();
  homeWatch = later;
  const more = el(doc, 'button', { type: 'button', class: 'tbtn shelves-more' }, BROWSE_COPY.moreShelves);
  more.addEventListener('click', () => {
    allShelves = true;
    const opened = [...box.querySelectorAll<HTMLElement>('.shelf[hidden]')];
    for (const sec of opened) sec.hidden = false;
    // the focus is not left on the button going away: on the first shelf it opened
    const h = opened[0]?.querySelector<HTMLElement>('h2');
    h?.setAttribute('tabindex', '-1');
    more.remove();
    h?.focus({ preventScroll: true });
  });
  const shown = homeShown(shelves);
  for (const [i, sh] of shelves.entries()) {
    // its line (browse.css): a mood's places, the day's own events, or things to do
    const line = sh.key in labels ? 'place' : sh.key === 'stage' || sh.key === 'today' || sh.key === 'exhibit' || sh.key === 'week' ? 'day' : 'fun';
    const sec = el(doc, 'section', { class: 'shelf', 'aria-labelledby': `shelf-${sh.key}`, 'data-line': line });
    const row = el(doc, 'ul', { class: 'shelf-row', 'data-shelf': sh.key });
    if (sh.key in labels) {
      const mood = sh.key as MoodShelf;
      const h = el(doc, 'h2');
      h.append(el(doc, 'button', { type: 'button', class: 'shelf-go', id: `shelf-${mood}`, 'data-mood': mood }, labels[mood]));
      sec.append(h);
      for (const c of sh.cards as MoodCard[]) {
        const b = el(doc, 'button', { type: 'button', class: 'bcard', 'data-mood': mood, 'data-pin': c.id });
        const frame = el(doc, 'span', { class: 'bpic sq' });
        const img = el(doc, 'img', { alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', 'data-id': c.id });
        if (later) {
          img.dataset.src = c.image;
          later.observe(img);
        } else img.setAttribute(start() ? 'data-later' : 'src', c.image);
        frame.append(img);
        b.append(frame, el(doc, 'span', { class: 'nm' }, c.name));
        if (c.trip) b.append(el(doc, 'span', { class: 'meta' }, c.trip));
        const li = el(doc, 'li');
        li.append(b);
        row.append(li);
      }
    } else {
      sec.append(el(doc, 'h2', { id: `shelf-${sh.key}` }, BROWSE_COPY.shelf[sh.key as ShelfKey]));
      row.append(...(sh as Shelf).cards.map((c) => cardLi(doc, c, later)));
    }
    sec.append(row);
    if (!sh.cards.length) sec.append(el(doc, 'p', { class: 'note shelf-none' }, BROWSE_COPY.noneNear));
    if (!shown[i] && !allShelves) sec.hidden = true;
    box.append(sec);
  }
  if (shown.includes(false) && !allShelves) box.append(more);
  box.append(...sources);
  return box;
}

let watching: IntersectionObserver | undefined;
const scrolled = new Set<string>();
/** How many shelves of the screen on show were scrolled sideways (app.ts, when it is left). */
export const scrolledRows = (): number => scrolled.size;

/** The whole-screen view: the title, a shelf per theme (its cards side by side, snapping), the source lines, 닫기 at the
 * bottom where the thumb is. */
export function browseScreen(doc: Document, items: readonly CultureItem[], now: Now, origin: { lat: number; lng: number } | null, sources: HTMLElement[]): HTMLElement {
  const box = el(doc, 'section', { class: 'browse', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' });
  box.append(el(doc, 'h2', { id: 'sheet-title', tabindex: '-1' }, BROWSE_COPY.open), el(doc, 'p', { class: 'note' }, BROWSE_COPY.note));
  // the hour's shelves first (ADR-0115 6): the sunset where the basis is, else 서울시청's
  const shelves = buildShelves(items, now, origin, sunsetMinutes(origin ?? CITY_HALL, now.day as Day));
  // 가로로 넘긴 줄 수 (ADR-0114 7): the shelves scrolled sideways since this screen was built
  scrolled.clear();
  box.addEventListener(
    'scroll',
    (e) => {
      const shelf = (e.target as HTMLElement).dataset?.shelf;
      if (shelf) scrolled.add(shelf);
    },
    { capture: true },
  );
  // the pictures in view only (no watcher where there is none: then each is set at once, lazily)
  const view = doc.defaultView;
  const later =
    view && 'IntersectionObserver' in view
      ? new view.IntersectionObserver((seen, obs) => {
          for (const e of seen) {
            if (!e.isIntersecting) continue;
            const img = e.target as HTMLImageElement;
            obs.unobserve(img);
            if (img.dataset.src) img.setAttribute('src', img.dataset.src);
          }
        })
      : undefined;
  // the last screen's watcher lets go of the pictures it never saw: at most one is ever kept
  watching?.disconnect();
  watching = later;
  if (!shelves.length) box.append(el(doc, 'p', { class: 'note' }, BROWSE_COPY.none));
  for (const sh of shelves) {
    const sec = el(doc, 'section', { class: 'shelf', 'aria-labelledby': `shelf-${sh.key}` });
    sec.append(el(doc, 'h3', { id: `shelf-${sh.key}` }, BROWSE_COPY.shelf[sh.key]));
    const row = el(doc, 'ul', { class: 'shelf-row', 'data-shelf': sh.key });
    row.append(...sh.cards.map((c) => cardLi(doc, c, later)));
    sec.append(row);
    box.append(sec);
  }
  box.append(...sources, el(doc, 'button', { type: 'button', class: 'sheet-close', 'data-action': 'close' }, COPY.close));
  return box;
}

/** The card sheet over the view (ADR-0114 4): the poster, title, place, why now and today's times, 출연, how far, 길찾기 and
 * 자세히 (http(s) only), both in a new tab. null: the item is not in today's list. */
export function browseCardSheet(doc: Document, items: readonly CultureItem[], id: string, now: Now, origin: { lat: number; lng: number } | null, app: MapApp, cast: (names: string) => string, sources: HTMLElement[]): HTMLElement | null {
  const it = items.find((x) => x.id === id);
  if (!it) return null;
  if (isFun(it) && it.fun.g === 'hood') return hoodSheet(doc, it, items, now, origin, app, sources);
  const layer = el(doc, 'div', { class: 'bc-layer' });
  const sheet = el(doc, 'section', { class: 'sheet bc', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bc-title' });
  const top = el(doc, 'div', { class: 'bc-top' });
  const txt = el(doc, 'div', { class: 'bc-txt' });
  txt.append(el(doc, 'h2', { id: 'bc-title', tabindex: '-1' }, it.title), el(doc, 'p', { class: 'bc-place' }, it.place));
  top.append(pic(doc, it), txt);
  sheet.append(top);
  // the same card the shelf shows: why now and how far, worked out the same way
  const c = browseCard(it, now, origin);
  const facts = el(doc, 'ul', { class: 'bc-facts' });
  const fun = isFun(it) ? it.fun : null;
  const times = fun ? '' : todayTimes(it, now);
  // 오늘 시간 only when the why line does not already say it (「19:30 시작」 and 「오늘 19:30」 would be the same thing twice)
  const when = fun ? '' : times ? (c?.why.includes(times) ? '' : BROWSE_COPY.today(times)) : it.time;
  // a curated place: its line is under the title already; no hours in our data (fun.ts), so they are pointed to, never said
  // the week's (ADR-0118): its dates, and a queue when the posts said so
  const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
  const week = isWeek(it) ? [BROWSE_COPY.period(md(it.start), md(it.end)), it.week.reserve === 'onsite' ? BROWSE_COPY.onsite : ''] : [];
  const lines = fun ? [c ? tripText(c) : '', fun.walkin ? '' : BROWSE_COPY.booking, BROWSE_COPY.hours] : [c?.why ?? '', ...week, when, it.cast ? cast(it.cast) : '', c ? tripText(c) : ''];
  for (const line of lines) if (line) facts.append(el(doc, 'li', {}, line));
  sheet.append(facts);
  const acts = el(doc, 'div', { class: 'bc-acts' });
  acts.append(goA(doc, it, c, app, 'primary'));
  const more = linkUrl(it.link);
  // 출처 글 보기 counted apart from 자세히 (browse_link 'post')
  if (more) acts.append(el(doc, 'a', { class: 'tbtn', href: more, target: '_blank', rel: 'noopener', 'data-blink': isWeek(it) ? 'post' : 'more' }, fun ? BROWSE_COPY.kakao : isWeek(it) ? BROWSE_COPY.post : BROWSE_COPY.more));
  sheet.append(acts, ...sources, el(doc, 'button', { type: 'button', class: 'sheet-close', 'data-action': 'close' }, COPY.close));
  layer.append(el(doc, 'div', { class: 'scrim', 'data-action': 'close' }), sheet);
  return layer;
}

/** 길찾기 to an item (on foot when the trip says 걸어서): a curated place by its name, an event by its place. */
function goA(doc: Document, it: CultureItem, c: BrowseCard | null, app: MapApp, cls: string, label?: string): HTMLElement {
  const to = { id: it.id, name: isFun(it) ? it.title : it.place || it.title, lat: it.lat, lng: it.lng } as Spot;
  const walk = !!c?.trip?.walk;
  const g = goLink(to, walk ? to : null, walk, false, app);
  return el(doc, 'a', { class: cls, href: g.href, target: '_blank', rel: 'noopener', 'data-blink': 'go', 'aria-label': COPY.goAria(to.name, g.mode === 'foot', g.app) }, label ?? GO_TEXT.go);
}

/** A 동네's sheet (ADR-0115 5): what is in it now, nearest its middle first, each row 길찾기 to that place. */
function hoodSheet(doc: Document, hood: CultureItem, items: readonly CultureItem[], now: Now, origin: { lat: number; lng: number } | null, app: MapApp, sources: HTMLElement[]): HTMLElement {
  const layer = el(doc, 'div', { class: 'bc-layer' });
  const sheet = el(doc, 'section', { class: 'sheet bc', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bc-title' });
  const c = browseCard(hood, now, origin);
  sheet.append(el(doc, 'h2', { id: 'bc-title', tabindex: '-1' }, hood.title));
  const trip = c ? tripText(c) : '';
  if (trip) sheet.append(el(doc, 'p', { class: 'bc-place' }, trip));
  sheet.append(el(doc, 'h3', { class: 'bc-sub' }, BROWSE_COPY.inHood));
  const list = el(doc, 'ul', { class: 'bc-hood' });
  const inside = inHood(hood, items, now, origin);
  for (const x of inside) {
    const li = el(doc, 'li');
    const a = goA(doc, x.item, x, app, 'bc-row', '');
    a.append(el(doc, 'span', { class: 'nm' }, x.item.title));
    if (x.why) a.append(el(doc, 'span', { class: 'meta' }, x.why));
    li.append(a);
    list.append(li);
  }
  // only the sources of what is listed: 카카오맵 for a curated place, the city's for an event, KOPIS for a show
  const used = (s: HTMLElement) => inside.some((x) => (s.dataset.src === 'kakao' ? isFun(x.item) : s.dataset.src === 'kopis' ? x.item.id.startsWith('kp-') : !isFun(x.item) && !x.item.id.startsWith('kp-')));
  sheet.append(list, ...sources.filter(used), el(doc, 'button', { type: 'button', class: 'sheet-close', 'data-action': 'close' }, COPY.close));
  layer.append(el(doc, 'div', { class: 'scrim', 'data-action': 'close' }), sheet);
  return layer;
}

/** A picture that failed: the text card instead (the box keeps its size). */
export function brokenPicture(img: HTMLImageElement): void {
  const box = img.closest('.bpic');
  if (!box) return;
  box.classList.add('noimg');
  img.remove();
}
