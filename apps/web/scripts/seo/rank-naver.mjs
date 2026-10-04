#!/usr/bin/env node
// 네이버 통합검색 순위 관찰(ADR-0079 1) — Playwright로 keywords.json의 target·watch·brand 검색어를 검색해
// 우리 주소(yeochana.pages.dev, 아무 경로)가 처음 나오는 블록과 순위를 기록한다.
//
// 사용 (apps/web에서; playwright-core + Chrome 또는 Chromium — tests/e2e와 같은 방식으로 찾는다):
//   node scripts/seo/rank-naver.mjs --dry                     검색어 목록만(네트워크 0)
//   node scripts/seo/rank-naver.mjs                           data/seo/rank/naver-YYYY-MM-DD.json 쓰기
//   옵션: --headed · --save-html <dir>(검증용 원문 저장) · --force(같은 날 파일 덮어쓰기)
//   Env: RANK_CHANNEL=chrome|chromium (기본 chrome)
//
// 정직성(ADR-0079 6): 막힘·캡차·HTTP 오류는 status 'check_failed'로 남긴다 — 'not_found'로 바꾸지 않는다.
// 결과를 바꾸려고 같은 날 다시 돌리지 않는다(같은 날 파일이 있으면 --force 없이는 멈춘다). 캡차를 풀지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { DATA, argOf, localDay } from './load-dist.mjs';

const HOST = 'yeochana.pages.dev';
const { has, val } = argOf(process.argv.slice(2));

const doc = JSON.parse(fs.readFileSync(path.join(DATA, 'keywords.json'), 'utf8'));
const queries = doc.candidates.filter((c) => ['brand', 'target', 'watch'].includes(c.verdict)).map((c) => ({ query: c.query, verdict: c.verdict }));

if (has('--dry')) {
  console.log(`\n네이버 순위 관찰 대상 ${queries.length}건 (네트워크 호출 없음)`);
  for (const q of queries) console.log(`  ${q.verdict.padEnd(6)} ${q.query}  https://search.naver.com/search.naver?query=${encodeURIComponent(q.query)}`);
  console.log('');
  process.exit(0);
}

const date = localDay();
const outDir = path.join(DATA, 'rank');
const outFile = path.join(outDir, `naver-${date}.json`);
if (fs.existsSync(outFile) && !has('--force')) {
  console.error(`${path.relative(process.cwd(), outFile)}가 이미 있다 — 같은 날 다시 재지 않는다(ADR-0079 6). 정말 필요하면 --force.`);
  process.exit(1);
}
const htmlDir = val('--save-html', null);
if (htmlDir) fs.mkdirSync(htmlDir, { recursive: true });

async function loadPlaywright() {
  for (const name of ['playwright-core', 'playwright']) {
    try {
      return await import(name);
    } catch {
      /* try the next */
    }
  }
  const root = execSync('npm root -g').toString().trim();
  return createRequire(path.join(root, 'noop.js'))('playwright-core');
}

/** 페이지 안에서 돈다 — 우리 링크의 블록·블록 안 순위·전체 링크 순위.
 * 2026-10 네이버 PC 통합검색: #main_pack 바로 아래 블록들. 웹문서·블로그·카페·지식iN은 제목 없는 div.spw_fsolid라
 * 첫 결과 링크의 호스트로 이름을 붙인다. 광고 블록과 네이버 도구 링크(저장·도움말 등)는 순위에서 뺀다. */
