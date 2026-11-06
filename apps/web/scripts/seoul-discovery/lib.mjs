/**
 * 서울 매일 발굴 (ADR-0123, review/seoul-discovery/criteria-01.md)의 순수 규칙과 호출 도우미. 명령은 discover.mjs·fun-images.mjs.
 * 순수 함수(거르기·하루 상한·같은 상호·8주·폐업·그림 검사)는 tests/seoul-discovery.test.ts가 잰다.
 */
import { createHash } from 'node:crypto';
import { brandOf as branchOff } from '../seoul-fun/prefilter.mjs';
import { MASS as CAFE_MASS } from '../seoul-cafe/curate.mjs';
import { ADULT as NIGHT_ADULT } from '../seoul-night/curate-03.mjs';

// ── 날짜 ──
export const kstDay = (now = new Date()) => new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// ── 숫자 (기준 01) ──
export const DAILY_MAX = 60; // 3절 하루 판정 상한
export const QUEUE_DAYS = 7; // 3절 줄에 남는 날
export const NEW_DAYS = 56; // 5절 B·9절 신상 8주 (end = start + 55)
export const NEW_FROM = -28; // 5절 B 새로 연 곳 문 연 날 D−28
export const AHEAD = 7; // 5절 B 시작 D+7 이하
export const MAX_SPAN = 92;
export const RECENT_DAYS = 30; // 9절
export const RECENT_POSTS = 3; // 9절
export const CLOSE_EVERY = 7; // 9절 폐업 신호 7일마다
export const AUDIT_KEEP = 40; // 8절
export const AUDIT_DROP = 20;
export const GATE = 0.9;
export const MAX_POSTS = 800; // 1절
export const PER_EXTRACT = 200; // 2절
export const PER_JUDGE = 60; // 6절

export const KINDS = ['팝업', '전시', '마켓', '축제', '행사', '새로 연 곳'];
export const CAFE_WORDS = ['카페', '베이커리', '케이크', '도넛', '디저트', '젤라또', '찻집', '로스터리'];
export const BOOK_WORDS = ['서점', '레코드숍'];
export const SHOP_WORDS = ['소품샵', '문구점', '향', '리빙숍', '빈티지숍', '편집숍', '플래그십'];
export const BAR_WORDS = ['칵테일바', '와인바', '하이볼바', '루프탑바', '음악바', '바', '클럽'];
export const WORDS = [...CAFE_WORDS, ...SHOP_WORDS, ...BOOK_WORDS, ...BAR_WORDS];
/** 9절: 8주 뒤 올라가는 갈래 (가게 낱말은 실린 갈래가 없어 내려간다) */
export const stayOf = (word) => (CAFE_WORDS.includes(word) ? 'G8' : BOOK_WORDS.includes(word) ? 'G4' : BAR_WORDS.includes(word) ? 'G10' : null);

