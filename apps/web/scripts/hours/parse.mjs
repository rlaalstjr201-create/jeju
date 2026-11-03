/**
 * 영업시간 글 읽기 (specs/open-now.md 2): review/hours/raw/intro의 TourAPI 소개 글을 `hours`({ c?, o? })로 읽어
 * review/hours/hours.json(장소 id → hours, 원문 함께)에 쓴다. 확실히 읽히는 것만 쓰고, 나머지는 비운다(모르는 곳).
 * applyHours는 public/spots.json의 장소에 `hours`를 붙인다(build-spots.mjs 끝, 또는 이 파일을 직접 돌려 제자리에서).
 *
 *   node scripts/hours/parse.mjs        hours.json을 다시 쓰고 public/spots.json에 붙인다(멱등).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** TourAPI 종류별 이용시간·쉬는 날 칸. */
export const FIELDS = {
  12: ['usetime', 'restdate'],
  14: ['usetimeculture', 'restdateculture'],
  28: ['usetimeleports', 'restdateleports'],
  38: ['opentime', 'restdateshopping'],
  39: ['opentimefood', 'restdatefood'],
};
const DAYS = '일월화수목금토';
const clean = (t) =>
  String(t ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const toMin = (h, m) => Number(h) * 60 + Number(m);

/** 이용시간 글 → [시작, 끝](분) 또는 null. 상시 개방·24시간은 [0, 1440]. 준비시간·마지막 주문·입장/매표 마감과
 * ※ 뒤, 괄호 안은 빼고 남은 구간들의 가장 이른 시작~가장 늦은 끝(자정을 넘기면 1440 넘게). */
export function parseOpen(text) {
  const t = clean(text);
  if (!t) return null;
  // 「상시 개방」이 어디에 있든(쇠소깍 「체험 09:00~18:00 / 상시 개방」): 그곳 자체는 늘 열려 있다
  if (/상시\s*개방|^24\s*시간|^연중\s*상시/.test(t)) return [0, 1440];
  const body = t
    .split('※')[0]
    .replace(/[(（][^)）]*[)）]/g, ' ')
    .replace(/(준비\s*시간|브레이크\s*타임|휴게\s*시간|(점심|저녁)?\s*마지막\s*주문|라스트\s*오더|(입장|매표|발권)\s*마감)\s*:?\s*\d{1,2}:\d{2}(\s*~\s*\d{1,2}:\d{2})?/g, ' ');
  const ranges = [...body.matchAll(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/g)].map((m) => {
    const from = toMin(m[1], m[2]);
    let to = toMin(m[3], m[4]);
    if (to === from) return [from, -1]; // 「12:00~12:00」: 읽지 않는다
    if (to < from) to += 1440;
    return [from, to];
  });
  if (!ranges.length || ranges.some(([f, e]) => f >= 1440 || e < 0 || e > 2880)) return null;
  const from = Math.min(...ranges.map((r) => r[0]));
  const to = Math.max(...ranges.map((r) => r[1]));
  return to - from >= 1440 ? [0, 1440] : [from, to];
}

/** 쉬는 날 글 → 매주 쉬는 요일(0 = 일) 또는 null(모름). 「연중무휴」는 []. 「매주 X요일」·「X요일」·「주말」 조각만 읽고,
 * 매월·격주·N째·부정기·명절 조각은 건너뛴다. 읽을 수 없는 조각이 하나라도 있으면(문의·비정기 등) 모름. */
