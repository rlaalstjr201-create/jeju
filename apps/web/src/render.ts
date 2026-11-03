// render(state) is idempotent: every aria-pressed/aria-current, label, count, card and sheet is derived from
// state (design/SPEC.md §12). Card nodes are rebuilt only when the list itself changes — a heart tap patches
// the heart and ♥ N, a broken photo drops its box in place — so photos never reload.
import { AREAS, AREA_GROUPS, areaLabel, type RegionName } from './areas';
import { DEST, DESTS, destOfId, isSggDest, type Dest, type SggDest } from './dest';
import { BUSAN, NATION, OPEN_AREAS, nationPart, openAreasOf, sggShort } from './release';
import { DAYS_AHEAD, addDays, dayOf, longDay, shortDay, type Day } from './dates';
import { duskNow, homeOrigin, moodExamples, nightHome, nowSpot, openMarkets, otherAreas, rainNow, sunPoint, sunsetSpots, SUNSET_LIST_MAX, todayActs, type MarketRow, type TodayAct } from './home';
import { appHome, handoffUrl, kakaoExternal, type InApp } from './keep';
import { MAP_APP_NAME, bookLink, goLink, placeApp, placeUrl, type MapApp } from './links';
import { marketText } from './market';
import { seasonOn, seasonText } from './season';
import { CARD_COUNT, REACHES, TRAVEL_TEXT, historyKey, listed, travel, travelText, withinReach, type Button, type Card, type NightShift, type Reach, type Spot } from './pick';
import { cardsValid, hasSaved, heldDay, isSaved, pickSpots, rainArea, savedCount, savedDays, savedIndex, spotIndex, tabNow, visitedSpots, whenDay, type SavedRow, type State, type VisitNote } from './state';
import { MAX_SAVED } from './store';
import { sunsetText } from './sun';
import { PAINS, TEXT_MAX, WENT } from './survey';
import type { GeoError, NoOrigin, Origin, OutsideAt, Overlay, View } from './types';

// Every string on screen (§9). Sentences end with a full stop; buttons, labels, titles and meta don't.
export const COPY = {
  basisGps: '내 위치 근처',
  basisStay: '숙소 근처',
  basisRegion: (label: string) => `${label} 근처`,
  basisNoGps: '지역 고르기',
  /** a day chosen in the basis sheet goes in front ("내일 · 애월 근처", "10월 3일 · 숙소 근처"). */
  basisWhen: (day: string, where: string) => `${day} · ${where}`,
  /** 비 와요(실내만) on (ADR-0075): said after the place ("구제주 근처 · 실내만"). */
  basisIndoor: (where: string) => `${where} · 실내만`,
  basisAria: (label: string) => `${label}, 기준 바꾸기`,
  savedAria: (n: number) => `저장한 곳 ${n}개`,
  locating: '위치 확인 중…',
  chooseArea: '지역으로 고르기',
  wrapped: '이 근처는 다 봤어요. 처음 본 곳부터 다시 보여 드려요.',
  /** 밤 (ADR-0091): what the picks moved back — 산길, 배로 가는 섬 (Amendment 1), or both */
  nightShifted: {
    trail: '밤이라 산길은 뒤로 미뤘어요.',
    island: '밤이라 배로 가는 섬은 뒤로 미뤘어요.',
    both: '밤이라 산길과 배로 가는 섬은 뒤로 미뤘어요.',
  } satisfies Record<NonNullable<NightShift>, string>,
  offline: '오프라인이라 사진은 안 보여요.',
  /** 고르는 방식 (ADR-0075): one quiet line over the cards. `reach` null = the range was widened to the nearest 3
   * (빈손 없음, pick.ts pool), so the line says that instead of a range it did not keep. */
  how: (reach: string | null, indoor: boolean) =>
    reach
      ? `${indoor ? `${reach} 안의 실내 중에서, ` : `${reach} 안에서, `}가까운 곳부터 골랐어요.`
      : `범위 안에 맞는 곳이 적어서 가장 가까운 ${indoor ? '실내 ' : ''}곳으로 골랐어요.`,
  howReach: { walk: '걸어서 15분', drive30: '차로 30분', drive60: '차로 1시간' } satisfies Record<Reach, string>,
  or: '아니면',
  more: '다른 3곳 보기',
  /** where a tap on the card goes (ADR-0071): the app of its place link */
  map: (app: MapApp) => MAP_APP_NAME[placeApp(app)],
  mapAria: (name: string, app: MapApp) => `${name}, ${MAP_APP_NAME[placeApp(app)]}에서 보기`,
  heartAria: (name: string) => `${name} 저장`,
  /** 길찾기 (ADR-0067, ADR-0069, ADR-0071): the words are goLink's; this says where to, in which app and how. */
  goAria: (name: string, foot: boolean, app: MapApp, pier?: string) => `${name}, ${pier ? `배 타는 곳 ${pier}까지 ` : ''}${MAP_APP_NAME[app]} ${foot ? '도보' : '자동차'} 길찾기`,
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
  retryGps: '위치 다시 쓰기',
  westFirst: '서쪽부터',
  /** ADR-0090 6: in the basis sheet's 동네 row, down to the 동네 index */
  otherArea: '다른 동네 고르기',
  savedEmpty: '저장한 곳이 없어요. 카드의 하트를 누르면 여기 모여요.',
  /** ADR-0061: the saved list's usage-record switch (its note is static in index.html, ADR-0078). */
  trackOff: '기록 끄기',
  trackOn: '기록 켜기',
  /** ADR-0071: TMAP opens only as an app (no web page to fall back on). */
  tmapNote: 'TMAP은 앱이 있어야 열려요. 걸어서 가는 길은 네이버지도로 열어요.',
  today: '오늘',
  held: (when: string) => `${when} 담아 둠`,
  pastDay: '지난 날',
  tomorrow: '내일',
  homeAsk: '지금 뭐 하고 싶어요?',
  homeAskDay: (day: string) => `${day} 뭐 하고 싶어요?`,
  homeFrom: (where: string) => `${where}에서`,
  homeFromArea: '동네를 고르면 그 근처에서',
  /** the line under the question: `where` null = no basis yet (동네 고르기); `gpsNow`: 지금 + 내 위치 */
  homeLede: (where: string | null, gpsNow: boolean, day: string | null) => {
    const from = where === null ? COPY.homeFromArea : COPY.homeFrom(gpsNow ? `지금 ${where}` : where);
    return day ? `${from} ${day} 갈 만한 곳 3곳을 골라 드려요. 마음에 들면 하트로 담아 두세요.` : `${from} 갈 만한 곳 3곳을 골라 드려요. 마음에 들면 바로 길찾기로 가요.`;
  },
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
  // ADR-0081: the survey (specs/survey.md). The home line, the sheet and its 고마워요.
  surveyLine: '써 보니 어땠어요? 1분 설문',
  feedbackSheet: '써 보니 어땠어요?',
  feedbackNote: '하나만 답해도 돼요. 글은 500자까지, 이름·연락처는 쓰지 마세요.',
  wentHead: '골라 준 곳에 실제로 갔나요?',
  went: { went: '갔어요', not: '안 갔어요', yet: '아직' } satisfies Record<(typeof WENT)[number], string>,
  painHead: '불편했던 점',
  painMany: '여러 개 골라도 돼요',
  pains: {
    far: '생각보다 멀었어요',
    closed: '가 보니 닫혀 있었어요',
    meh: '골라 준 곳이 별로였어요',
    gps: '위치가 잘 안 잡혔어요',
    slow: '느리거나 잘 안 열렸어요',
  } satisfies Record<(typeof PAINS)[number], string>,
  painText: '그 밖에 불편했던 점',
  wishText: '있었으면 하는 것',
  send: '보내기',
  thanks: '고마워요',
  thanksNote: '보내 주신 의견은 다음에 고칠 것을 고를 때 읽어요.',
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
  /** the link held more than there was room for: what is here was not pushed out */
  restoreLeft: (n: number) => `저장은 ${MAX_SAVED}곳까지라 ${n}곳은 넣지 못했어요.`,
  inappName: { kakaotalk: '카카오톡', instagram: '인스타그램', facebook: '페이스북', naver: '네이버 앱', line: '라인', daum: '다음 앱' } satisfies Record<InApp, string>,
  inappNote: (app: string) => `${app} 안에서 저장한 곳은 ${app}에만 남아요.`,
  inappOpen: '브라우저로 열기',
  inappCopied: '링크를 복사했어요. 휴대폰 브라우저 주소창에 붙여 넣어 주세요.',
  inappFailed: '오른쪽 위 메뉴에서 다른 브라우저로 열어 주세요.',
  nudge: '홈 화면에 추가하면 저장한 곳이 오래 남아요.',
  nudgeIos: '공유 버튼에서 ‘홈 화면에 추가’를 눌러 주세요. 지금 저장한 곳은 아래 ‘링크로 백업’으로 옮겨요.',
  install: '홈 화면에 추가',
  // 홈 A′ (ADR-0075): 오늘 판, the moods' examples, the two sections under 아무거나
  sunset: (time: string) => `해 지는 시각 ${time}`,
  /** `dated`: a chosen day, not today (date mode) — said 이날, like the market cards (market.ts). */
  todayWord: (dated: boolean) => (dated ? '이날' : '오늘'),
  /** a market folded into the grey line when another row took the one place to tap */
  marketFold: (dated: boolean, name: string) => `${dated ? '이날' : '오늘'} ${name} 장날`,
  /** 오늘 판's market row: the words before and after the market's name (shown bold) */
  marketRow: (dated: boolean): [string, string] => [`${COPY.todayWord(dated)} `, ' 장날'],
  marketHead: (dated: boolean) => `${dated ? '이날' : '오늘'} 장 서는 곳`,
  areasHead: '다른 동네 둘러보기',
  example: (names: string[]) => `예: ${names.join(', ')}`,
  /** no basis yet (GPS, no fix this session): the island's best, not said to be near (ADR-0075 Amendment 1) */
  examplePopular: (names: string[]) => `제주 인기: ${names.join(', ')}`,
  homeCredit: '정보·사진: 비짓제주(제주관광공사)',
  homeSettings: '설정 · 지도 앱 · 의견',
  // 지금 여기서 (ADR-0101, specs/home-v2.md 1): the small word over the first place, and its share button's name
  nowKicker: '지금 여기서',
  shareAria: (name: string) => `${name}, 같이 보기`,
  // 노을 볼 곳 (ADR-0083): only in the hours before the sunset, with 3 or more places
  sunsetPlaces: '노을 볼 곳',
  sunsetCount: (n: number) => ` ${n}곳 · 차로 45분 안`,
  sunsetCredit: ' · 해안선 © ',
  osm: 'OpenStreetMap contributors',
  // 비 소식 (ADR-0076): only when it will rain; the source next to it
  rainAsk: '비 소식 · 실내만 볼까요?',
  rainOn: '비 소식이 있어 실내만 보고 있어요',
  rainAll: '모두 보기',
  rainFrom: '날씨: 기상청',
  // 가 봤어요 (ADR-0087, specs/hide-visited.md): the card's switch, its status line, the saved list's 뺀 곳 — shown as
  // 가 본 곳 (ADR-0090 5), and 되돌리기 beside the status line
  visited: '가 봤어요',
  visitedAria: (name: string) => `${name}, 가 봤어요`,
  visitedOut: (name: string) => `${josa(name, '은', '는')} 다음부터 빼고 골라요.`,
  visitedIn: (name: string) => `${josa(name, '을', '를')} 다시 넣었어요.`,
  visitedAllIn: (n: number) => `가 본 곳 ${n}곳을 모두 다시 넣었어요.`,
  visitedList: (n: number) => `가 본 곳 ${n}곳`,
  undo: '되돌리기',
  undoAria: (name: string) => `${name}, 되돌리기`,
  putBack: '다시 넣기',
  putBackAria: (name: string) => `${name}, 다시 넣기`,
  putBackAll: '모두 다시 넣기',
} as const;