// ── 이름 ──
export const norm = (s) => String(s ?? '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
/** 상호: 지점 이름을 뗀 것, 떼고 두 자 미만이면 이름 전체 (가게 기준 02·밤 기준 03의 고친 규칙) */
export function brandOf(name) {
  const b = branchOff(name);
  return b.length >= 2 ? b : String(name).replace(/\s+/g, '').toLowerCase();
}
const SHOP_MASS = ['다이소', '아트박스', '올리브영', '무인양품', '모던하우스', '자주', '핫트랙스', '이니스프리', '랄라블라', '롭스', '시코르', '미니소', '플라잉타이거', '유니클로', '자라', 'zara', '에이치앤엠', 'h&m', '탑텐', '스파오', '에잇세컨즈', '무신사스탠다드', '지오다노', '나이키', '아디다스', '뉴발란스', 'abc마트', '슈마커', '폴더', '다비치', '코스트코', '이케아', '한샘', '까사미아', '텐바이텐', '모닝글로리', '교보핫트랙스'];
const BAR_MASS = ['생활맥주', '역전할머니맥주', '한신포차', '투다리', '봉구비어', '칠성포차', '용용선생', '크라운호프', '금별맥주', '간이역', '호맥', '설맥', '우후죽순', '오내혼술집', '펀비어킹', '인생술집', '청담이상'];
/** 3절 대형 체인 (카페 기준 01 R4 + 가게 기준 02 + 밤 기준 03 R4) */
export const MASS = [...new Set([...CAFE_MASS, ...SHOP_MASS, ...BAR_MASS].map((s) => s.toLowerCase()))];
export const MASS_OK = /리저브|reserve|본점|1호점|플래그십|flagship/i;
export const isMass = (name) => MASS.some((m) => brandOf(name).startsWith(m)) && !MASS_OK.test(name);
/** 3절 유흥 낱말 (밤 기준 03 R3) */
export const ADULT = NIGHT_ADULT;

/** 3절 갈래(돌아가며 뽑기): 팝업·행사 / 카페 / 전시·마켓·축제 / 가게 / 바 / 그 밖 */
export const LANES = ['popup', 'cafe', 'show', 'shop', 'bar', 'other'];
export function laneOf(c) {
  if (c.kind === '팝업' || c.kind === '행사') return 'popup';
  if (c.kind === '전시' || c.kind === '마켓' || c.kind === '축제') return 'show';
  const w = String(c.word ?? '');
  if (CAFE_WORDS.includes(w) || /카페|커피|베이커리|빵|디저트|케이크|젤라또/.test(w || c.name)) return 'cafe';
  if (SHOP_WORDS.includes(w) || BOOK_WORDS.includes(w) || /소품|문구|편집|빈티지|서점|플래그십/.test(w || c.name)) return 'shop';
  if (BAR_WORDS.includes(w) || /바$|와인|칵테일|하이볼|클럽/.test(w)) return 'bar';
  return 'other';
}

/** 장부에서 이 이름(또는 카카오 id)을 이미 판정·처리했는가 */
export const seen = (ledger, name) => !!ledger.names[norm(name)];

/**
 * 3절: 옮겨 적은 후보(`cands`, 이름별 하나)와 어제 줄(`queue`)을 장부·체인·유흥으로 거르고, 갈래를 돌아가며 `max`곳.
 * 돌려줌: { pick, rest(줄에 남김), skipped: { ledger, mass, adult, old } }
 */
export function pickDay(cands, queue, ledger, day, max = DAILY_MAX) {
  const skipped = { ledger: 0, mass: 0, adult: 0, old: 0 };
  const byName = new Map();
  for (const q of queue) {
    if (q.firstSeen < addDays(day, -QUEUE_DAYS + 1)) { skipped.old++; continue; }
    byName.set(norm(q.name), q);
  }
  for (const c of cands) {
    const k = norm(c.name);
    const q = byName.get(k);
    if (q) byName.set(k, { ...q, ...c, firstSeen: q.firstSeen, first: [...q.first, ...c.first.filter((p) => !q.first.some((x) => x.link === p.link))].slice(0, 8) });
    else byName.set(k, { ...c, firstSeen: day });
  }
  const ok = [];
  for (const c of byName.values()) {
    if (!norm(c.name)) continue;
    if (seen(ledger, c.name)) { skipped.ledger++; continue; }
    if (isMass(c.name)) { skipped.mass++; continue; }
    if (ADULT.test(c.name)) { skipped.adult++; continue; }
    ok.push(c);
  }
  const latest = (c) => c.first.map((p) => p.day).sort().at(-1) ?? '';
  const lanes = new Map(LANES.map((l) => [l, []]));
  for (const c of ok) lanes.get(laneOf(c)).push(c);
  for (const list of lanes.values()) list.sort((a, b) => b.first.length - a.first.length || (latest(a) < latest(b) ? 1 : latest(a) > latest(b) ? -1 : 0) || (norm(a.name) < norm(b.name) ? -1 : 1));
  const pick = [];
  while (pick.length < max && [...lanes.values()].some((l) => l.length)) for (const l of LANES) if (pick.length < max && lanes.get(l).length) pick.push(lanes.get(l).shift());
  const rest = [...lanes.values()].flat();
  return { pick, rest, skipped };
}

/** 5절 B·7절 형식 검사: keep 하나가 실을 수 있는 꼴인가 (까닭 또는 '') */
export function badKeep(j, row, day) {
  const D = /^\d{4}-\d{2}-\d{2}$/;
  const k = row?.kakao;
  if (!k) return 'no kakao place';
  if (!/^서울/.test(k.address)) return 'not Seoul';
  if (!KINDS.includes(j.kind)) return 'kind';
  if (!D.test(j.start) || !D.test(j.end) || j.start > j.end) return 'dates';
  if (!['none', 'onsite'].includes(j.reserve)) return 'reserve';
  if (!/^https:\/\//.test(j.src)) return 'src';
  if (j.kind === '새로 연 곳') {
    if (!WORDS.includes(j.word)) return 'word';
    if (j.end !== addDays(j.start, NEW_DAYS - 1)) return 'end ≠ start + 55';
    if (j.start < addDays(day, NEW_FROM) || j.start > addDays(day, AHEAD)) return 'opened outside D−28..D+7';
  } else {
    if (j.end < day || j.start > addDays(day, AHEAD)) return 'not this week';
    if (Date.parse(j.end) - Date.parse(j.start) > MAX_SPAN * 864e5) return 'over 92 days';
  }
  return '';
}

/**
 * 7절 같은 상호 한 번 더 보기. `keeps`: [{ cid, name, kind, total }] (그날), `shipped`: 이미 실린 이름들(즐길 거리·발굴).
 * 새로 연 곳은 상호로, 그 밖은 이름(norm)으로 묶어 한 곳만. 돌려줌: 빠진 cid → 까닭.
 */
export function sameBrandOnce(keeps, shipped) {
  const out = {};
  const key = (k) => (k.kind === '새로 연 곳' ? `b:${brandOf(k.name)}` : `n:${norm(k.name)}`);
  const have = new Map();
  for (const s of shipped) {
    have.set(`b:${brandOf(s.name)}`, s.name);
    have.set(`n:${norm(s.name)}`, s.name);
  }
  const groups = new Map();
  for (const k of keeps) {
    const g = key(k);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(k);
  }
  for (const [g, list] of groups) {
    const flagship = list.filter((k) => MASS_OK.test(k.name));
    if (have.has(g) && !flagship.length) {
      for (const k of list) out[k.cid] = `same brand already shipped: ${have.get(g)}`;
      continue;
    }
    const best = [...list].sort((a, b) => Number(MASS_OK.test(b.name)) - Number(MASS_OK.test(a.name)) || (b.total ?? 0) - (a.total ?? 0) || (a.cid < b.cid ? -1 : 1))[0];
    for (const k of list) if (k !== best) out[k.cid] = `same brand kept once: ${best.name}`;
  }
  return out;
}

const CLOSE = /폐업|영업\s?종료|문\s?닫|휴업|이전/;
/** 9절 폐업 신호: 카카오 이름 검색 결과(`docs`)에 그 id가 없거나, 블로그 제목에 상호와 폐업 낱말이 함께 있다 */
export function closedSignal(item, kakaoIds, titles) {
  const id = /place\.map\.kakao\.com\/(\d+)/.exec(item.kakao)?.[1];
  if (kakaoIds && id && !kakaoIds.includes(id)) return 'kakao: not found by name';
  const b = norm(brandOf(item.name));
  const t = titles.find((x) => CLOSE.test(x) && norm(x).includes(b));
  return t ? `blog: ${t}` : '';
}
/** 9절 8주: 블로그 최신 글(`posts` [{day, title}])에서 D−30 안, 제목에 상호가 있는 글이 3건 이상이고 폐업 낱말이 없다 */
export function stillLoved(item, posts, day) {
  const b = norm(brandOf(item.name));
  const from = addDays(day, -RECENT_DAYS);
  const recent = posts.filter((p) => p.day >= from && p.day <= day && norm(p.title).includes(b));
  return recent.length >= RECENT_POSTS && !recent.some((p) => CLOSE.test(p.title));
}
/**
 * 9절 하루 지우기 결정 (호출 결과를 받아서). 돌려줌: 'keep' | 'ended' | 'stay:G8' | 'retired' | 'closed:<까닭>' | 'check'(8주·폐업 확인이 필요함)
 */
export function sweepOf(item, day) {
  if (item.kind !== '새로 연 곳') return item.end < day ? 'ended' : 'keep';
  if (item.stay) return 'keep';
  return addDays(item.start, NEW_DAYS) <= day ? 'check' : 'keep';
}

// ── 그림 (10절) ──
export const BLOCKED = /(^|\.)(blog\.naver\.com|post\.naver\.com|cafe\.naver\.com|in\.naver\.com|map\.naver\.com|m\.place\.naver\.com|place\.naver\.com|naver\.me|smartstore\.naver\.com|booking\.naver\.com|tistory\.com|brunch\.co\.kr|velog\.io|instagram\.com|facebook\.com|fb\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|threads\.net|tiktok\.com|kakao\.com|daum\.net|kko\.to|linktr\.ee|litt\.ly|inpock\.co\.kr|modoo\.at|catchtable\.co\.kr|tablemanager\.io|band\.us|blogspot\.com|wordpress\.com|notion\.site|notion\.com|oopy\.io|daangn\.com|karroter\.net|tabling\.co\.kr|creatorlink\.net|reserv\.company)$/i;
export function okPage(u) {
  try {
    const x = new URL(u);
    return (x.protocol === 'https:' || x.protocol === 'http:') && !BLOCKED.test(x.hostname);
  } catch {
    return false;
  }
}
const ent = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
/** 페이지 HTML의 og:image(없으면 twitter:image)와 og:site_name */
export function ogOf(html, page) {
  const meta = (key) => {
    for (const m of html.matchAll(/<meta\s[^>]*>/gi)) {
      const tag = m[0];
      const p = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
      if (p !== key) continue;
      const c = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
      if (c) return ent(c);
    }
    return '';
  };
  let image = meta('og:image') || meta('og:image:url') || meta('og:image:secure_url') || meta('twitter:image');
  if (image) {
    try {
      image = new URL(image, page).href.replace(/^http:\/\//i, 'https://');
    } catch {
      image = '';
    }
  }
  return { image, site: meta('og:site_name') };
}
export const BAD_IMAGE = /logo|favicon|icon|symbol|noimage|no_image|no-image|placeholder|blank|default|sample|temp_|sns[-_]?img|sns_share|share_default|share[-_]?image|sns[-_]?represent|\/kakao\d*\.(?:jpe?g|png)/i;
/** 그림이 이 호스트·경로면 쓰지 않는다 (ADR-0123 Amendment 2): 노션 프록시, 상품 썸네일, 사이트 화면 캡처 */
export const BAD_IMAGE_HOST = /^https:\/\/([^/]*\.)?(oopy\.lazyrockets\.com|notion\.so|notion\.site|notion\.com|oopy\.io)\//i;
export const BAD_IMAGE_PATH = /\/product\/|screen-thumb/i;
/** 기준 02 10절: 로고로 보이는 크기 — 정사각형이면서 600px 이하 */
export const LOGO_SQUARE = 600;
/** 그림 바이트의 가로·세로 (png·jpeg·gif·webp) */
export function imageSize(buf) {
  const b = Buffer.from(buf);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { type: 'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length > 10 && b.toString('ascii', 0, 3) === 'GIF') return { type: 'gif', w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const f = b.toString('ascii', 12, 16);
    if (f === 'VP8 ') return { type: 'webp', w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (f === 'VP8L') {
      const n = b.readUInt32LE(21);
      return { type: 'webp', w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
    }
    if (f === 'VP8X') return { type: 'webp', w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { type: 'jpeg', w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}
export const MAX_IMAGE = 1.5 * 1024 * 1024;
/** 10절 그림 검사: 까닭 또는 '' */
export function badImage(url, size, bytes) {
  if (!/^https:\/\//.test(url)) return 'not https';
  if (BAD_IMAGE.test(url)) return 'logo-like address';
  if (BAD_IMAGE_HOST.test(url)) return 'platform image host';
  if (BAD_IMAGE_PATH.test(url)) return 'product thumbnail or site capture';
  if (bytes > MAX_IMAGE) return 'over 1.5 MB';
  if (!size) return 'not an image';
  if (size.w === size.h && size.w <= LOGO_SQUARE) return 'small square (logo-like)';
  if (size.w < 400 || size.h < 200) return 'too small';
  const r = size.w / size.h;
  if (r < 0.5 || r > 2.6) return 'odd shape';
  return '';
}
/** 10절 이름의 핵심 낱말: 흔한 낱말을 뺀 두 자 이상 첫 낱말 */
const COMMON = /^(팝업|팝업스토어|스토어|store|popup|pop-up|서울|seoul|성수|성수동|홍대|한남|더현대|여의도|잠실|명동|강남|전시|전시회|展|마켓|플리마켓|페스티벌|축제|행사|오픈|오픈기념|기념|신상|그랜드|grand|open|the|in|x|×|20\d\d|\d+주년|\d+회|제\d+회)$/i;
export function coreWord(name) {
  for (const w of String(name).replace(/[<>()[\]「」『』'"“”‘’·,:!?]/g, ' ').split(/\s+/)) if (w.length >= 2 && !COMMON.test(w)) return w;
  return '';
}

// ── 장소 확인 (기준 02 4절) ──
export const CRITERIA = 'criteria-02.md';
const GU = ['종로', '중', '용산', '성동', '광진', '동대문', '중랑', '성북', '강북', '도봉', '노원', '은평', '서대문', '마포', '양천', '강서', '구로', '금천', '영등포', '동작', '관악', '서초', '강남', '송파', '강동'];
const NOT_DONG = /^(이|활|행|운|자|변|감|충|연|공|노|파|진|부|소|출|발|요|원|합|선|후|청|단|협|작|기|구|고|상|대|중)$/;
/** 글의 동네: 구 이름, 동 이름(「성수동2가」는 성수), 동네 이름(hoods) — 장소 글자에서, 없으면 처음 글에서 */
export function areaOf(placeText, posts, hoods) {
  const read = (t) => {
    const gus = new Set();
    const dongs = new Set();
    const named = new Set();
    for (const m of String(t).matchAll(/([가-힣]{1,4})구(?![가-힣])/g)) if (GU.includes(m[1])) gus.add(m[1]);
    for (const m of String(t).matchAll(/([가-힣]{1,4})동(?:\d가)?(?![가-힣])/g)) if (m[1].length >= 2 || !NOT_DONG.test(m[1])) dongs.add(m[1]);
    for (const h of hoods) for (const part of h.name.split('·')) if (String(t).includes(part)) named.add(h.name);
    return { gus: [...gus], dongs: [...dongs], hoods: [...named] };
  };
  const empty = (a) => !a.gus.length && !a.dongs.length && !a.hoods.length;
  const first = read(placeText ?? '');
  return empty(first) ? read((posts ?? []).map((p) => `${p.title} ${p.desc ?? ''}`).join(' ')) : first;
}
/** 카카오 결과(`doc`: address 도로명 또는 지번, jibun 지번)가 글의 동네와 맞는가 */
export function areaMatch(doc, area, hoods) {
  const gu = /^서울\S*\s+(\S+?)구\s/.exec(`${doc.jibun || doc.address} `)?.[1];
  if (gu && area.gus.includes(gu)) return true;
  const dong = /\s([가-힣]+?)\d*동(?:\d+가)?\s/.exec(` ${doc.jibun ?? ''} `)?.[1];
  if (dong && area.dongs.some((d) => d === dong || d.replace(/\d+$/, '') === dong)) return true;
  return area.hoods.some((name) => {
    const h = hoods.find((x) => x.name === name);
    return !!h && km(h, doc) <= HOOD_KM;
  });
}
/** 맞는 서울 결과 가운데 첫 것 */
export const placeOf = (docs, area, hoods) => docs.find((d) => /^서울/.test(d.address) && areaMatch(d, area, hoods)) ?? null;

// ── 감사 표본 ──
export function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function sampleOf(ids, n, seed) {
  const rnd = mulberry32(seed);
  const a = [...ids].sort();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n).sort();
}
/** 8절 게이트: 실린 표본(judge keep)의 감사 keep 비율 */
export function gateOf(keepIds, dropIds, audit) {
  const agreeKeep = keepIds.filter((id) => audit[id] === 'keep').length;
  const agreeDrop = dropIds.filter((id) => audit[id] === 'drop').length;
  const keepRate = keepIds.length ? agreeKeep / keepIds.length : null;
  return { keep: { n: keepIds.length, agree: agreeKeep, rate: keepRate }, drop: { n: dropIds.length, agree: agreeDrop, rate: dropIds.length ? agreeDrop / dropIds.length : null }, pass: keepRate !== null && keepRate >= GATE };
}

// ── 그 밖 ──
export const hash = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 10);
export const km = (a, b) => {
  const r = Math.PI / 180;
  return 6371 * Math.hypot((b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), (b.lat - a.lat) * r);
};
export const HOOD_KM = 0.7;
/** 동네(hoods-01 중심 700m 안) 또는 구 */
export function whereOf(p, hoods, address) {
  const h = hoods.map((x) => ({ x, d: km(x, p) })).sort((a, b) => a.d - b.d)[0];
  return h && h.d <= HOOD_KM ? { hood: h.x.name, where: h.x.name } : { where: String(address ?? '').split(' ')[1] ?? '' };
}
export const strip = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
/** 블로그 postdate 20261105, 뉴스 pubDate RFC 822 → YYYY-MM-DD (KST) */
export function dayOf(i) {
  if (/^\d{8}$/.test(i.postdate ?? '')) return `${i.postdate.slice(0, 4)}-${i.postdate.slice(4, 6)}-${i.postdate.slice(6, 8)}`;
  const t = Date.parse(i.pubDate ?? '');
  return Number.isNaN(t) ? '' : kstDay(new Date(t));
}
