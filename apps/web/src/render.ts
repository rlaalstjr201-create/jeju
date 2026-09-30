// render(state) is idempotent: every aria-pressed/aria-current, label, count, card and sheet is derived from
// state (design/SPEC.md §12). Card nodes are rebuilt only when the list itself changes — a heart tap patches
// the heart and ♥ N, a broken photo drops its box in place — so photos never reload.
import { AREAS, AREA_GROUPS, areaLabel, type AreaName } from './areas';
import { bookingUrl, kakaoUrl } from './links';
import { historyKey, travel, travelText, type Button, type Card } from './pick';
import { GPS_KEY, cardsValid, savedCount, type State } from './state';
import type { NoOrigin, Origin, Overlay, View } from './types';

// Every string on screen (§9). Sentences end with a full stop; buttons, labels, titles and meta don't.
export const COPY = {
  basisGps: '내 주변',
  basisStay: '숙소 근처',
  basisRegion: (label: string) => `${label} 근처`,
  basisNoGps: '지역 고르기',
  basisAria: (label: string) => `${label}, 기준 바꾸기`,
  savedAria: (n: number) => `저장한 곳 ${n}개`,
  locating: '위치 확인 중…',
  chooseArea: '지역으로 고르기',
  wrapped: '이 근처는 다 봤어요. 처음 본 곳부터 다시 보여 드려요.',
  offline: '오프라인이라 사진은 안 보여요.',
  or: '아니면',
  more: '다른 3곳 보기',
  map: '카카오맵',
  mapAria: (name: string) => `${name}, 카카오맵에서 보기`,
  heartAria: (name: string) => `${name} 저장`,
  book: '마이리얼트립에서 예약 찾아보기',
  bookAria: (name: string) => `${name}, 마이리얼트립에서 예약 찾아보기`,
  firstSave: '저장한 곳은 맨 위 하트 버튼에 모여요.',
  noOrigin: {
    denied: '위치 권한이 꺼져 있어요.',
    unavailable: '위치를 확인하지 못했어요.',
    outside: '지금은 제주 밖이에요.',
  } satisfies Record<NoOrigin, string>,
  noOriginBody: '내일 갈 동네를 고르면 거기서 가까운 곳을 보여 드려요.',
  deniedHow: '위치를 쓰려면 브라우저 설정에서 위치 권한을 켜 주세요.',
  empty: ['이 근처에는 보여 드릴 곳이 없어요.', '다른 동네를 골라 주세요.'],
  loadError: ['목록을 불러오지 못했어요.', '연결을 확인하고 다시 불러와 주세요.'],
  loadErrorOffline: ['오프라인이라 목록을 불러오지 못했어요.', '연결되면 다시 불러와 주세요.'],
  retry: '다시 불러오기',
  westFirst: '서쪽부터',
  savedEmpty: '저장한 곳이 없어요. 카드의 하트를 누르면 여기 모여요.',
  savedUnsorted: '위치를 몰라서 저장한 순서대로 보여 드려요.',
  savedNearHere: '지금 있는 곳에서 가까운 순이에요.',
  savedNear: (from: string) => `${from} 가까운 순이에요.`,
  savedFoot: '이 브라우저에만 저장돼요.',
  savedFootInApp: '앱 안에서 연 창이라 다른 브라우저에서는 보이지 않아요.',
  basisSheet: '어디 근처로 볼까요?',
  gpsOption: '내 위치',
  gpsOff: '위치 권한이 꺼져 있어요',
  stayOption: '숙소',
  stayUnset: '처음 한 번만 정해요',
  restay: '숙소 다시 정하기',
  staySheet: '숙소가 어디예요?',
  stayNote: '한 번 정하면 이 기기에 기억해 둘게요.',
  stayHere: '지금 위치를 숙소로',
  stayError: {
    denied: '위치 권한이 꺼져 있어요. 아래에서 숙소 동네를 골라 주세요.',
    unavailable: '위치를 확인하지 못했어요. 아래에서 숙소 동네를 골라 주세요.',
    outside: '지금은 제주 밖이에요. 아래에서 숙소 동네를 골라 주세요.',
  } satisfies Record<NoOrigin, string>,
  close: '닫기',
  announce: (n: number) => `${n}곳 골랐어요.`,
  announceMore: (n: number) => `다른 ${n}곳 골랐어요.`,
  /** the first card's meta when every card on screen is the same trip ("셋 다 애월에서 차로 약 5분"). */
  together: (n: number) => (n === 2 ? '둘 다' : '셋 다'),
} as const;

