#!/usr/bin/env node
// Static landing pages after `vite build` (specs/seo-landing.md, ADR-0072). Run with tsx (it imports the app's TS rules):
//   tsx scripts/build-landing.mjs                 dist/jeju/**, sitemap, robots Sitemap line, _redirects; then the quality bar
//   tsx scripts/build-landing.mjs --write-slugs   give new places a slug in data/landing/slugs.json (npm run landing:slugs)
// Env: SITE_URL (absolute canonical/sitemap; empty = relative), LANDING_PHOTOS=0 (no VisitJeju photos, ADR-0072).
// Exit 1 when a place has no slug, or the quality bar fails: a run of source text on a page (L4), two pages too alike,
// a place page with too little of its own text, or a photo that is not a VisitJeju hotlink.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS } from '../src/region/areas.ts';
import { normalizeSpots } from '../src/pick/data.ts';
import { judge } from './seo/keyword-gate.mjs';
import {
  assignSlugs, buildSite, busanPages, contentHash, copiedReasons, HASH_VERSION, kstDay, ownShare, pageLastmods, similarPairs, sitemapFiles, sourceCopies, CSS_PATH,
} from './landing.ts';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLUGS = join(APP, 'data/landing/slugs.json');
const LASTMOD = join(APP, 'data/landing/lastmod.json');
/** The quality bar (specs/seo-landing.md 「품질 기준」). Set before the first build's numbers were seen; see the spec. */
export const BAR = { maxSimilarity: 0.8, minOwnShare: 0.3, minNearby: 3, sourceRun: 20 };
const PHOTO_HOST = 'https://api.cdn.visitjeju.net/';
/** 부산 (ADR-0099): TourAPI photos as the app shows them (specs/busan.md 3.5). */
const BUSAN_PHOTO_HOST = 'https://tong.visitkorea.or.kr/';

const argv = process.argv.slice(2);
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const fail = [];

const registry = existsSync(SLUGS) ? read(SLUGS) : { slugs: {} };
if (argv.includes('--write-slugs')) {
  const spots = normalizeSpots(read(join(APP, 'public/spots.json')));
  const added = assignSlugs(spots, registry.slugs);
  const slugs = Object.fromEntries(Object.entries({ ...registry.slugs, ...added }).sort(([a], [b]) => a.localeCompare(b)));
  mkdirSync(dirname(SLUGS), { recursive: true });
  writeFileSync(SLUGS, `${JSON.stringify({ _why: 'Place page addresses (ADR-0072). An entry never changes and a slug is never reused; area = the first address, for 301s.', slugs }, null, 1)}\n`);
  console.log(`slugs: ${Object.keys(added).length} added, ${Object.keys(slugs).length} in ${SLUGS.slice(APP.length + 1)}`);
  process.exit(0);
}

const DIST = resolve(APP, argv.includes('--dist') ? argv[argv.indexOf('--dist') + 1] : 'dist');
if (!existsSync(join(DIST, 'spots.json'))) {
  console.error(`build-landing: ${DIST}/spots.json not found — run vite build first`);
  process.exit(1);
}
const spots = normalizeSpots(read(join(DIST, 'spots.json')));
const missing = spots.filter((s) => !registry.slugs[s.id]);
if (missing.length) {
  console.error(`build-landing: ${missing.length} place(s) have no address yet (${missing.slice(0, 3).map((s) => s.name).join(', ')} …). Run npm run landing:slugs and commit data/landing/slugs.json.`);
  process.exit(1);
}

// Source text the reasons were written from (review/input: VisitJeju introduction, and the summary and comment made from it).
const sources = new Map();
for (const f of readdirSync(join(APP, 'review/input')).filter((x) => x.endsWith('.json'))) {
  for (const r of read(join(APP, 'review/input', f))) sources.set(r.id, [r.intro, r.summary, r.comment].filter((t) => typeof t === 'string' && t));
}
const exclude = copiedReasons(spots, (id) => sources.get(id) ?? [], BAR.sourceRun);

// 2단계: only the 조합 whose search words are keyword-gate targets (data/seo/keywords.json, judged again here).
const keywords = read(join(APP, 'data/seo/keywords.json'));
const combos = (keywords.candidates ?? []).flatMap((c) => {
  const m = /^\/jeju\/([a-z]+)\/(rest|walk|new|food)\/$/.exec(c.landing ?? '');
  return m && judge(c).verdict === 'target' ? [{ area: m[1], mood: m[2], query: c.query }] : [];
});

const site = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
const photos = process.env.LANDING_PHOTOS !== '0';
let dataDate = null;
try {
  dataDate = execFileSync('git', ['log', '-1', '--format=%cs', '--', 'public/spots.json'], { cwd: APP }).toString().trim() || null;
} catch {
  /* no git: no date */
}

const { pages, places, redirects } = buildSite({ spots, slugs: registry.slugs, exclude, combos, site, photos, dataDate, busan: existsSync(join(DIST, 'spots-busan.json')) });