/** 여행지 (ADR-0094, specs/busan.md 1.3·1.4·3.5·6·8): the switched-on build's words, apart from COPY so that a Jeju build,
 * where every use of them is behind the switch, carries none of them (another language's table: Lang.busan). */
export const BUSAN_COPY = {
  /** the 여행지 row's words (강원: ADR-0102 Amendment 2 — its 시군구 are listed in its 동네 index) */
  destName: { jeju: '제주', busan: '부산', gangwon: '강원', seoul: '서울', nation: '다른 곳' } satisfies Record<Dest, string>,
  /** 강원's 시군구 by code (DEST.gangwon.sgg): the name line, the title, 「○○ 인기:」 and 「○○ 밖이에요」 say the one in use */
  sggName: { '51150': '강릉', '51210': '속초', '51110': '춘천', '51830': '양양', '51760': '평창', '11110': '종로', '11140': '서울 중구', '11170': '용산', '11200': '성동', '11215': '광진', '11230': '동대문', '11260': '중랑', '11290': '성북', '11305': '강북', '11320': '도봉', '11350': '노원', '11380': '은평', '11410': '서대문', '11440': '마포', '11470': '양천', '11500': '강서', '11530': '구로', '11545': '금천', '11560': '영등포', '11590': '동작', '11620': '관악', '11650': '서초', '11680': '강남', '11710': '송파', '11740': '강동' } as Record<string, string>,
  destHead: '여행지',
  /** a 검수한 곳 other than Jeju, by its name (부산, 속초: ADR-0102) */
  title: (name: string) => `여차나:${name} · P를 위한 여행동반자`,
  examplePopular: (name: string, names: string[]) => `${name} 인기: ${names.join(', ')}`,
  homeCredit: '정보·사진: 한국관광공사',
  outside: (name: string) => `지금은 ${name} 밖이에요.`,
  stayOutside: (name: string) => `지금은 ${name} 밖이에요. 아래에서 숙소 동네를 골라 주세요.`,
  switched: { jeju: '지금 계신 제주로 바꿨어요.', busan: '지금 계신 부산으로 바꿨어요.', nation: '지금 계신 곳으로 바꿨어요.' } satisfies Record<Exclude<Dest, SggDest>, string>,
  /** 강원's, by its 시군구 */
  switchedTo: (name: string) => `지금 계신 ${josa(name, '으로', '로')} 바꿨어요.`,
  otherSaved: { jeju: (n: number) => `제주에 저장한 곳 ${n}곳`, busan: (n: number) => `부산에 저장한 곳 ${n}곳` },
  /** the name line's button (ADR-0094 Amendment 3): its words, e.g. 「여차나:제주」 */
  destAria: (name: string) => `${name}, 여행지 바꾸기`,
  /** ADR-0103: the basis sheet's 「여행지 | 내 위치」 (its 여행지 side is destHead) and 주소·숙소 검색 */
  destGps: '내 위치',
  addrOption: '주소·숙소',
  addrSearch: '주소나 숙소 이름 검색',
  addrGo: '검색',
  /** told to a screen reader when the answers come (render.ts patchAddr) */
  addrFound: (n: number) => `${n}곳 찾았어요.`,
  addrError: {
    off: '검색을 쓸 수 없어요.',
    none: '찾는 곳이 없어요. 다른 이름으로 검색해 주세요.',
    fail: '검색하지 못했어요. 연결을 확인하고 다시 검색해 주세요.',
    nodata: '이 근처는 아직 장소 자료가 없어요.',
    once: '이번에만 이곳을 숙소로 써요. 주소를 확인하지 못해 저장하지 않았어요.',
  } satisfies Record<GeoError, string>,
} as const;

