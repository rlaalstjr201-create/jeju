// 주간 순위 운영(ADR-0079) — 순수 함수. gsc-import.mjs·indexnow.mjs가 쓰고 tests/seo-rank-ops.test.ts가 검증한다.
//
// 정직성(ADR-0079 6): 모르는 값은 비워 둔다. 0이나 「없음」으로 채우지 않는다 — pivotOf가 0을 실제 관측으로 읽는다.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s) => typeof s === 'string' && DAY.test(s) && !Number.isNaN(Date.parse(s));
const nonNegInt = (n) => Number.isInteger(n) && n >= 0;

/** GSC 실적 화면에서 옮긴 CTR — 0~1 숫자 또는 "3.2%" 문자열. 못 읽으면 null. */
function ctrOf(v) {
  if (typeof v === 'number' && v >= 0 && v <= 1) return v;
  const m = typeof v === 'string' && v.trim().match(/^(\d+(?:\.\d+)?)\s*%$/);
  return m && Number(m[1]) <= 100 ? Number(m[1]) / 100 : null;
}

/**
 * 주간 작업이 GSC 「실적 → 검색어」 화면에서 옮겨 적은 파일을 검증한다.
 * doc: { date_range: { start, end }, rows: [{ query, clicks, impressions, ctr, position }] }
 * → { errors, rows }  (errors가 있으면 rows를 쓰지 않는다)
 */
export function validateGscExport(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return { errors: ['JSON 객체가 아니다'], rows: [] };
  const r = doc.date_range || {};
  if (!isDay(r.start) || !isDay(r.end)) errors.push('date_range.start·end가 YYYY-MM-DD가 아니다');
  else if (r.start > r.end) errors.push(`date_range ${r.start} > ${r.end}`);
  if (!Array.isArray(doc.rows)) return { errors: [...errors, 'rows 배열이 없다'], rows: [] };
  const rows = [];
  const seen = new Set();
  doc.rows.forEach((x, i) => {
    const at = `rows[${i}]`;
    const q = typeof x?.query === 'string' ? x.query.trim() : '';
    if (!q) { errors.push(`${at} query 없음`); return; }
    if (seen.has(q)) errors.push(`${at} 「${q}」 중복`);
    seen.add(q);
    if (!nonNegInt(x.clicks)) errors.push(`${at} 「${q}」 clicks가 0 이상 정수가 아니다`);
    if (!nonNegInt(x.impressions)) errors.push(`${at} 「${q}」 impressions가 0 이상 정수가 아니다`);
    else if (nonNegInt(x.clicks) && x.clicks > x.impressions) errors.push(`${at} 「${q}」 clicks > impressions`);
    const ctr = ctrOf(x.ctr);
    if (ctr === null) errors.push(`${at} 「${q}」 ctr를 읽을 수 없다(0~1 또는 "n%")`);
    if (typeof x.position !== 'number' || !(x.position >= 1)) errors.push(`${at} 「${q}」 position이 1 이상 숫자가 아니다`);
    rows.push({ query: q, clicks: x.clicks, impressions: x.impressions, ctr, position: x.position });
  });
  return { errors, rows: errors.length ? [] : rows };
}

/** 검색어 비교 키 — 공백·대소문자 차이로 같은 검색어를 놓치지 않는다. */
export const normQuery = (q) => String(q).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * target마다 이번 주 track 한 줄을 만든다.
 * gscRows: validateGscExport rows | null(GSC 읽기 실패·파일 없음) · naver: rank-naver 결과 파일 | null
 * → [{ query, line }]  line: { week, google_pos?, impressions?, clicks?, gsc?, naver_pos?, naver_block?, naver? }
 *   gsc: 'absent'(파일에 그 검색어 행이 없다 — 노출 0일 수도, 익명 처리일 수도) | 'check_failed'
 *   naver: 'found' | 'not_found' | 'check_failed' — naver_pos는 found일 때만(블록 안 순위)
 */