// 부산 1단계 (ADR-0099): /busan/ 허브 + 동네 12쪽, only in a build that carries Busan's file (the switched-on one).
// Source text = each place's TourAPI overview (review/busan/raw/detail), held to the same bar as VisitJeju's.
const busanFile = join(DIST, 'spots-busan.json');
const busanSources = new Map();
let busan = { pages: [], places: 0, spots: [], exclude: new Set() };
if (existsSync(busanFile)) {
  const detail = join(APP, 'review/busan/raw/detail');
  for (const f of readdirSync(detail).filter((x) => x.endsWith('.json'))) {
    for (const it of [read(join(detail, f))?.body?.response?.body?.items?.item ?? []].flat()) {
      if (it?.contentid && typeof it.overview === 'string' && it.overview) busanSources.set(`bs-${it.contentid}`, [it.overview]);
    }
  }
  const bSpots = normalizeSpots(read(busanFile));
  const bExclude = copiedReasons(bSpots, (id) => busanSources.get(id) ?? [], BAR.sourceRun);
  let bDate = null;
  try {
    bDate = execFileSync('git', ['log', '-1', '--format=%cs', '--', 'public/spots-busan.json'], { cwd: APP }).toString().trim() || null;
  } catch {
    /* no git: no date */
  }
  busan = { ...busanPages({ spots: bSpots, exclude: bExclude, site, photos, dataDate: bDate }), spots: bSpots, exclude: bExclude };
}

// --- write -----------------------------------------------------------------------------------------------------
for (const p of pages) {
  const dir = join(DIST, p.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), p.html);
}
for (const p of busan.pages) {
  const dir = join(DIST, p.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), p.html);
}
writeFileSync(join(DIST, CSS_PATH), readFileSync(join(APP, 'src/landing.css')));
const urls = ['/', '/privacy', ...pages.map((p) => p.path), ...busan.pages.map((p) => p.path)];
// sitemap-core.xml (home, privacy, hub, areas, combos) + one per area of place pages (docs/seo/2026-10-16-generic-search.md a4)
const sitemapGroups = {
  core: ['/', '/privacy', ...pages.filter((p) => p.kind !== 'place').map((p) => p.path)],
  ...Object.fromEntries(AREAS.map((a) => [a.slug, places.filter((x) => x.area.slug === a.slug).map((x) => x.url)])),
  // its own file, so Search Console counts Busan's 13 apart from Jeju's (docs/seo/2026-10-24-busan-landing.md 2절)
  'busan-core': busan.pages.map((p) => p.path),
};
// Each page's lastmod is the day what it says last changed (audit D4): data/landing/lastmod.json keeps a hash per
// page; a second build on the same day writes the same file. Commit it with the data.
const today = kstDay(new Date());
const htmls = [
  ['/', readFileSync(join(DIST, 'index.html'), 'utf8')],
  ['/privacy', readFileSync(join(DIST, 'privacy.html'), 'utf8')],
  ...pages.map((p) => [p.path, p.html]),
  ...busan.pages.map((p) => [p.path, p.html]),
];
const hashesBy = (version) => Object.fromEntries(htmls.map(([path, html]) => [path, contentHash(html, site, version)]));
const prevLastmod = existsSync(LASTMOD) ? read(LASTMOD) : null;
// a record written by an older contentHash: compare with that version too, so a new way of hashing moves no date
const prevVersion = prevLastmod?.hash_version ?? 1;
const legacy = prevLastmod && prevVersion !== HASH_VERSION ? hashesBy(prevVersion) : undefined;
const lastmods = pageLastmods(prevLastmod?.pages ?? null, hashesBy(HASH_VERSION), today, dataDate, legacy);
const lastmodJson = `${JSON.stringify({ _why: 'Sitemap lastmod per page (audit D4): the day its <main> last changed, button words left out. Written by the build; commit it.', hash_version: HASH_VERSION, pages: lastmods }, null, 1)}\n`;
if (!existsSync(LASTMOD) || readFileSync(LASTMOD, 'utf8') !== lastmodJson) writeFileSync(LASTMOD, lastmodJson);
const changedToday = Object.values(lastmods).filter((e) => e.lastmod === today).length;
const sitemaps = sitemapFiles(sitemapGroups, site, Object.fromEntries(Object.entries(lastmods).map(([k, v]) => [k, v.lastmod])));
for (const [f, body] of Object.entries(sitemaps)) writeFileSync(join(DIST, f), body);
const robots = join(DIST, 'robots.txt');
if (site && existsSync(robots) && !/^Sitemap:/m.test(readFileSync(robots, 'utf8'))) {
  writeFileSync(robots, `${readFileSync(robots, 'utf8').replace(/\n*$/, '\n')}\nSitemap: ${site}/sitemap.xml\n`);
}
if (redirects.length) writeFileSync(join(DIST, '_redirects'), `${redirects.join('\n')}\n`);

// --- the quality bar -------------------------------------------------------------------------------------------
const copies = sourceCopies(pages, [...sources.values()].flat(), spots.map((s) => s.name), BAR.sourceRun);
for (const c of copies.slice(0, 10)) fail.push(`source text on ${c.path}: ${c.run}`);
if (copies.length > 10) fail.push(`… ${copies.length} pages with source text`);
const busanCopies = sourceCopies(busan.pages, [...busanSources.values()].flat(), busan.spots.map((s) => s.name), BAR.sourceRun);
for (const c of busanCopies) fail.push(`source text on ${c.path}: ${c.run}`);