/** The name (its main part, without the alias) and the particle its last syllable takes: 받침 → `withFinal`. */
function josa(name: string, withFinal: string, without: string): string {
  const main = splitName(name.trim()).main;
  const c = main.charCodeAt(main.length - 1) - 0xac00;
  return `${main}${c >= 0 && c < 11172 && c % 28 === 0 ? without : withFinal}`;
}

/** A 검수한 곳's name where the screen speaks of it: 강원's is its 시군구 in use (ADR-0102 Amendment 2). */
export const destNameOf = (s: { dest: Dest; sgg: string | null }): string => (DEST[s.dest].sgg && BUSAN_COPY.sggName[s.sgg ?? '']) || BUSAN_COPY.destName[s.dest];

/** The mood buttons' own words; the results title repeats the one chosen. */
export const MOOD_LABEL: Record<Button, string> = {
  rest: '푹 쉬고 싶어',
  walk: '좀 걷고 싶어',
  new: '놀러 가고 싶어',
  famous: '유명한 데 가 보고 싶어',
  food: '맛있는 거 먹고 싶어',
  any: '아무거나 골라줘',
};

/** A place's words on screen (ADR-0093: in another language, its translation; the map links keep the Korean name). */
export const PLACE = { name: (s: Spot) => s.name.trim(), reason: (s: Spot) => s.reason };

/** ADR-0093: the app's languages, each named in itself. */
const LANGS = [
  ['ko', '한국어'],
  ['en', 'English'],
  ['zh-Hans', '简体中文'],
  ['ja', '日本語'],
];

const HEART_PATH =
  'M12 20.3s-7.4-4.5-9.2-9.1C1.6 8 3.5 4.6 6.9 4.6c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.4 0 5.3 3.4 4.1 6.6-1.8 4.6-9.2 9.1-9.2 9.1z';
const CHECK = '<svg class="i-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
/** 주소·숙소 검색's button (ADR-0103): a magnifier, no emoji (SPEC 14 #2) */
const SEARCH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>';
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
  if (s.basis === 'region' && s.region) return COPY.basisRegion(areaLabel(s.region, OPEN_AREAS));
  // another destination picked in the sheet, its 동네 not yet (specs/busan.md 1.4)
  if (s.basis === 'region') return COPY.basisNoGps;
  return s.lastFail ? COPY.basisNoGps : COPY.basisGps;
}
/** 지금: the place only. A chosen day goes in front: "내일 · 애월 근처", "10월 3일 · 숙소 근처"; 실내만 after. */
export function basisLabel(s: State): string {
  const where = s.indoor ? COPY.basisIndoor(whereLabel(s)) : whereLabel(s);
  if (s.when === 'now') return where;
  return COPY.basisWhen(s.when === addDays(s.today, 1) ? COPY.tomorrow : shortDay(s.when), where);
}

/** 「오늘 담아 둠」: the other day a place is kept on (heuristic audit H1), or null. */
export function heldText(s: State, id: string): string | null {
  const d = heldDay(s, id);
  if (!d) return null;
  if (d < s.today) return COPY.held(COPY.pastDay);
  return COPY.held(d === s.today ? COPY.today : d === addDays(s.today, 1) ? COPY.tomorrow : shortDay(d));
}

/** Home question and line under it follow the basis (heuristic audit H3). 지금 + 내 위치: ADR-0077 Am.2 as is. */
export function homeCopy(s: State): { ask: string; lede: string } {
  const where = whereLabel(s);
  const day = s.when === 'now' ? null : s.when === addDays(s.today, 1) ? COPY.tomorrow : shortDay(s.when);
  const lede = COPY.homeLede(where === COPY.basisNoGps ? null : where, where === COPY.basisGps && !day, day);
  return { ask: day ? COPY.homeAskDay(day) : COPY.homeAsk, lede };
}

/** The status line's words for the last 가 봤어요 / 다시 넣기 (ADR-0087). */
export function visitText(v: VisitNote): string {
  if (v.k === 'all') return COPY.visitedAllIn(v.n);
  return v.k === 'out' ? COPY.visitedOut(v.name) : COPY.visitedIn(v.name);
}

/** Status line under the results heading: one short line, plus an escape hatch while GPS is slow (S04·S05).
 * `undo`: the place just left out, put back by 되돌리기 after 「… 빼고 골라요.」 (ADR-0090 5) while it is still out. */
export function statusOf(s: State): { text: string; chooseArea: boolean; undo: { id: string; name: string } | null } {
  const p = s.phase;
  if (s.view !== 'cards') return { text: '', chooseArea: false, undo: null };
  if (p.k === 'pending' && p.step === 'locating' && p.slow) return { text: COPY.locating, chooseArea: p.long, undo: null };
  if (p.k === 'ready') {
    const parts: string[] = [];
    if (BUSAN && s.destNote) parts.push(isSggDest(s.destNote) ? BUSAN_COPY.switchedTo(destNameOf(s)) : BUSAN_COPY.switched[s.destNote]);
    if (s.cards?.wrapped) parts.push(COPY.wrapped);
    if (s.cards?.nightShifted) parts.push(COPY.nightShifted[s.cards.nightShifted]);
    if (s.offline) parts.push(COPY.offline);
    const v = s.visitNote;
    if (v) parts.push(visitText(v));
    const undo = v?.k === 'out' && v.id && s.visited.includes(v.id) ? { id: v.id, name: v.name } : null;
    return { text: parts.join(' '), chooseArea: false, undo };
  }
  return { text: '', chooseArea: false, undo: null };
}

/** 고르는 방식 (ADR-0075): only while the cards show. The range is said only if every card is inside it. */
export function howOf(s: State): string {
  const c = s.cards;
  if (s.view !== 'cards' || s.phase.k !== 'ready' || !c) return '';
  // the 자동 지역 (plans/nationwide-app.md 4): no reason was read, the nearest first
  if (NATION && s.dest === 'nation') return nationPart()!.copy.how;
  const inReach = c.list.every((x) => withinReach(c.reach, c.origin.point, x.spot));
  const how = COPY.how(inReach ? COPY.howReach[c.reach] : null, c.indoor);
  // 강원 in another language (ADR-0102): its places are not translated yet — said once, as the 자동 지역's 동네 index does
  const ko = NATION && DEST[s.dest].sgg ? nationPart()?.copy.koNames : '';
  return ko ? `${how} ${ko}` : how;
}

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

