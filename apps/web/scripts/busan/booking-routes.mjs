/**
 * 부산 체험 예약 경로 조사 S4b (plans/busan.md S4b, ADR-0074, 사전등록 review/busan/booking/criteria.md).
 *
 *   node scripts/busan/booking-routes.mjs     → review/busan/raw/intro/*.json, review/busan/booking/routes.json
 *
 * 결과 생성 실행이라 한 번 돌린다. 이미 쓴 routes.json이 있으면 아무것도 부르지 않고 멈춘다.
 * 규칙 함수는 export(tests/busan-booking.test.ts). 키는 저장소 루트 .env의 DATA_GO_KR_SERVICE_KEY, 어디에도 남기지 않는다.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callsOn, DAY_LIMIT, kstDay, tourApi } from './collect.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const busanDir = resolve(webRoot, 'review/busan');
export const ROUTES = resolve(busanDir, 'booking/routes.json');
export const SEARCH_CAP = 57; // criteria 2절: 60 − 파서 맞추기 3
export const RADIUS_M = 300;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** criteria 2절: 괄호와 그 안 글자를 지우고 공백 하나로, 뒤에 ` 부산`. */
export const queryOf = (name) => `${String(name).replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim() || name} 부산`;

/** criteria 3절 이름 다듬기: 다듬은 값과 머리말 뗀 값. */
export function nameForms(name) {
  const base = String(name)
    .normalize('NFKC')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/[\s·,./&'\-_]/g, '')
    .toLowerCase();
  const out = new Set([base]);
  let s = base;
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of ['부산광역시', '부산', '주식회사']) {
      if (s.startsWith(p) && s.length > p.length) {
        s = s.slice(p.length);
        out.add(s);
        changed = true;
      }
    }
  }
  return [...out].filter(Boolean);
}

/** 이름이 맞다: 같거나, 한쪽이 다른 쪽을 품고 짧은 쪽이 두 글자 이상. */
export function namesMatch(a, b) {
  for (const x of nameForms(a))
    for (const y of nameForms(b)) {
      if (x === y) return true;
      const [short, long] = x.length <= y.length ? [x, y] : [y, x];
      if ([...short].length >= 2 && long.includes(short)) return true;
    }
  return false;
}

export function metres(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** criteria 3절 phone: 칸의 첫 번호, 꼴이 맞으면 `tel:` + 숫자. */
export function phoneOf(text) {
  for (const m of String(text ?? '').matchAll(/(?<!\d)(050\d[-.\s]?\d{4}[-.\s]?\d{4}|0\d{1,2}[-.)\s]?\d{3,4}[-.\s]?\d{4}|1[568]\d{2}[-.\s]?\d{4})(?!\d)/g)) {
    const d = m[1].replace(/\D/g, '');
    if (/^0\d{8,10}$/.test(d) || /^050\d{9}$/.test(d) || /^1[568]\d{6}$/.test(d)) return `tel:${d}`;
  }
  return null;
}

/** 칸 글자에 들어 있는 주소들(원문 순서). 스킴 없는 `www.`에는 https://를 붙인다. */
export function urlsIn(text) {
  const s = String(text ?? '').replace(/&amp;/g, '&');
  const out = [];
  for (const m of s.matchAll(/https?:\/\/[^\s"'<>]+|(?<![\w/.])www\.[^\s"'<>]+/gi)) {
    let u = m[0].replace(/[),.;]+$/, '');
    // 「공식 홈페이지 https://a.kr/공식 인스타그램 …」처럼 붙어 쓴 한글 꼬리는 주소가 아니다(호스트의 한글 도메인은 둔다)
    const at = u.search(/[^:/]\/|$/) + 1;
    u = u.slice(0, at) + u.slice(at).replace(/[가-힣].*$/, '');
    u = u.replace(/^(https?:\/\/[^/]*?\.[a-z]{2,})[가-힣].*$/i, '$1/'); // 「http://a.co.kr공식 …」
    if (/^www\./i.test(u)) u = `https://${u}`;
    try {
      const url = new URL(u);
      if (!out.includes(url.href)) out.push(url.href);
    } catch {
      /* 주소 꼴 아님 */
    }
  }
  return out;
}

const SNS = /(^|\.)(instagram\.com|facebook\.com|youtube\.com|youtu\.be|litt\.ly|linktr\.ee|inpock\.co\.kr|tiktok\.com|twitter\.com|x\.com)$|^(blog|cafe|smartstore|m\.blog|m\.cafe)\.naver\.com$|^(open|pf)\.kakao\.com$/;
/** criteria 3절: SNS·블로그·링크 모음·관광 안내·지자체 포털이면 그 까닭, 아니면 null. */
export function snsOrPortal(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return 'not a url';
  }
  const host = u.hostname.toLowerCase();
  if (SNS.test(host)) return 'sns';
  if (/(^|\.)visitbusan\.net$/.test(host)) return 'portal';
  if (/^(www\.)?busan\.go\.kr$/.test(host)) return 'portal';
  if (/^(www\.)?(bsjunggu|bsseogu|bsdonggu|yeongdo|busanjin|dongnae|bsnamgu|bsbukgu|haeundae|saha|geumjeong|bsgangseo|yeonje|suyeong|sasang|gijang)\.go\.kr$/.test(host)) return 'portal';
  return null;
}

