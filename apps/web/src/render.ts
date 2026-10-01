// render(state) is idempotent: every aria-pressed/aria-current, label, count, card and sheet is derived from
// state (design/SPEC.md §12). Card nodes are rebuilt only when the list itself changes — a heart tap patches
// the heart and ♥ N, a broken photo drops its box in place — so photos never reload.
import { AREAS, AREA_GROUPS, areaLabel, type AreaName } from './areas';
import { DAYS_AHEAD, addDays, dayOf, longDay, shortDay, type Day } from './dates';
import { appHome, backupUrl, kakaoExternal, type InApp } from './keep';
import { bookingUrl, kakaoUrl } from './links';
import { REACHES, historyKey, travel, travelText, type Button, type Card, type Reach, type Spot } from './pick';
import { cardsValid, hasSaved, isSaved, savedCount, savedDays, spotIndex, tabNow, type SavedRow, type State } from './state';
import type { NoOrigin, Origin, Overlay, View } from './types';

// Every string on screen (§9). Sentences end with a full stop; buttons, labels, titles and meta don't.
export const COPY = {
  basisGps: '여기 근처',
  basisStay: '숙소 근처',
  basisRegion: (label: string) => `${label} 근처`,
  basisNoGps: '지역 고르기',
  /** a day chosen in the basis sheet goes in front ("내일 · 애월 근처", "10월 3일 · 숙소 근처"). */
  basisWhen: (day: string, where: string) => `${day} · ${where}`,
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
  noOriginBody: '동네를 고르면 거기서 가까운 곳을 보여 드려요.',
  deniedHow: '위치를 쓰려면 브라우저 설정에서 위치 권한을 켜 주세요.',
  empty: ['이 근처에는 보여 드릴 곳이 없어요.', '다른 동네를 골라 주세요.'],
  loadError: ['목록을 불러오지 못했어요.', '연결을 확인하고 다시 불러와 주세요.'],
  loadErrorOffline: ['오프라인이라 목록을 불러오지 못했어요.', '연결되면 다시 불러와 주세요.'],
  retry: '다시 불러오기',
  westFirst: '서쪽부터',
  savedEmpty: '저장한 곳이 없어요. 카드의 하트를 누르면 여기 모여요.',
  /** ADR-0061: the saved list's note on anonymous counting, and its switch. */
  trackNote: '어디가 좋았는지 익명으로 세어요.',
  trackOff: '기록 끄기',
  trackOn: '기록 켜기',
  today: '오늘',
  tomorrow: '내일',
  past: '지난 날',
  pastOpen: '펼치기',
  pastClose: '접기',
  up: '위로',
  down: '아래로',
  moveDay: '다른 날로',
  upAria: (name: string) => `${name}, 위로`,
  downAria: (name: string) => `${name}, 아래로`,
  moveDayAria: (name: string) => `${name}, 다른 날로`,
  moveSheet: '어느 날로 옮길까요?',
  basisSheet: '언제 어디 근처로 볼까요?',
  whenHead: '언제',
  whereHead: '어디',
  /** 얼마나 (ADR-0060): the range, under 어디. Not in the basis label. */
  reachHead: '얼마나',
  reach: { walk: '걸어서', drive30: '차로 30분', drive60: '차로 1시간' } satisfies Record<Reach, string>,
  /** 비 와요(실내만) (ADR-0065): one row under 얼마나, and the cards' word while it is on. */
  weatherHead: '날씨',
  indoorToggle: '비 와요(실내만)',
  indoor: '실내',
  whenNow: '지금',
  pickDay: '날짜 고르기',
  /** where the browser has no picker: the date field is shown and applies only on this (or Enter). */
  dayOk: '이 날로',
  gpsOption: '지금 있는 곳',
  gpsOff: '위치 권한이 꺼져 있어요',
  stayOption: '숙소',
  stayArea: (label: string) => `${label} 숙소`,
  stayUnset: '처음 한 번만 정해요',
  restay: '다시 정하기',
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
  /** the `아니면` line when both row cards are the same trip ("둘 다 차로 약 5분"). */
  both: (trip: string) => `둘 다 ${trip}`,
  // ADR-0063: keeping saves without a login
  backupCopied: '링크를 복사했어요. 다른 브라우저나 기기에서 열면 여기 저장한 곳을 합칠 수 있어요.',
  backupFailed: '링크를 복사하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  restoreAsk: (n: number) => `링크에 저장한 곳이 ${n}곳 있어요. 이 기기에 합칠까요?`,
  restoreNone: '링크에 있는 곳을 지금 목록에서 찾지 못했어요.',
  restoreMerge: '합치기',
  restoreCancel: '그만두기',
  restoreDone: (n: number) => (n ? `${n}곳을 합쳤어요. 맨 위 하트 버튼에 모여요.` : '새로 합칠 곳이 없어요. 이미 이 기기에 있어요.'),
  inappName: { kakaotalk: '카카오톡', instagram: '인스타그램', facebook: '페이스북', naver: '네이버 앱', line: '라인', daum: '다음 앱' } satisfies Record<InApp, string>,
  inappNote: (app: string) => `${app} 안에서 저장한 곳은 ${app}에만 남아요.`,
  inappOpen: '브라우저로 열기',
  inappCopied: '링크를 복사했어요. 휴대폰 브라우저 주소창에 붙여 넣어 주세요.',
  inappFailed: '오른쪽 위 메뉴에서 다른 브라우저로 열어 주세요.',
  nudge: '홈 화면에 추가하면 저장한 곳이 오래 남아요.',
  nudgeIos: '공유 버튼에서 ‘홈 화면에 추가’를 눌러 주세요. 지금 저장한 곳은 아래 ‘링크로 백업’으로 옮겨요.',
  install: '홈 화면에 추가',
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
const CHECK = '<svg class="i-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
/** the `아니면` line's shared trip; the row links point at it with aria-describedby. */
const ALT_TRIP = 'alt-trip';
const HEART_22 = `<svg width="22" height="22" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${HEART_PATH}"/></svg>`;

/** "9월 30일 수요일": today's date in Jeju (ADR-0059, Asia/Seoul like the saved days). */
export function dateLabel(d: Date): string {
  return longDay(dayOf(d));
}

/** A saved-list day: "오늘", "내일", "10월 3일 금요일". */
export function dayName(today: Day, day: Day): string {
  if (day === today) return COPY.today;
  if (day === addDays(today, 1)) return COPY.tomorrow;
  return longDay(day);
}

/** "더럭초등학교(구, 더럭분교)" → name + "(구, 더럭분교)" shown smaller and never broken inside (§3.3). So is
 * the part after " - " ("… 절로 가는길 - 정진의 길"): it is what tells a course from its siblings. */
export function splitName(name: string): { main: string; alias: string | null } {
  const m = /^(.+?)\s*([(（].+[)）])$/.exec(name) ?? /^(.+?)\s+(-\s+.+)$/.exec(name);
  return m ? { main: m[1], alias: m[2] } : { main: name, alias: null };
}

function whereLabel(s: State): string {
  if (s.basis === 'stay' && s.stay) return COPY.basisStay;
  if (s.basis === 'region' && s.region) return COPY.basisRegion(areaLabel(s.region));
  return s.lastFail ? COPY.basisNoGps : COPY.basisGps;
}
/** 지금: the place only. A chosen day goes in front: "내일 · 애월 근처", "10월 3일 · 숙소 근처". */
export function basisLabel(s: State): string {
  const where = whereLabel(s);
  if (s.when === 'now') return where;
  return COPY.basisWhen(s.when === addDays(s.today, 1) ? COPY.tomorrow : shortDay(s.when), where);
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
  crumb: HTMLElement;
  status: HTMLElement;
  foodSub: HTMLElement;
  newSub: HTMLElement;
  cards: HTMLElement;
  savedTitle: HTMLElement;
  savedCount: HTMLElement;
  savedSort: HTMLElement;
  savedList: HTMLElement;
  track: HTMLButtonElement;
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
    basis: q<HTMLButtonElement>('#basis'),
    basisText: q('#basis > span'),
    saved: q<HTMLButtonElement>('#saved'),
    savedN: q('#saved > .n'),
    crumb: q('#crumb'),
    status: q('#status'),
    foodSub: q('#foodSub'),
    newSub: q('#newSub'),
    cards: q('#cards'),
    savedTitle: q('#savedTitle'),
    savedCount: q('#savedTitle > .count'),
    savedSort: q('#savedView > .sort'),
    savedList: q('#savedView > .picks'),
    track: q<HTMLButtonElement>('#savedView [data-action="track"]'),
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

export function createRenderer(doc: Document, els: Els): Renderer {
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
  /** Results meta (§7): the first card always says where from and that a tap opens 카카오맵. The two row cards'
   * trip is said once on the `아니면` line when it is the same ("아니면 · 둘 다 차로 약 5분") and the rows then
   * have no meta line; otherwise each row says its own trip, without the "from". */
  function resultMetas(origin: Origin, list: Card[]): { metas: (string | null)[]; both: string | null } {
    const trips = list.map((c) => travelText(tripOf(origin, c)));
    const both = list.length === 3 && trips[1] === trips[2] ? trips[1] : null;
    const metas = list.map((c, i) => (i === 0 ? travelText(tripOf(origin, c), origin.from) : both ? null : trips[i]));
    return { metas, both };
  }

  function photoEl(spot: Card['spot'], eager: boolean): HTMLElement {
    const ph = el(doc, 'div', { class: 'ph' });
    const load: Record<string, string> = eager ? { fetchpriority: 'high' } : { loading: 'lazy' };
    ph.append(el(doc, 'img', { src: spot.image, alt: '', ...load, decoding: 'async', referrerpolicy: 'no-referrer' }));
    return ph;
  }

  /** `indoor`: 비 와요 is on (ADR-0065) — the line starts with 실내, words only (no tag or chip, §14). */
  function metaEl(meta: string | null, dest: boolean, indoor = false): HTMLElement {
    const metaEl = el(doc, 'p', { class: 'meta' });
    if (indoor) {
      metaEl.append(el(doc, 'span', { class: 'indoor' }, COPY.indoor));
      if (meta || dest) metaEl.append(el(doc, 'span', { class: 'sep', 'aria-hidden': 'true' }, ' ·'), ' ');
    }
    if (meta) metaEl.append(el(doc, 'span', { class: 'travel' }, meta));
    // "·" is held to the trip by a no-break space and a line may break after it: a narrow line ends
    // "… 5분 ·" and the next starts with "카카오맵", never with "·".
    if (meta && dest) metaEl.append(el(doc, 'span', { class: 'sep', 'aria-hidden': 'true' }, ' ·'), ' ');
    // Says where a tap on the card goes (S57); no arrow glyph.
    if (dest) metaEl.append(el(doc, 'span', { class: 'dest', 'aria-hidden': 'true' }, COPY.map));
    return metaEl;
  }

  /** `meta`: the trip (null = none); `dest`: also say where a tap goes ("카카오맵"); `day`: a saved-list row,
   * whose heart is about that day. */
  function cardEl(s: State, c: Card, kind: 'lead' | 'row', meta: string | null, dest: boolean, eager: boolean, describedBy?: string, day?: Day): HTMLElement {
    const { spot } = c;
    const name = spot.name.trim();
    const broken = s.broken.includes(spot.id);
    const card = el(doc, 'div', { class: `card ${kind}${broken ? ' noimg' : ''}`, 'data-id': spot.id });
    if (!broken) card.append(photoEl(spot, eager));
    // The name's link covers the whole card (::after); heart and booking link sit above it (S8-3).
    const title = el(doc, 'h2', { class: 'name' });
    const link = el(doc, 'a', { class: 'card-link', href: kakaoUrl(spot), target: '_blank', rel: 'noopener', 'aria-label': COPY.mapAria(name) });
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
    heart.innerHTML = HEART_22;
    card.append(title, heart, el(doc, 'p', { class: 'reason' }, spot.reason));
    // 실내 only on the results, only while 비 와요 picked them (ADR-0065)
    const indoor = !day && !!s.cards?.indoor && spot.indoor === true;
    if (meta || dest || indoor) card.append(metaEl(meta, dest, indoor));
    if (spot.bookable) {
      card.append(el(doc, 'a', { class: 'tbtn book', href: bookingUrl(spot), target: '_blank', rel: 'noopener', 'aria-label': COPY.bookAria(name) }, COPY.book));
    }
    return card;
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

  function areaGroups(parent: HTMLElement, where: 'inline' | 'basis' | 'stay', selected: AreaName | null) {
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
    b.append(text);
    b.insertAdjacentHTML('beforeend', CHECK);
    return b;
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
        const { metas, both } = resultMetas(origin, list);
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
      const name = spot.name.trim();
      const ctl = el(doc, 'div', { class: 'ctl' });
      const btn = (action: string, text: string, aria: string) =>
        el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': action, 'data-id': entry.id, 'data-date': entry.date, 'aria-label': aria }, text);
      ctl.append(btn('up', COPY.up, COPY.upAria(name)), btn('down', COPY.down, COPY.downAria(name)), btn('move-day', COPY.moveDay, COPY.moveDayAria(name)));
      card.append(ctl);
      rowNodes.set(key, card);
    }
    const metaKey = `${meta ?? ''}|${dest}`;
    if (card.dataset.meta !== metaKey) {
      card.dataset.meta = metaKey;
      card.querySelector(':scope > .meta')?.remove();
      if (meta || dest) card.querySelector(':scope > .reason')!.after(metaEl(meta, dest));
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
    return `${s.today}|${o ? `${o.key}@${o.point.lat},${o.point.lng}` : ''}|${past.length}|${s.pastOpen}|${days.join(';')}`;
  }

  function savedListNodes(s: State): HTMLElement[] {
    const { upcoming, past } = savedDays(s);
    const o = s.savedList!.origin;
    const idx = spotIndex(s.spots!);
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
    els.savedList.replaceChildren(...nodes);
    if (inside) refocus(active!);
  }

  /** Hearts, broken photos and the first-save hint are patched in place — cards are never rebuilt for them. */
  function patchCards(s: State) {
    for (const h of els.main.querySelectorAll<HTMLButtonElement>('.heart[data-id]')) setAttr(h, 'aria-pressed', String(isSaved(s, h.dataset.id!, h.dataset.date)));
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
        const idx = s.spots ? spotIndex(s.spots) : null;
        for (const card of els.main.querySelectorAll<HTMLElement>('.card.noimg[data-id]')) {
          const id = card.dataset.id!;
          const spot = broken.has(id) ? null : (s.cards?.list.find((x) => x.spot.id === id)?.spot ?? idx?.get(id));
          if (!spot) continue;
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

  // --- keeping saves without a login (ADR-0063): quiet notices, a sentence or two and text buttons ---
  let homeSig = '';
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
  /** Where a link to this app carries what is saved here (the in-app browser's way out). */
  const shareUrl = (s: State) => {
    const home = appHome(doc.defaultView?.location.href ?? 'https://localhost/');
    return s.saved.length ? backupUrl(home, s.saved, s.indoor) : home;
  };
  function renderKeep(s: State) {
    const k = s.keep;
    const r = k.restore;
    // a backup link's places that this data knows (all of them until the data is in)
    const n = r?.k === 'ask' ? (s.spots ? r.entries.filter((e) => spotIndex(s.spots!).has(e.id)).length : r.entries.length) : 0;
    const sig = r?.k === 'ask' ? `ask|${n}` : r?.k === 'done' ? `done|${r.added}` : k.inapp && k.inappNote ? `inapp|${k.inapp}|${k.inappNote}` : '';
    if (sig !== homeSig) {
      const focusIn = els.homeNote.contains(doc.activeElement);
      homeSig = sig;
      if (r?.k === 'ask' && n) fill(els.homeNote, [COPY.restoreAsk(n)], [act('restore-merge', COPY.restoreMerge), act('restore-cancel', COPY.restoreCancel)]);
      else if (r?.k === 'ask') fill(els.homeNote, [COPY.restoreNone], [act('restore-cancel', COPY.close)]);
      else if (r?.k === 'done') fill(els.homeNote, [COPY.restoreDone(r.added)], []);
      else if (k.inapp && k.inappNote) {
        const name = COPY.inappName[k.inapp];
        const lines = [COPY.inappNote(name)];
        if (k.inappNote === 'copied') lines.push(COPY.inappCopied);
        else if (k.inappNote === 'failed') lines.push(COPY.inappFailed);
        // KakaoTalk has its own way out to the phone's browser; elsewhere the link is copied
        const open = k.inapp === 'kakaotalk' ? el(doc, 'a', { class: 'tbtn', 'data-action': 'inapp-open', href: '#' }, COPY.inappOpen) : act('inapp-copy', COPY.inappOpen);
        fill(els.homeNote, lines, [open, act('inapp-close', COPY.close)]);
      } else els.homeNote.replaceChildren();
      els.homeNote.hidden = !sig;
      if (r?.k === 'done' && els.announce) els.announce.textContent = COPY.restoreDone(r.added);
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

  // --- sheet ---
  function sheetSigOf(s: State): string {
    // Only what the user changes in a sheet. News that arrives while it is open — a 숙소 GPS failure, a GPS
    // denial — is patched in place (patchSheet): a rebuild under the finger would reset its scroll and focus.
    const move = s.overlay === 'move' && s.moveTarget ? `${s.moveTarget.id}|${s.moveTarget.date}` : '';
    return `${s.overlay}|${s.basis}|${s.region}|${s.stay?.area ?? ''}|${s.stay?.source ?? ''}|${s.reach}|${s.indoor}|${s.when}|${s.today}|${move}`;
  }

  /** A thin-rule list of rows under its own group heading (the 언제 / 어디 / 얼마나 parts of the basis sheet). */
  function optGroup(parent: HTMLElement, id: string, heading: string | null, rows: HTMLElement[]): HTMLElement {
    const opts = el(doc, 'div', { class: 'opts', role: 'group' });
    if (heading) {
      const h = el(doc, 'p', { class: 'group-h', id });
      h.append(el(doc, 'span', {}, heading));
      parent.append(h);
      opts.setAttribute('aria-labelledby', id);
    }
    opts.append(...rows);
    parent.append(opts);
    return opts;
  }
  function optRow(...children: HTMLElement[]): HTMLElement {
    const row = el(doc, 'div', { class: 'optrow' });
    row.append(...children);
    return row;
  }
  /** 날짜 고르기: an option that opens the browser's own date picker (today to a year on), with the native
   * input kept beside it. Where showPicker() is missing the input itself is shown with 이 날로 (app.ts). */
  function pickDay(s: State, picked: Day | null): HTMLElement[] {
    const input = el(doc, 'input', { type: 'date', class: 'sr', min: s.today, max: addDays(s.today, DAYS_AHEAD), tabindex: '-1', 'aria-hidden': 'true', 'aria-label': COPY.pickDay, 'data-action': 'day-input' });
    input.value = picked ?? '';
    const box = el(doc, 'div', { class: 'date-fb' });
    box.append(input, el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'day-ok', hidden: '' }, COPY.dayOk));
    return [option(COPY.pickDay, picked ? longDay(picked) : null, { 'data-action': 'pick-day', 'aria-pressed': String(!!picked) }), box];
  }

  function buildSheet(s: State) {
    const overlay = s.overlay!;
    const scrim = el(doc, 'div', { class: 'scrim', 'data-action': 'close' });
    const panel = el(doc, 'section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' });
    const title = overlay === 'basis' ? COPY.basisSheet : overlay === 'move' ? COPY.moveSheet : COPY.staySheet;
    panel.append(el(doc, 'h2', { id: 'sheet-title', tabindex: '-1' }, title));
    if (overlay === 'basis') {
      // 언제 (specs/date-mode.md): 지금 · 내일 · 날짜 고르기 on one compact row, so 어디 comes sooner.
      // Choosing one keeps the sheet open for 어디.
      const tomorrow = addDays(s.today, 1);
      const picked = s.when !== 'now' && s.when !== tomorrow ? s.when : null;
      const when = optRow(
        option(COPY.whenNow, null, { 'data-when': 'now', 'aria-pressed': String(s.when === 'now') }),
        option(COPY.tomorrow, null, { 'data-when': tomorrow, 'aria-pressed': String(s.when === tomorrow) }),
        ...pickDay(s, picked),
      );
      when.classList.add('when-row');
      optGroup(panel, 'when-h', COPY.whenHead, [when]);
      // 어디: a thin-rule list of two rows; 다시 정하기 sits at the end of the 숙소 row, beside its option (§6.10).
      // The 지금 있는 곳 row's "위치 권한이 꺼져 있어요" line comes and goes in patchSheet.
      const stayRow = optRow(option(COPY.stayOption, s.stay ? COPY.stayArea(areaLabel(s.stay.area)) : COPY.stayUnset, { 'data-basis': 'stay', 'aria-pressed': String(s.basis === 'stay') }));
      if (s.stay) stayRow.append(el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'restay' }, COPY.restay));
      optGroup(panel, 'where-h', COPY.whereHead, [optRow(option(COPY.gpsOption, null, { 'data-basis': 'gps', 'aria-pressed': String(s.basis === 'gps') })), stayRow]);
      // 얼마나 (ADR-0060): right under the 어디 rows, before the 동네 index, so it is in view without scrolling.
      // The same thin-rule rows with a check. Choosing one closes the sheet.
      optGroup(panel, 'reach-h', COPY.reachHead, REACHES.map((r) => optRow(option(COPY.reach[r], null, { 'data-reach': r, 'aria-pressed': String(s.reach === r) }))));
      // 비 와요(실내만) (ADR-0065): one row of its own, the same thin-rule option with a check when on. Choosing it
      // closes the sheet, like 얼마나.
      optGroup(panel, 'weather-h', COPY.weatherHead, [optRow(option(COPY.indoorToggle, null, { 'data-indoor': '', 'aria-pressed': String(s.indoor) }))]);
      areaGroups(panel, 'basis', s.basis === 'region' ? s.region : null);
    } else if (overlay === 'move') {
      // 다른 날로: the days that have saved places (today on), the row's own checked, then 날짜 고르기.
      const from = s.moveTarget?.date ?? '';
      const days = [...new Set(s.saved.map((e) => e.date).filter((d) => d >= s.today))].sort();
      optGroup(panel, 'move-h', null, [
        ...days.map((d) => optRow(option(dayName(s.today, d), null, { 'data-day': d, 'aria-pressed': String(d === from) }))),
        optRow(...pickDay(s, null)),
      ]);
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
      const sub = gps.querySelector('.lm');
      if (s.lastFail === 'denied') {
        if (!sub) gps.querySelector('.nm')!.after(el(doc, 'span', { class: 'lm' }, COPY.gpsOff));
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
      // 다른 날로 moved its row: the row (a new node, keyed by its new day) gets the focus back
      const moved =
        opener && !opener.isConnected && opener.dataset.action === 'move-day' && s.moveTarget
          ? [...els.savedList.querySelectorAll<HTMLElement>('[data-action="move-day"]')].find((b) => b.dataset.id === s.moveTarget!.id && b.dataset.date === s.moveTarget!.date)
          : null;
      const back = opener?.isConnected && !opener.closest('[hidden]') ? opener : (moved ?? els.basis);
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
      view === 'cards' ? els.crumb : view === 'saved' ? els.savedTitle : (els.moods.find((b) => b.getAttribute('aria-current') === 'true') ?? els.moods[0]);
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
    const head = els.crumb.parentElement!;
    const r = els.crumb.getBoundingClientRect();
    const topBar = els.basis.parentElement!.getBoundingClientRect().bottom;
    if ((r.top < topBar || r.top > win.innerHeight) && typeof head.scrollIntoView === 'function') head.scrollIntoView({ block: 'start' });
    if (c.how === 'more' || lostFocus()) els.crumb.focus({ preventScroll: true });
  }

  function render(s: State) {
    const yBefore = s.view !== shownView ? (win?.scrollY ?? 0) : 0;
    const label = basisLabel(s);
    if (els.basisText.textContent !== label) {
      // the day and its "·" stay together: a label wrapped at large text never starts a line with "·"
      const i = label.indexOf(' · ');
      if (i < 0) els.basisText.textContent = label;
      else els.basisText.replaceChildren(el(doc, 'span', { class: 'nw' }, label.slice(0, i + 2)), label.slice(i + 2));
    }
    setAttr(els.basis, 'aria-label', COPY.basisAria(label));

    const n = savedCount(s);
    const inSaved = s.view === 'saved';
    // Counts today and later; shown while anything is saved (지난 날 stays reachable) and while the list is
    // open, even at 0, so the toggle never vanishes under the thumb.
    els.saved.hidden = !hasSaved(s) && !inSaved;
    setText(els.savedN, String(n));
    setAttr(els.saved, 'aria-label', COPY.savedAria(n));
    setAttr(els.saved, 'aria-pressed', String(inSaved));
    setText(els.track, s.tracking ? COPY.trackOff : COPY.trackOn);

    els.home.hidden = s.view !== 'home';
    els.results.hidden = s.view !== 'cards';
    els.savedView.hidden = !inSaved;
    if (s.mood) setText(els.crumb, MOOD_LABEL[s.mood]);
    // The mood chosen last time is ticked on the first screen.
    for (const b of els.moods) setAttr(b, 'aria-current', b.dataset.mood === s.mood ? 'true' : null);
    els.foodSub.hidden = !(s.view === 'cards' && s.mood === 'food');
    els.newSub.hidden = !(s.view === 'cards' && s.mood === 'new');
    for (const b of els.subs) setAttr(b, 'aria-pressed', String(b.dataset.sub === s.sub || b.dataset.sub === s.newSub));

    const st = statusOf(s);
    const statusKey = `${st.text}|${st.chooseArea}`;
    if (statusKey !== lastStatus) {
      lastStatus = statusKey;
      els.status.replaceChildren();
      if (st.text) els.status.append(el(doc, 'span', {}, st.text));
      if (st.chooseArea) els.status.append(el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'choose-area' }, COPY.chooseArea));
    }

    renderResults(s);
    renderSaved(s);
    patchCards(s);
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
    setDate: (text) => setText(els.date, text),
    dispose() {
      io?.disconnect();
      io = null;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
