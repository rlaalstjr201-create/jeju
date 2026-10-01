// 빌드 결과(dist)를 읽어 감사 입력을 만든다. crawl.mjs·verify.mjs가 같은 입력을 보게 하는 단일 출처.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileToUrl, parsePage } from './crawl-parse.mjs';

export const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA = path.join(APP, 'data', 'seo');

export const argOf = (argv) => ({
  has: (f) => argv.includes(f),
  val: (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; },
});

/** 사이트 origin. --site > SITE_URL > data/seo/config.json site_url. 비면 ''(= 도메인 미정). */
export function originOf(cli) {
  let cfg = '';
  try { cfg = JSON.parse(fs.readFileSync(path.join(DATA, 'config.json'), 'utf8')).site_url || ''; } catch { /* 없음 */ }
  return String(cli || process.env.SITE_URL || cfg || '').replace(/\/+$/, '');
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, out);
    else if (e.name.endsWith('.html')) out.push(fp);
  }
  return out;
}

/** dist → { pages: Map<url, page>, files, spotCount }. dist가 없으면 null. */
export function loadDist(dist, origin) {
  if (!fs.existsSync(dist)) return null;
  const pages = new Map();
  for (const fp of walk(dist)) {
    const rel = path.relative(dist, fp);
    const url = fileToUrl(rel);
    pages.set(url, { url, file: rel.split(path.sep).join('/'), ...parsePage(fs.readFileSync(fp, 'utf8'), origin) });
  }
  const read = (f) => { const p = path.join(dist, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
  const files = Object.fromEntries(['robots.txt', 'sitemap.xml', 'llms.txt', '_headers'].map((f) => [f, read(f)]));
  let spotCount = 0;
  try { spotCount = JSON.parse(read('spots.json') || '[]').length; } catch { /* 깨진 JSON은 다른 검사가 잡는다 */ }
  return { pages, files, spotCount };
}

/** 로컬 날짜(YYYY-MM-DD). toISOString은 UTC라 한국 오전에 하루 전으로 박힌다(seoulist 3회 사고). */
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