export function parseClosed(text) {
  const t = clean(text).split('※')[0].trim();
  if (!t) return null;
  if (/비정기|부정기|문의|변동|확인/.test(t)) return null;
  // 「(단, 월요일이 공휴일이면 …)」 같은 단서는 쪼개기 전에 뺀다(그 안의 쉼표로 갈라지지 않게)
  const plain = t.replace(/[(（][^)）]*[)）]/g, ' ');
  const days = new Set();
  let known = false;
  // 격주·매월·N째가 섞인 글은 조각마다 「매주」가 붙은 것만 읽는다(「격주 월, 화요일」의 화요일을 매주로 읽지 않게)
  const strict = /격주|매월|매달|째/.test(plain);
  for (const raw of plain.split(/[/,]|\s및\s/)) {
    // 「일요일~월요일」 같은 이어진 요일은 펼친다
    const piece = raw
      .replace(/휴무|휴관|휴원|휴일|정기/g, '')
      .replace(/([월화수목금토일])요일\s*~\s*([월화수목금토일])요일/g, (_, a, b) => {
        const out = [];
        for (let i = DAYS.indexOf(a); ; i = (i + 1) % 7) {
          out.push(DAYS[i]);
          if (DAYS[i] === b || out.length > 7) break;
        }
        return out.join(',');
      })
      .trim();
    if (!piece) continue;
    if (/^연중\s*무휴/.test(piece)) {
      known = true;
      continue;
    }
    if (/설|추석|명절|연휴|공휴일|매월|매달|격주|째|월\s*\d|\d+일/.test(piece)) continue;
    if (/^주말$/.test(piece)) {
      days.add(0).add(6);
      known = true;
      continue;
    }
    const m = /^(매주\s*)?([월화수목금토일](요일)?(\s*[,·]?\s*[월화수목금토일](요일)?)*)$/.exec(piece);
    if (!m) return null;
    if (strict && !m[1]) return null;
    for (const ch of m[2].replace(/요일/g, '')) if (DAYS.includes(ch)) days.add(DAYS.indexOf(ch));
    known = true;
  }
  return known ? [...days].sort() : null;
}

/** 소개 항목 하나 → { c?, o? } 또는 null(아무것도 모름). */
export function hoursOf(item) {
  const f = item && FIELDS[Number(item.contenttypeid)];
  if (!f) return null;
  const o = parseOpen(item[f[0]]);
  const c = parseClosed(item[f[1]]);
  // 매일 쉬는 곳은 없다: 일곱 요일이 다 나오면 잘못 읽은 것
  const h = { ...(c && c.length && c.length < 7 ? { c } : {}), ...(o ? { o } : {}) };
  return Object.keys(h).length ? h : null;
}

export function loadHours(path = resolve(webRoot, 'review/hours/hours.json')) {
  return existsSync(path) ? new Map(Object.entries(readJson(path).hours).map(([id, v]) => [id, v.hours])) : new Map();
}

/** spots에 `hours`를 붙인다(있던 것은 바꾼다, 없는 곳은 뗀다). 자리는 늘 `score` 바로 뒤: 뒤에 붙는 칸(철·노을·밤·유명한 곳·
 * 체험)을 붙이는 스크립트들이 각자 끝자리를 정하므로, 그 사이에 끼지 않는다. */
export function applyHours(spots, hours = loadHours()) {
  return spots.map((s) => {
    const { hours: _old, ...rest } = s;
    const h = hours.get(String(s.id));
    if (!h) return rest;
    const out = {};
    for (const [k, v] of Object.entries(rest)) {
      out[k] = v;
      if (k === 'score') out.hours = h;
    }
    if (!('hours' in out)) out.hours = h;
    return out;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(webRoot, 'review/hours');
  const match = readJson(resolve(dir, 'match.json')).items;
  const out = {};
  const counts = { matched: match.length, intro: 0, open: 0, closed: 0, any: 0 };
  for (const m of match) {
    const p = resolve(dir, 'raw/intro', `${m.contentid}.json`);
    if (!existsSync(p)) continue;
    const item = readJson(p).item;
    if (!item) continue;
    counts.intro++;
    const h = hoursOf(item);
    if (!h) continue;
    counts.any++;
    if (h.o) counts.open++;
    if (h.c) counts.closed++;
    const [u, r] = FIELDS[Number(item.contenttypeid)];
    out[m.id] = { contentid: m.contentid, hours: h, text: { open: clean(item[u]), closed: clean(item[r]) } };
  }
  writeFileSync(resolve(dir, 'hours.json'), `${JSON.stringify({ source: 'TourAPI KorService2 detailIntro2', counts, hours: out }, null, 1)}\n`);
  const spotsPath = resolve(webRoot, 'public/spots.json');
  const spots = applyHours(readJson(spotsPath), loadHours());
  writeFileSync(spotsPath, JSON.stringify(spots));
  console.log(JSON.stringify(counts));
}