/** The mood buttons' own words; the results title repeats the one chosen. */
export const MOOD_LABEL: Record<Button, string> = {
  rest: '푹 쉬고 싶어',
  walk: '좀 걷고 싶어',
  new: '새로운 거 해보고 싶어',
  food: '맛있는 거 먹고 싶어',
  any: '아무거나 골라줘',
};

const HEART_PATH =
  'M12 20.3s-7.4-4.5-9.2-9.1C1.6 8 3.5 4.6 6.9 4.6c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.4 0 5.3 3.4 4.1 6.6-1.8 4.6-9.2 9.1-9.2 9.1z';
const HEART_22 = `<svg width="22" height="22" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${HEART_PATH}"/></svg>`;

const WEEKDAYS = '일월화수목금토';
/** "10월 1일 목요일": tomorrow's date — or today's before 4 a.m., when "내일" still means the coming day. */
export function dateLabel(now: Date): string {
  const d = new Date(now.getTime());
  if (d.getHours() >= 4) d.setDate(d.getDate() + 1);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}

/** "더럭초등학교(구, 더럭분교)" → name + "(구, 더럭분교)" shown smaller and never broken inside (§3.3). */
export function splitName(name: string): { main: string; alias: string | null } {
  const m = /^(.+?)\s*([(（].+[)）])$/.exec(name);
  return m ? { main: m[1], alias: m[2] } : { main: name, alias: null };
}

export function basisLabel(s: State): string {
  if (s.basis === 'stay' && s.stay) return COPY.basisStay;
  if (s.basis === 'region' && s.region) return COPY.basisRegion(areaLabel(s.region));
  return s.lastFail ? COPY.basisNoGps : COPY.basisGps;
}

export function savedSortText(origin: Origin | null): string {
  if (!origin) return COPY.savedUnsorted;
  if (origin.key === GPS_KEY) return COPY.savedNearHere;
  return COPY.savedNear(origin.from);
}

/** Status line under the results heading: one short line, plus an escape hatch while GPS is slow (S04·S05). */
export function statusOf(s: State): { text: string; chooseArea: boolean } {
  const p = s.phase;
  if (s.view !== 'cards') return { text: '', chooseArea: false };
  if (p.k === 'pending' && p.step === 'locating' && p.slow) return { text: COPY.locating, chooseArea: p.long };
  if (p.k === 'ready') {
    const parts: string[] = [];
    if (s.cards?.wrapped) parts.push(COPY.wrapped);
    if (s.offline) parts.push(COPY.offline);
    return { text: parts.join(' '), chooseArea: false };
  }
  return { text: '', chooseArea: false };
}

export interface Els {
  app: HTMLElement;
  main: HTMLElement;
  home: HTMLElement;
  results: HTMLElement;
  savedView: HTMLElement;
  date: HTMLElement;
  basis: HTMLButtonElement;
  basisText: HTMLElement;
  saved: HTMLButtonElement;
  savedN: HTMLElement;
  resultsTitle: HTMLElement;
  status: HTMLElement;
  foodSub: HTMLElement;
  cards: HTMLElement;
  savedTitle: HTMLElement;
  savedCount: HTMLElement;
  savedSort: HTMLElement;
  savedList: HTMLElement;
  savedFoot: HTMLElement;
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
    basis: q<HTMLButtonElement>('#basis'),
    basisText: q('#basis > span'),
    saved: q<HTMLButtonElement>('#saved'),
    savedN: q('#saved > .n'),
    resultsTitle: q('#resultsTitle'),
    status: q('#status'),
    foodSub: q('#foodSub'),
    cards: q('#cards'),
    savedTitle: q('#savedTitle'),
    savedCount: q('#savedTitle > .count'),
    savedSort: q('#savedView > .sort'),
    savedList: q('#savedView > .picks'),
    savedFoot: q('#savedView > .foot'),
    sheet: q('#sheet'),
    announce: doc.querySelector<HTMLElement>('#announce'),
    moods: [...doc.querySelectorAll<HTMLButtonElement>('button[data-mood]')],
    subs: [...doc.querySelectorAll<HTMLButtonElement>('button[data-sub]')],
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}
function setAttr(e: Element, name: string, value: string | null) {
  if (value === null) {
    if (e.hasAttribute(name)) e.removeAttribute(name);
  } else if (e.getAttribute(name) !== value) e.setAttribute(name, value);
}
function setText(e: Element, text: string) {
  if (e.textContent !== text) e.textContent = text;
}

