// One screen: 5 mood buttons (static HTML, ADR-0028) + basis toggle → 3 cards (spec, plan OQ3·5).
import { distanceKm, driveMinutes, pickCards, type Button, type Card, type Histories, type Point, type Spot, type Sub } from './pick';

/** 15개 세부 지역, 고정 중심 좌표 (ADR-0029, plans/tomorrow-picker.md "지역 15곳 중심 좌표"). */
export const AREAS = [
  { name: '구제주', lat: 33.5125, lng: 126.526, group: 'jeju' },
  { name: '신제주', lat: 33.487, lng: 126.488, group: 'jeju' },
  { name: '애월', lat: 33.4475, lng: 126.3678, group: 'jeju' },
  { name: '한림', lat: 33.3957, lng: 126.2651, group: 'jeju' },
  { name: '한경', lat: 33.3274, lng: 126.2212, group: 'jeju' },
  { name: '조천', lat: 33.5012, lng: 126.6668, group: 'jeju' },
  { name: '구좌', lat: 33.5189, lng: 126.8079, group: 'jeju' },
  { name: '우도', lat: 33.5079, lng: 126.9538, group: 'jeju' },
  { name: '서귀포시내', lat: 33.2573, lng: 126.5338, group: 'seogwipo' },
  { name: '중문', lat: 33.2576, lng: 126.4205, group: 'seogwipo' },
  { name: '안덕', lat: 33.2693, lng: 126.3295, group: 'seogwipo' },
  { name: '대정', lat: 33.2472, lng: 126.2689, group: 'seogwipo' },
  { name: '남원', lat: 33.3053, lng: 126.6735, group: 'seogwipo' },
  { name: '표선', lat: 33.3643, lng: 126.7973, group: 'seogwipo' },
  { name: '성산', lat: 33.4387, lng: 126.9026, group: 'seogwipo' },
] as const;
type Area = (typeof AREAS)[number];

export type LocateFailure = 'denied' | 'unavailable' | 'outside';
export class LocateError extends Error {
  constructor(readonly reason: LocateFailure) {
    super(reason);
  }
}

export interface Deps {
  loadSpots(): Promise<Spot[]>;
  /** Current position; rejects with LocateError. */
  locate(): Promise<Point>;
  storage: Storage | null;
}

type Basis = 'gps' | 'stay' | 'region';
interface Place extends Point {
  label: string;
}

const KEY_STAY = 'jeju.stay';
const KEY_BASIS = 'jeju.basis';
const KEY_REGION = 'jeju.region';
const KEY_SAVED = 'jeju.saved';

// kakaoPlaceId 없으면 이름 검색으로 대체 (ADR-0028 지도 링크 폴백).
export const kakaoUrl = (s: Spot) =>
  s.kakaoPlaceId
    ? `https://place.map.kakao.com/${encodeURIComponent(s.kakaoPlaceId)}`
    : `https://map.kakao.com/link/search/${encodeURIComponent(s.name)}`;
export const bookingUrl = (s: Spot) => `https://www.myrealtrip.com/search?q=${encodeURIComponent(s.name)}`;

const JEJU = { latMin: 33.0, latMax: 33.7, lngMin: 126.0, lngMax: 127.1 };
export const inJeju = (p: Point) =>
  p.lat >= JEJU.latMin && p.lat <= JEJU.latMax && p.lng >= JEJU.lngMin && p.lng <= JEJU.lngMax;

function read<T>(storage: Storage | null, key: string): T | null {
  try {
    const v = storage?.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(storage: Storage | null, key: string, value: unknown) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode etc. — still works for this visit */
  }
}
const isPlace = (v: unknown): v is Place =>
  !!v && typeof (v as Place).lat === 'number' && typeof (v as Place).lng === 'number' && typeof (v as Place).label === 'string';

/** Storage read used only to seed the in-memory saved-id list at mount (S8-3/S8-4 UX fix #2: the
 * in-memory list, not storage, is the session's source of truth from here on — storage is a
 * best-effort mirror, so a broken/throwing storage never gets hearts stuck). */
