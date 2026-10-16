/**
 * 장소 글 번역 (ADR-0093, specs/i18n.md §5): the shipped places' name and reason in English, Simplified Chinese and
 * Japanese, as public/i18n/places.<lang>.json `{ id: [name, reason] }` ('' = the Korean one shows). Built from the
 * translation batches under review/i18n/<lang>/ (`reasons-NNN.json` and `names-NNN.json`, each `{ id: text }`), so a
 * batch can be redone and this run again; nothing else changes and the source data (spots.json) is only read.
 *   node scripts/i18n-places.mjs --export   the Korean source batches, review/i18n/source/batch-NNN.json (150 each)
 *   node scripts/i18n-places.mjs            the three files, with a count of what is missing or does not pass
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LANGS = ['en', 'zh-Hans', 'ja'];
const BATCH = 150;
const HANGUL = /[가-힣]/;

/** The places that ship (not hidden), in file order. */
export function shipped(spots) {
  return spots.filter((s) => !s.hide);
}

/** Why a translated text cannot ship, or null: empty, Korean left in it, a final full stop, or too long. */
export function textProblem(text, kind) {
  if (typeof text !== 'string' || !text.trim()) return 'empty';
  if (HANGUL.test(text)) return 'hangul';
  if (kind === 'reason' && /[.。．｡]$/.test(text.trim())) return 'full stop';
  if (text.length > (kind === 'reason' ? 160 : 80)) return 'too long';
  return null;
}

function readBatches(dir, prefix) {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort()) {
    Object.assign(out, JSON.parse(readFileSync(resolve(dir, f), 'utf8')));
  }
  return out;
}

/** The file for one language and what did not make it: `{ places, missing, rejected }`. */
export function buildLang(spots, reasons, names) {
  const places = {};
  const missing = { name: 0, reason: 0 };
  const rejected = [];
  for (const s of shipped(spots)) {
    const pair = ['', ''];
    for (const [i, kind, src] of [[0, 'name', names], [1, 'reason', reasons]]) {
      const t = src[s.id];
      if (t === undefined) {
        missing[kind]++;
        continue;
      }
      const why = textProblem(t, kind);
      if (why) rejected.push({ id: s.id, kind, why });
      else pair[i] = t.trim().replace(/\s+/g, ' ');
    }
    if (pair[0] || pair[1]) places[s.id] = pair;
  }
  return { places, missing, rejected };
}

function main() {
  const spots = JSON.parse(readFileSync(resolve(root, 'public/spots.json'), 'utf8'));
  const list = shipped(spots);
  if (process.argv.includes('--export')) {
    const dir = resolve(root, 'review/i18n/source');
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < list.length; i += BATCH) {
      const rows = list.slice(i, i + BATCH).map((s) => ({ id: s.id, name: s.name.trim(), reason: s.reason, mood: s.mood, ...(s.sub ? { sub: s.sub } : {}) }));
      writeFileSync(resolve(dir, `batch-${String(i / BATCH + 1).padStart(3, '0')}.json`), `${JSON.stringify(rows, null, 1)}\n`);
    }
    console.log(`exported ${list.length} places in ${Math.ceil(list.length / BATCH)} batches`);
    return;
  }
  mkdirSync(resolve(root, 'public/i18n'), { recursive: true });
  for (const lang of LANGS) {
    const dir = resolve(root, 'review/i18n', lang);
    const { places, missing, rejected } = buildLang(spots, readBatches(dir, 'reasons-'), readBatches(dir, 'names-'));
    writeFileSync(resolve(root, `public/i18n/places.${lang}.json`), JSON.stringify(places));
    console.log(`${lang}: ${Object.keys(places).length} of ${list.length} places; missing names ${missing.name}, reasons ${missing.reason}; rejected ${rejected.length}`);
    for (const r of rejected.slice(0, 20)) console.log(`  ${r.id} ${r.kind}: ${r.why}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
