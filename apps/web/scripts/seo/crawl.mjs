#!/usr/bin/env node
// 전수 크롤 진단 — 빌드된 dist를 전부 읽고 구조와 SEO·GEO 감사를 낸다. 외부 호출 0건.
// (seoulist scripts/seo-crawl.mjs를 옮김. hreflang 왕복은 뺐다 — ko 단일. 감사 규칙은 audit-rules.mjs.)
//
// 사용 (apps/web에서):
//   npm run seo:crawl                         전체 진단
//   npm run seo:crawl -- --json               기계 판독용
//   npm run seo:crawl -- --site https://…     origin 지정 (기본: SITE_URL → data/seo/config.json)
//   npm run seo:crawl -- --snapshot           지금 상태를 data/seo/crawl/<날짜>.json에 남긴다 (opt-in)
//   npm run seo:crawl -- --diff <파일>        그 스냅샷과 대조 (기본: 가장 최근 스냅샷)
//   npm run seo:crawl -- --dist <경로>        대상 변경 (기본 dist)
//
// ⚠ 게이트가 아니라 계기판이다 — exit 0 고정. 막는 쪽은 `seo:verify -- --strict`.
// ⚠ 스냅샷 기록은 opt-in이다. 조회가 저장소를 조용히 고치지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { buildGraph, GENERIC_ANCHOR, FINGERPRINT_FIELDS, fingerprintOf, normUrl } from './crawl-parse.mjs';
import { auditSite } from './audit-rules.mjs';
import { APP, DATA, argOf, originOf, loadDist, localDay } from './load-dist.mjs';

const { has, val } = argOf(process.argv.slice(2));
const JSON_OUT = has('--json');
const DIST = path.resolve(APP, val('--dist', 'dist'));
const ORIGIN = originOf(val('--site'));
const CRAWL_DIR = path.join(DATA, 'crawl');
const DEPTH_WARN = 3;

const site = loadDist(DIST, ORIGIN);
if (!site) { console.log(`빌드 결과가 없다: ${DIST}\n먼저 npm run build`); process.exit(0); }
const { pages, files, spotCount } = site;

const indexable = [...pages.values()].filter((p) => !p.fragment && !p.noindex && p.url !== '/404.html');

// ── ① 내부링크 그래프 ─────────────────────────────────────────
const { inbound, depth } = buildGraph(pages);
const orphans = indexable.filter((p) => p.url !== '/' && inbound.get(p.url) === 0).map((p) => p.url);
const unreached = indexable.filter((p) => !depth.has(p.url)).map((p) => p.url);
const deep = indexable.filter((p) => (depth.get(p.url) ?? 0) > DEPTH_WARN).map((p) => ({ url: p.url, depth: depth.get(p.url) }));
const brokenInternal = [];
for (const p of pages.values()) for (const l of p.links) if (!pages.has(l.to)) brokenInternal.push({ from: p.url, to: l.to });
const genericAnchors = [...pages.values()].flatMap((p) => p.links.filter((l) => !l.text || GENERIC_ANCHOR.test(l.text)).map((l) => ({ from: p.url, to: l.to, text: l.text })));

// ── ② 사이트맵 대조 ───────────────────────────────────────────
let sitemap = null;
if (files['sitemap.xml'] != null) {
  const urls = new Set([...files['sitemap.xml'].matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => normUrl(m[1].trim(), ORIGIN)).filter(Boolean));
  sitemap = {
    n: urls.size,
    missing_from_dist: [...urls].filter((u) => !pages.has(u)),
    not_in_sitemap: indexable.filter((p) => !urls.has(p.url)).map((p) => p.url),
  };
}

// ── ③ 감사 ───────────────────────────────────────────────────
const findings = auditSite({ pages, files, origin: ORIGIN, spotCount });

// ── ④ 배포 diff ──────────────────────────────────────────────
const fingerprint = () => Object.fromEntries([...pages.values()].filter((p) => !p.fragment).map((p) => [p.url, fingerprintOf(p)]));
let diff = null;
const snapArg = val('--diff');
const latest = fs.existsSync(CRAWL_DIR) ? fs.readdirSync(CRAWL_DIR).filter((f) => f.endsWith('.json')).sort().pop() : null;
const prevPath = snapArg ? path.resolve(process.cwd(), snapArg) : (latest ? path.join(CRAWL_DIR, latest) : null);
if (prevPath && fs.existsSync(prevPath) && !has('--snapshot')) {
  const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
  const now = fingerprint();
  const changed = [];
  for (const [u, cur] of Object.entries(now)) {
    const old = prev.pages?.[u];
    if (!old) continue;
    const fields = Object.keys(FINGERPRINT_FIELDS).filter((k) => old[k] !== cur[k]);
    if (fields.length) changed.push({ url: u, fields: fields.map((k) => FINGERPRINT_FIELDS[k]) });
  }
  diff = {
    against: path.relative(APP, prevPath), snapshot_at: prev.at,
    added: Object.keys(now).filter((u) => !prev.pages?.[u]),
    removed: Object.keys(prev.pages || {}).filter((u) => !now[u]),
    changed,
  };
}
if (has('--snapshot')) {
  fs.mkdirSync(CRAWL_DIR, { recursive: true });
  const at = localDay();
  const out = path.join(CRAWL_DIR, `${at}.json`);
  fs.writeFileSync(out, `${JSON.stringify({ at, origin: ORIGIN, pages: fingerprint() }, null, 2)}\n`);
  if (!JSON_OUT) console.log(`스냅샷 기록: ${path.relative(APP, out)} (${pages.size}쪽)`);
}