type ResultsBody = { k: 'blank' } | { k: 'keep' } | { k: 'ghost' } | { k: 'cards' } | { k: 'notice'; kind: 'noOrigin' | 'loadError' | 'empty' };
type SavedBody = { k: 'none' } | { k: 'head' } | { k: 'keep' } | { k: 'ghost' } | { k: 'list' } | { k: 'error' };

/** `showing`: the key (mood + food sub) whose cards/notice/frame is on screen now, or null. */
function resultsBodyOf(s: State, showing: string | null): ResultsBody {
  const p = s.phase;
  if (s.view === 'home') return { k: 'blank' };
  if (s.view !== 'cards') return { k: 'keep' }; // the saved list is on top; what's underneath stays
  // Under 300ms nothing changes when the same mood is refreshed ("다른 3곳 보기", another basis): the cards
  // stay until the new ones land. Another mood or sub never borrows the old cards. After 300ms, a still frame —
  // unless the cards on screen still answer this mood, sub and basis (the same mood tapped again re-checks
  // GPS): those stay, rather than turning grey and coming back as the same 3.
  const same = !!s.mood && showing === historyKey(s.mood, s.sub);
  if (p.k === 'pending') {
    if (same && cardsValid(s)) return { k: 'keep' };
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

export function createRenderer(doc: Document, els: Els, env: { inApp: boolean }): Renderer {
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

  let resultsSig = '';
  let resultsShowing: string | null = null; // key of what (cards, a notice, the still frame) is in #cards
  let savedSig = '';
  let savedShowing = false;
  let sheetSig = '';
  let prevOverlay: Overlay = null;
  let opener: HTMLElement | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let announceSeq = 0;
  let revealedSeq = 0;
  let lastStatus = '|false';
  let shownView: View = 'home';
  let scrollBeforeSaved: { from: View; y: number } | null = null;
  let patchedBroken: readonly string[] = [];

  // --- cards ---
  const tripOf = (origin: Origin, c: Card) => travel(origin.point, origin.isPoint, c.spot);
  const metaFor = (origin: Origin | null, c: Card, withFrom: boolean) =>
    origin ? travelText(tripOf(origin, c), withFrom ? origin.from : undefined) : null;
  /** Results meta (§7, §14): the first card says where from and that a tap opens 카카오맵, the rows only their
   * own trip. When every card is the same trip (most screens: "차로 약 5분" three times) it is said once, on
   * the first card ("셋 다 …"), and the rows have no meta line. */
  function resultMetas(origin: Origin, list: Card[]): (string | null)[] {
    const trips = list.map((c) => travelText(tripOf(origin, c)));
    const one = list.length > 1 && trips.every((t) => t === trips[0]);
    return list.map((c, i) => {
      if (i > 0) return one ? null : trips[i];
      const lead = metaFor(origin, c, true)!;
      return one ? `${COPY.together(list.length)} ${lead}` : lead;
    });
  }

  function photoEl(spot: Card['spot'], eager: boolean): HTMLElement {
    const ph = el(doc, 'div', { class: 'ph' });
    const load: Record<string, string> = eager ? { fetchpriority: 'high' } : { loading: 'lazy' };
    ph.append(el(doc, 'img', { src: spot.image, alt: '', ...load, decoding: 'async', referrerpolicy: 'no-referrer' }));
    return ph;
  }

  /** `meta`: the trip (null = none); `dest`: also say where a tap goes ("카카오맵"). */
  function cardEl(s: State, c: Card, kind: 'lead' | 'row', meta: string | null, dest: boolean, eager: boolean): HTMLElement {
    const { spot } = c;
    const name = spot.name.trim();
    const broken = s.broken.includes(spot.id);
    const card = el(doc, 'div', { class: `card ${kind}${broken ? ' noimg' : ''}`, 'data-id': spot.id });
    if (!broken) card.append(photoEl(spot, eager));
    // The name's link covers the whole card (::after); heart and booking link sit above it (S8-3).
    const title = el(doc, 'h2', { class: 'name' });
    const link = el(doc, 'a', { class: 'card-link', href: kakaoUrl(spot), target: '_blank', rel: 'noopener', 'aria-label': COPY.mapAria(name) });
    const { main, alias } = splitName(name);
    link.append(main);
    if (alias) link.append(' ', el(doc, 'span', { class: 'alias' }, alias));
    title.append(link);
    // Name fixed, state only in aria-pressed (S59).
    const heart = el(doc, 'button', { type: 'button', class: 'heart', 'data-id': spot.id, 'aria-pressed': String(s.saved.includes(spot.id)), 'aria-label': COPY.heartAria(name) });
    heart.innerHTML = HEART_22;
    card.append(title, heart, el(doc, 'p', { class: 'reason' }, spot.reason));
    if (meta || dest) {
      const metaEl = el(doc, 'p', { class: 'meta' });
      if (meta) metaEl.append(el(doc, 'span', { class: 'travel' }, meta));
      // "·" is held to the trip by a no-break space and a line may break after it: a narrow line ends
      // "… 5분 ·" and the next starts with "카카오맵", never with "·".
      if (meta && dest) metaEl.append(el(doc, 'span', { class: 'sep', 'aria-hidden': 'true' }, ' ·'), ' ');
      // Says where a tap on the card goes (S57); no arrow glyph.
      if (dest) metaEl.append(el(doc, 'span', { class: 'dest', 'aria-hidden': 'true' }, COPY.map));
      card.append(metaEl);
    }
    if (spot.bookable) {
      card.append(el(doc, 'a', { class: 'book', href: bookingUrl(spot), target: '_blank', rel: 'noopener', 'aria-label': COPY.bookAria(name) }, COPY.book));
    }
    return card;
  }

  function ghostCard(kind: 'lead' | 'row'): HTMLElement {
    const card = el(doc, 'div', { class: `card ${kind} ghost`, 'aria-hidden': 'true' });
    const txt = el(doc, 'div', { class: 'txt' });
    for (let i = 0; i < 3; i++) txt.append(el(doc, 'span', { class: 'bar' }));
    card.append(el(doc, 'div', { class: 'ph' }), txt);
    return card;
  }

  function areaGroups(parent: HTMLElement, where: 'inline' | 'basis' | 'stay', selected: AreaName | null) {
    AREA_GROUPS.forEach(({ group, heading }, i) => {
      const h = el(doc, 'h3', { class: 'group-h' });
      h.append(el(doc, 'span', {}, heading));
      if (i === 0) h.append(el(doc, 'span', { class: 'order' }, COPY.westFirst));
      const grid = el(doc, 'div', { class: 'areas' });
      for (const a of AREAS.filter((x) => x.group === group)) {
        grid.append(el(doc, 'button', { type: 'button', class: 'opt', 'data-area': a.name, 'data-where': where, 'aria-pressed': String(a.name === selected) }, a.label));
      }
      parent.append(h, grid);
    });
  }

  function notice(s: State, kind: 'noOrigin' | 'loadError' | 'empty'): HTMLElement {
    const box = el(doc, 'div', { class: 'notice' });
    const p = s.phase;
    let lines: readonly string[];
    if (kind === 'noOrigin' && p.k === 'noOrigin') lines = [COPY.noOrigin[p.why], COPY.noOriginBody];
    else if (kind === 'loadError' && p.k === 'loadError') lines = p.offline ? COPY.loadErrorOffline : COPY.loadError;
    else lines = COPY.empty;
    box.append(el(doc, 'p', { class: 'notice-t' }, lines[0]), el(doc, 'p', { class: 'notice-b' }, lines[1]));
    if (kind === 'loadError') {
      box.append(el(doc, 'button', { type: 'button', class: 'retry', 'data-action': 'retry' }, COPY.retry));
    } else {
      areaGroups(box, 'inline', s.basis === 'region' ? s.region : null);
      if (p.k === 'noOrigin' && p.why === 'denied') box.append(el(doc, 'p', { class: 'notice-f' }, COPY.deniedHow));
    }
    return box;
  }

  function resultsSigOf(s: State, b: ResultsBody): string {
    if (b.k === 'cards') return `cards|${s.cards!.seq}`;
    if (b.k === 'notice') {
      const p = s.phase;
      const detail = p.k === 'noOrigin' ? p.why : p.k === 'loadError' ? String(p.offline) : '';
      return `notice|${b.kind}|${detail}|${s.basis}|${s.region}`;
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
    resultsShowing = b.k === 'blank' || !s.mood ? null : b.k === 'cards' ? s.cards!.key : historyKey(s.mood, s.sub);
    switch (b.k) {
      case 'blank':
        els.cards.replaceChildren();
        break;
      case 'ghost':
        els.cards.replaceChildren(ghostCard('lead'), ghostCard('row'), ghostCard('row'));
        break;
      case 'cards': {
        const { list, origin } = s.cards!;
        const metas = resultMetas(origin, list);
        const nodes: HTMLElement[] = [];
        list.forEach((c, i) => {
          if (i === 1 && list.length > 2) nodes.push(el(doc, 'p', { class: 'alt' }, COPY.or));
          nodes.push(cardEl(s, c, i === 0 ? 'lead' : 'row', metas[i], i === 0, i === 0));
        });
        nodes.push(el(doc, 'button', { type: 'button', class: 'more', 'data-action': 'more' }, COPY.more));
        els.cards.replaceChildren(...nodes);
        break;
      }
      case 'notice':
        els.cards.replaceChildren(notice(s, b.kind));
        break;
    }
  }

  function renderSaved(s: State) {
    const b = savedBodyOf(s, savedShowing);
    if (b.k === 'keep') return;
    const list = b.k === 'list' ? s.savedList! : null;
    const sig = b.k === 'list' ? `list|${list!.seq}` : b.k === 'error' ? `error|${s.phase.k === 'loadError' && s.phase.offline}` : b.k;
    if (sig === savedSig) return;
    savedSig = sig;
    savedShowing = b.k === 'list' || b.k === 'error' || b.k === 'ghost';
    let count = '';
    let sort = '';
    let foot = '';
    const nodes: HTMLElement[] = [];
    if (b.k === 'ghost') {
      const n = Math.min(Math.max(s.snapshot?.length ?? 1, 1), 3);
      for (let i = 0; i < n; i++) nodes.push(ghostCard('row'));
    } else if (b.k === 'error') {
      nodes.push(notice(s, 'loadError'));
    } else if (list) {
      if (list.list.length) {
        count = String(list.list.length);
        sort = savedSortText(list.origin);
        // Every row says where from: the list is sorted by distance (§6.11).
        for (const c of list.list) nodes.push(cardEl(s, c, 'row', metaFor(list.origin, c, true), true, false));
        foot = env.inApp ? `${COPY.savedFoot} ${COPY.savedFootInApp}` : COPY.savedFoot;
      } else {
        sort = COPY.savedEmpty;
      }
    }
    setText(els.savedCount, count);
    setText(els.savedSort, sort);
    setText(els.savedFoot, foot);
    els.savedList.replaceChildren(...nodes);
  }

  /** Hearts, broken photos and the first-save hint are patched in place — cards are never rebuilt for them. */
  function patchCards(s: State) {
    const on = new Set(s.saved);
    for (const h of els.main.querySelectorAll<HTMLButtonElement>('.heart[data-id]')) setAttr(h, 'aria-pressed', String(on.has(h.dataset.id!)));
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
        const shownCards = [...(s.cards?.list ?? []), ...(s.savedList?.list ?? [])];
        for (const card of els.main.querySelectorAll<HTMLElement>('.card.noimg[data-id]')) {
          const c = broken.has(card.dataset.id!) ? null : shownCards.find((x) => x.spot.id === card.dataset.id);
          if (!c) continue;
          card.classList.remove('noimg');
          card.prepend(photoEl(c.spot, false));
        }
      }
    }
    for (const n of els.main.querySelectorAll<HTMLElement>('.hint:not(.leaving)')) {
      if (n.parentElement?.dataset.id !== s.hintFor) leave(n);
    }
    if (s.hintFor) {
      const box = s.view === 'saved' ? els.savedList : els.cards;
      const card = [...box.querySelectorAll<HTMLElement>('.card[data-id]')].find((c) => c.dataset.id === s.hintFor);
      if (card && !card.querySelector('.hint')) card.append(el(doc, 'p', { class: 'hint', 'aria-live': 'polite' }, COPY.firstSave));
    }
  }
  function leave(n: HTMLElement) {
    if (!motion()) {
      n.remove();
      return;
    }
    n.classList.add('leaving');
    later(150, () => n.remove());
  }

  // --- sheet ---
  function sheetSigOf(s: State): string {
    // Only what the user changes in a sheet. News that arrives while it is open — a 숙소 GPS failure, a GPS
    // denial — is patched in place (patchSheet): a rebuild under the finger would reset its scroll and focus.
    return `${s.overlay}|${s.basis}|${s.region}|${s.stay?.area ?? ''}|${s.stay?.source ?? ''}`;
  }

  function option(label: string, sub: string | null, attrs: Record<string, string>): HTMLButtonElement {
    const b = el(doc, 'button', { type: 'button', class: 'opt', ...attrs }, label);
    if (sub) b.append(el(doc, 'span', { class: 'sub' }, sub));
    return b;
  }

  function buildSheet(s: State) {
    const overlay = s.overlay!;
    const scrim = el(doc, 'div', { class: 'scrim', 'data-action': 'close' });
    const panel = el(doc, 'section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' });
    panel.append(el(doc, 'h2', { id: 'sheet-title', tabindex: '-1' }, overlay === 'basis' ? COPY.basisSheet : COPY.staySheet));
    if (overlay === 'basis') {
      const pair = el(doc, 'div', { class: 'pair' });
      pair.append(
        // its "위치 권한이 꺼져 있어요" line comes and goes in patchSheet
        option(COPY.gpsOption, null, { 'data-basis': 'gps', 'aria-pressed': String(s.basis === 'gps') }),
        option(COPY.stayOption, s.stay ? areaLabel(s.stay.area) : COPY.stayUnset, { 'data-basis': 'stay', 'aria-pressed': String(s.basis === 'stay') }),
      );
      panel.append(pair);
      if (s.stay) panel.append(el(doc, 'button', { type: 'button', class: 'restay', 'data-action': 'restay' }, COPY.restay));
      areaGroups(panel, 'basis', s.basis === 'region' ? s.region : null);
    } else {
      panel.append(
        el(doc, 'p', { class: 'note' }, COPY.stayNote),
        el(doc, 'button', { type: 'button', class: 'primary', 'data-action': 'stay-here' }, COPY.stayHere),
        el(doc, 'p', { class: 'form-err', role: 'alert', hidden: '' }),
      );
      areaGroups(panel, 'stay', s.stay?.source === 'area' ? s.stay.area : null);
    }
    panel.append(el(doc, 'button', { type: 'button', class: 'sheet-close', 'data-action': 'close' }, COPY.close));
    els.sheet.replaceChildren(scrim, panel);
  }

  function patchSheet(s: State) {
    const gps = els.sheet.querySelector<HTMLButtonElement>('[data-basis="gps"]');
    if (gps) {
      const sub = gps.querySelector('.sub');
      if (s.lastFail === 'denied') {
        if (!sub) gps.append(el(doc, 'span', { class: 'sub' }, COPY.gpsOff));
      } else sub?.remove();
    }
    const here = els.sheet.querySelector<HTMLButtonElement>('[data-action="stay-here"]');
    if (here) {
      here.disabled = s.stayForm.pending;
      setText(here, s.stayForm.pending ? COPY.locating : COPY.stayHere);
    }
    const err = els.sheet.querySelector<HTMLElement>('.form-err');
    if (err) {
      // The button stays a button; the reason goes on its own line (S09).
      setText(err, s.stayForm.error ? COPY.stayError[s.stayForm.error] : '');
      err.hidden = !s.stayForm.error;
    }
  }

  function focusSheet() {
    const pick = els.sheet.querySelector<HTMLElement>('.sheet [aria-pressed="true"]') ?? els.sheet.querySelector<HTMLElement>('#sheet-title');
    pick?.focus({ preventScroll: true });
  }

  function renderSheet(s: State) {
    if (s.overlay && !prevOverlay) {
      // who opened it (before the page goes inert and drops focus): focus goes back there on close
      const active = doc.activeElement as HTMLElement | null;
      opener = active && active !== doc.body && !els.sheet.contains(active) ? active : null;
    }
    // Everything behind the sheet is inert: no Tab or tap reaches it (S58). Lifted before focus goes back to
    // the opener — focus() on an element inside an inert subtree silently does nothing.
    if (s.overlay) els.app.setAttribute('inert', '');
    else els.app.removeAttribute('inert');
    if (s.overlay) {
      if (closeTimer) {
        // Reopened while the close animation was still running: take the node back.
        clearTimeout(closeTimer);
        timers.delete(closeTimer);
        closeTimer = null;
        els.sheet.classList.remove('closing');
        sheetSig = '';
      }
      const sig = sheetSigOf(s);
      if (sig !== sheetSig) {
        const focusInside = !!prevOverlay && els.sheet.contains(doc.activeElement);
        const switched = prevOverlay !== s.overlay;
        sheetSig = sig;
        buildSheet(s);
        els.sheet.hidden = false;
        if (switched || focusInside) focusSheet();
      }
      patchSheet(s);
    } else if (prevOverlay) {
      sheetSig = '';
      const done = () => {
        closeTimer = null;
        els.sheet.classList.remove('closing');
        els.sheet.replaceChildren();
        els.sheet.hidden = true;
      };
      if (motion()) {
        els.sheet.classList.add('closing');
        closeTimer = later(190, done);
      } else done();
      const back = opener?.isConnected && !opener.closest('[hidden]') ? opener : els.basis;
      opener = null;
      back.focus?.({ preventScroll: true });
    }
    prevOverlay = s.overlay;
  }

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
  function focusView(view: View) {
    const target =
      view === 'cards' ? els.resultsTitle : view === 'saved' ? els.savedTitle : (els.moods.find((b) => b.getAttribute('aria-current') === 'true') ?? els.moods[0]);
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
    else if (lostFocus()) focusView(s.view);
  }

  /** New cards: bring the heading back under the top bar if it scrolled away ("다른 3곳 보기", S45·S46). */
  function reveal(s: State) {
    const c = s.view === 'cards' && s.phase.k === 'ready' ? s.cards : null;
    if (!c || c.seq === revealedSeq) return;
    revealedSeq = c.seq;
    if (c.how === 'restore' || !win) return;
    const head = els.resultsTitle.parentElement!;
    const r = els.resultsTitle.getBoundingClientRect();
    const topBar = els.basis.parentElement!.getBoundingClientRect().bottom;
    if ((r.top < topBar || r.top > win.innerHeight) && typeof head.scrollIntoView === 'function') head.scrollIntoView({ block: 'start' });
    if (c.how === 'more' || lostFocus()) els.resultsTitle.focus({ preventScroll: true });
  }

  function render(s: State) {
    const yBefore = s.view !== shownView ? (win?.scrollY ?? 0) : 0;
    const label = basisLabel(s);
    setText(els.basisText, label);
    setAttr(els.basis, 'aria-label', COPY.basisAria(label));

    const n = savedCount(s);
    const inSaved = s.view === 'saved';
    // Stays visible while the list is open, even at 0, so the toggle never vanishes under the thumb.
    els.saved.hidden = n === 0 && !inSaved;
    setText(els.savedN, String(n));
    setAttr(els.saved, 'aria-label', COPY.savedAria(n));
    setAttr(els.saved, 'aria-pressed', String(inSaved));

    els.home.hidden = s.view !== 'home';
    els.results.hidden = s.view !== 'cards';
    els.savedView.hidden = !inSaved;
    if (s.mood) setText(els.resultsTitle, MOOD_LABEL[s.mood]);
    // The mood chosen last time is ticked on the first screen.
    for (const b of els.moods) setAttr(b, 'aria-current', b.dataset.mood === s.mood ? 'true' : null);
    els.foodSub.hidden = !(s.view === 'cards' && s.mood === 'food');
    for (const b of els.subs) setAttr(b, 'aria-pressed', String(b.dataset.sub === s.sub));

    const st = statusOf(s);
    const statusKey = `${st.text}|${st.chooseArea}`;
    if (statusKey !== lastStatus) {
      lastStatus = statusKey;
      els.status.replaceChildren();
      if (st.text) els.status.append(el(doc, 'span', {}, st.text));
      if (st.chooseArea) els.status.append(el(doc, 'button', { type: 'button', class: 'link', 'data-action': 'choose-area' }, COPY.chooseArea));
    }

    renderResults(s);
    renderSaved(s);
    patchCards(s);
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
    setDate: (text) => setText(els.date, text),
    dispose() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