/** The 자동 지역's words for a position `outside` (predeploy review M-1·m-2): outside Korea only where it was found to be
 * (`abroad`); with the 자동 지역 in use, no 시군구 near — or, for a 숙소, the 검수한 곳 it is in; else null: Jeju's and
 * Busan's own 「~ 밖」 words. */
function nationOutside(s: State, at: OutsideAt | undefined, stay: boolean): string | null {
  if (!NATION) return null;
  const n = nationPart();
  if (!n) return null;
  if (at === 'abroad') return stay ? n.copy.stayOutside : n.copy.outside;
  if (s.dest !== 'nation') return null;
  if (stay && (at === 'jeju' || at === 'busan' || isSggDest(at))) return n.copy.stayIn(BUSAN_COPY.destName[at]);
  return stay ? n.copy.stayNodata : n.copy.nodata;
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
  let sheetSig = '';
  let prevOverlay: Overlay = null;
  let opener: HTMLElement | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let announceSeq = 0;
  /** 주소·숙소 검색's answer last told (patchAddr) */
  let geoSaid: State['geo'] | null = null;
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

  // --- 홈 A′ (ADR-0075): 오늘 판, the moods' 「예:」 and photos, the sections under 아무거나. Redrawn only when
  // what they show changes (the data, basis, range, 실내, the day, the tabs, the map app). Nothing with a photo
  // or a link is drawn before the data is in: the rows' min-height holds the place, no grey slots (§14). ---
  let homeSig = '';
  /** the latest home draw (a staged step of an older one is dropped) and whether the data has been drawn in full */
  let homeGen = 0;
  let homeFilled = false;
  let homeSpots: Spot[] | null = null;
  let homeVisited: readonly string[] = [];
  let todayText = '';
  let homeDated = false;
  const ARROW = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  /** `data-id`: a photo that fails is remembered like a card's (app.ts) and the next draw skips it. */
  const homePhoto = (spot: Spot, lazy: boolean) =>
    el(doc, 'img', { src: spot.image, alt: '', ...(lazy ? { loading: 'lazy' } : {}), decoding: 'async', referrerpolicy: 'no-referrer', 'data-id': spot.id });

  function todayRow(row: MarketRow, dated: boolean): HTMLElement {
    // a jump to 오늘 장 서는 곳 below (app.ts scrolls; the address and history stay as they are)
    const a = el(doc, 'a', { class: 'act', href: '#market', 'data-action': 'to-market' });
    const txt = el(doc, 'span');
    const [pre, post] = COPY.marketRow(dated);
    txt.append(pre, el(doc, 'b', {}, PLACE.name(row.spot)), `${post}\u00a0· ${row.where}`);
    a.append(txt, icon(ARROW));
    return a;
  }

  /** 노을 볼 곳 N곳 · 차로 45분 안: a jump to the 노을 볼 곳 section below, like the market row (ADR-0083). */
  function sunsetRow(n: number): HTMLElement {
    const a = el(doc, 'a', { class: 'act', href: '#sunset', 'data-action': 'to-sunset' });
    const txt = el(doc, 'span');
    txt.append(el(doc, 'b', {}, COPY.sunsetPlaces), COPY.sunsetCount(n));
    a.append(txt, icon(ARROW));
    return a;
  }

  /** 노을 볼 곳: the nearest few, each 길찾기 in one tap like the market rows. */
  function sunsetSection(s: State, rows: MarketRow[], origin: Origin): HTMLElement {
    const sec = el(doc, 'section', { id: 'sunset', class: 'more-sec', 'aria-labelledby': 'sunset-h' });
    sec.append(el(doc, 'h2', { id: 'sunset-h', tabindex: '-1' }, COPY.sunsetPlaces));
    const list = el(doc, 'ul', { class: 'mk-list' });
    for (const { spot, where } of rows.slice(0, SUNSET_LIST_MAX)) {
      const g = goLink(spot, origin.point, false, origin.isPoint, s.mapApp);
      const a = el(doc, 'a', { class: 'mk', href: g.href, target: '_blank', rel: 'noopener', 'aria-label': COPY.goAria(PLACE.name(spot), g.mode === 'foot', g.app, g.terminal) });
      const txt = el(doc, 'span', { class: 'txt' });
      txt.append(el(doc, 'span', { class: 'nm' }, PLACE.name(spot)), el(doc, 'span', { class: 'meta' }, where));
      if (spot.image && !s.broken.includes(spot.id)) a.append(homePhoto(spot, true));
      a.append(txt);
      const li = el(doc, 'li');
      li.append(a);
      list.append(li);
    }
    sec.append(list);
    return sec;
  }

  /** 비 소식: 실내만 볼까요? turns 실내만 on (ADR-0065's switch); with it on already, says so and offers 모두 보기. */
  function rainRow(indoor: boolean): HTMLElement {
    const txt = el(doc, 'span', { class: 'txt' });
    txt.append(indoor ? COPY.rainOn : COPY.rainAsk, ' ', el(doc, 'span', { class: 'src' }, COPY.rainFrom));
    if (indoor) {
      const row = el(doc, 'div', { class: 'act rain' });
      row.append(txt, el(doc, 'button', { type: 'button', class: 'all', 'data-action': 'rain-all' }, COPY.rainAll));
      return row;
    }
    const b = el(doc, 'button', { type: 'button', class: 'act rain', 'data-action': 'rain-indoor' });
    b.append(txt, icon(ARROW));
    return b;
  }

  function marketSection(s: State, rows: MarketRow[], origin: Origin | null, dated: boolean): HTMLElement {
    const sec = el(doc, 'section', { id: 'market', class: 'more-sec', 'aria-labelledby': 'market-h' });
    sec.append(el(doc, 'h2', { id: 'market-h', tabindex: '-1' }, COPY.marketHead(dated)));
    const list = el(doc, 'ul', { class: 'mk-list' });
    for (const { spot, where } of rows) {
      // 길찾기 to the market in one tap (ADR-0067), in the chosen map app
      const g = goLink(spot, origin?.point ?? null, false, origin?.isPoint ?? false, s.mapApp);
      const a = el(doc, 'a', { class: 'mk', href: g.href, target: '_blank', rel: 'noopener', 'aria-label': COPY.goAria(PLACE.name(spot), g.mode === 'foot', g.app, g.terminal) });
      const txt = el(doc, 'span', { class: 'txt' });
      txt.append(el(doc, 'span', { class: 'nm' }, PLACE.name(spot)), el(doc, 'span', { class: 'meta' }, `${marketText(spot.market!, whenDay(s), dated)}\u00a0· ${where}`));
      if (spot.image && !s.broken.includes(spot.id)) a.append(homePhoto(spot, true));
      a.append(txt);
      const li = el(doc, 'li');
      li.append(a);
      list.append(li);
    }
    sec.append(list);
    return sec;
  }

  function areasSection(s: State, spots: Spot[], origin: Origin | null): HTMLElement {
    const sec = el(doc, 'section', { class: 'more-sec', 'aria-labelledby': 'areas-h' });
    sec.append(el(doc, 'h2', { id: 'areas-h' }, COPY.areasHead));
    const grid = el(doc, 'ul', { class: 'tiles' });
    // the area pages (ADR-0072): plain links, no history of ours
    for (const { area, photo } of otherAreas(spots, origin, s.broken)) {
      const a = el(doc, 'a', { class: 'tile', href: `/jeju/${area.slug}/` });
      if (photo) a.append(homePhoto(photo, true));
      a.append(el(doc, 'span', { class: 'nm' }, area.label), el(doc, 'span', { class: 'lm' }, area.landmark));
      const li = el(doc, 'li');
      li.append(a);
      grid.append(li);
    }
    sec.append(grid);
    return sec;
  }

  function homeSigOf(s: State, origin: Origin | null): string {
    // a GPS fix that moved is another place: its own photos, markets and 동네
    const at = origin ? `${origin.key}@${origin.point.lat.toFixed(3)},${origin.point.lng.toFixed(3)}` : '';
    const dusk = !!origin && s.when === 'now' && duskNow(s.clock, origin.point, whenDay(s));
    // 밤 (ADR-0091): 「예:」 put 야외 산길 and islands by boat after the others from the sunset to the sunrise
    return [at, s.reach, s.indoor, whenDay(s), s.when === 'now', s.sub, s.newSub, s.mapApp, s.broken.length, rainNow(s), dusk, nightHome(s, origin), s.dest, s.listFailed].join('|');
  }

  /** 지금 여기서 (ADR-0101, specs/home-v2.md 1): the one place the 아무거나 rule would show first, over the moods; not drawn
   * while no place with a photo can be shown. The card's name is not a link: its one tap is 길찾기. Until the data is in,
   * the empty card keeps its place (.now:empty): the moods under it do not move when it comes. A list that did not come
   * (s.listFailed) takes it away: no empty grey card is left up. */
  function renderNow(s: State, spots: Spot[] | null, origin: Origin | null) {
    const spot = spots ? nowSpot(s, spots, origin) : null;
    if (!spot) {
      els.now.hidden = !!spots || s.listFailed;
      els.now.replaceChildren();
      setAttr(els.now, 'aria-label', null);
      return;
    }
    const photo = el(doc, 'div', { class: 'now-photo' });
    photo.append(el(doc, 'img', { src: spot.image, alt: '', fetchpriority: 'high', decoding: 'async', referrerpolicy: 'no-referrer', 'data-id': spot.id }));
    const head = el(doc, 'div');
    // the word over the name and, with a basis, how far, on its line (the first screen is short of height)
    const kick = el(doc, 'p', { class: 'now-kick' }, COPY.nowKicker);
    if (origin) kick.append(el(doc, 'span', { class: 'now-meta' }, ` · ${travelText(travel(origin.point, origin.isPoint, spot))}`));
    head.append(kick, el(doc, 'h2', { class: 'now-name' }, splitName(PLACE.name(spot)).main));
    const go = el(doc, 'a', { class: 'tbtn go', target: '_blank', rel: 'noopener' });
    setGo(go, spot, origin, s.reach, s.mapApp);
    const row = el(doc, 'div', { class: 'now-row' });
    row.append(go);
    const body = el(doc, 'div', { class: 'now-body' });
    body.append(head, row);
    els.now.replaceChildren(photo, body);
    setAttr(els.now, 'aria-label', COPY.nowKicker);
    els.now.hidden = false;
  }

  function renderHome(s: State) {
    const dated = s.when !== 'now';
    homeDated = dated;
    // date mode (specs/date-mode.md): the board is about the day being viewed
    setText(els.date, dated ? longDay(s.when) : todayText);
    const hc = homeCopy(s);
    setText(els.ask, hc.ask);
    setText(els.lede, hc.lede);
    const origin = homeOrigin(s);
    // a row's place, held from the first paint when the last visit said a row would be up now (index.html yc-row, app.ts
    // keepRow), until what decides the row is in — the list and 비 소식's answer — or the list did not come
    const area = rainArea(s);
    if (s.listFailed || (s.spots && (!area || s.rain?.area === area))) doc.documentElement.classList.remove('yc-row');
    const sig = homeSigOf(s, origin);
    if (sig === homeSig && s.spots === homeSpots && s.visited === homeVisited) return;
    homeSig = sig;
    homeSpots = s.spots;
    homeVisited = s.visited;
    // 뺀 곳 (ADR-0087) are left out of 「예:」, 노을 볼 곳 and 오늘 장 서는 곳, as from the cards
    const spots = s.spots && pickSpots(s.spots, s.visited);
    const day = whenDay(s);
    const markets = spots ? openMarkets(spots, origin, day) : [];
    // without a basis no market goes on the board under 「내 위치 근처」: it could be across the island (ADR-0075
    // Amendment 1); the 오늘 장 서는 곳 section below still lists them, each with its area
    // 노을 볼 곳 (ADR-0083): today only, with a basis, in the hours before the sunset there
    const sunset = spots && origin && !dated && duskNow(s.clock, origin.point, day) ? sunsetSpots(spots, origin, day) : [];
    const acts = todayActs(origin ? markets : [], rainNow(s), sunset);
    const sunsetOn = acts.some((a) => a.k === 'sunset');
    const folded = acts.slice(1).filter((a): a is Extract<TodayAct, { k: 'market' }> => a.k === 'market');
    const facts = [COPY.sunset(sunsetText(sunPoint(origin, s.dest, s.sgg), day)), ...folded.map((a) => COPY.marketFold(dated, PLACE.name(a.row.spot)))];
    // "·" held to the word before it by a no-break space (§3.2): a line never starts with "·"
    setText(els.todayFacts, facts.map((f) => `\u00a0· ${f}`).join(''));
    els.today.querySelector(':scope > .act')?.remove();
    const first = acts[0];
    if (first) els.today.append(first.k === 'rain' ? rainRow(s.indoor) : first.k === 'sunset' ? sunsetRow(first.rows.length) : todayRow(first.row, dated));
    // until the data is in (.wait marks it); a row's place is held only at the times the last visit said one would be up
    // (yc-row, above)
    els.today.classList.toggle('wait', !spots);
    renderNow(s, spots || null, origin);

    /** what the rows drawn so far in this draw show (top down): 유명한 데's 「예:」 passes over them (ADR-0092 7) */
    const drawn: string[] = [];
    /** `only`: the mood rows to draw (all five when missing) */
    const examples = (only?: readonly Button[]) => {
      for (const b of els.moods) {
        const mood = b.dataset.mood;
        if (!mood || mood === 'any' || (only && !only.includes(mood as Button))) continue;
        b.querySelector('.ex')?.remove();
        b.querySelector('.pair')?.remove();
        const ex = spots ? moodExamples(s, spots, origin, mood as Exclude<Button, 'any'>, mood === 'famous' ? drawn : undefined) : [];
        if (mood !== 'famous') drawn.push(...ex.map((x) => x.id));
        if (!ex.length) continue;
        // 「예:」 — an example, not a promise (ADR-0075 3); 「제주 인기:」 while the basis is not known (Amendment 1)
        const names = ex.map((x) => splitName(PLACE.name(x)).main);
        b.querySelector('.txt')!.append(el(doc, 'span', { class: 'ex sr' }, origin || s.dest === 'nation' ? COPY.example(names) : BUSAN && s.dest !== 'jeju' ? BUSAN_COPY.examplePopular(destNameOf(s), names) : COPY.examplePopular(names)));
        const pair = el(doc, 'span', { class: 'pair', 'aria-hidden': 'true' });
        // the second photo is not shown (.pair img + img): lazy, so it does not hold up the first ones on a slow line
        pair.append(...ex.map((x, i) => homePhoto(x, i > 0)));
        b.querySelector('.i-check')!.before(pair);
      }
    };
    // the sections under 아무거나: 노을 볼 곳 and 오늘 장 서는 곳, then 다른 동네, the credit and 설정
    const sections = (): HTMLElement[] => {
      const nodes: HTMLElement[] = [];
      if (sunsetOn && origin) nodes.push(sunsetSection(s, sunset, origin));
      if (markets.length) nodes.push(marketSection(s, markets, origin, dated));
      return nodes;
    };
    // an area's photo is not a pick: from the data as it is
    // 다른 동네 둘러보기 links the area pages, which Busan has none of (specs/busan.md 1.4)
    const areas = () => (BUSAN && s.dest !== 'jeju' ? el(doc, 'span', { hidden: '' }) : areasSection(s, s.spots!, origin));
    const tail = (): HTMLElement[] => {
      // the coastline the 노을 places were worked out from (ODbL): credited while they are shown
      const credit = el(doc, 'p', { class: 'credit' }, BUSAN && DEST[s.dest].credit === 'tour' ? BUSAN_COPY.homeCredit : COPY.homeCredit);
      if (sunsetOn) credit.append(COPY.sunsetCredit, el(doc, 'a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, COPY.osm));
      // settings reachable with nothing saved yet (heuristic audit H5): they live under the saved list
      // ADR-0093: then the other languages, each in its own words; a link opens the app again in it
      const langs = el(doc, 'p', { class: 'lang-line' });
      for (const [lang, name] of LANGS.filter(([l]) => l !== (doc.documentElement.lang || 'ko'))) {
        langs.append(...(langs.firstChild ? [' · '] : []), el(doc, 'a', { href: `/?lang=${lang}`, hreflang: lang, lang }, name));
      }
      return [credit, el(doc, 'button', { type: 'button', class: 'tbtn settings', 'data-action': 'settings' }, COPY.homeSettings), langs];
    };
    const gen = ++homeGen;
    // The first time the data is drawn (opts.stageHome): 노을 볼 곳 and 오늘 장 서는 곳 at once, with the 오늘 판 row
    // that jumps to them; the moods' 「예:」 and photos a frame later, two rows at a time, then 다른 동네 (its tiles
    // over two frames), the credit and 설정 — every step its own short task and frame instead of one long one. A step
    // a newer draw has overtaken is dropped (that draw starts again). Any later redraw is done in place, at once.
    if (opts.stageHome && spots && !homeFilled) {
      els.homeMore.replaceChildren(...sections());
      let late: Element[] = [];
      const steps = [
        () => examples(['rest', 'walk']),
        () => examples(['new', 'famous']),
        () => examples(['food']),
        () => {
          const sec = areas();
          late = [...sec.querySelectorAll(':scope > .tiles > li')].slice(6);
          for (const li of late) li.remove();
          els.homeMore.append(sec);
        },
        () => {
          els.homeMore.querySelector('.tiles')?.append(...late);
          els.homeMore.append(...tail());
          homeFilled = true;
        },
      ];
      const run = (i: number) =>
        afterPaint(() => {
          if (gen !== homeGen) return;
          steps[i]();
          if (i + 1 < steps.length) run(i + 1);
        });
      run(0);
      return;
    }
    examples();
    els.homeMore.replaceChildren(...(spots ? [...sections(), areas(), ...tail()] : []));
  }

  /** ADR-0081: one text button at the very bottom of the home, only while it is due and 기록 is on. Absent
   * otherwise (the home is then exactly as it was). */
  let surveyEl: HTMLElement | null = null;
  function renderSurvey(s: State) {
    const on = s.surveyLine && s.tracking;
    if (on && !surveyEl) {
      surveyEl = el(doc, 'p', { class: 'survey' });
      surveyEl.append(el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'survey' }, COPY.surveyLine));
      els.homeMore.after(surveyEl);
    } else if (!on && surveyEl) {
      surveyEl.remove();
      surveyEl = null;
    }
  }

  // --- sheet ---
  function sheetSigOf(s: State): string {
    // Only what the user changes in a sheet. News that arrives while it is open — a 숙소 GPS failure, a GPS
    // denial — is patched in place (patchSheet): a rebuild under the finger would reset its scroll and focus.
    // 의견 보내기 keeps what is typed: rebuilt only when it turns into 고마워요
    if (s.overlay === 'feedback') return `feedback|${s.feedbackSent}`;
    const move = s.overlay === 'move' && s.moveTarget ? `${s.moveTarget.id}|${s.moveTarget.date}` : '';
    return `${s.overlay}|${s.basis}|${s.region}|${s.stay?.area ?? ''}|${s.stay?.source ?? ''}|${s.reach}|${s.indoor}|${s.when}|${s.today}|${move}|${s.dest}|${s.destPick}`;
  }

  /** 「여행지 | 내 위치」 (ADR-0103): how the destination is decided — by the position (내 위치: the basis 지금 있는 곳, which
   * follows the position into another destination) or picked (여행지: any other basis, or that side pressed in this sheet).
   * Under 여행지 its chips, one row that scrolls sideways inside itself instead of wrapping. */
  function destToggle(panel: HTMLElement, s: State) {
    const pick = s.destPick || s.basis !== 'gps';
    const seg = optRow(
      option(BUSAN_COPY.destHead, null, { 'data-seg': 'pick', 'aria-pressed': String(pick) }),
      option(BUSAN_COPY.destGps, null, { 'data-seg': 'gps', 'aria-pressed': String(!pick) }),
    );
    seg.classList.add('seg-row');
    const box = el(doc, 'div', { class: 'opts seg', role: 'group', 'aria-label': BUSAN_COPY.destHead });
    box.append(seg);
    panel.append(box);
    if (!pick) return;
    const chips = el(doc, 'div', { class: 'chips', role: 'group', 'aria-label': BUSAN_COPY.destHead });
    for (const d of [...DESTS, 'nation' as const]) {
      const b = el(doc, 'button', { type: 'button', class: 'tbtn', 'data-dest': d, 'aria-pressed': String(s.dest === d) });
      b.append(el(doc, 'span', { class: 'nm' }, BUSAN_COPY.destName[d]));
      chips.append(b);
    }
    panel.append(chips);
  }
  /** 주소·숙소 검색 (ADR-0103) under its option: the words, then 검색 */
  function addrBox(): HTMLElement {
    const box = el(doc, 'div', { class: 'addr' });
    // a name or an address, not prose: no spelling underline, no capital or correction on a phone's keyboard
    const q = el(doc, 'input', { type: 'search', class: 'date-in addr-q', 'aria-label': BUSAN_COPY.addrSearch, placeholder: BUSAN_COPY.addrSearch, maxlength: '40', enterkeyhint: 'search', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' });
    // what was typed survives a rebuild of the sheet (언제 picked meanwhile)
    q.value = els.sheet.querySelector<HTMLInputElement>('.addr-q')?.value ?? '';
    const go = el(doc, 'button', { type: 'button', class: 'tbtn addr-go', 'data-action': 'addr-go', 'aria-label': BUSAN_COPY.addrGo });
    go.append(icon(SEARCH));
    box.append(q, go);
    return box;
  }
  /** The search's answers as option rows under 주소·숙소, and why there are none; patched, never a rebuild (the words typed stay). */
  function patchAddr(s: State) {
    const row = els.sheet.querySelector<HTMLElement>('.addr')?.closest<HTMLElement>('.optrow');
    if (!row) return;
    const go = row.querySelector<HTMLButtonElement>('.addr-go')!;
    // asking: never `disabled` (the focus on it would drop to the page) — marked, and app.ts searchAddr ignores it
    for (const a of ['aria-busy', 'aria-disabled']) {
      if (s.geo.pending) go.setAttribute(a, 'true');
      else go.removeAttribute(a);
    }
    const hits = s.geo.hits ?? [];
    const sig = JSON.stringify(hits);
    if (row.dataset.hits !== sig) {
      row.dataset.hits = sig;
      for (const r of els.sheet.querySelectorAll('.hit-row')) r.remove();
      row.after(
        ...hits.map((h, i) => {
          const r = optRow(option(h.name, h.addr, { 'data-hit': String(i) }));
          r.classList.add('hit-row');
          return r;
        }),
      );
    }
    const err = els.sheet.querySelector<HTMLElement>('.addr-err');
    if (err) {
      setText(err, s.geo.error ? BUSAN_COPY.addrError[s.geo.error] : '');
      err.hidden = !s.geo.error;
    }
    // told to a screen reader once per answer (polite): how many were found, or why none — not again when the sheet is rebuilt
    const live = els.sheet.querySelector<HTMLElement>('.addr-live');
    if (live && s.geo !== geoSaid) {
      geoSaid = s.geo;
      live.textContent = s.geo.pending ? '' : s.geo.error ? BUSAN_COPY.addrError[s.geo.error] : s.geo.hits ? BUSAN_COPY.addrFound(s.geo.hits.length) : '';
    }
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
  /** A touch screen's pointer (phones, in-app browsers); never where matchMedia is missing (jsdom). */
  const coarse = () => {
    try {
      return !!win?.matchMedia?.('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  };
  /** 날짜 고르기: an option that opens the browser's own date picker (today to a year on), with the native
   * input kept beside it. Where showPicker() is missing the input itself is shown with 이 날로 (app.ts).
   * On a touch screen the input itself lies see-through over the option, so the finger lands on it and the OS
   * opens its picker: iOS Safari and in-app browsers open nothing from showPicker() on a hidden field. */
  function pickDay(s: State, picked: Day | null): HTMLElement[] {
    const range = { type: 'date', min: s.today, max: addDays(s.today, DAYS_AHEAD), 'aria-label': COPY.pickDay };
    if (coarse()) {
      const tap = el(doc, 'input', { ...range, class: 'date-tap', ...(picked ? { value: picked } : {}) });
      if (tap.type === 'date') {
        const row = el(doc, 'label', { class: 'opt' });
        row.append(...option(COPY.pickDay, picked ? longDay(picked) : null, {}).childNodes, tap);
        return [row];
      }
    }
    const input = el(doc, 'input', { ...range, class: 'sr', tabindex: '-1', 'aria-hidden': 'true', 'data-action': 'day-input' });
    input.value = picked ?? '';
    const box = el(doc, 'div', { class: 'date-fb' });
    box.append(input, el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'day-ok', hidden: '' }, COPY.dayOk));
    return [option(COPY.pickDay, picked ? longDay(picked) : null, { 'data-action': 'pick-day', 'aria-pressed': String(!!picked) }), box];
  }

  /** 의견 보내기 (ADR-0081): the option rows hold a real radio / checkbox (the browser keeps what is chosen, so
   * nothing is lost while it is open); two text boxes; 보내기. app.ts reads it all on 보내기. */
  function feedbackForm(panel: HTMLElement) {
    const choice = (type: 'radio' | 'checkbox', name: string, value: string, label: string) => {
      const row = el(doc, 'label', { class: 'opt' });
      const text = el(doc, 'span');
      text.append(el(doc, 'span', { class: 'nm' }, label));
      row.append(el(doc, 'input', { type, name, value, class: 'sr' }), text, icon(CHECK));
      return optRow(row);
    };
    const box = (id: string, label: string) => {
      const wrap = el(doc, 'div', { class: 'fb-box' });
      wrap.append(el(doc, 'label', { class: 'group-h', for: id }, label), el(doc, 'textarea', { id, class: 'date-in fb-in', rows: '3', maxlength: String(TEXT_MAX) }));
      return wrap;
    };
    panel.append(el(doc, 'p', { class: 'note' }, COPY.feedbackNote));
    optGroup(panel, 'went-h', COPY.wentHead, WENT.map((w) => choice('radio', 'fb-went', w, COPY.went[w]))).setAttribute('role', 'radiogroup');
    optGroup(panel, 'pain-h', COPY.painHead, PAINS.map((p) => choice('checkbox', 'fb-pain', p, COPY.pains[p])));
    panel.querySelector('#pain-h')?.append(el(doc, 'span', { class: 'order' }, COPY.painMany));
    panel.append(box('fb-pain-text', COPY.painText), box('fb-wish', COPY.wishText));
    panel.append(el(doc, 'button', { type: 'button', class: 'primary fb-send', 'data-action': 'feedback-send' }, COPY.send));
  }

  function buildSheet(s: State) {
    const overlay = s.overlay!;
    const scrim = el(doc, 'div', { class: 'scrim', 'data-action': 'close' });
    const panel = el(doc, 'section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' });
    const title =
      overlay === 'basis' ? COPY.basisSheet : overlay === 'move' ? COPY.moveSheet : overlay === 'feedback' ? (s.feedbackSent ? COPY.thanks : COPY.feedbackSheet) : COPY.staySheet;
    panel.append(el(doc, 'h2', { id: 'sheet-title', tabindex: '-1' }, title));
    if (overlay === 'basis') {
      // 여행지 (specs/busan.md 1.4): the sheet's first row, with the switch on — the one in use pressed
      // the nation build (with 강원 and 다른 곳, its part asked for when pressed: app.ts pickDest): 「여행지 | 내 위치」 (ADR-0103)
      if (NATION) destToggle(panel, s);
      else if (BUSAN) {
        // one compact line, like 언제 (the `--mode busan` rollback's 제주 · 부산)
        const row = optRow(...DESTS.filter((d) => !DEST[d].sgg).map((d) => option(BUSAN_COPY.destName[d], null, { 'data-dest': d, 'aria-pressed': String(s.dest === d) })));
        row.classList.add('when-row');
        optGroup(panel, 'dest-h', BUSAN_COPY.destHead, [row]);
      }
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
      // the nation build: 주소·숙소, its search box on the row's own second line (ADR-0103)
      const stayRow = optRow(option(NATION ? BUSAN_COPY.addrOption : COPY.stayOption, s.stay ? COPY.stayArea(areaLabel(s.stay.area, OPEN_AREAS)) : COPY.stayUnset, { 'data-basis': 'stay', 'aria-pressed': String(s.basis === 'stay') }));
      if (s.stay) stayRow.append(el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'restay' }, COPY.restay));
      if (NATION) stayRow.append(addrBox());
      // the 동네 in use shows here, checked, not only far down in the index (heuristic audit H6); under it, where its line
      // 「다른 동네는 아래에서 골라요」 was, 다른 동네 고르기 goes down to that index (ADR-0090 6, app.ts)
      const regionRow: HTMLElement[] = [];
      if (s.basis === 'region' && s.region) {
        const row = optRow(option(COPY.basisRegion(areaLabel(s.region, OPEN_AREAS)), null, { 'data-action': 'close', 'aria-pressed': 'true' }), el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'other-area' }, COPY.otherArea));
        row.classList.add('other-row');
        regionRow.push(row);
      }
      optGroup(panel, 'where-h', COPY.whereHead, [optRow(option(COPY.gpsOption, null, { 'data-basis': 'gps', 'aria-pressed': String(s.basis === 'gps') })), stayRow, ...regionRow]);
      // the search's line, seen; what a screen reader is told is the polite .addr-live beside it (patchAddr)
      if (NATION) panel.append(el(doc, 'p', { class: 'form-err addr-err', hidden: '' }), el(doc, 'p', { class: 'sr addr-live', role: 'status' }));
      // 얼마나 (ADR-0060): right under the 어디 rows, before the 동네 index, so it is in view without scrolling.
      // The same thin-rule rows with a check. Choosing one closes the sheet.
      optGroup(panel, 'reach-h', COPY.reachHead, REACHES.map((r) => optRow(option(COPY.reach[r], null, { 'data-reach': r, 'aria-pressed': String(s.reach === r) }))));
      // 비 와요(실내만) (ADR-0065): one row of its own, the same thin-rule option with a check when on. Choosing it
      // closes the sheet, like 얼마나.
      optGroup(panel, 'weather-h', COPY.weatherHead, [optRow(option(COPY.indoorToggle, null, { 'data-indoor': '', 'aria-pressed': String(s.indoor) }))]);
      areaGroups(panel, 'basis', s.basis === 'region' ? s.region : null, s.dest, s.sgg);
    } else if (overlay === 'move') {
      // 다른 날로: the days that have saved places (today on), the row's own checked, then 날짜 고르기.
      const from = s.moveTarget?.date ?? '';
      const days = [...new Set(s.saved.map((e) => e.date).filter((d) => d >= s.today))].sort();
      optGroup(panel, 'move-h', null, [
        ...days.map((d) => optRow(option(dayName(s.today, d), null, { 'data-day': d, 'aria-pressed': String(d === from) }))),
        optRow(...pickDay(s, null)),
      ]);
    } else if (overlay === 'feedback') {
      if (s.feedbackSent) panel.append(el(doc, 'p', { class: 'note' }, COPY.thanksNote));
      else feedbackForm(panel);
    } else {
      panel.append(
        el(doc, 'p', { class: 'note' }, COPY.stayNote),
        el(doc, 'button', { type: 'button', class: 'primary', 'data-action': 'stay-here' }, COPY.stayHere),
        el(doc, 'p', { class: 'form-err', role: 'alert', hidden: '' }),
      );
      areaGroups(panel, 'stay', s.stay?.source === 'area' ? s.stay.area : null, s.dest, s.sgg);
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
    if (NATION) patchAddr(s);
    const err = els.sheet.querySelector<HTMLElement>('.form-err:not(.addr-err)');
    if (err) {
      // The button stays a button; the reason goes on its own line (S09).
      setText(err, s.stayForm.error ? (s.stayForm.error === 'outside' && nationOutside(s, s.stayForm.at, true)) || (BUSAN && s.stayForm.error === 'outside' && s.dest !== 'jeju' && s.dest !== 'nation' ? BUSAN_COPY.stayOutside(destNameOf(s)) : COPY.stayError[s.stayForm.error]) : '');
      err.hidden = !s.stayForm.error;
    }
  }

  function focusSheet(atDest = false) {
    // a day picked on a touch screen is the see-through field's value (pickDay), not a pressed option
    // (the 여행지 row is not where a choice is made each time: focus starts below it, as before it was there)
    // opened from the name line (ADR-0094 Amendment 3): on the 여행지 in use
    // (「여행지 | 내 위치」 the same, ADR-0103: on its chip in use, else on its side pressed)
    const dest = atDest ? els.sheet.querySelector<HTMLElement>('.sheet [data-dest][aria-pressed="true"]') ?? els.sheet.querySelector<HTMLElement>('.sheet [data-seg][aria-pressed="true"]') : null;
    const pick = dest ?? els.sheet.querySelector<HTMLElement>('.sheet [aria-pressed="true"]:not([data-dest]):not([data-seg]), .sheet .date-tap[value]') ?? els.sheet.querySelector<HTMLElement>('#sheet-title');
    pick?.focus({ preventScroll: true });
  }

  /** `fn` once the browser has painted the frame now being prepared: a task posted from a frame callback runs
   * after that frame is drawn. Without frame callbacks, a task. */
  function afterPaint(fn: () => void) {
    const task = () => void later(0, fn);
    if (typeof win?.requestAnimationFrame === 'function') win.requestAnimationFrame(task);
    else task();
  }
  /** The page under an open sheet goes inert after the sheet's first frame, or at the first key or pointer press
   * before that (flushInert); never once the sheet is closed again. */
  let inertQueued = false;
  function inertNow() {
    inertQueued = false;
    if (prevOverlay) els.app.setAttribute('inert', '');
  }
  function queueInert() {
    if (inertQueued) return;
    inertQueued = true;
    afterPaint(() => {
      if (inertQueued) inertNow();
    });
  }
  const flushInert = () => {
    if (inertQueued) inertNow();
  };
  doc.addEventListener('keydown', flushInert, true);
  doc.addEventListener('pointerdown', flushInert, true);

  function renderSheet(s: State) {
    if (s.overlay && !prevOverlay) {
      // who opened it (before the page goes inert and drops focus): focus goes back there on close
      const active = doc.activeElement as HTMLElement | null;
      opener = active && active !== doc.body && !els.sheet.contains(active) ? active : null;
    }
    // Everything behind the sheet is inert: no Tab or tap reaches it (S58). On opening it is set once the sheet's
    // first frame is painted (queueInert): restyling the page under the sheet is then not part of the tap's frame.
    // Until that moment the scrim covers the page, the focus is in the sheet and Tab is held there, and a key or
    // pointer press sets it first. Lifted at once, before focus goes back to the opener — focus() on an element
    // inside an inert subtree silently does nothing.
    if (s.overlay && !prevOverlay) queueInert();
    else if (s.overlay) els.app.setAttribute('inert', '');
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
        if (switched || focusInside) focusSheet(switched && opener?.id === 'logo');
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
    setDate: (text) => {
      todayText = text;
      if (!homeDated) setText(els.date, text);
    },
    dispose() {
      io?.disconnect();
      io = null;
      inertQueued = false;
      doc.removeEventListener('keydown', flushInert, true);
      doc.removeEventListener('pointerdown', flushInert, true);
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
