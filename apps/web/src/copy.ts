// Every string the app shows, and the pure helpers that word them (split out of render.ts, ADR-0126).
// No DOM: what a label, status line or sheet title says for a State.
import { areaLabel } from './region/areas';
import { DEST, isSggDest, type Dest, type SggDest } from './region/dest';
import { BUSAN, NATION, OPEN_AREAS, nationPart } from './region/release';
import { addDays, dayOf, longDay, shortDay, type Day } from './dates';
import { type InApp } from './keep';
import { MAP_APP_NAME, placeApp, type MapApp } from './pick/links';
import { withinReach, type Button, type NightShift, type Reach, type Spot } from './pick/pick';
import { heldDay, type State, type VisitNote } from './state';
import { MAX_SAVED } from './store';
import { PAINS, WENT } from './usage/survey';
import type { GeoError, NoOrigin } from './types';
import type { OutsideAt } from './types';

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
export function josa(name: string, withFinal: string, without: string): string {
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

export function whereLabel(s: State): string {
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

/** The 자동 지역's words for a position `outside` (predeploy review M-1·m-2): outside Korea only where it was found to be
 * (`abroad`); with the 자동 지역 in use, no 시군구 near — or, for a 숙소, the 검수한 곳 it is in; else null: Jeju's and
 * Busan's own 「~ 밖」 words. */
export function nationOutside(s: State, at: OutsideAt | undefined, stay: boolean): string | null {
  if (!NATION) return null;
  const n = nationPart();
  if (!n) return null;
  if (at === 'abroad') return stay ? n.copy.stayOutside : n.copy.outside;
  if (s.dest !== 'nation') return null;
  if (stay && (at === 'jeju' || at === 'busan' || isSggDest(at))) return n.copy.stayIn(BUSAN_COPY.destName[at]);
  return stay ? n.copy.stayNodata : n.copy.nodata;
}
