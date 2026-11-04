// 오늘 서울 둘러보기 (ADR-0114): the whole-screen view (1·2) and the card sheet over it (4), in the culture chunk
// (culture-view.ts, ADR-0100: never in the entry). Its stylesheet comes with that chunk. The shelves are browse.ts's;
// the pictures load from the event and show sites themselves (5), lazily, over https, and a picture that fails becomes a
// text card. Titles, places, kinds and time words stay as the list gives them (Korean).
import './browse.css';
import { browseCard, buildShelves, imageUrl, linkUrl, todayTimes, type BrowseCard, type ShelfKey } from './browse';
import type { CultureItem, Now } from './culture';
import { GO_TEXT, goLink, type MapApp } from './links';
import { TRAVEL_TEXT, formatMinutes, type Spot } from './pick';
import { COPY } from './render';

/** Its words (ADR-0093: another language's come in through culture-view.ts words, as one table). */
export const BROWSE_COPY = {
  /** the way in on 서울's home, and the screen's title */
  open: '오늘 서울 둘러보기',
  note: '오늘 하는 것만, 지금 갈 수 있는 것만 모았어요.',
  shelf: { near: '지금 근처', today: '오늘만·오늘까지', week: '이번 주에 끝나요', stage: '연극·뮤지컬', live: '라이브·인디', exhibit: '전시', free: '무료' } satisfies Record<ShelfKey, string>,
  none: '지금 둘러볼 것이 없어요.',
  /** 오늘 시간 on the card sheet: 「오늘 11:00~18:00」 */
  today: (times: string) => `오늘 ${times}`,
  more: '자세히(예매·안내)',
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

let watching: IntersectionObserver | undefined;
const scrolled = new Set<string>();
/** How many shelves of the screen on show were scrolled sideways (app.ts, when it is left). */
export const scrolledRows = (): number => scrolled.size;

/** The whole-screen view: the title, a shelf per theme (its cards side by side, snapping), the source lines, 닫기 at the
 * bottom where the thumb is. */
export function browseScreen(doc: Document, items: readonly CultureItem[], now: Now, origin: { lat: number; lng: number } | null, sources: HTMLElement[]): HTMLElement {
  const box = el(doc, 'section', { class: 'browse', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' });
  box.append(el(doc, 'h2', { id: 'sheet-title', tabindex: '-1' }, BROWSE_COPY.open), el(doc, 'p', { class: 'note' }, BROWSE_COPY.note));
  const shelves = buildShelves(items, now, origin);
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
    for (const c of sh.cards) {
      const b = el(doc, 'button', { type: 'button', class: 'bcard', 'data-action': 'browse-card', 'data-id': c.item.id });
      b.append(pic(doc, c.item, later), el(doc, 'span', { class: 'nm' }, c.item.title));
      if (c.why) b.append(el(doc, 'span', { class: 'meta' }, c.why));
      const trip = tripText(c);
      if (trip) b.append(el(doc, 'span', { class: 'meta' }, trip));
      const li = el(doc, 'li');
      li.append(b);
      row.append(li);
    }
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
  const times = todayTimes(it, now);
  // 오늘 시간 only when the why line does not already say it (「19:30 시작」 and 「오늘 19:30」 would be the same thing twice)
  const when = times ? (c?.why.includes(times) ? '' : BROWSE_COPY.today(times)) : it.time;
  for (const line of [c?.why ?? '', when, it.cast ? cast(it.cast) : '', c ? tripText(c) : '']) if (line) facts.append(el(doc, 'li', {}, line));
  sheet.append(facts);
  const acts = el(doc, 'div', { class: 'bc-acts' });
  const to = { id: it.id, name: it.place || it.title, lat: it.lat, lng: it.lng } as Spot;
  const walk = !!c?.trip?.walk;
  const g = goLink(to, walk ? to : null, walk, false, app);
  acts.append(el(doc, 'a', { class: 'primary', href: g.href, target: '_blank', rel: 'noopener', 'data-blink': 'go', 'aria-label': COPY.goAria(to.name, g.mode === 'foot', g.app) }, GO_TEXT.go));
  const more = linkUrl(it.link);
  if (more) acts.append(el(doc, 'a', { class: 'tbtn', href: more, target: '_blank', rel: 'noopener', 'data-blink': 'more' }, BROWSE_COPY.more));
  sheet.append(acts, ...sources, el(doc, 'button', { type: 'button', class: 'sheet-close', 'data-action': 'close' }, COPY.close));
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
