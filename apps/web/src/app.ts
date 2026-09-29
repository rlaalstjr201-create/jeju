// One screen: 5 mood buttons (static HTML, ADR-0028) + basis toggle → 3 cards (spec, plan OQ3·5).
import { distanceKm, pickCards, type Button, type Card, type Histories, type Point, type Spot } from './pick';

export const REGIONS = [
  { name: '제주시', lat: 33.4996, lng: 126.5312 },
  { name: '서귀포', lat: 33.2541, lng: 126.56 },
  { name: '동쪽', lat: 33.458, lng: 126.931 },
  { name: '서쪽', lat: 33.4125, lng: 126.265 },
] as const;

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
  const cardsBox = $<HTMLElement>('#cards');
  const status = $<HTMLElement>('#status');
  const sheetBox = $<HTMLElement>('#sheet');
  const moodBtns = [...doc.querySelectorAll<HTMLButtonElement>('[data-mood]')];

  // S1' 검수(build-spots.mjs)가 가격·운영시간·요일·평점 문구와 부적합 항목을 이미 걸러냈다.
  const spotsP = deps.loadSpots();
  spotsP.catch(() => undefined); // surfaced on tap

  let stay: Place | null = read<Place>(deps.storage, KEY_STAY);
  if (!isPlace(stay)) stay = null;
  const savedRegion = REGIONS.find((r) => r.name === read<string>(deps.storage, KEY_REGION)) ?? null;
  let region: Place | null = savedRegion ? { ...savedRegion, label: savedRegion.name } : null;
  let basis: Basis = read<Basis>(deps.storage, KEY_BASIS) ?? 'gps';
  if (basis === 'stay' && !stay) basis = 'gps';
  if (basis === 'region' && !region) basis = 'gps';

  let active: Button | null = null;
  let histories: Histories = {};
  let lastOrigin: { basis: Basis; point: Point } | null = null;
  let busy = 0;

  function setBasis(b: Basis) {
    basis = b;
    write(deps.storage, KEY_BASIS, b);
    renderBasis();
  }
  function renderBasis() {
    const label = basis === 'stay' ? '숙소 기준' : basis === 'region' && region ? `${region.label} 기준` : '내 위치 기준';
    basisBtn.textContent = `${label} ⇄`;
    basisBtn.setAttribute('aria-label', `${label}. 누르면 ${basis === 'gps' ? '숙소' : '내 위치'} 기준으로 바꿔요`);
  }

  function say(text: string) {
    status.textContent = text;
  }

  function closeSheet() {
    sheetBox.replaceChildren();
    sheetBox.hidden = true;
  }

  function openSheet(title: string, note: string, build: (body: HTMLElement) => void) {
    const backdrop = el(doc, 'div', { class: 'backdrop' });
    backdrop.addEventListener('click', closeSheet);
    const panel = el(doc, 'section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' });
    panel.append(el(doc, 'h2', { id: 'sheet-title' }, title));
    if (note) panel.append(el(doc, 'p', { class: 'sheet-note' }, note));
    const body = el(doc, 'div', { class: 'sheet-body' });
    build(body);
    const close = el(doc, 'button', { type: 'button', class: 'sheet-close' }, '닫기');
    close.addEventListener('click', closeSheet);
    panel.append(body, close);
    sheetBox.replaceChildren(backdrop, panel);
    sheetBox.hidden = false;
    (body.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  function regionButtons(body: HTMLElement, onPick: (r: (typeof REGIONS)[number]) => void) {
    const grid = el(doc, 'div', { class: 'regions' });
    for (const r of REGIONS) {
      const b = el(doc, 'button', { type: 'button', 'data-region': r.name }, r.name);
      b.addEventListener('click', () => onPick(r));
      grid.append(b);
    }
    body.append(grid);
  }

  /** GPS unusable: ask which of the 4 regions we are in. */
  function openRegionPicker(why: LocateFailure) {
    const note =
      why === 'outside'
        ? '지금은 제주 밖에 계신 것 같아요. 내일 머물 곳과 가까운 쪽을 골라 주세요.'
        : '위치를 확인할 수 없어요. 지금 계신 곳과 가까운 쪽을 골라 주세요.';
    openSheet('어느 쪽에 계세요?', note, (body) =>
      regionButtons(body, (r) => {
        region = { lat: r.lat, lng: r.lng, label: r.name };
        write(deps.storage, KEY_REGION, r.name);
        setBasis('region');
        closeSheet();
        if (active) void show(active);
      }),
    );
  }

  function saveStay(place: Place) {
    stay = place;
    write(deps.storage, KEY_STAY, place);
    setBasis('stay');
    closeSheet();
    if (active) void show(active);
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
      body.append(here, el(doc, 'p', { class: 'or' }, '또는 숙소가 있는 쪽'));
      regionButtons(body, (r) => saveStay({ lat: r.lat, lng: r.lng, label: '숙소' }));
    });
  }

  async function origin(): Promise<Point | null> {
    if (basis === 'stay' && stay) return stay;
    if (basis === 'region' && region) return region;
    try {
      return await deps.locate();
    } catch (e) {
      openRegionPicker(e instanceof LocateError ? e.reason : 'unavailable');
      return null;
    }
  }

  function renderCards(cards: Card[]) {
    const list = el(doc, 'ol', { class: 'card-list' });
    for (const { spot, minutes } of cards) {
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
      li.append(link);
      if (spot.bookable) {
        li.append(el(doc, 'a', { class: 'book', href: bookingUrl(spot), target: '_blank', rel: 'noopener' }, '예약 찾아보기'));
      }
      list.append(li);
    }
    cardsBox.replaceChildren(list);
    if (cards.length) cardsBox.append(el(doc, 'p', { class: 'hint' }, '한 번 더 누르면 다른 곳을 보여 드려요.'));
  }

  async function show(button: Button) {
    const ticket = ++busy;
    active = button;
    for (const b of moodBtns) b.setAttribute('aria-pressed', String(b.dataset.mood === button));
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
    const r = pickCards(spots, o, button, histories);
    histories = r.histories;
    renderCards(r.cards);
  }

  for (const b of moodBtns) b.addEventListener('click', () => void show(b.dataset.mood as Button));
  basisBtn.addEventListener('click', () => {
    // 'region' is only a stand-in for GPS: toggling retries GPS (the picker reopens if it still fails).
    if (basis === 'stay' || basis === 'region') setBasis('gps');
    else if (stay) setBasis('stay');
    else return openStaySheet();
    if (active) void show(active);
  });

  closeSheet();
  renderBasis();
  return { show };
}
