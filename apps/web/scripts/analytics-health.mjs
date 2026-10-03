#!/usr/bin/env node
// Daily check (ADR-0078 2): has the site's own anonymous record counted anything lately? For a scheduled task:
// exit 0 and one OK line when it has; exit 1 and one Korean line saying why when not.
//   node scripts/analytics-health.mjs [site]     (site defaults to $SITE, then https://yeogwi.pages.dev)
const site = (process.argv[2] ?? process.env.SITE ?? 'https://yeogwi.pages.dev').replace(/\/+$/, '');
const url = `${site}/api/events/health`;

function fail(why) {
  console.error(`분석 경고: ${why} (${url})`);
  process.exit(1);
}

let res;
try {
  res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json' } });
} catch (e) {
  fail(`수집기에 닿지 않아요 — ${e?.name === 'TimeoutError' ? '15초 안에 답이 없어요' : (e?.cause?.code ?? e?.message ?? e)}`);
}
if (!res.ok) fail(`수집기가 ${res.status}로 답했어요`);
let body;
try {
  body = await res.json();
} catch {
  fail('수집기 답이 JSON이 아니에요');
}
const n = body?.last24h;
if (typeof n !== 'number' || !Number.isFinite(n)) fail(`수집기 답에 last24h 숫자가 없어요: ${JSON.stringify(body).slice(0, 80)}`);
if (n === 0) fail('지난 24시간 자체 기록이 0건이에요 — 수집이 멈췄는지 확인해 주세요');
console.log(`OK 지난 24시간 자체 기록 ${n}건`);
