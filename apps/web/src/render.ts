// render(state) is idempotent: every aria-pressed/aria-current, label, count, card and sheet is derived from
// state (design/SPEC.md §12). Card nodes are rebuilt only when the list itself changes — a heart tap patches
// the heart and ♥ N, a broken photo drops its box in place — so photos never reload.
import { AREAS, AREA_GROUPS, type RegionName } from './region/areas';
import { DEST, DESTS, destOfId, isSggDest, type Dest } from './region/dest';
import { BUSAN, NATION, nationPart, openAreasOf, sggShort } from './region/release';
import { longDay, type Day } from './dates';
import { appHome, handoffUrl, kakaoExternal } from './keep';
import { bookLink, goLink, placeUrl, type MapApp } from './pick/links';
import { marketText } from './pick/market';
import { seasonOn, seasonText } from './pick/season';
import { CARD_COUNT, TRAVEL_TEXT, historyKey, listed, travel, travelText, type Button, type Card, type Reach, type Spot } from './pick/pick';
import { cardsValid, hasSaved, isSaved, savedCount, savedDays, savedIndex, spotIndex, tabNow, visitedSpots, whenDay, type SavedRow, type State } from './state';
import type { NoOrigin, Origin, OutsideAt, View } from './types';
import { COPY, BUSAN_COPY, destNameOf, MOOD_LABEL, PLACE, dayName, splitName, basisLabel, heldText, visitText, statusOf, howOf } from './copy';
import { el, setAttr, setText } from './view/dom';
import { createHome } from './view/home';
import type { Kit, SheetKit } from './view/kit';
import { createSheet } from './view/sheet';
import { CHECK, HEART_22 } from './view/icons';
import { nationOutside } from './copy';

/** the `아니면` line's shared trip; the row links point at it with aria-describedby. */
const ALT_TRIP = 'alt-trip';

export interface Els {
  app: HTMLElement;
  main: HTMLElement;
  home: HTMLElement;
  results: HTMLElement;
  savedView: HTMLElement;
  date: HTMLElement;
  ask: HTMLElement;
  lede: HTMLElement;
  /** ADR-0090: 뒤로, the top bar's left on the results and the saved list */
  back: HTMLButtonElement;
  basis: HTMLButtonElement;
  basisText: HTMLElement;
  saved: HTMLButtonElement;
  savedN: HTMLElement;
  crumb: HTMLElement;
  how: HTMLElement;
  status: HTMLElement;
  foodSub: HTMLElement;
  newSub: HTMLElement;
  cards: HTMLElement;
  savedTitle: HTMLElement;
  savedCount: HTMLElement;
  savedSort: HTMLElement;
  savedList: HTMLElement;
  track: HTMLButtonElement;
  /** ADR-0071: 지도 앱 at the foot of 저장한 곳 */
  mapApps: HTMLButtonElement[];
  mapAppNote: HTMLElement;
  /** ADR-0087: 뺀 곳 N곳 under 설정 — the box, its toggle, the list it opens, and its status line */
  visitedBox: HTMLElement;
  visitedToggle: HTMLButtonElement;
  visitedList: HTMLElement;
  visitedNote: HTMLElement;
  settingsH: HTMLElement;
  /** ADR-0075: 오늘 판, its grey facts, and the sections under the moods */
  today: HTMLElement;
  todayFacts: HTMLElement;
  now: HTMLElement;
  homeMore: HTMLElement;
  /** ADR-0063: the first screen's notice (backup to merge, in-app browser), the saved list's nudge and backup. */
  homeNote: HTMLElement;
  nudge: HTMLElement;
  backup: HTMLButtonElement;
  backupNote: HTMLElement;
  sheet: HTMLElement;
  announce: HTMLElement | null;
  moods: HTMLButtonElement[];
  subs: HTMLButtonElement[];
}

export function findEls(doc: Document): Els {
  const q = <T extends HTMLElement>(sel: string) => {
    const e = doc.querySelector<T>(sel);
    if (!e) throw new Error(`missing ${sel}`);
    return e;
  };
  return {
    app: q('#app'),
    main: q('#main'),
    home: q('#home'),
    results: q('#results'),
    savedView: q('#savedView'),
    date: q('#date'),
    ask: q('#ask'),
    lede: q('#lede'),
    back: q<HTMLButtonElement>('#back'),
    basis: q<HTMLButtonElement>('#basis'),
    basisText: q('#basis > span'),
    saved: q<HTMLButtonElement>('#saved'),
    savedN: q('#saved > .n'),
    crumb: q('#crumb'),
    how: q('#how'),
    status: q('#status'),
    foodSub: q('#foodSub'),
    newSub: q('#newSub'),
    cards: q('#cards'),
    savedTitle: q('#savedTitle'),
    savedCount: q('#savedTitle > .count'),
    savedSort: q('#savedView > .sort'),
    savedList: q('#savedView > .picks'),
    track: q<HTMLButtonElement>('#savedView [data-action="track"]'),
    mapApps: [...doc.querySelectorAll<HTMLButtonElement>('#savedView [data-action="map-app"]')],
    mapAppNote: q('#mapAppNote'),
    visitedBox: q('#savedView .visited-box'),
    visitedToggle: q<HTMLButtonElement>('#savedView [data-action="visited-list"]'),
    visitedList: q('#visitedList'),
    visitedNote: q('#visitedNote'),
    settingsH: q('#settingsH'),
    today: q('#today'),
    todayFacts: q('#today .facts'),
    now: q('#now'),
    homeMore: q('#homeMore'),
    homeNote: q('#homeNote'),
    nudge: q('#nudge'),
    backup: q<HTMLButtonElement>('#savedView [data-action="backup"]'),
    backupNote: q('#backupNote'),
    sheet: q('#sheet'),
    announce: doc.querySelector<HTMLElement>('#announce'),
    moods: [...doc.querySelectorAll<HTMLButtonElement>('button[data-mood]')],
    subs: [...doc.querySelectorAll<HTMLButtonElement>('button[data-sub]')],
  };
}

type ResultsBody = { k: 'blank' } | { k: 'keep' } | { k: 'ghost' } | { k: 'cards' } | { k: 'notice'; kind: 'noOrigin' | 'loadError' | 'empty' };
type SavedBody = { k: 'none' } | { k: 'head' } | { k: 'keep' } | { k: 'ghost' } | { k: 'list' } | { k: 'error' };

/** `showing`: the key (mood + food sub / 새로운 거 tab) whose cards/notice/frame is on screen now, or null. */
function resultsBodyOf(s: State, showing: string | null): ResultsBody {
  const p = s.phase;
  if (s.view === 'home') return { k: 'blank' };
  if (s.view !== 'cards') return { k: 'keep' }; // the saved list is on top; what's underneath stays
  // Under 300ms nothing changes when the same mood is refreshed ("다른 3곳 보기", another basis): the cards
  // stay until the new ones land. Another mood or sub never borrows the old cards. After 300ms, a still frame —
  // unless the cards on screen still answer this mood, sub and basis (the same mood tapped again re-checks
  // GPS): those stay, rather than turning grey and coming back as the same 3.
  const same = !!s.mood && showing === historyKey(s.mood, tabNow(s));
  if (p.k === 'pending') {
    // Cards that still answer it stay while it is asked: kept if on screen, drawn if the screen was blank (a mood
    // tapped from the home is drawn once with its request, app.ts batch).
    if (cardsValid(s)) return same ? { k: 'keep' } : { k: 'cards' };
    return p.slow ? { k: 'ghost' } : same ? { k: 'keep' } : { k: 'blank' };
  }
  if (p.k === 'ready') return s.cards ? { k: 'cards' } : { k: 'blank' };
  if (p.k === 'noOrigin' || p.k === 'loadError' || p.k === 'empty') return { k: 'notice', kind: p.k };
  return cardsValid(s) ? { k: 'cards' } : { k: 'blank' };
}