function extract(host) {
  const main = document.querySelector('#main_pack') || document.body;
  const UTIL = /^(search|m\.search|help|ader|adcr|ads|ad\.search|nid|policy|terms|keep|whale|m)\.naver\.com$/;
  const ok = (a) => { try { const u = new URL(a.href); return /^https?:$/.test(u.protocol) && !UTIL.test(u.host); } catch { return false; } };
  const ours = (a) => { try { return decodeURIComponent(a.href).includes(host); } catch { return a.href.includes(host); } };
  const keyOf = (href) => { try { const u = new URL(href); return u.host + u.pathname.replace(/\/+$/, ''); } catch { return href; } };
  const byHost = (h) => (/blog\.naver/.test(h) ? '블로그' : /cafe\.naver/.test(h) ? '카페' : /kin\.naver/.test(h) ? '지식iN'
    : /youtube|tv\.naver|clip\.naver/.test(h) ? '동영상' : /map\.naver/.test(h) ? '플레이스' : '웹문서');
  const all = new Set();
  for (const sec of [...main.children].filter((c) => /^(DIV|SECTION)$/.test(c.tagName))) {
    const links = [...sec.querySelectorAll('a[href]')].filter(ok);
    if (!links.length) continue;
    const heads = [...sec.querySelectorAll('h2')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (heads.some((h) => /관련 광고|파워링크/.test(h))) continue;
    const head = heads.sort((a, b) => a.length - b.length)[0];
    const name = head ? head.slice(0, 20) : byHost(new URL(links[0].href).host);
    const seen = new Set();
    for (const a of links) {
      const k = keyOf(a.href);
      seen.add(k);
      all.add(k);
      if (ours(a)) return { found: true, block: name, position_in_block: [...seen].indexOf(k) + 1, overall_link_rank: [...all].indexOf(k) + 1, url: a.href };
    }
  }
  // 블록 밖(사이드·하단)이나 광고에서만 나오는 경우까지 놓치지 않는다.
  const any = [...document.querySelectorAll('a[href]')].find(ours);
  if (any) return { found: true, block: '(블록 밖)', position_in_block: null, overall_link_rank: null, url: any.href };
  return { found: false, block: null, position_in_block: null, overall_link_rank: null, url: null };
}

const pw = await loadPlaywright();
const channel = process.env.RANK_CHANNEL ?? 'chrome';
const browser = await pw.chromium.launch({ channel: channel === 'chromium' ? undefined : channel, headless: !has('--headed') });
const ctx = await browser.newContext({ locale: 'ko-KR', viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [i, q] of queries.entries()) {
  if (i) await sleep(4000 + Math.random() * 4000);
  const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(q.query)}`;
  const base = { query: q.query, verdict: q.verdict, date };
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    if (htmlDir) fs.writeFileSync(path.join(htmlDir, `${String(i + 1).padStart(2, '0')}.html`), await page.content());
    const status = res?.status() ?? 0;
    if (status >= 400 || !status) { results.push({ ...base, status: 'check_failed', why: `HTTP ${status}` }); continue; }
    const blocked = await page.evaluate(() => {
      const t = document.body?.innerText || '';
      return /captcha/i.test(location.href) || /자동입력 방지|비정상적인 (접근|검색)|보안 절차|Captcha/i.test(t) ? t.slice(0, 80) : (document.querySelector('#main_pack') ? null : '#main_pack 없음');
    });
    if (blocked) { results.push({ ...base, status: 'check_failed', why: `막힘 의심: ${blocked.replace(/\s+/g, ' ')}` }); continue; }
    const r = await page.evaluate(extract, HOST);
    results.push({ ...base, status: r.found ? 'found' : 'not_found', ...r });
  } catch (err) {
    results.push({ ...base, status: 'check_failed', why: String(err.message || err).split('\n')[0] });
  }
  const last = results[results.length - 1];
  console.log(`  ${last.status.padEnd(12)} ${q.query}${last.found ? ` — ${last.block} ${last.position_in_block ?? '-'}위 (전체 링크 ${last.overall_link_rank ?? '-'})` : last.why ? ` — ${last.why}` : ''}`);
}
await browser.close();

fs.mkdirSync(outDir, { recursive: true });
const out = {
  _why: 'ADR-0079 1 네이버 통합검색 주간 관찰. position_in_block = 그 블록 안 고유 링크 순서, overall_link_rank = 본문(#main_pack) 고유 외부 링크 순서. check_failed는 「없음」이 아니다.',
  date, engine: 'naver', tool: `playwright ${channel}${has('--headed') ? ' headed' : ' headless'}`, host: HOST,
  summary: { total: results.length, found: results.filter((r) => r.status === 'found').length, not_found: results.filter((r) => r.status === 'not_found').length, check_failed: results.filter((r) => r.status === 'check_failed').length },
  results,
};
fs.writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');
console.log(`\n→ ${path.relative(process.cwd(), outFile)} · found ${out.summary.found} · not_found ${out.summary.not_found} · check_failed ${out.summary.check_failed}\n`);
