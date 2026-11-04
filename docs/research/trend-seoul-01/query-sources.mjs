// 트렌드 01 출처 조회 (00-preregistration.md 「출처」): S1 TourAPI, S2 카카오 로컬, S3 네이버 블로그. 한 번만 돌린다.
// 키는 저장소 루트 .env에서 읽고 어디에도 남기지 않는다. 결과: 02-sources.json(원문 요약)과 호출 수.
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
const DAY = '20261105';
const km = (a, b) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const areaOf = (p) => Object.entries(AREAS).find(([, c]) => km(c, p) <= 1.5)?.[0] ?? null;
const calls = { tour: 0, kakao: 0, naver: 0 };
const errors = [];
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// S1 TourAPI searchFestival2 (서울, 기간이 11-05를 품는 것, 반경 안)
async function s1() {
  const key = env('DATA_GO_KR_SERVICE_KEY');
  const enc = /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
  const out = [];
  for (let page = 1; page <= 3 && calls.tour < 20; page++) {
    const q = new URLSearchParams({ MobileOS: 'ETC', MobileApp: 'yeochana', _type: 'json', eventStartDate: '20260101', lDongRegnCd: '11', numOfRows: '500', pageNo: String(page), arrange: 'A' });
    calls.tour++;
    try {
      const body = await (await fetch(`https://apis.data.go.kr/B551011/KorService2/searchFestival2?serviceKey=${enc}&${q}`)).json();
      const items = [body?.response?.body?.items?.item ?? []].flat();
      for (const i of items) {
        const p = { lat: Number(i.mapy), lng: Number(i.mapx) };
        const area = areaOf(p);
        const open = String(i.eventstartdate) <= DAY && String(i.eventenddate) >= DAY;
        if (area && open) out.push({ area, name: i.title, addr: i.addr1, start: i.eventstartdate, end: i.eventenddate, contentid: i.contentid });
      }
      const total = Number(body?.response?.body?.totalCount ?? 0);
      if (page * 500 >= total) break;
    } catch (e) {
      errors.push(`tour p${page}: ${String(e.message).split(key).join('<key>')}`);
      break;
    }
  }
  return out;
}

// S2 카카오 로컬 키워드 「팝업」·「팝업스토어」, 반경 1.5km, 최대 3쪽
async function s2() {
  const key = env('KAKAO_REST_API_KEY');
  const out = new Map();
  for (const [area, c] of Object.entries(AREAS)) {
    for (const query of ['팝업', '팝업스토어']) {
      for (let page = 1; page <= 3 && calls.kakao < 30; page++) {
        calls.kakao++;
        try {
          const q = new URLSearchParams({ query, x: String(c.lng), y: String(c.lat), radius: '1500', page: String(page), size: '15', sort: 'distance' });
          const body = await (await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${q}`, { headers: { Authorization: `KakaoAK ${key}` } })).json();
          for (const d of body.documents ?? []) out.set(d.id, { area, name: d.place_name, addr: d.road_address_name || d.address_name, category: d.category_name, distance_m: Number(d.distance), url: d.place_url });
          if (body.meta?.is_end) break;
        } catch (e) {
          errors.push(`kakao ${area} ${query} p${page}: ${e.message}`);
          break;
        }
      }
    }
  }
  return [...out.values()];
}

// S3 네이버 블로그, 최신순 100건, 2026-10-22 이후
async function s3() {
  const id = env('NAVER_CLIENT_ID');
  const secret = env('NAVER_CLIENT_SECRET');
  const out = [];
  for (const [area, query] of [['성수', '성수 팝업'], ['홍대', '홍대 팝업'], ['이태원', '이태원 팝업'], ['이태원', '한남 팝업']]) {
    calls.naver++;
    try {
      const q = new URLSearchParams({ query, display: '100', sort: 'date' });
      const body = await (await fetch(`https://openapi.naver.com/v1/search/blog.json?${q}`, { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } })).json();
      for (const i of body.items ?? []) {
        if (String(i.postdate) < '20261022') continue;
        const title = strip(i.title);
        const desc = strip(i.description);
        // 이름 후보: 「… 팝업」 앞 1~3어절 (규칙, 애매한 것도 후보로만 남긴다)
        const cands = [...`${title} ${desc}`.matchAll(/((?:[^\s,.!?'"()[\]「」]+\s){0,2}[^\s,.!?'"()[\]「」]+)\s*팝업(?:스토어)?/g)].map((m) => m[1]);
        out.push({ area, query, date: i.postdate, title, desc, link: i.link, cands: [...new Set(cands)] });
      }
    } catch (e) {
      errors.push(`naver ${query}: ${e.message}`);
    }
  }
  return out;
}

const startedAt = new Date().toISOString();
const result = { startedAt, day: DAY, areas: AREAS, s1: await s1(), s2: await s2(), s3: await s3(), calls, errors };
writeFileSync(resolve(here, '02-sources.json'), `${JSON.stringify(result, null, 1)}\n`);
console.log(JSON.stringify({ s1: result.s1.length, s2: result.s2.length, s3: result.s3.length, calls, errors }));