function getSaved(storage: Storage | null): string[] {
  const v = read<unknown[]>(storage, KEY_SAVED);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
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

export function mountApp(doc: Document, deps: Deps) {
  const $ = <T extends HTMLElement>(sel: string) => doc.querySelector(sel) as T;
  const basisBtn = $<HTMLButtonElement>('#basis');
  const savedBtn = $<HTMLButtonElement>('#saved');
  const cardsBox = $<HTMLElement>('#cards');
  const status = $<HTMLElement>('#status');
  const sheetBox = $<HTMLElement>('#sheet');
  const foodSubBox = $<HTMLElement>('#foodSub');
  const moodBtns = [...doc.querySelectorAll<HTMLButtonElement>('[data-mood]')];
  const subBtns = [...doc.querySelectorAll<HTMLButtonElement>('[data-sub]')];

  // S1' 검수(build-spots.mjs)가 가격·운영시간·요일·평점 문구와 부적합 항목을 이미 걸러냈다.
  const spotsP = deps.loadSpots();
  spotsP.catch(() => undefined); // surfaced on tap
  // Drop saved ids that no longer exist in the data, quietly (ADR-0029 "조용히 제외"), so ♥ N never
  // over-counts against what the saved list will actually show (MINOR).
  spotsP
    .then((spots) => {
      const known = new Set(spots.map((s) => s.id));
      const filtered = savedIds.filter((id) => known.has(id));
      if (filtered.length !== savedIds.length) {
        saveIds(filtered);
        renderSavedBtn();
      }
    })
    .catch(() => undefined);

  let stay: Place | null = read<Place>(deps.storage, KEY_STAY);
  if (!isPlace(stay)) stay = null;
  const savedArea = AREAS.find((a) => a.name === read<string>(deps.storage, KEY_REGION)) ?? null;
  let region: Place | null = savedArea ? { lat: savedArea.lat, lng: savedArea.lng, label: savedArea.name } : null;
  let basis: Basis = read<Basis>(deps.storage, KEY_BASIS) ?? 'gps';
  if (basis === 'stay' && !stay) basis = 'gps';
  if (basis === 'region' && !region) basis = 'gps';

  let active: Button | null = null;
  let foodSub: Sub = 'meal';
  let histories: Histories = {};
  let lastOrigin: { basis: Basis; point: Point } | null = null;
  let busy = 0;
  /** saved-list view state (S8-4): what to restore on "돌아가기". */
  let showingSaved = false;
  let beforeSaved: Button | null = null;
  /** the 3 cards last shown for `beforeSaved`, tagged with the button they belong to — "돌아가기"
   * only restores them when they still match `beforeSaved`; otherwise it recomputes via show()
   * (UX fix #1: a stale pair could restore the wrong cards, e.g. after a basis change). */
  let lastCards: { button: Button; cards: Card[] } | null = null;
  /** in-memory source of truth for saved ids this session (UX fix #2); storage is a best-effort mirror. */
  let savedIds: string[] = getSaved(deps.storage);

  function saveIds(ids: string[]) {
    savedIds = ids;
    write(deps.storage, KEY_SAVED, ids); // best-effort; savedIds stays correct even if this throws
  }
  /** newest-first (ADR-0029 하트 저장); returns the new pressed state. */
  function toggleSavedId(id: string): boolean {
    const i = savedIds.indexOf(id);
    if (i >= 0) {
      const next = savedIds.slice();
      next.splice(i, 1);
      saveIds(next);
      return false;
    }
    saveIds([id, ...savedIds]);
    return true;
  }

  // --- Back-button/back-swipe handling (UX fix #3): pushState when an overlay (sheet or the saved
  // list) opens, so the phone's back gesture closes it instead of leaving the app. popstate closes
  // whichever overlay is open; a UI-triggered close instead calls history.back() so the entry it
  // pushed gets consumed and history stays balanced (no double pops in either direction).
  const win = doc.defaultView;
  let sheetHistoryPushed = false;
  let savedHistoryPushed = false;
  let handlingPopstate = false;
  function pushOverlayHistory() {
    try {
      win?.history.pushState({ jejuOverlay: true }, '');
    } catch {
      /* history API unavailable (e.g. sandboxed) — overlay still works, just without the back-guard */
    }
  }
  function popOverlayHistory() {
    if (handlingPopstate) return; // already consumed by the browser's own back navigation
    try {
      win?.history.back();
    } catch {
      /* ignore */
    }
  }
  win?.addEventListener('popstate', () => {
    // Guard against a listener from an earlier mountApp() call on the same window (e.g. re-mounting
    // in tests) firing against detached elements — only the live mount's DOM is still in `doc`.
    if (!doc.body.contains(sheetBox)) return;
    handlingPopstate = true;
    try {
      if (!sheetBox.hidden) dismissSheet();
      else if (showingSaved) void closeSavedView();
    } finally {
      handlingPopstate = false;
    }
  });

  function renderFoodSub() {
    foodSubBox.hidden = active !== 'food';
    for (const b of subBtns) b.setAttribute('aria-pressed', String(b.dataset.sub === foodSub));
  }

  function setBasis(b: Basis) {
    basis = b;
    write(deps.storage, KEY_BASIS, b);
    // A basis change invalidates cards computed from the old origin, so 돌아가기 must recompute
    // rather than restore stale drive times (MINOR).
    lastCards = null;
    renderBasis();
  }
  function renderBasis() {
    const label = basis === 'stay' ? '숙소 기준' : basis === 'region' && region ? `${region.label} 기준` : '내 위치 기준';
    basisBtn.textContent = `${label} ⇄`;
    basisBtn.setAttribute('aria-label', `${label}. 누르면 기준 위치를 바꿔요`);
  }

  function renderSavedBtn() {
    const n = savedIds.length;
    savedBtn.hidden = n === 0;
    savedBtn.textContent = `${HEART_FILLED} ${n}`;
    savedBtn.setAttribute('aria-label', `저장한 곳 ${n}개`);
    savedBtn.setAttribute('aria-pressed', String(showingSaved));
  }

  function say(text: string) {
    status.textContent = text;
  }

  /** Fires when the open sheet is dismissed (backdrop tap, 닫기, or Escape) without completing its pick. */
  let onSheetDismiss: (() => void) | null = null;
  /** The element to return focus to once the sheet closes (MINOR: focus management). */
  let sheetReturnFocus: HTMLElement | null = null;

  function closeSheet() {
    sheetBox.replaceChildren();
    sheetBox.hidden = true;
    const focusTarget = sheetReturnFocus;
    sheetReturnFocus = null;
    focusTarget?.focus?.();
    if (sheetHistoryPushed) {
      sheetHistoryPushed = false;
      popOverlayHistory();
    }
  }

  /** Dismiss = closeSheet + tell openSheet's caller nothing was picked. A successful pick calls
   * closeSheet() directly instead, so onSheetDismiss never fires for it. */
  function dismissSheet() {
    const cb = onSheetDismiss;
    onSheetDismiss = null;
    closeSheet();
    cb?.();
  }

  function openSheet(title: string, note: string, build: (body: HTMLElement) => void, onDismiss?: () => void) {
    onSheetDismiss = onDismiss ?? null;
    // A sheet already open (e.g. opening the stay sheet from the basis sheet) is being replaced in
    // place, not freshly opened: keep the existing return target (UX fix #6) — doc.activeElement
    // would otherwise be a button inside the sheet that's about to be removed — and don't push a
    // second history entry for it (one physical back should close the whole sheet flow).
    if (sheetBox.hidden) {
      sheetReturnFocus = (doc.activeElement as HTMLElement) ?? null;
      pushOverlayHistory();
      sheetHistoryPushed = true;
    }
    const backdrop = el(doc, 'div', { class: 'backdrop' });
    backdrop.addEventListener('click', dismissSheet);
    const panel = el(doc, 'section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' });
    panel.append(el(doc, 'h2', { id: 'sheet-title' }, title));
    if (note) panel.append(el(doc, 'p', { class: 'sheet-note' }, note));
    const body = el(doc, 'div', { class: 'sheet-body' });
    build(body);
    const close = el(doc, 'button', { type: 'button', class: 'sheet-close' }, '닫기');
    close.addEventListener('click', dismissSheet);
    panel.append(body, close);
    sheetBox.replaceChildren(backdrop, panel);
    sheetBox.hidden = false;
    (body.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  // Escape dismisses the open sheet the same way a backdrop tap does (MINOR: keyboard support).
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheetBox.hidden) dismissSheet();
  });

  /** 15개 지역을 제주시 쪽 / 서귀포 쪽 두 묶음으로 렌더 (ADR-0029, plan S8-2). `selected`가 있으면 그 지역을 표시한다. */
  function areaGroups(body: HTMLElement, onPick: (a: Area) => void, selected?: string | null) {
    const groups: { group: Area['group']; heading: string }[] = [
      { group: 'jeju', heading: '제주시 쪽' },
      { group: 'seogwipo', heading: '서귀포 쪽' },
    ];
    for (const { group, heading } of groups) {
      body.append(el(doc, 'h3', { class: 'area-heading' }, heading));
      const grid = el(doc, 'div', { class: 'regions' });
      for (const a of AREAS.filter((x) => x.group === group)) {
        const isSelected = a.name === selected;
        const b = el(doc, 'button', {
          type: 'button',
          'data-area': a.name,
          'aria-pressed': String(isSelected),
          ...(isSelected ? { class: 'primary' } : {}),
        }, a.name);
        b.addEventListener('click', () => onPick(a));
        grid.append(b);
      }
      body.append(grid);
    }
  }

  function pickArea(a: Area) {
    region = { lat: a.lat, lng: a.lng, label: a.name };
    write(deps.storage, KEY_REGION, a.name);
    setBasis('region');
    closeSheet();
    resumeAfterBasisChange();
  }

  /** GPS unusable: ask which of the 15 areas we are in (replaces the old 4-region picker, ADR-0029). */
  function openAreaFallback(why: LocateFailure) {
    const note =
      why === 'outside'
        ? '지금은 제주 밖에 계신 것 같아요. 내일 머물 곳과 가까운 지역을 골라 주세요.'
        : '위치를 확인할 수 없어요. 지금 계신 곳과 가까운 지역을 골라 주세요.';
    openSheet('어느 지역에 계세요?', note, (body) => areaGroups(body, pickArea), () => {
      // Dismissed without picking an area: don't leave ♥ N dead (showingSaved stuck true forever) or
      // the old mood cards showing with every mood button unpressed (MAJOR).
      if (showingSaved) {
        void closeSavedView();
        return;
      }
      // A mood button was pressed but had nothing to show (no origin) — return to the calm start
      // state instead of leaving it pressed with no cards and no message (UX fix #4).
      if (active) {
        active = null;
        for (const b of moodBtns) b.setAttribute('aria-pressed', 'false');
        renderFoodSub();
        cardsBox.replaceChildren();
        say('위치를 몰라서 못 골랐어요. 위 ⇄에서 지역을 골라 주세요');
      }
    });
  }

  function saveStay(place: Place) {
    stay = place;
    write(deps.storage, KEY_STAY, place);
    setBasis('stay');
    closeSheet();
    resumeAfterBasisChange();
  }

  /** After a basis change (area pick, 숙소 save, gps/숙소 switch): resume whichever view was pending —
   * the saved list if that's what the user was trying to reach, otherwise the active mood (S8-4). */
  function resumeAfterBasisChange() {
    if (showingSaved) void showSavedView();
    else if (active) void show(active);
  }

  /** First switch to 숙소 with nothing saved: register it (plan OQ3). */
  function openStaySheet() {
    openSheet('숙소를 어디로 할까요?', '한 번만 정하면 이 기기에 기억해 둘게요.', (body) => {
      const here = el(doc, 'button', { type: 'button', class: 'primary' }, '지금 위치를 숙소로 저장');
      here.addEventListener('click', async () => {
        here.disabled = true;
        try {
          const p = await deps.locate();
          saveStay({ lat: p.lat, lng: p.lng, label: '숙소' });
        } catch {
          here.disabled = false;
          here.textContent = '위치를 확인할 수 없어요. 아래에서 골라 주세요';
        }
      });
      body.append(here, el(doc, 'p', { class: 'or' }, '또는 숙소가 있는 지역'));
      areaGroups(body, (a) => saveStay({ lat: a.lat, lng: a.lng, label: '숙소' }));
    });
  }

  /** Basis toggle now always opens a sheet: 내 위치 / 숙소 / 15개 지역 (ADR-0029 S8-2). */
  function openBasisSheet() {
    openSheet('어디 기준으로 볼까요?', '', (body) => {
      const gps = el(doc, 'button', {
        type: 'button',
        'data-basis': 'gps',
        'aria-pressed': String(basis === 'gps'),
        ...(basis === 'gps' ? { class: 'primary' } : {}),
      }, '내 위치');
      gps.addEventListener('click', () => {
        setBasis('gps');
        closeSheet();
        resumeAfterBasisChange();
      });
      const stayBtn = el(doc, 'button', {
        type: 'button',
        'data-basis': 'stay',
        'aria-pressed': String(basis === 'stay'),
        ...(basis === 'stay' ? { class: 'primary' } : {}),
      }, '숙소');
      stayBtn.addEventListener('click', () => {
        if (stay) {
          setBasis('stay');
          closeSheet();
          resumeAfterBasisChange();
        } else {
          openStaySheet();
        }
      });
      body.append(gps, stayBtn);
      if (stay) {
        // A traveller who moves hotels mid-trip needs a way back into 숙소 registration (MINOR).
        const restay = el(doc, 'button', { type: 'button' }, '숙소 다시 정하기');
        restay.addEventListener('click', () => openStaySheet());
        body.append(restay);
      }
      body.append(el(doc, 'p', { class: 'or' }, '또는 지역으로 고르기'));
      areaGroups(body, pickArea, basis === 'region' ? region?.label : null);
    });
  }

  async function origin(): Promise<Point | null> {
    if (basis === 'stay' && stay) return stay;
    if (basis === 'region' && region) return region;
    try {
      return await deps.locate();
    } catch (e) {
      openAreaFallback(e instanceof LocateError ? e.reason : 'unavailable');
      return null;
    }
  }

  // U+FE0E (text presentation selector) keeps iOS from swapping this for a red emoji glyph.
  const HEART_FILLED = '♥︎';
  const HEART_OUTLINE = '♡︎';

  /** Heart button, top-right of the photo (S8-3): a real button, own aria-pressed/name, never triggers the card link. */
  function heartButton(spot: Spot): HTMLButtonElement {
    const pressed = savedIds.includes(spot.id);
    const b = el(doc, 'button', {
      type: 'button',
      class: `heart${pressed ? ' is-saved' : ''}`,
      'aria-pressed': String(pressed),
      'aria-label': `${spot.name} ${pressed ? '저장 해제' : '저장'}`,
    });
    b.textContent = pressed ? HEART_FILLED : HEART_OUTLINE;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = toggleSavedId(spot.id);
      b.setAttribute('aria-pressed', String(now));
      b.setAttribute('aria-label', `${spot.name} ${now ? '저장 해제' : '저장'}`);
      b.classList.toggle('is-saved', now);
      b.textContent = now ? HEART_FILLED : HEART_OUTLINE;
      renderSavedBtn();
    });
    return b;
  }

  function cardLi({ spot, minutes }: Card): HTMLLIElement {
    const li = el(doc, 'li', { class: 'card', 'data-id': spot.id });
    const link = el(doc, 'a', { class: 'card-link', href: kakaoUrl(spot), target: '_blank', rel: 'noopener' });
    const figure = el(doc, 'div', { class: 'card-img' });
    const img = el(doc, 'img', { src: spot.image, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => {
      figure.hidden = true; // no blank photo box
      console.warn('card image failed', spot.id);
    });
    figure.append(img);
    const body = el(doc, 'div', { class: 'card-body' });
    body.append(
      el(doc, 'h2', { class: 'card-name' }, spot.name),
      el(doc, 'p', { class: 'card-reason' }, spot.reason),
      el(doc, 'p', { class: 'card-drive' }, `차로 약 ${minutes}분`),
    );
    link.append(figure, body);
    // heart sits as a sibling of the link (not inside it) so a tap never reaches the map link (S8-3).
    li.append(link, heartButton(spot));
    if (spot.bookable) {
      li.append(el(doc, 'a', { class: 'book', href: bookingUrl(spot), target: '_blank', rel: 'noopener' }, '예약 찾아보기'));
    }
    return li;
  }

  function renderCards(cards: Card[]) {
    const list = el(doc, 'ol', { class: 'card-list' });
    for (const c of cards) list.append(cardLi(c));
    cardsBox.replaceChildren(list);
    if (cards.length) cardsBox.append(el(doc, 'p', { class: 'hint' }, '한 번 더 누르면 다른 곳을 보여 드려요.'));
  }

  function renderSavedView(cards: Card[]) {
    const wrap = el(doc, 'div', { class: 'saved-view' });
    const back = el(doc, 'button', { type: 'button', class: 'back' }, '← 돌아가기');
    back.addEventListener('click', () => void closeSavedView());
    const heading = el(doc, 'h2', { class: 'saved-heading' }, '저장한 곳');
    wrap.append(back, heading);
    if (cards.length) {
      const list = el(doc, 'ol', { class: 'card-list' });
      // Unsaving here just flips the heart to outline — the card stays on screen until the list is
      // reopened, so a stray tap while scrolling has an undo path (MINOR).
      for (const c of cards) list.append(cardLi(c));
      wrap.append(list);
    } else {
      wrap.append(el(doc, 'p', { class: 'hint' }, '저장한 곳이 없어요.'));
    }
    cardsBox.replaceChildren(wrap);
  }

  async function closeSavedView() {
    showingSaved = false;
    renderSavedBtn();
    if (savedHistoryPushed) {
      savedHistoryPushed = false;
      popOverlayHistory();
    }
    if (beforeSaved && lastCards && lastCards.button === beforeSaved) {
      // Restore the cards the user was already looking at — don't advance pickCards' history (S8-4).
      // Only when they still match `beforeSaved` (UX fix #1): a basis change or similar in between
      // invalidates them, so fall through to a fresh show() instead of restoring stale cards.
      active = beforeSaved;
      for (const b of moodBtns) b.setAttribute('aria-pressed', String(b.dataset.mood === beforeSaved));
      renderFoodSub();
      renderCards(lastCards.cards);
    } else if (beforeSaved) {
      void show(beforeSaved);
    } else {
      active = null;
      for (const b of moodBtns) b.setAttribute('aria-pressed', 'false');
      renderFoodSub();
      cardsBox.replaceChildren();
      say('');
    }
  }

  async function showSavedView() {
    const ticket = ++busy;
    showingSaved = true;
    renderSavedBtn();
    for (const b of moodBtns) b.setAttribute('aria-pressed', 'false');
    active = null;
    renderFoodSub();
    say(basis === 'gps' ? '위치 확인 중…' : '');
    const o = await origin();
    if (ticket !== busy) return;
    say('');
    if (!o) return;
    let spots: Spot[];
    try {
      spots = await spotsP;
    } catch {
      say('목록을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.');
      showingSaved = false; // let ♥ N be tapped again instead of staying stuck (S8-4)
      renderSavedBtn();
      return;
    }
    if (ticket !== busy || !showingSaved) return;
    // Unknown ids (data changed since saving) are skipped silently (S8-4).
    const byId = new Map(spots.map((s) => [s.id, s] as const));
    const found = savedIds.map((id) => byId.get(id)).filter((s): s is Spot => !!s);
    const cards: Card[] = found
      .map((spot) => ({ spot, minutes: driveMinutes(distanceKm(o, spot)) }))
      .sort((a, b) => distanceKm(o, a.spot) - distanceKm(o, b.spot));
    // Now actually opening (UX fix #3): push a history entry so back closes the list instead of
    // leaving the app.
    pushOverlayHistory();
    savedHistoryPushed = true;
    renderSavedView(cards);
  }

  async function show(button: Button) {
    const ticket = ++busy;
    showingSaved = false;
    renderSavedBtn();
    // Clear immediately (UX fix #1): a stale pair from a previous button/basis must never be
    // restorable by 돌아가기 while this pick is in flight.
    lastCards = null;
    active = button;
    for (const b of moodBtns) b.setAttribute('aria-pressed', String(b.dataset.mood === button));
    renderFoodSub();
    say(basis === 'gps' ? '위치 확인 중…' : '');
    const o = await origin();
    if (ticket !== busy) return;
    say('');
    if (!o) return;
    let spots: Spot[];
    try {
      spots = await spotsP;
    } catch {
      say('목록을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.');
      return;
    }
    if (ticket !== busy) return;
    // Start over only when the basis changes or the origin moves more than ~1km (GPS jitter keeps history).
    if (!lastOrigin || lastOrigin.basis !== basis || distanceKm(lastOrigin.point, o) > 1) {
      histories = {};
      lastOrigin = { basis, point: { lat: o.lat, lng: o.lng } };
    }
    const r = pickCards(spots, o, button, histories, button === 'food' ? foodSub : undefined);
    histories = r.histories;
    lastCards = { button, cards: r.cards };
    renderCards(r.cards);
  }

  for (const b of moodBtns) b.addEventListener('click', () => void show(b.dataset.mood as Button));
  for (const b of subBtns) {
    b.addEventListener('click', () => {
      const sub = b.dataset.sub as Sub;
      if (sub === foodSub || active !== 'food') return;
      foodSub = sub;
      renderFoodSub();
      void show('food');
    });
  }
  basisBtn.addEventListener('click', openBasisSheet);
  savedBtn.addEventListener('click', () => {
    // Toggle (UX fix #7): tapping ♥ N again while the list is open closes it, matching its
    // aria-pressed state.
    if (showingSaved) {
      void closeSavedView();
      return;
    }
    beforeSaved = active;
    void showSavedView();
  });

  closeSheet();
  renderBasis();
  renderSavedBtn();
  renderFoodSub();
  return { show };
}