export function trackLinesOf(candidates, week, gscRows, naver) {
  const g = new Map((gscRows || []).map((r) => [normQuery(r.query), r]));
  const n = new Map(((naver && naver.results) || []).map((r) => [normQuery(r.query), r]));
  return candidates.filter((c) => c.verdict === 'target').map((c) => {
    const line = { week };
    if (!gscRows) line.gsc = 'check_failed';
    else {
      const r = g.get(normQuery(c.query));
      if (r) Object.assign(line, { google_pos: Math.round(r.position * 10) / 10, impressions: r.impressions, clicks: r.clicks });
      else line.gsc = 'absent';
    }
    if (naver) {
      const r = n.get(normQuery(c.query));
      if (!r) line.naver = 'check_failed';
      else if (r.status === 'check_failed') line.naver = 'check_failed';
      else if (r.found) Object.assign(line, { naver: 'found', naver_pos: r.position_in_block, naver_block: r.block });
      else line.naver = 'not_found';
    }
    return { query: c.query, line };
  });
}

/** track에 줄을 넣는다. 같은 week 줄이 있으면 바꾼다(같은 주 가져오기를 다시 해도 줄이 늘지 않는다). */
export function appendTrack(c, line) {
  const track = (c.track || []).filter((t) => t.week !== line.week);
  track.push(line);
  track.sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));
  return { ...c, track };
}

/** 「10위 밖」으로 볼 수 있는 상태 — 순위가 있거나, 확실히 못 찾았거나. 확인 실패는 판단하지 않는다(null). */
function posOf(t, engine) {
  if (engine === 'google') return typeof t.google_pos === 'number' ? t.google_pos : null;
  if (typeof t.naver_pos === 'number') return t.naver_pos;
  return t.naver === 'not_found' ? Infinity : null;
}

/**
 * 「밀림」 경보(ADR-0079 2): 지난주보다 3계단 넘게 내려가거나 10위 안에서 밖으로 나가면 경보.
 * 색인 4주 안(또는 색인일 미확인)은 판정하지 않는다(suppressed).
 * → { flagged: [{query, engine, from, to, why}], suppressed: [{query, why}] }
 */
export function dropsOf(candidates, today) {
  const flagged = [], suppressed = [];
  for (const c of candidates.filter((x) => x.verdict === 'target')) {
    const t = c.track || [];
    if (t.length < 2) continue;
    if (!c.indexed_at) { suppressed.push({ query: c.query, why: '색인일 미확인 — 판정하지 않는다' }); continue; }
    const weeks = Math.floor((Date.parse(today) - Date.parse(c.indexed_at)) / (7 * 864e5));
    if (weeks < 4) { suppressed.push({ query: c.query, why: `색인 ${weeks}주 — 4주 전에는 판정하지 않는다` }); continue; }
    const [prev, cur] = t.slice(-2);
    for (const engine of ['google', 'naver']) {
      const from = posOf(prev, engine), to = posOf(cur, engine);
      if (from === null || to === null || from === Infinity) continue;
      const fmt = (p) => (p === Infinity ? '못 찾음' : `${p}위`);
      if (from <= 10 && to > 10) flagged.push({ query: c.query, engine, from, to, why: `10위 안 → 밖 (${fmt(from)} → ${fmt(to)})` });
      else if (to - from > 3) flagged.push({ query: c.query, engine, from, to, why: `${Math.round((to - from) * 10) / 10}계단 하락 (${fmt(from)} → ${fmt(to)})` });
    }
  }
  return { flagged, suppressed };
}

/** sitemap.xml(urlset 또는 sitemapindex) → { urls: [{loc, lastmod}], sitemaps: [loc] } */
export function parseSitemap(xml) {
  const tag = (block, name) => (block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)) || [])[1]?.trim() ?? null;
  const unesc = (s) => s && s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const urls = [...String(xml).matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({ loc: unesc(tag(m[1], 'loc')), lastmod: tag(m[1], 'lastmod') })).filter((u) => u.loc);
  const sitemaps = [...String(xml).matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/g)].map((m) => unesc(tag(m[1], 'loc'))).filter(Boolean);
  return { urls, sitemaps };
}

/**
 * IndexNow 대상 — seed 이후 새로 생긴 URL과 lastmod가 바뀐 URL만. 사라진 URL은 알리지 않는다(목록만).
 * state: { urls: { [loc]: lastmod|null } } · current: [{loc, lastmod}]
 */
export function indexnowDiff(state, current) {
  const known = (state && state.urls) || {};
  const added = [], changed = [];
  const now = new Set();
  for (const u of current) {
    now.add(u.loc);
    if (!(u.loc in known)) added.push(u.loc);
    else if ((u.lastmod ?? null) !== (known[u.loc] ?? null)) changed.push(u.loc);
  }
  const removed = Object.keys(known).filter((l) => !now.has(l));
  return { added, changed, removed };
}