const strip = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
const titleOf = (html) => (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();
const PARKED = /hugedomains|sedoparking|this domain (is|may be) for sale|도메인을 구매|domain is parked|godaddy\.com\/domainsearch|parkingcrew/i;

/** 텍스트에 이름이 있는가(다듬은 꼴로 견줌). */
export function textHasName(text, names) {
  const flat = String(text).normalize('NFKC').replace(/[\s·,./&'\-_]/g, '').toLowerCase();
  return names.some((n) => nameForms(n).some((f) => [...f].length >= 2 && flat.includes(f)));
}

/** criteria 3절 homepage 판정. `res`는 { status, url, html } 또는 { error }. */
export function homepageVerdict(url, res, names) {
  const why = snsOrPortal(url) ?? (res.url ? snsOrPortal(res.url) : null);
  if (why) return { verdict: 'rejected-sns', note: why };
  if (res.error) return { verdict: 'rejected-dead', note: res.error };
  if (res.status === 403 || res.status === 429) return { verdict: 'uncertain', note: `HTTP ${res.status}` };
  if (res.status >= 400) return { verdict: 'rejected-dead', note: `HTTP ${res.status}` };
  const title = titleOf(res.html);
  const body = strip(res.html).slice(0, 200000);
  if (PARKED.test(title) || PARKED.test(body.slice(0, 5000))) return { verdict: 'rejected-dead', note: `주차 도메인, 제목 '${title}'` };
  if (textHasName(`${title} ${body}`, names)) return { verdict: 'accepted', note: `HTTP ${res.status}, 최종 ${res.url}, 제목 '${title}'` };
  return { verdict: 'uncertain', note: `HTTP ${res.status}, 최종 ${res.url}, 제목 '${title}', 이름 없음` };
}

/** 주소에서 시·구 다음 두 낱말(도로명이나 동·번지). */
export function addressWords(addr) {
  const w = String(addr ?? '').split(/\s+/).filter(Boolean);
  const i = w.findIndex((x) => /(구|군)$/.test(x) && !/^부산/.test(x));
  return i >= 0 ? w.slice(i + 1, i + 3) : [];
}

/** criteria 3절 naver 판정. */
export function naverBookingVerdict(res, names, addr) {
  if (res.error) return { verdict: 'rejected-dead', note: res.error };
  if (res.status !== 200) return { verdict: res.status === 403 || res.status === 429 ? 'uncertain' : 'rejected-dead', note: `HTTP ${res.status}` };
  if (!/(^|\.)booking\.naver\.com$/.test(new URL(res.url).hostname)) return { verdict: 'rejected-dead', note: `최종 ${res.url}` };
  const title = titleOf(res.html);
  const m = title.match(/^네이버 예약\s*::\s*(.+)$/);
  if (m && names.some((n) => namesMatch(n, m[1]))) return { verdict: 'accepted', note: `HTTP 200, 최종 ${res.url}, 제목 '${title}'` };
  const words = addressWords(addr);
  const body = strip(res.html);
  if (words.length === 2 && words.every((w) => body.includes(w))) return { verdict: 'accepted', note: `HTTP 200, 최종 ${res.url}, 제목 '${title}', 본문 주소 '${words.join(' ')}'` };
  return { verdict: 'rejected-dead', note: `HTTP 200, 제목 '${title}', 이름·주소 없음` };
}

/** 네이버 검색 쪽의 __APOLLO_STATE__ → 장소들 { name, lat, lng, phone, booking, homepage, closed }. */
export function naverPlaces(html) {
  const i = html.indexOf('__APOLLO_STATE__');
  if (i < 0) return null;
  const start = html.indexOf('{', i);
  // 첫 `{`와 짝이 맞는 `}`까지(문자열 안의 괄호는 세지 않는다)
  let depth = 0;
  let inStr = false;
  let end = start;
  for (; end < html.length; end++) {
    const c = html[end];
    if (inStr) {
      if (c === '\\') end++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) break;
  }
  const state = JSON.parse(html.slice(start, end + 1));
  const deref = (v) => (v && v.__ref ? state[v.__ref] : v);
  const out = [];
  const root = state.ROOT_QUERY ?? {};
  // 한 곳 결과: placeDetail
  for (const [k, v] of Object.entries(root)) {
    if (!k.startsWith('placeDetail(')) continue;
    const base = deref(v?.base);
    if (!base?.name) continue;
    const c = base.coordinate ?? {};
    const status = (v.newBusinessHours ?? []).map((h) => h?.businessStatusDescription?.status ?? '').join(' ');
    out.push({
      name: base.name,
      lat: Number(c.y),
      lng: Number(c.x),
      address: base.roadAddress || base.address || '',
      phone: base.phone || base.virtualPhone || null,
      booking: v.naverBooking?.naverBookingUrl ?? null,
      homepage: v.homepages?.repr?.url ?? null,
      closed: /폐업|휴업|폐점/.test(`${base.name} ${status}`),
    });
  }
  // 여러 곳 결과: 목록 항목
  for (const v of Object.values(state)) {
    // 이름과 좌표가 있는 항목 모두(광고·사진·길찾기 항목은 뺀다)
    if (!v || typeof v !== 'object' || typeof v.name !== 'string' || /Ad[A-Z]|Ad$|^(Panorama|BusStation|SubwayStation|InnerRoute|PlaceDetailBase)$|Review/.test(v.__typename ?? '')) continue;
    const x = Number(v.x ?? v.longitude ?? v.coordinate?.x);
    const y = Number(v.y ?? v.latitude ?? v.coordinate?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !x || !y) continue;
    out.push({
      name: v.name,
      lat: y,
      lng: x,
      address: v.roadAddress || v.address || v.commonAddress || '',
      phone: v.phone || v.virtualPhone || null,
      booking: v.bookingUrl || v.naverBookingUrl || null,
      homepage: typeof v.homepage === 'string' ? v.homepage : null,
      closed: /폐업|휴업|폐점/.test(`${v.name} ${v.businessStatus?.status?.text ?? v.newBusinessHours?.status ?? ''}`),
    });
  }
  return out;
}

/** 맞은 네이버 장소: 이름이 맞고 300m 이내 가운데 가장 가까운 곳. */
export function matchNaver(places, spot) {
  const near = (places ?? [])
    .map((p) => ({ p, d: metres(spot, p) }))
    .filter(({ p, d }) => d <= RADIUS_M && namesMatch(spot.name, p.name))
    .sort((a, b) => a.d - b.d);
  return near[0] ? { ...near[0].p, distance: Math.round(near[0].d) } : null;
}

export const KINDS = ['naver', 'homepage', 'phone'];
/** criteria 3절 best·경로 없음. */
export function decide(routes, naver, naverFailed) {
  for (const k of KINDS) {
    const r = routes.find((x) => x.kind === k && x.verdict === 'accepted');
    if (r) return { best: k };
  }
  if (naver?.closed) return { best: null, call: 'closed', reason: `closed: 맞은 네이버 장소 '${naver.name}'에 폐업·휴업 표시` };
  const seen = routes.map((r) => `${r.kind} ${r.verdict}`).join(', ') || '후보 없음';
  return { best: null, call: 'noroute', reason: `noroute: 확인된 경로 없음(${seen})${naverFailed ? ', 네이버 확인 실패' : naver ? '' : ', 네이버에서 맞는 장소 없음'}` };
}

// ---------------------------------------------------------------- 실행

function env(key) {
  for (const line of readFileSync(resolve(webRoot, '../../.env'), 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq > 0 && line.slice(0, eq).trim() === key) return line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const INFO = /^infocenter/;
const RESERV = /reserv/i;

async function get(url) {
  try {
    const ctl = AbortSignal.timeout(20000);
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko' }, redirect: 'follow', signal: ctl });
    const buf = Buffer.from(await res.arrayBuffer());
    let html = buf.toString('utf8');
    if (/charset=["']?(euc-kr|ks_c_5601)/i.test(html.slice(0, 3000)) || /euc-kr/i.test(res.headers.get('content-type') ?? '')) html = new TextDecoder('euc-kr').decode(buf);
    return { status: res.status, url: res.url, html };
  } catch (e) {
    return { error: `연결 실패 ${e.cause?.code ?? e.name}` };
  }
}

async function main() {
  if (existsSync(ROUTES)) throw new Error('routes.json이 이미 있다 — 한 번만 돌린다(criteria 5절)');
  const spots = readJson(resolve(webRoot, 'public/spots-busan.json')).filter((s) => s.mood === 'new' && s.sub === 'do');
  const logPath = resolve(busanDir, 'booking/calls.log');
  const tourLog = resolve(busanDir, 'raw/calls.log');
  const introDir = resolve(busanDir, 'raw/intro');
  mkdirSync(introDir, { recursive: true });
  const key = env('DATA_GO_KR_SERVICE_KEY');
  if (!key) throw new Error('DATA_GO_KR_SERVICE_KEY missing');
  const api = tourApi(key);
  const log = (kind, id, result) => appendFileSync(logPath, `${kstDay()}\t${new Date().toISOString()}\t${kind}\t${id}\t${result}\n`);
  const counts = { search: 0, get: 0, tourapi: 0 };
  const out = {};
  let naverFailed = 0;

  for (const s of spots) {
    const cid = s.id.slice(3);
    const common = readJson(resolve(busanDir, 'raw/detail', `${cid}.json`)).body.response.body.items.item[0];
    // TourAPI detailIntro2
    const introPath = resolve(introDir, `${cid}.json`);
    let intro;
    if (existsSync(introPath)) intro = readJson(introPath).item;
    else {
      const used = callsOn(readFileSync(tourLog, 'utf8'), kstDay());
      if (used >= DAY_LIMIT) throw new Error(`TourAPI KST 하루 ${DAY_LIMIT}회 한도`);
      let status = 'ok';
      try {
        const body = await api('detailIntro2', { contentId: cid, contentTypeId: common.contenttypeid });
        if (body?.response?.header?.resultCode !== '0000') status = `resultCode ${body?.response?.header?.resultCode}`;
        intro = body?.response?.body?.items?.item?.[0] ?? {};
        if (status === 'ok') writeFileSync(introPath, `${JSON.stringify({ contentid: cid, fetchedAt: new Date().toISOString(), item: intro }, null, 1)}\n`);
      } catch (e) {
        status = 'error';
        intro = {};
      }
      counts.tourapi += 1;
      appendFileSync(tourLog, `${kstDay()}\t${new Date().toISOString()}\tdetailIntro2\t${cid}\t${status}\n`);
    }

    // 네이버 검색 1회(응답을 못 받으면 한 번 더, 상한 안)
    let places = null;
    let failed = false;
    for (let attempt = 0; attempt < 2 && places === null; attempt++) {
      if (counts.search >= SEARCH_CAP) {
        failed = true;
        break;
      }
      if (counts.search) await sleep(2500);
      counts.search += 1;
      const res = await get(`https://m.search.naver.com/search.naver?query=${encodeURIComponent(queryOf(s.name))}`);
      if (res.status === 401 || res.status === 403) {
        log('naver-search', s.id, `HTTP ${res.status} stop`);
        throw new Error(`네이버 검색 HTTP ${res.status} — 멈춤`);
      }
      if (res.error || res.status >= 429) {
        log('naver-search', s.id, res.error ?? `HTTP ${res.status}`);
        continue;
      }
      try {
        places = naverPlaces(res.html) ?? [];
        log('naver-search', s.id, `ok ${places.length} places`);
      } catch (e) {
        log('naver-search', s.id, `parse ${e.message.slice(0, 60)}`);
        places = null;
        break;
      }
    }
    if (places === null) {
      failed = true;
      naverFailed += 1;
    }
    const naver = places ? matchNaver(places, s) : null;
    const names = [s.name, ...(naver ? [naver.name] : [])];
    const routes = [];
    const fetchRoute = async (url) => {
      counts.get += 1;
      await sleep(800);
      const r = await get(url);
      log('get', s.id, r.error ?? `HTTP ${r.status}`);
      return r;
    };

    if (naver?.booking) {
      const u = naver.booking.startsWith('http') ? naver.booking : `https://m.booking.naver.com${naver.booking}`;
      if (/(^|\.)booking\.naver\.com$/.test(new URL(u).hostname)) {
        const r = await fetchRoute(u);
        const v = naverBookingVerdict(r, names, common.addr1);
        routes.push({ kind: 'naver', url: r.url && v.verdict === 'accepted' ? r.url : u, evidence: `네이버 검색 '${queryOf(s.name)}' → '${naver.name}'(${naver.address}), 좌표 ${naver.distance}m / ${v.note}`, verdict: v.verdict });
      }
    }
    const intro_ = intro ?? {};
    const reservText = Object.entries(intro_).filter(([k]) => RESERV.test(k)).map(([, v]) => v).join(' ');
    const candidates = [
      ...urlsIn(common.homepage).map((u) => [u, 'TourAPI homepage']),
      ...urlsIn(reservText).map((u) => [u, 'TourAPI 예약 안내']),
      ...(naver?.homepage ? urlsIn(naver.homepage).map((u) => [u, `네이버 장소 '${naver.name}' 홈페이지`]) : []),
    ].filter(([u], i, a) => a.findIndex(([w]) => w === u) === i);
    for (const [u, from] of candidates) {
      const pre = snsOrPortal(u);
      const r = pre ? {} : await fetchRoute(u);
      const v = homepageVerdict(u, r, names);
      routes.push({ kind: 'homepage', url: u, evidence: `${from} / ${v.note}`, verdict: v.verdict });
    }
    const infoText = Object.entries(intro_).filter(([k]) => INFO.test(k)).map(([, v]) => v).join(' ');
    const tourTel = phoneOf(infoText);
    if (tourTel) routes.push({ kind: 'phone', url: tourTel, evidence: `TourAPI 문의 전화 '${infoText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)}' (번호 꼴만 확인, 통화는 안 함)`, verdict: 'accepted' });
    const naverTel = naver ? phoneOf(naver.phone) : null;
    if (naverTel && naverTel !== tourTel) routes.push({ kind: 'phone', url: naverTel, evidence: `네이버 장소 '${naver.name}' 전화 ${naver.phone} (번호 꼴만 확인, 통화는 안 함)`, verdict: 'accepted' });

    const d = decide(routes, naver, failed);
    out[s.id] = { name: s.name, contenttypeid: Number(common.contenttypeid), naver: failed ? 'failed' : naver ? 'matched' : 'none', routes, best: d.best, ...(d.call ? { call: d.call, reason: d.reason } : {}) };
    console.log(`${s.id} ${s.name}: ${d.best ?? d.call}`);
  }

  const values = Object.values(out);
  const byBest = Object.fromEntries([...KINDS, 'closed', 'noroute'].map((k) => [k, values.filter((v) => (v.best ?? v.call) === k).length]));
  const doc = {
    meta: { criteria: 'review/busan/booking/criteria.md', checkedAt: kstDay(), targets: spots.length, calls: counts, naverFailed, byBest, stopped: naverFailed > 10 ? 'naver 응답 실패 10곳 넘음(criteria 5절)' : null },
    spots: out,
  };
  writeFileSync(ROUTES, `${JSON.stringify(doc, null, 1)}\n`);
  console.log(JSON.stringify(doc.meta));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