const alike = similarPairs([...pages, ...busan.pages], BAR.maxSimilarity);
for (const x of alike.slice(0, 10)) fail.push(`too alike (${x.sim.toFixed(3)} ≥ ${BAR.maxSimilarity}): ${x.a} ${x.b}`);
const closest = similarPairs(pages, 0.5)[0];
const busanClosest = busan.pages.length
  ? similarPairs([...pages.filter((p) => p.kind !== 'place'), ...busan.pages], 0.3).find((x) => x.a.startsWith('/busan/') || x.b.startsWith('/busan/'))
  : null;

const placePages = pages.filter((p) => p.kind === 'place');
const own = ownShare(placePages).sort((a, b) => a.share - b.share);
for (const o of own.filter((x) => x.share < BAR.minOwnShare).slice(0, 10)) fail.push(`thin: ${o.path} own text ${(o.share * 100).toFixed(1)}% < ${BAR.minOwnShare * 100}%`);
for (const p of placePages) {
  const near = (p.html.match(/<ul class="near">([\s\S]*?)<\/ul>/)?.[1].match(/<li>/g) ?? []).length;
  if (near < BAR.minNearby) fail.push(`thin: ${p.path} has ${near} nearby places`);
}
for (const p of pages) {
  for (const m of p.html.matchAll(/<img\b[^>]*\ssrc="([^"]*)"/g)) {
    if (!photos) fail.push(`photo with LANDING_PHOTOS=0: ${p.path}`);
    else if (!m[1].startsWith(PHOTO_HOST)) fail.push(`photo not a VisitJeju hotlink: ${p.path} ${m[1]}`);
  }
  if (!/비짓제주\(제주관광공사\)/.test(p.html)) fail.push(`no credit: ${p.path}`);
}
for (const p of busan.pages) {
  for (const m of p.html.matchAll(/<img\b[^>]*\ssrc="([^"]*)"/g)) {
    if (!photos) fail.push(`photo with LANDING_PHOTOS=0: ${p.path}`);
    else if (!m[1].startsWith(BUSAN_PHOTO_HOST)) fail.push(`photo not a TourAPI hotlink: ${p.path} ${m[1]}`);
  }
  if (!/<p class="credit">정보(·사진)?: 한국관광공사<\/p>/.test(p.html)) fail.push(`no credit: ${p.path}`);
  // a key-less / or a /jeju/ link would open Jeju (index.html's first script); the hub's one line to the /jeju/ hub
  // itself is on purpose (ADR-0099 Amendment 1)
  const toJeju = p.kind === 'hub' ? /<a\b[^>]*\shref="\/(jeju\/[^"]|")/ : /<a\b[^>]*\shref="\/(jeju\/|")/;
  if (toJeju.test(p.html)) fail.push(`a link to Jeju or a key-less / on ${p.path}`);
}

const size = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);
const count = pages.reduce((a, p) => ({ ...a, [p.kind]: (a[p.kind] ?? 0) + 1 }), {});
console.log(`landing: ${pages.length} pages (${Object.entries(count).map(([k, n]) => `${k} ${n}`).join(' · ')}), ${(size(join(DIST, 'jeju')) / 1048576).toFixed(1)} MB, photos ${photos ? 'on (hotlink)' : 'off'}, site ${site || '(relative)'}`);
console.log(`  places ${places.length} of ${spots.length}; no page (reason repeats ${BAR.sourceRun}+ characters of its source): ${exclude.size}${exclude.size ? ` — ${spots.filter((s) => exclude.has(s.id)).map((s) => s.name).join(', ')}` : ''}`);
console.log(`  closest pair ${closest ? `${closest.sim.toFixed(3)} ${closest.a} ${closest.b}` : '< 0.5'} (bar < ${BAR.maxSimilarity}); least own text ${own.length ? `${(own[0].share * 100).toFixed(1)}% ${own[0].path}` : '-'} (bar ≥ ${BAR.minOwnShare * 100}%)`);
if (busan.pages.length) {
  console.log(`  busan: ${busan.pages.length} pages (hub 1 · area ${busan.pages.length - 1}), places listed ${busan.places} of ${busan.spots.length}; reason repeats its overview: ${busan.exclude.size}; source-text runs ${busanCopies.length}; closest pair with a Busan page ${busanClosest ? `${busanClosest.sim.toFixed(3)} ${busanClosest.a} ${busanClosest.b}` : '< 0.3'}`);
}
console.log(`  source-text runs: ${copies.length}; sitemap ${urls.length} URLs in ${Object.keys(sitemaps).length - 1} files under the index sitemap.xml (core ${sitemapGroups.core.length}; lastmod today: ${changedToday}); redirects ${redirects.length}`);
if (fail.length) {
  for (const f of fail) console.error(`  FAIL ${f}`);
  process.exit(1);
}
