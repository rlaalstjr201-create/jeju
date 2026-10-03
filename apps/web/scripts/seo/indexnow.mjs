#!/usr/bin/env node
// IndexNow(ADR-0079 4) — 배포 뒤 바뀐 URL만 네이버와 IndexNow API에 알린다.
//
// 규칙: 네이버 공식 FAQ — 「IndexNow를 사용하기 시작한 이후 추가된 URL만」. 그래서 첫 실행은 seed다.
//   node scripts/seo/indexnow.mjs seed [--live]   지금 사이트맵의 URL·lastmod를 「이미 아는 것」으로 기록만(전송 0)
//   node scripts/seo/indexnow.mjs dry  [--live]   seed 이후 추가·변경된 URL 목록만(전송 0)
//   node scripts/seo/indexnow.mjs send [--live]   그 URL만 전송 → 상태 갱신. 키 파일이 라이브에 있어야 한다.
// 사이트맵: 기본 dist/sitemap.xml(빌드 결과 = 배포할 것) · --live면 https://yeogwi.pages.dev/sitemap.xml.
// 키: public/<32자 16진수>.txt (내용 = 키). 상태: data/seo/indexnow-state.json.
// 주의: lastmod가 사이트 전체 데이터 날짜 하나라 데이터를 갱신하면 전 URL이 「변경」이 된다 — dry로 먼저 본다.

import fs from 'node:fs';
import path from 'node:path';
import { APP, DATA, argOf, originOf } from './load-dist.mjs';
import { parseSitemap, indexnowDiff } from './rank-ops.mjs';

const [mode] = process.argv.slice(2);
const { has } = argOf(process.argv.slice(2));
if (!['seed', 'dry', 'send'].includes(mode)) { console.error('사용: indexnow.mjs seed|dry|send [--live]'); process.exit(2); }

const ORIGIN = originOf() || 'https://yeogwi.pages.dev';
const HOST = new URL(ORIGIN).host;
const STATE = path.join(DATA, 'indexnow-state.json');
const ENDPOINTS = ['https://searchadvisor.naver.com/indexnow', 'https://api.indexnow.org/indexnow'];
const MAX = 10000;

const keyFile = fs.readdirSync(path.join(APP, 'public')).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) { console.error('public/<키>.txt가 없다'); process.exit(1); }
const key = fs.readFileSync(path.join(APP, 'public', keyFile), 'utf8').trim();
if (`${key}.txt` !== keyFile) { console.error(`${keyFile} 내용이 파일 이름과 다르다`); process.exit(1); }

async function readSitemap(loc) {
  if (has('--live')) {
    const r = await fetch(loc, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`${loc} HTTP ${r.status}`);
    return r.text();
  }
  const f = path.join(APP, 'dist', new URL(loc).pathname.replace(/^\//, ''));
  if (!fs.existsSync(f)) throw new Error(`${path.relative(APP, f)} 없음 — 먼저 SITE_URL=${ORIGIN} npm run build`);
  return fs.readFileSync(f, 'utf8');
}

async function currentUrls() {
  const { urls, sitemaps } = parseSitemap(await readSitemap(`${ORIGIN}/sitemap.xml`));
  for (const s of sitemaps) urls.push(...parseSitemap(await readSitemap(s)).urls);
  const foreign = urls.filter((u) => { try { return new URL(u.loc).host !== HOST; } catch { return true; } });
  if (foreign.length) throw new Error(`사이트맵에 다른 호스트 URL ${foreign.length}건(예: ${foreign[0].loc}) — SITE_URL로 빌드한 dist인지 확인(상대 주소면 SITE_URL 없이 빌드된 것)`);
  return urls;
}

const readState = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : null);
const writeState = (s) => fs.writeFileSync(STATE, JSON.stringify(s, null, 1) + '\n');
// fetch 뒤 process.exit를 부르면 Windows Node가 libuv assert로 죽는다 — 끝은 exitCode로 낸다.
const fail = (msg) => { console.error(msg); process.exitCode = 1; };

async function main() {
  const urls = await currentUrls();
  const src = has('--live') ? `${ORIGIN}/sitemap.xml` : 'dist/sitemap.xml';

  if (mode === 'seed') {
    const prev = readState();
    if (prev && !has('--force')) return fail(`이미 seed됨(${prev.seeded_at}) — 다시 seed하면 그 사이 바뀐 URL을 잃는다. 정말이면 --force`);
    writeState({
      _why: 'IndexNow 「이미 아는」 URL 집합(ADR-0079 4). seed 시점 URL은 보내지 않는다 — 이후 추가·변경분만 send.',
      host: HOST, key_file: keyFile, seeded_at: new Date().toISOString(), source: src,
      urls: Object.fromEntries(urls.map((u) => [u.loc, u.lastmod ?? null])), sent: [],
    });
    return console.log(`seed — ${urls.length} URL을 기록했다(전송 0). 출처 ${src}`);
  }

  const state = readState();
  if (!state) return fail('seed가 없다 — 먼저 indexnow.mjs seed');
  const { added, changed, removed } = indexnowDiff(state, urls);
  const list = [...added, ...changed];
  console.log(`\nIndexNow ${mode} — 출처 ${src} · 추가 ${added.length} · 변경 ${changed.length} · 사라짐 ${removed.length}(알리지 않음)`);
  for (const u of added) console.log(`  + ${u}`);
  for (const u of changed) console.log(`  ~ ${u}`);
  if (mode === 'dry' || !list.length) return console.log(list.length ? '\n(dry: 전송하지 않았다)\n' : '\n보낼 URL 없음\n');
  if (list.length > MAX) return fail(`${list.length}건 > 1회 한도 ${MAX} — 나눠 보내는 기능은 없다. 범위를 확인하라`);

  // 키 파일이 라이브에 없으면 403만 받는다 — 보내기 전에 확인한다.
  const keyLocation = `${ORIGIN}/${keyFile}`;
  const live = await fetch(keyLocation, { signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.text() : '')).catch(() => '');
  if (live.trim() !== key) return fail(`라이브 키 파일 불일치 — ${keyLocation} (배포 전인가?)`);

  const body = JSON.stringify({ host: HOST, key, keyLocation, urlList: list });
  const responses = [];
  for (const ep of ENDPOINTS) {
    const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body, signal: AbortSignal.timeout(20000) })
      .then((x) => ({ endpoint: ep, status: x.status })).catch((e) => ({ endpoint: ep, status: 0, error: e.message }));
    responses.push(r);
    console.log(`  ${ep} → ${r.status}${r.error ? ` (${r.error})` : ''}`);
  }
  // 하나라도 받아들였으면(200·202) 상태를 갱신한다. 둘 다 실패면 다음 send가 같은 목록을 다시 보낸다.
  if (!responses.some((r) => r.status === 200 || r.status === 202)) return fail('전송 실패 — 상태를 바꾸지 않았다\n');
  for (const u of urls) if (list.includes(u.loc)) state.urls[u.loc] = u.lastmod ?? null;
  state.sent.push({ at: new Date().toISOString(), n: list.length, responses });
  writeState(state);
  console.log(`상태 갱신 — ${list.length}건\n`);
}
await main().catch((e) => fail(e.message));