function savedBodyOf(s: State, showing: boolean): SavedBody {
  const p = s.phase;
  if (s.view !== 'saved') return { k: 'none' };
  if (p.k === 'ready' && s.savedList) return { k: 'list' };
  if (p.k === 'loadError') return { k: 'error' };
  if (p.k === 'pending' && p.slow) return { k: 'ghost' };
  if (p.k === 'pending' && showing) return { k: 'keep' };
  return { k: 'head' };
}


export interface Renderer {
  render(s: State): void;
  setDate(text: string): void;
  dispose(): void;
}

export interface RenderOptions {
  /** the first time the data is drawn on the home, the moods' 「예:」 and photos and the sections under them (노을 볼
   * 곳, 오늘 장 서는 곳, 다른 동네, the credit and 설정) come a frame at a time (renderHome; app.ts: with
   * deps.yieldToMain). */
  stageHome?: boolean;
}

export function createRenderer(doc: Document, els: Els, opts: RenderOptions = {}): Renderer {
  const win = doc.defaultView;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };
  /** Motion only when the user hasn't asked for less — and never where matchMedia is missing (jsdom). */
  const motion = () => {
    try {
      return !!win?.matchMedia?.('(prefers-reduced-motion: no-preference)').matches;
    } catch {
      return false;
    }
  };
  /** The inline icons (check, heart, arrow): each markup is parsed once and cloned after that. A parse per row was
   * a good part of building the basis sheet (25 rows) inside the tap. */
  const icons = new Map<string, Node>();
  function icon(markup: string): Node {
    let n = icons.get(markup);
    if (!n) {
      const box = doc.createElement('div');
      box.innerHTML = markup;
      n = box.firstChild!;
      icons.set(markup, n);
    }
    return n.cloneNode(true);
  }

  let resultsSig = '';
  let resultsShowing: string | null = null; // key of what (cards, a notice, the still frame) is in #cards
  let savedSig = '';
  let savedShowing = false;
  let announceSeq = 0;
  let revealedSeq = 0;
  let lastStatus = '|false';
  let shownView: View = 'home';
  let scrollBeforeSaved: { from: View; y: number } | null = null;
  let patchedBroken: readonly string[] = [];

  // --- cards ---
  const tripOf = (origin: Origin, c: Card) => travel(origin.point, origin.isPoint, c.spot);
  /** Results meta (§7): the first card always says where from and which map app a tap opens. The two row cards'
   * trip is said once on the `아니면` line when it is the same ("아니면 · 둘 다 차로 약 5분") and the rows then
   * have no meta line; otherwise each row says its own trip, without the "from". `own`: 자동 지역 (no reason line,
   * plans/nationwide-app.md R7) — each row keeps its trip, so the row is not a name alone. */
  function resultMetas(origin: Origin, list: Card[], own = false): { metas: (string | null)[]; both: string | null } {
    const trips = list.map((c) => travelText(tripOf(origin, c)));
    const both = !own && list.length === 3 && trips[1] === trips[2] ? trips[1] : null;
    const metas = list.map((c, i) => (i === 0 ? travelText(tripOf(origin, c), origin.from) : both ? null : trips[i]));
    return { metas, both };
  }

  /** A Busan (자동 지역) place without a photo (TourAPI gave none): a text card from the start, no empty <img> (S4 handover). */
  const noPhoto = (spot: Spot) => BUSAN && !spot.image && destOfId(spot.id) !== 'jeju';

  function photoEl(spot: Card['spot'], eager: boolean): HTMLElement {
    const ph = el(doc, 'div', { class: 'ph' });
    const load: Record<string, string> = eager ? { fetchpriority: 'high' } : { loading: 'lazy' };
    ph.append(el(doc, 'img', { src: spot.image, alt: '', ...load, decoding: 'async', referrerpolicy: 'no-referrer' }));
    return ph;
  }

  /** `indoor`: 비 와요 is on (ADR-0065) — the line starts with 실내, words only (no tag or chip, §14).
   * `market`: a five-day market's day words (ADR-0066), in the same place and the same way.
   * `season`: the 철 words (ADR-0080), after 실내, held together with their separator so they never split. */
  /** 「오늘 담아 둠 ·」 first in a result card's meta line, only while there is one (heuristic audit H1). */
  function setHeld(s: State, meta: HTMLElement, id: string) {
    const t = heldText(s, id);
    let span = meta.querySelector<HTMLElement>(':scope > .held');
    if (!t) return void span?.remove();
    if (span?.dataset.t === t) return;
    if (!span) {
      span = el(doc, 'span', { class: 'held' });
      meta.prepend(span);
    }
    span.dataset.t = t;
    span.replaceChildren(t, el(doc, 'span', { class: 'sep', 'aria-hidden': 'true' }, ' ·'), ' ');
  }

  /** `tag`: the first card's travel time (「차로 약 10분」) goes in a tag (ADR-0088), the words and their order as they are. */
  function metaEl(meta: string | null, dest: MapApp | null, indoor = false, market: string | null = null, season: string | null = null, tag = false): HTMLElement {
    const metaEl = el(doc, 'p', { class: 'meta' });
    if (indoor) {
      metaEl.append(el(doc, 'span', { class: 'indoor' }, COPY.indoor));
      if (season || market || meta || dest) metaEl.append(el(doc, 'span', { class: 'sep', 'aria-hidden': 'true' }, ' ·'), ' ');
    }
    if (season) {
      const nw = el(doc, 'span', { class: 'nw' });
      nw.append(el(doc, 'span', { class: 'season' }, season));
      if (market || meta || dest) nw.append(el(doc, 'span', { class: 'sep', 'aria-hidden': 'true' }, ' ·'));
      metaEl.append(nw);
      if (market || meta || dest) metaEl.append(' ');
    }
    if (market) {
      metaEl.append(el(doc, 'span', { class: 'market' }, market));
      if (meta || dest) metaEl.append(el(doc, 'span', { class: 'sep', 'aria-hidden': 'true' }, ' ·'), ' ');
    }
    const time = tag && meta ? TRAVEL_TEXT.tag.exec(meta) : null;
    if (meta && time) {
      const travel = el(doc, 'span', { class: 'travel' }, meta.slice(0, time.index));
      travel.append(el(doc, 'span', { class: 'tag' }, time[0]));
      const after = meta.slice(time.index + time[0].length);
      if (after) travel.append(after);
      metaEl.append(travel);
    } else if (meta) metaEl.append(el(doc, 'span', { class: 'travel' }, meta));
    // "·" is held to the trip by a no-break space and a line may break after it: a narrow line ends
    // "… 5분 ·" and the next starts with "카카오맵", never with "·".
    if (meta && dest) metaEl.append(el(doc, 'span', { class: 'sep', 'aria-hidden': 'true' }, ' ·'), ' ');
    // Says where a tap on the card goes (S57); no arrow glyph.
    if (dest) metaEl.append(el(doc, 'span', { class: 'dest', 'aria-hidden': 'true' }, COPY.map(dest)));
    return metaEl;
  }

  /** `meta`: the trip (null = none); `dest`: also say where a tap goes (the map app, "네이버지도"); `day`: a saved-list row,
   * whose heart is about that day. */
  /** 길찾기 (ADR-0067, ADR-0069) from `origin` (null = no position yet), in the range `reach`: written on a new
   * card and patched on a reused saved row. */
  function setGo(a: HTMLElement, spot: Spot, origin: Origin | null, reach: Reach, app: MapApp) {
    const g = goLink(spot, origin?.point ?? null, reach === 'walk', origin?.isPoint ?? false, app);
    setAttr(a, 'href', g.href);
    setAttr(a, 'aria-label', COPY.goAria(PLACE.name(spot), g.mode === 'foot', g.app, g.terminal));
    setText(a, g.text);
  }
  /** The card's own link (name and photo) in the chosen app (ADR-0071): written on a new card, patched on a reused row. */
  function setPlace(a: HTMLElement, spot: Spot, app: MapApp) {
    setAttr(a, 'href', placeUrl(spot, app));
    setAttr(a, 'aria-label', COPY.mapAria(PLACE.name(spot), app));
  }

  function cardEl(s: State, c: Card, kind: 'lead' | 'row', meta: string | null, dest: boolean, eager: boolean, describedBy?: string, day?: Day): HTMLElement {
    const { spot } = c;
    const name = PLACE.name(spot);
    const broken = s.broken.includes(spot.id) || noPhoto(spot);
    const card = el(doc, 'div', { class: `card ${kind}${broken ? ' noimg' : ''}`, 'data-id': spot.id });
    if (!broken) card.append(photoEl(spot, eager));
    // The name's link covers the whole card (::after); heart and booking link sit above it (S8-3).
    const title = el(doc, 'h2', { class: 'name' });
    const link = el(doc, 'a', { class: 'card-link', target: '_blank', rel: 'noopener' });
    setPlace(link, spot, s.mapApp);
    // A row whose trip went to the `아니면` line hears it with the card (§6.5).
    if (describedBy) link.setAttribute('aria-describedby', describedBy);
    const { main, alias } = splitName(name);
    // with an alias, the name is its own span: a row card cuts it at two lines so the alias always shows
    if (alias) link.append(el(doc, 'span', { class: 'base' }, main), ' ', el(doc, 'span', { class: 'alias' }, alias));
    else link.append(main);
    title.append(link);
    // Name fixed, state only in aria-pressed (S59).
    const heart = el(doc, 'button', { type: 'button', class: 'heart', 'data-id': spot.id, 'aria-pressed': String(isSaved(s, spot.id, day)), 'aria-label': COPY.heartAria(name) });
    if (day) heart.dataset.date = day;
    if (day) card.dataset.date = day; // a saved-list row: which one a 길찾기 came from (ADR-0085)
    heart.append(icon(HEART_22));
    card.append(title, heart);
    // a 자동 지역 place has no reason (plans/nationwide-app.md 4): no empty line for it
    const reason = PLACE.reason(spot);
    if (reason) card.append(el(doc, 'p', { class: 'reason' }, reason));
    // 실내 only on the results, only while 비 와요 picked them (ADR-0065)
    const indoor = !day && !!s.cards?.indoor && spot.indoor === true;
    // 장날 only on the results, for the day being viewed (ADR-0066)
    const market = !day && spot.market ? marketText(spot.market, whenDay(s), s.when !== 'now') : null;
    // 철 only on the results, for the day being viewed (ADR-0080)
    const inSeason = day ? null : seasonOn(spot.season, whenDay(s));
    const season = inSeason ? seasonText(inSeason) : null;
    if (meta || dest || indoor || market || season) {
      const m = metaEl(meta, dest ? s.mapApp : null, indoor, market, season, !day && kind === 'lead');
      // kept on another day (heuristic audit H1): the empty heart says so, not 「not saved」
      if (!day) setHeld(s, m, spot.id);
      card.append(m);
    }
    // 길찾기 (ADR-0067, ADR-0069): directions in one tap, on every card; the card itself stays the place page
    const go = el(doc, 'a', { class: 'tbtn go', target: '_blank', rel: 'noopener' });
    if (!day) setGo(go, spot, s.cards?.origin ?? null, s.cards?.reach ?? s.reach, s.mapApp);
    // 예약 (ADR-0074): a 체험's one verified route, under 길찾기 — 네이버 예약, 마이리얼트립 상품, 홈페이지 or 전화 (tel:).
    const b = bookLink(spot, PLACE.name(spot));
    const book = b ? el(doc, 'a', { class: 'tbtn book', href: b.href, ...(b.href.startsWith('tel:') ? {} : { target: '_blank' }), rel: 'noopener', 'aria-label': b.aria }, b.text) : null;
    if (day) {
      card.append(go);
      if (book) card.append(book);
      return card;
    }
    // 가 봤어요 (ADR-0087), results only: the first card on its own line under 길찾기 (after the booking link, if any),
    // a row card right after 길찾기 on its line
    const visited = visitedEl(s, spot.id, name);
    if (kind === 'lead') {
      const ctl = el(doc, 'div', { class: 'ctl' });
      // the order they are drawn in (ADR-0088): 길찾기 | 가 봤어요, then the booking link under them
      ctl.append(visited);
      if (book) ctl.append(book);
      card.append(go, ctl);
    } else {
      const line = el(doc, 'div', { class: 'ctl go-line' });
      line.append(go, visited);
      card.append(line);
      if (book) card.append(book);
    }
    return card;
  }

  /** Name fixed, state only in aria-pressed (like the heart); the check before the words shows it. */
  function visitedEl(s: State, id: string, name: string): HTMLElement {
    const b = el(doc, 'button', { type: 'button', class: 'tbtn visited', 'data-id': id, 'aria-pressed': String(s.visited.includes(id)), 'aria-label': COPY.visitedAria(name) });
    b.append(icon(CHECK), COPY.visited);
    return b;
  }

  /** "다른 3곳 보기" in a sticky bar at the end of the list (§6.6). One node, reused while results show; the
   * rule above it shows only while it floats — seen by watching a 1px marker at its bottom, no scroll handler. */
  let bar: HTMLElement | null = null;
  let io: IntersectionObserver | null = null;
  function moreBar(): HTMLElement {
    if (bar) return bar;
    bar = el(doc, 'div', { class: 'more-bar' });
    const end = el(doc, 'span', { class: 'more-end', 'aria-hidden': 'true' });
    bar.append(el(doc, 'button', { type: 'button', class: 'more', 'data-action': 'more' }, COPY.more), end);
    const IO = win?.IntersectionObserver;
    if (IO) {
      const b = bar;
      // rootMargin -1px: floating, the marker's top edge touches the viewport's bottom edge, and an
      // edge-adjacent target counts as intersecting in Chrome — it must count as off screen.
      io = new IO((es) => b.classList.toggle('stuck', !es[es.length - 1].isIntersecting), { threshold: 0, rootMargin: '0px 0px -1px 0px' });
      io.observe(end);
    }
    return bar;
  }

  function ghostCard(kind: 'lead' | 'row'): HTMLElement {
    const card = el(doc, 'div', { class: `card ${kind} ghost`, 'aria-hidden': 'true' });
    const txt = el(doc, 'div', { class: 'txt' });
    for (let i = 0; i < 3; i++) txt.append(el(doc, 'span', { class: 'bar' }));
    card.append(el(doc, 'div', { class: 'ph' }), txt);
    return card;
  }

  function areaGroups(parent: HTMLElement, where: 'inline' | 'basis' | 'stay', selected: RegionName | null, dest: Dest = 'jeju', sgg: string | null = null) {
    // the 자동 지역: its 시도's 시군구 and 다른 시도, drawn by its part (plans/nationwide-app.md 4)
    // 강원 (ADR-0102): its 시도's 시군구, the same index as the 자동 지역's — another one picked there moves to it (app.ts toSgg)
    if (NATION && (dest === 'nation' || DEST[dest].sgg)) return nationPart()?.areas(parent, where, selected, dest === 'nation' ? sgg : (sgg ?? DEST[dest].sgg![0]), option);
    if (BUSAN && dest === 'busan') {
      // specs/busan.md 2절: one group, no heading, west → east
      const id = `areas-${where}-busan`;
      const h = el(doc, 'p', { class: 'group-h', id });
      h.append(el(doc, 'span', { class: 'order' }, COPY.westFirst));
      const grid = el(doc, 'div', { class: 'areas', role: 'group', 'aria-label': BUSAN_COPY.destName.busan });
      for (const a of openAreasOf('busan')) grid.append(option(a.label, a.landmark, { 'data-area': a.name, 'data-where': where, 'aria-pressed': String(a.name === selected) }));
      parent.append(h, grid);
      return;
    }
    AREA_GROUPS.forEach(({ group, heading }, i) => {
      // ids per place: the inline index and a sheet's can be in the document at the same time
      const id = `areas-${where}-${group}`;
      const h = el(doc, 'p', { class: 'group-h', id });
      h.append(el(doc, 'span', {}, heading));
      if (i === 0) h.append(el(doc, 'span', { class: 'order' }, COPY.westFirst));
      const grid = el(doc, 'div', { class: 'areas', role: 'group', 'aria-labelledby': id });
      for (const a of AREAS.filter((x) => x.group === group)) {
        grid.append(option(a.label, a.landmark, { 'data-area': a.name, 'data-where': where, 'aria-pressed': String(a.name === selected) }));
      }
      parent.append(h, grid);
    });
  }

  /** A thin-rule list row (area index, sheet options): name, a quieter second line, a check when chosen. */
  function option(label: string, sub: string | null, attrs: Record<string, string>): HTMLButtonElement {
    const b = el(doc, 'button', { type: 'button', class: 'opt', ...attrs });
    const text = el(doc, 'span');
    text.append(el(doc, 'span', { class: 'nm' }, label));
    if (sub) text.append(el(doc, 'span', { class: 'lm' }, sub));
    b.append(text, icon(CHECK));
    return b;
  }

  /** why there is no position, in words (the results' notice and the home's, ADR-0110 Amendment 1) */
  const noOriginText = (s: State, why: NoOrigin, at?: OutsideAt) =>
    (why === 'outside' && nationOutside(s, at, false)) || (BUSAN && why === 'outside' && s.dest !== 'jeju' && s.dest !== 'nation' ? BUSAN_COPY.outside(destNameOf(s)) : COPY.noOrigin[why]);

  function notice(s: State, kind: 'noOrigin' | 'loadError' | 'empty'): HTMLElement {
    const box = el(doc, 'div', { class: 'notice' });
    const p = s.phase;
    let lines: readonly string[];
    if (kind === 'noOrigin' && p.k === 'noOrigin') lines = [noOriginText(s, p.why, p.at), COPY.noOriginBody];
    else if (kind === 'loadError' && p.k === 'loadError') lines = p.offline ? COPY.loadErrorOffline : COPY.loadError;
    else lines = COPY.empty;
    box.append(el(doc, 'p', { class: 'notice-t' }, lines[0]), el(doc, 'p', { class: 'notice-b' }, lines[1]));
    if (kind === 'loadError') {
      box.append(el(doc, 'button', { type: 'button', class: 'retry', 'data-action': 'retry' }, COPY.retry));
    } else {
      // how to get the location back, above the 동네 grid rather than under it (heuristic audit H8)
      if (p.k === 'noOrigin' && p.why === 'denied') box.append(el(doc, 'p', { class: 'notice-f' }, COPY.deniedHow));
      if (p.k === 'noOrigin' && p.why !== 'outside') box.append(el(doc, 'button', { type: 'button', class: 'tbtn regps', 'data-action': 'retry' }, COPY.retryGps));
      areaGroups(box, 'inline', s.basis === 'region' ? s.region : null, s.dest, s.sgg);
    }
    return box;
  }

  function resultsSigOf(s: State, b: ResultsBody): string {
    // a market's day words and 철 (ADR-0066, ADR-0080) follow the day being viewed: redrawn when it changes, only if
    // one may be shown
    if (b.k === 'cards') return `cards|${s.cards!.seq}|${s.mapApp}${s.cards!.list.some((c) => c.spot.market || c.spot.season) ? `|${whenDay(s)}|${s.when === 'now'}` : ''}`;
    if (b.k === 'notice') {
      const p = s.phase;
      const detail = p.k === 'noOrigin' ? `${p.why}${p.at ?? ''}` : p.k === 'loadError' ? String(p.offline) : '';
      return `notice|${b.kind}|${detail}|${s.basis}|${s.region}|${s.dest}`;
    }
    return b.k;
  }

  function renderResults(s: State) {
    els.cards.setAttribute('aria-busy', String(s.view === 'cards' && s.phase.k === 'pending'));
    const b = resultsBodyOf(s, resultsShowing);
    if (b.k === 'keep') return;
    const sig = resultsSigOf(s, b);
    if (sig === resultsSig) return;
    resultsSig = sig;
    resultsShowing = b.k === 'blank' || !s.mood ? null : b.k === 'cards' ? s.cards!.key : historyKey(s.mood, tabNow(s));
    switch (b.k) {
      case 'blank':
        els.cards.replaceChildren();
        break;
      case 'ghost':
        els.cards.replaceChildren(ghostCard('lead'), ghostCard('row'), ghostCard('row'));
        break;
      case 'cards': {
        const { list, origin } = s.cards!;
        const { metas, both } = resultMetas(origin, list, s.dest === 'nation');
        const nodes: HTMLElement[] = [];
        list.forEach((c, i) => {
          if (i === 1) {
            // "아니면" — and the two rows' shared trip, said once ("아니면 · 둘 다 차로 약 5분")
            const alt = el(doc, 'p', { class: 'alt' });
            alt.append(el(doc, 'b', {}, COPY.or));
            if (both) alt.append(' · ', el(doc, 'span', { id: ALT_TRIP }, COPY.both(both)));
            nodes.push(alt);
          }
          nodes.push(cardEl(s, c, i === 0 ? 'lead' : 'row', metas[i], i === 0, i === 0, i > 0 && both ? ALT_TRIP : undefined));
        });
        nodes.push(moreBar());
        els.cards.replaceChildren(...nodes);
        break;
      }
      case 'notice':
        els.cards.replaceChildren(notice(s, b.kind));
        break;
    }
  }

  // --- saved list (§6.12): by day. Rows are keyed `${id}|${day}` and reused, so moving one never reloads
  // a photo; the meta and the 위로/아래로 buttons are patched on each draw. ---
  const rowNodes = new Map<string, HTMLElement>();

  function savedRowEl(s: State, spot: Spot, row: SavedRow, pos: { first: boolean; last: boolean }, meta: string | null, dest: boolean): HTMLElement {
    const { entry } = row;
    const key = `${entry.id}|${entry.date}`;
    let card = rowNodes.get(key);
    if (!card) {
      card = cardEl(s, { spot, minutes: 0 }, 'row', null, false, false, undefined, entry.date);
      const name = PLACE.name(spot);
      const ctl = el(doc, 'div', { class: 'ctl' });
      const btn = (action: string, text: string, aria: string) =>
        el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': action, 'data-id': entry.id, 'data-date': entry.date, 'aria-label': aria }, text);
      ctl.append(btn('up', COPY.up, COPY.upAria(name)), btn('down', COPY.down, COPY.downAria(name)), btn('move-day', COPY.moveDay, COPY.moveDayAria(name)));
      card.append(ctl);
      rowNodes.set(key, card);
    }
    setGo(card.querySelector<HTMLElement>(':scope > .go')!, spot, s.savedList?.origin ?? null, s.reach, s.mapApp);
    setPlace(card.querySelector<HTMLElement>('.card-link')!, spot, s.mapApp);
    const metaKey = `${meta ?? ''}|${dest}|${s.mapApp}`;
    if (card.dataset.meta !== metaKey) {
      card.dataset.meta = metaKey;
      card.querySelector(':scope > .meta')?.remove();
      if (meta || dest) (card.querySelector(':scope > .reason') ?? card.querySelector(':scope > .heart'))!.after(metaEl(meta, dest ? s.mapApp : null));
    }
    // a row taken out in this visit keeps only its (empty) heart: nothing to move
    const ctl = card.querySelector<HTMLElement>(':scope > .ctl')!;
    ctl.hidden = !row.live;
    ctl.querySelector<HTMLElement>('[data-action="up"]')!.hidden = pos.first;
    ctl.querySelector<HTMLElement>('[data-action="down"]')!.hidden = pos.last;
    return card;
  }

  function savedListSig(s: State): string {
    const { upcoming, past } = savedDays(s);
    const o = s.savedList!.origin;
    const days = [...upcoming, ...(s.pastOpen ? past : [])].map((d) => `${d.day}:${d.rows.map((r) => `${r.entry.id}${r.live ? '' : '~'}`).join(',')}`);
    return `${s.today}|${o ? `${o.key}@${o.point.lat},${o.point.lng}` : ''}|${s.reach}|${s.mapApp}|${past.length}|${s.pastOpen}|${days.join(';')}${BUSAN ? `|${s.dest}|${s.saved.length}` : ''}`;
  }

  function savedListNodes(s: State): HTMLElement[] {
    const { upcoming, past } = savedDays(s);
    const o = s.savedList!.origin;
    const idx = savedIndex(s)!;
    const used = new Set<string>();
    let first = true;
    // The first row says where the trips are measured from (the current basis, not that day's) and where a
    // tap goes; the others say only their trip. Without a position there is no trip.
    const rowsOf = (rows: SavedRow[]) => {
      const live = rows.filter((r) => r.live);
      return rows.map((r) => {
        const spot = idx.get(r.entry.id)!;
        const i = live.indexOf(r);
        const meta = o ? travelText(travel(o.point, o.isPoint, spot), first ? o.from : undefined) : null;
        const node = savedRowEl(s, spot, r, { first: i <= 0, last: i === live.length - 1 }, meta, first);
        first = false;
        used.add(`${r.entry.id}|${r.entry.date}`);
        return node;
      });
    };
    const nodes: HTMLElement[] = [];
    for (const d of upcoming) {
      const id = `day-${d.day}`;
      const sec = el(doc, 'section', { class: 'day', 'aria-labelledby': id });
      sec.append(el(doc, 'h2', { class: 'day-h', id }, dayName(s.today, d.day)), ...rowsOf(d.rows));
      nodes.push(sec);
    }
    if (past.length) {
      // 지난 날: folded at the bottom; opened, each day under its own date
      const sec = el(doc, 'section', { class: 'day past', 'aria-labelledby': 'day-past' });
      const head = el(doc, 'div', { class: 'day-h' });
      head.append(
        el(doc, 'h2', { id: 'day-past' }, COPY.past),
        el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'past', 'aria-expanded': String(s.pastOpen) }, s.pastOpen ? COPY.pastClose : COPY.pastOpen),
      );
      sec.append(head);
      if (s.pastOpen) for (const d of past) sec.append(el(doc, 'p', { class: 'group-h' }, longDay(d.day)), ...rowsOf(d.rows));
      nodes.push(sec);
    }
    for (const k of [...rowNodes.keys()]) if (!used.has(k)) rowNodes.delete(k);
    return nodes;
  }

  /** The control that had focus before the list was redrawn, or its stand-in: the same button in its new
   * place, the row's next visible control when it hid (위로 on the new first row), the new 펼치기/접기. */
  function refocus(active: HTMLElement) {
    const same = (b: HTMLElement) => b.dataset.action === active.dataset.action && b.dataset.id === active.dataset.id && b.dataset.date === active.dataset.date;
    const shown = (b: Element | null | undefined): b is HTMLElement => !!b && b.isConnected && !(b as HTMLElement).hidden && !b.closest('[hidden]');
    let t: HTMLElement | null | undefined = shown(active) ? active : [...els.savedList.querySelectorAll<HTMLElement>('button[data-action]')].find(same);
    if (!shown(t)) t = active.closest('.card')?.querySelector<HTMLElement>('.ctl button:not([hidden])') ?? active.closest('.card')?.querySelector<HTMLElement>('.heart');
    if (shown(t) && doc.activeElement !== t) t.focus();
  }

  function renderSaved(s: State) {
    const b = savedBodyOf(s, savedShowing);
    if (b.k === 'keep') return;
    const sig = b.k === 'list' ? `list|${savedListSig(s)}` : b.k === 'error' ? `error|${s.phase.k === 'loadError' && s.phase.offline}` : b.k;
    const n = savedCount(s);
    setText(els.savedCount, b.k === 'list' && n ? String(n) : '');
    if (sig === savedSig) return;
    savedSig = sig;
    savedShowing = b.k === 'list' || b.k === 'error' || b.k === 'ghost';
    // read before the rows are taken into their new sections (moving the focused one drops its focus)
    const active = doc.activeElement as HTMLElement | null;
    const inside = !!active && els.savedList.contains(active);
    let empty = '';
    let nodes: HTMLElement[] = [];
    if (b.k === 'ghost') {
      const k = Math.min(Math.max(s.saved.length, 1), 3);
      for (let i = 0; i < k; i++) nodes.push(ghostCard('row'));
    } else if (b.k === 'error') {
      nodes.push(notice(s, 'loadError'));
    } else if (b.k === 'list') {
      nodes = savedListNodes(s);
      if (!nodes.length) empty = COPY.savedEmpty;
    }
    if (b.k !== 'list') rowNodes.clear();
    setText(els.savedSort, empty);
    // 「부산에 저장한 곳 N곳」 (specs/busan.md 6): the other destination's saves, kept, one line under this one's
    if (BUSAN && b.k === 'list') {
      for (const d of DESTS) {
        // 강원's ids are the 자동 지역's nt- (ADR-0102): no line of their own, as the 자동 지역's
        const n = d === s.dest || isSggDest(d) ? 0 : s.saved.filter((e) => destOfId(e.id) === d).length;
        if (!n) continue;
        const line = el(doc, 'p', { class: 'other-dest' });
        line.append(el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'other-dest', 'data-dest': d }, BUSAN_COPY.otherSaved[d as 'jeju' | 'busan'](n)));
        nodes.push(line);
      }
    }
    els.savedList.replaceChildren(...nodes);
    if (inside) refocus(active!);
  }

  /** Hearts, broken photos and the first-save hint are patched in place — cards are never rebuilt for them. */
  function patchCards(s: State) {
    for (const h of els.main.querySelectorAll<HTMLButtonElement>('.heart[data-id]')) setAttr(h, 'aria-pressed', String(isSaved(s, h.dataset.id!, h.dataset.date)));
    for (const v of els.cards.querySelectorAll<HTMLButtonElement>('.visited[data-id]')) setAttr(v, 'aria-pressed', String(s.visited.includes(v.dataset.id!)));
    for (const h of els.main.querySelectorAll<HTMLElement>('.heart[data-id]:not([data-date])')) {
      const meta = h.parentElement?.querySelector<HTMLElement>(':scope > .meta');
      if (meta) setHeld(s, meta, h.dataset.id!);
    }
    if (s.broken !== patchedBroken) {
      const was = patchedBroken;
      patchedBroken = s.broken;
      const broken = new Set(s.broken);
      for (const ph of els.main.querySelectorAll<HTMLElement>('.card[data-id] > .ph')) {
        const card = ph.parentElement!;
        if (!broken.has(card.dataset.id!)) continue;
        ph.remove();
        card.classList.add('noimg');
      }
      // Back online: a card that lost its photo only for want of a connection gets it back in place.
      if (was.length > s.broken.length) {
        const idx = savedIndex(s);
        for (const card of els.main.querySelectorAll<HTMLElement>('.card.noimg[data-id]')) {
          const id = card.dataset.id!;
          const spot = broken.has(id) ? null : (s.cards?.list.find((x) => x.spot.id === id)?.spot ?? idx?.get(id));
          if (!spot || noPhoto(spot)) continue;
          card.classList.remove('noimg');
          card.prepend(photoEl(spot, false));
        }
      }
    }
    // The first-save hint (results only) stays until the next intent clears `hintFor` — no timer, no fade
    // (§6.13): it goes at once with the next draw.
    for (const n of els.main.querySelectorAll<HTMLElement>('.hint')) {
      if (n.parentElement?.dataset.id !== s.hintFor) n.remove();
    }
    if (s.hintFor && s.view === 'cards') {
      const card = [...els.cards.querySelectorAll<HTMLElement>('.card[data-id]')].find((c) => c.dataset.id === s.hintFor);
      if (card && !card.querySelector('.hint')) {
        card.append(el(doc, 'p', { class: 'hint' }, COPY.firstSave));
        if (els.announce) els.announce.textContent = COPY.firstSave;
      }
    }
  }

  // --- 뺀 곳 N곳 (ADR-0087): under 설정, only while there is one; opened, the names nearest first, each with 다시
  // 넣기, and 모두 다시 넣기 at the end. Its status line is its own (#status is the results'). ---
  let visitedSig = '';
  function renderVisited(s: State) {
    const list = s.view === 'saved' ? visitedSpots(s) : [];
    setText(els.visitedNote, s.view === 'saved' && s.visitNote ? visitText(s.visitNote) : '');
    const sig = list.length ? `${s.visitedOpen}|${list.map((x) => x.id).join()}` : '';
    if (sig === visitedSig) return;
    visitedSig = sig;
    const active = doc.activeElement as HTMLElement | null;
    const inside = !!active && els.visitedBox.contains(active);
    const at = inside && active!.dataset.action === 'put-back' ? [...els.visitedList.querySelectorAll('[data-action="put-back"]')].indexOf(active!) : -1;
    els.visitedBox.hidden = !list.length;
    setText(els.visitedToggle, COPY.visitedList(list.length));
    setAttr(els.visitedToggle, 'aria-expanded', String(s.visitedOpen));
    els.visitedList.hidden = !s.visitedOpen || !list.length;
    if (els.visitedList.hidden) els.visitedList.replaceChildren();
    else {
      const ul = el(doc, 'ul', { class: 'visited-list' });
      for (const spot of list) {
        const name = PLACE.name(spot);
        const li = el(doc, 'li');
        li.append(el(doc, 'span', {}, name), el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'put-back', 'data-id': spot.id, 'aria-label': COPY.putBackAria(name) }, COPY.putBack));
        ul.append(li);
      }
      els.visitedList.replaceChildren(ul, el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'put-back-all' }, COPY.putBackAll));
    }
    // the row put back is gone: the next row's 다시 넣기 (or the one before), else the toggle; with none left, 설정
    if (!inside || (active!.isConnected && !active!.closest('[hidden]'))) return;
    const rows = [...els.visitedList.querySelectorAll<HTMLElement>('[data-action="put-back"]')];
    const t = !list.length ? els.settingsH : (rows[Math.min(at, rows.length - 1)] ?? els.visitedToggle);
    t.focus({ preventScroll: true });
  }

  // --- keeping saves without a login (ADR-0063): quiet notices, a sentence or two and text buttons ---
  let noteSig = '';
  let nudgeSig = '';
  const act = (action: string, text: string) => el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': action }, text);
  function fill(box: HTMLElement, lines: string[], acts: HTMLElement[]) {
    const nodes: HTMLElement[] = lines.map((t, i) => el(doc, 'p', i === 0 ? { tabindex: '-1' } : {}, t));
    if (acts.length) {
      const row = el(doc, 'div', { class: 'acts' });
      row.append(...acts);
      nodes.push(row);
    }
    box.replaceChildren(...nodes);
  }
  /** Where a link to this app carries what is saved here and a 숙소 링크 (the in-app browser's way out). */
  const shareUrl = (s: State) => handoffUrl(appHome(doc.defaultView?.location.href ?? 'https://localhost/'), s, doc.documentElement.lang);
  function renderKeep(s: State) {
    const k = s.keep;
    const r = k.restore;
    // a backup link's places that this data knows (all of them until the data is in)
    const n = r?.k === 'ask' ? (s.spots ? r.entries.filter((e) => spotIndex(s.spots!).has(e.id)).length : r.entries.length) : 0;
    const f = s.homeFail;
    const sig = r?.k === 'ask' ? `ask|${n}` : r?.k === 'done' ? `done|${r.added}|${r.left}` : k.inapp && k.inappNote ? `inapp|${k.inapp}|${k.inappNote}` : f ? `fail|${f.why}|${s.dest}` : s.homeReading ? 'reading' : '';
    // 합치기's answer; past MAX_SAVED, how many found no room (with nothing added, that line alone)
    const done = r?.k === 'done' ? [...(r.added || !r.left ? [COPY.restoreDone(r.added)] : []), ...(r.left ? [COPY.restoreLeft(r.left)] : [])] : [];
    if (sig !== noteSig) {
      const focusIn = els.homeNote.contains(doc.activeElement);
      noteSig = sig;
      if (r?.k === 'ask' && n) fill(els.homeNote, [COPY.restoreAsk(n)], [act('restore-merge', COPY.restoreMerge), act('restore-cancel', COPY.restoreCancel)]);
      else if (r?.k === 'ask') fill(els.homeNote, [COPY.restoreNone], [act('restore-cancel', COPY.close)]);
      else if (r?.k === 'done') fill(els.homeNote, done, []);
      else if (k.inapp && k.inappNote) {
        const name = COPY.inappName[k.inapp];
        const lines = [COPY.inappNote(name)];
        if (k.inappNote === 'copied') lines.push(COPY.inappCopied);
        else if (k.inappNote === 'failed') lines.push(COPY.inappFailed);
        // KakaoTalk has its own way out to the phone's browser; elsewhere the link is copied
        const open = k.inapp === 'kakaotalk' ? el(doc, 'a', { class: 'tbtn', 'data-action': 'inapp-open', href: '#' }, COPY.inappOpen) : act('inapp-copy', COPY.inappOpen);
        fill(els.homeNote, lines, [open, act('inapp-close', COPY.close)]);
      } else if (f) fill(els.homeNote, [noOriginText(s, f.why, f.at), f.why === 'denied' ? COPY.deniedHow : COPY.noOriginBody], []);
      else if (s.homeReading) fill(els.homeNote, [COPY.locating], []);
      else els.homeNote.replaceChildren();
      els.homeNote.hidden = !sig;
      if (r?.k === 'done' && els.announce) els.announce.textContent = done.join(' ');
      else if (sig.startsWith('fail|') && els.announce) els.announce.textContent = [...els.homeNote.querySelectorAll('p')].map((p) => p.textContent).join(' ');
      // the button tapped is gone: the answer (or, with nothing left, the first mood) takes the focus
      if (focusIn) (els.homeNote.querySelector<HTMLElement>('p') ?? els.moods[0])?.focus({ preventScroll: true });
    }
    const out = els.homeNote.querySelector<HTMLAnchorElement>('a[data-action="inapp-open"]');
    if (out) setAttr(out, 'href', kakaoExternal(shareUrl(s)));

    const nsig = s.view === 'saved' && k.nudge && k.install ? k.install : '';
    if (nsig !== nudgeSig) {
      const focusIn = els.nudge.contains(doc.activeElement);
      nudgeSig = nsig;
      if (nsig === 'ios') fill(els.nudge, [COPY.nudge, COPY.nudgeIos], [act('nudge-close', COPY.close)]);
      else if (nsig === 'prompt') fill(els.nudge, [COPY.nudge], [act('install', COPY.install), act('nudge-close', COPY.close)]);
      else els.nudge.replaceChildren();
      els.nudge.hidden = !nsig;
      if (focusIn) els.savedTitle.focus({ preventScroll: true });
    }
    els.backup.hidden = !s.saved.length;
    setText(els.backupNote, k.backup === 'copied' ? COPY.backupCopied : k.backup === 'failed' ? COPY.backupFailed : '');
  }

  /** `fn` once the browser has painted the frame now being prepared: a task posted from a frame callback runs
   * after that frame is drawn. Without frame callbacks, a task. */
  function afterPaint(fn: () => void) {
    const task = () => void later(0, fn);
    if (typeof win?.requestAnimationFrame === 'function') win.requestAnimationFrame(task);
    else task();
  }
  const kit: Kit = { doc, els, opts, win, later, motion, icon, act, fill, setGo, afterPaint };
  const { renderHome, renderSurvey, setHomeDate } = createHome(kit);

  const sheetKit: SheetKit = { ...kit, timers, areaGroups, option };
  const { renderSheet, disposeSheet } = createSheet(sheetKit);

  // --- scroll and focus ---
  const lostFocus = () => {
    const a = doc.activeElement as HTMLElement | null;
    return !a || a === doc.body || !a.isConnected || !!a.closest('[hidden]');
  };
  const scrollTo = (y: number) => {
    try {
      win?.scrollTo(0, y);
    } catch {
      /* no layout */
    }
  };
  /** the home's: the mood in use, or the first; 서울 홈's shelves (its buttons hidden): that mood's shelf heading (Amendment 4) */
  const homeFocus = (): HTMLElement | undefined => {
    const cur = els.moods.find((b) => b.getAttribute('aria-current') === 'true') ?? els.moods[0];
    if (!cur?.closest('ul')?.hidden) return cur;
    return doc.querySelector<HTMLElement>(`#shelves .shelf-go[data-mood="${cur.dataset.mood}"]`) ?? doc.querySelector<HTMLElement>('#shelves .shelf-go') ?? cur;
  };
  function focusView(view: View) {
    const target =
      view === 'cards' ? els.crumb : view === 'saved' ? els.savedTitle : homeFocus();
    target?.focus({ preventScroll: true });
  }
  /** Screens change instantly and start at the top; closing the saved list goes back to where you were. */
  /** `yBefore`: the scroll offset read before this render touched the DOM — once the old view is hidden
   * the page is shorter and the browser has already pulled scrollY back to the top. */
  function viewChanged(s: State, yBefore: number) {
    if (s.view === shownView) return;
    const from = shownView;
    shownView = s.view;
    if (s.view === 'saved') {
      scrollBeforeSaved = { from, y: yBefore };
      scrollTo(0);
      focusView('saved');
      return;
    }
    const back = from === 'saved' && scrollBeforeSaved?.from === s.view ? scrollBeforeSaved : null;
    if (from === 'saved') scrollBeforeSaved = null;
    scrollTo(back ? back.y : 0);
    if (s.view === 'cards' && from === 'home') focusView('cards');
    // 뒤로 (ADR-0090) stays in the bar but means something else now: as from the 바꾸기 / 돌아가기 it took the place
    // of, the focus goes to the screen it led to
    else if (lostFocus() || doc.activeElement === els.back) focusView(s.view);
  }

  /** New cards: bring the heading back under the top bar if it scrolled away ("다른 3곳 보기", S45·S46). */
  function reveal(s: State) {
    const c = s.view === 'cards' && s.phase.k === 'ready' ? s.cards : null;
    if (!c || c.seq === revealedSeq) return;
    revealedSeq = c.seq;
    if (c.how === 'restore' || !win) return;
    const head = els.crumb.parentElement!;
    const r = els.crumb.getBoundingClientRect();
    const topBar = els.basis.parentElement!.getBoundingClientRect().bottom;
    if ((r.top < topBar || r.top > win.innerHeight) && typeof head.scrollIntoView === 'function') head.scrollIntoView({ block: 'start' });
    if (c.how === 'more' || lostFocus()) els.crumb.focus({ preventScroll: true });
  }

  // --- 여행지 (ADR-0094): the logo's grey name, the document title, the credits and the Korean-only line ---
  let tabSpots: Spot[] | null = null;
  let moodSpots: Spot[] | null = null;
  let moodDest: Dest | null = null;
  let destDrawn: string | null = null;
  const jejuTitle = doc.title;
  const credits = [...doc.querySelectorAll<HTMLElement>('#results > .credit, #savedView .about > .credit:first-of-type')].map((e) => ({ e, html: e.innerHTML }));
  function renderDest(s: State) {
    // the 자동 지역 is named by its 시군구 (plans/nationwide-app.md 1.5): another one is another name; 강원 by its own
    // (ADR-0102 Amendment 2)
    const short = DEST[s.dest].label === 'sgg' ? sggShort(s.sgg ?? '') : '';
    const name = short || destNameOf(s);
    const key = `${s.dest}|${name}`;
    if (key === destDrawn) return;
    destDrawn = key;
    const busan = s.dest !== 'jeju';
    const tour = DEST[s.dest].credit === 'tour';
    for (const rg of doc.querySelectorAll('.logo .rg')) setText(rg, `:${name}`);
    const logo = doc.getElementById('logo');
    if (BUSAN && logo) setAttr(logo, 'aria-label', BUSAN_COPY.destAria(logo.textContent ?? ''));
    doc.title = short ? nationPart()!.copy.title(short) : busan ? BUSAN_COPY.title(name) : jejuTitle;
    for (const c of credits) {
      if (tour) c.e.textContent = BUSAN_COPY.homeCredit;
      else c.e.innerHTML = c.html;
    }
    for (const l of doc.querySelectorAll<HTMLElement>('#results > .landing')) l.hidden = busan;
  }

  function render(s: State) {
    const yBefore = s.view !== shownView ? (win?.scrollY ?? 0) : 0;
    const label = basisLabel(s);
    if (els.basisText.textContent !== label) {
      // the day and its "·" stay together, and so do the place's last word and the "·" before 실내만: a label
      // wrapped at large text never starts a line with "·"
      const parts = label.split(' · ');
      if (parts.length === 1) els.basisText.textContent = label;
      else {
        const nodes: (string | HTMLElement)[] = [];
        parts.forEach((p, i) => {
          if (i === parts.length - 1) return void nodes.push(p);
          const k = i === 0 && s.when !== 'now' ? 0 : p.lastIndexOf(' ') + 1;
          if (k) nodes.push(p.slice(0, k));
          nodes.push(el(doc, 'span', { class: 'nw' }, `${p.slice(k)} ·`), ' ');
        });
        els.basisText.replaceChildren(...nodes);
      }
    }
    setAttr(els.basis, 'aria-label', COPY.basisAria(label));

    const n = savedCount(s);
    const inSaved = s.view === 'saved';
    // the bar's left (ADR-0090): the logo on the first screen (style.css), 뒤로 on the other two
    els.back.hidden = s.view === 'home';
    // Counts today and later; shown while anything is saved (지난 날 stays reachable) and while the list is
    // open, even at 0, so the toggle never vanishes under the thumb.
    els.saved.hidden = !hasSaved(s) && !inSaved;
    setText(els.savedN, String(n));
    setAttr(els.saved, 'aria-label', COPY.savedAria(n));
    setAttr(els.saved, 'aria-pressed', String(inSaved));
    setText(els.track, s.tracking ? COPY.trackOff : COPY.trackOn);
    for (const b of els.mapApps) setAttr(b, 'aria-pressed', String(b.dataset.app === s.mapApp));
    setText(els.mapAppNote, s.mapApp === 'tmap' ? COPY.tmapNote : '');

    els.home.hidden = s.view !== 'home';
    els.results.hidden = s.view !== 'cards';
    els.savedView.hidden = !inSaved;
    if (s.mood) setText(els.crumb, MOOD_LABEL[s.mood]);
    // The mood chosen last time is ticked on the first screen.
    for (const b of els.moods) setAttr(b, 'aria-current', b.dataset.mood === s.mood ? 'true' : null);
    els.foodSub.hidden = !(s.view === 'cards' && s.mood === 'food');
    els.newSub.hidden = !(s.view === 'cards' && s.mood === 'new');
    for (const b of els.subs) setAttr(b, 'aria-pressed', String(b.dataset.sub === s.sub || b.dataset.sub === s.newSub));
    // 탭은 그 여행지에 보일 곳이 3곳 이상일 때만 (specs/busan.md 5절, plans/busan.md M8): 구경·체험
    if (s.spots !== tabSpots) {
      tabSpots = s.spots;
      for (const b of els.subs) {
        const sub = b.dataset.sub;
        if (sub === 'sight' || sub === 'do') b.hidden = !!s.spots && s.spots.filter((x) => listed(x) && x.mood === 'new' && x.sub === sub).length < CARD_COUNT;
      }
    }
    if (BUSAN) renderDest(s);
    // the 자동 지역 (plans/nationwide-app.md 4): no mood it does not offer, nor one with fewer than 3 places in its list
    if (NATION && (s.spots !== moodSpots || s.dest !== moodDest)) {
      moodSpots = s.spots;
      moodDest = s.dest;
      for (const b of els.moods) {
        const m = b.dataset.mood as Button;
        if (m === 'any') continue;
        const off = s.dest === 'nation' && (!DEST.nation.moods.includes(m) || (!!s.spots && s.spots.filter((x) => listed(x) && (x.mood === m || !!(x.moods as readonly string[] | undefined)?.includes(m))).length < CARD_COUNT));
        b.closest('li')?.toggleAttribute('hidden', off);
      }
    }

    const how = howOf(s);
    setText(els.how, how);
    els.how.hidden = !how;
    const st = statusOf(s);
    const statusKey = `${st.text}|${st.chooseArea}|${st.undo?.id ?? ''}`;
    if (statusKey !== lastStatus) {
      lastStatus = statusKey;
      // 되돌리기 pressed goes with its line: the focus goes to that place's 가 봤어요, the same switch (ADR-0090 5)
      const undone = els.status.contains(doc.activeElement) ? (doc.activeElement as HTMLElement).dataset.id : undefined;
      els.status.replaceChildren();
      if (st.text) els.status.append(el(doc, 'span', {}, st.text));
      if (st.undo) els.status.append(el(doc, 'button', { type: 'button', class: 'tbtn undo', 'data-action': 'visited-undo', 'data-id': st.undo.id, 'aria-label': COPY.undoAria(st.undo.name) }, COPY.undo));
      if (st.chooseArea) els.status.append(el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'choose-area' }, COPY.chooseArea));
      if (undone) {
        const to = st.undo?.id === undone ? els.status.querySelector<HTMLElement>('.undo') : [...els.cards.querySelectorAll<HTMLElement>('.visited[data-id]')].find((b) => b.dataset.id === undone);
        to?.focus({ preventScroll: true });
      }
    }

    renderResults(s);
    renderSaved(s);
    renderVisited(s);
    patchCards(s);
    renderHome(s);
    renderSurvey(s);
    renderKeep(s);
    renderSheet(s);
    if (els.announce && s.announce.seq !== announceSeq) {
      announceSeq = s.announce.seq;
      els.announce.textContent = s.announce.more ? COPY.announceMore(s.announce.n) : COPY.announce(s.announce.n);
    }
    viewChanged(s, yBefore);
    reveal(s);
  }

  return {
    render,
    setDate: (text) => setHomeDate(text),
    dispose() {
      io?.disconnect();
      io = null;
      disposeSheet();
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
