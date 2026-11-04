// 트렌드 02 출처 조회 (00-preregistration.md 「새 출처」): S4 서울시 문화행사, S5 네이버 뉴스. 한 번만 돌린다.
// 키는 저장소 루트 .env에서 읽고 어디에도 남기지 않는다. 결과: 02-sources.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = (k) => {
  for (const line of readFileSync(resolve(here, '../../../.env'), 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && line.slice(0, i).trim() === k) return line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
};
const AREAS = { 성수: { lat: 37.5446, lng: 127.056 }, 홍대: { lat: 37.5572, lng: 126.9245 }, 이태원: { lat: 37.5345, lng: 126.9946 } };
const GU = { 성동구: '성수', 마포구: '홍대', 용산구: '이태원' };
const DAY = '2026-11-05';
const km = (a, b) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const areaOf = (p) => Object.entries(AREAS).find(([, c]) => km(c, p) <= 1.5)?.[0] ?? null;
const calls = { seoul: 0, naver: 0 };
const errors = [];
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function s4() {
  const key = env('SEOUL_OPEN_API_KEY');
  const out = [];
  let total = Infinity;
  for (let from = 1; from <= total && calls.seoul < 25; from += 1000) {
    calls.seoul++;
    try {
      const r = await fetch(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/culturalEventInfo/${from}/${from + 999}/`);
      const b = (await r.json()).culturalEventInfo;
      if (!b?.row) throw new Error(`no rows at ${from}: ${JSON.stringify(b?.RESULT ?? null)}`);
      total = Number(b.list_total_count);
      for (const e of b.row) {
        const start = String(e.STRTDATE).slice(0, 10);
        const end = String(e.END_DATE).slice(0, 10);
        if (!(start <= DAY && DAY <= end)) continue;
        const lat = Number(e.LAT);
        const lng = Number(e.LOT);
        const has = Number.isFinite(lat) && Number.isFinite(lng) && lat > 30 && lng > 120;
        const area = has ? areaOf({ lat, lng }) : null;
        // 좌표가 없으면 자치구로 남겨 판정 에이전트가 본다
        if (area || (!has && GU[e.GUNAME])) out.push({ area: area ?? `${GU[e.GUNAME]}?(좌표 없음)`, name: e.TITLE, place: e.PLACE, gu: e.GUNAME, kind: e.CODENAME, start, end, link: e.ORG_LINK || e.HMPG_ADDR, coords: has });
      }
    } catch (e) {
      errors.push(`seoul from ${from}: ${String(e.message).split(key).join('<key>')}`);
      break;
    }
  }
  return { total, rows: out };
}

async function s5() {
  const id = env('NAVER_CLIENT_ID');
  const secret = env('NAVER_CLIENT_SECRET');
  const out = [];
  for (const [area, query] of [['성수', '성수 팝업'], ['홍대', '홍대 팝업'], ['이태원', '이태원 팝업'], ['이태원', '한남 팝업']]) {
    calls.naver++;
    try {
      const q = new URLSearchParams({ query, display: '100', sort: 'date' });
      const body = await (await fetch(`https://openapi.naver.com/v1/search/news.json?${q}`, { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } })).json();
      for (const i of body.items ?? []) {
        const d = new Date(i.pubDate);
        if (!(d >= new Date('2026-10-01T00:00:00+09:00'))) continue;
        out.push({ area, query, date: d.toISOString().slice(0, 10), title: strip(i.title), desc: strip(i.description), link: i.originallink || i.link });
      }
    } catch (e) {
      errors.push(`naver news ${query}: ${e.message}`);
    }
  }
  return out;
}

const result = { startedAt: new Date().toISOString(), day: DAY, areas: AREAS, s4: await s4(), s5: await s5(), calls, errors };
writeFileSync(resolve(here, '02-sources.json'), `${JSON.stringify(result, null, 1)}\n`);
console.log(JSON.stringify({ s4total: result.s4.total, s4: result.s4.rows.length, s5: result.s5.length, calls, errors }));