const report = {
  dist: path.relative(APP, DIST) || '.', origin: ORIGIN || null,
  counts: { html: pages.size, indexable: indexable.length, noindex: [...pages.values()].filter((p) => p.noindex).length, spots: spotCount },
  pages: indexable.map((p) => ({ url: p.url, title: p.title, description_chars: p.description.length, text_chars: p.textChars, jsonld: p.jsonld.flatMap((b) => b.types), h1: p.h1s[0] || null, depth: depth.get(p.url) ?? null, inbound: inbound.get(p.url) })),
  link_graph: { orphans, unreachable_from_home: unreached, deeper_than: DEPTH_WARN, deep, broken_internal: brokenInternal, generic_anchors: genericAnchors.length },
  uncrawlable_links: [...pages.values()].reduce((a, p) => a + p.uncrawlable.length, 0),
  sitemap,
  findings,
  findings_by_severity: findings.reduce((a, f) => ({ ...a, [f.severity]: (a[f.severity] || 0) + 1 }), {}),
  diff,
};

if (JSON_OUT) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

const line = (label, n, note = '') => console.log(`  ${String(n).padStart(5)}  ${label}${note ? `   ${note}` : ''}`);
console.log(`\n■ 전수 크롤 — ${report.dist} · origin ${ORIGIN || '(없음 — SITE_URL 미설정)'}\n`);
line('HTML 총계', report.counts.html);
line('색인 대상', report.counts.indexable, `(noindex ${report.counts.noindex}쪽 제외)`);
line('spots.json 장소', spotCount, '← JS가 그리는 것. 정적 HTML에는 없다');
for (const p of report.pages) console.log(`         ${p.url.padEnd(12)} 본문 ${String(p.text_chars).padStart(5)}자 · JSON-LD ${p.jsonld.join(',') || '없음'} · "${p.title}"`);

console.log('\n■ 내부링크 그래프');
line('고아 페이지', orphans.length);
for (const u of orphans.slice(0, 10)) console.log(`         ${u}`);
line('홈에서 도달 불가', unreached.length);
for (const u of unreached.slice(0, 10)) console.log(`         ${u}`);
line(`깊이 ${DEPTH_WARN}홉 초과`, deep.length);
line('dist에 없는 내부 링크', brokenInternal.length);
for (const b of brokenInternal.slice(0, 8)) console.log(`         ${b.from} → ${b.to}`);
line('일반 앵커텍스트', genericAnchors.length);
line('크롤 불가 링크', report.uncrawlable_links);

console.log('\n■ 사이트맵');
if (!sitemap) console.log('      —  sitemap.xml 없음');
else {
  line('사이트맵 URL', sitemap.n);
  line('사이트맵에 있는데 dist에 없음', sitemap.missing_from_dist.length);
  line('색인 대상인데 사이트맵에 없음', sitemap.not_in_sitemap.length);
}

console.log(`\n■ 감사 — ${findings.length}건 (${Object.entries(report.findings_by_severity).map(([k, n]) => `${k} ${n}`).join(' · ') || '0'})`);
for (const f of findings) {
  console.log(`  [${f.severity}·${f.layer}] ${f.id}`);
  console.log(`         ${f.msg}`);
  console.log(`         → ${f.fix}`);
}

console.log('\n■ 배포 diff');
if (!diff) console.log('      —  기준 스냅샷이 없다. npm run seo:crawl -- --snapshot 으로 지금을 기준으로 남긴다');
else {
  console.log(`         기준 ${diff.against} (${diff.snapshot_at})`);
  line('추가된 쪽', diff.added.length);
  for (const u of diff.added.slice(0, 8)) console.log(`         + ${u}`);
  line('사라진 쪽', diff.removed.length, diff.removed.length ? '← 색인 자산이 사라진다' : '');
  for (const u of diff.removed.slice(0, 8)) console.log(`         − ${u}`);
  line('바뀐 쪽', diff.changed.length);
  for (const c of diff.changed.slice(0, 12)) console.log(`         ~ ${c.url}   [${c.fields.join(', ')}]`);
}
console.log('\n계기판이지 게이트가 아니다 — exit 0. 막으려면 npm run seo:verify -- --strict\n');
process.exit(0);
