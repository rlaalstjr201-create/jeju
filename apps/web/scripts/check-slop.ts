// design/SPEC.md §14 — the "AI slop" checklist, as a machine check over the source (and the build, when
// dist/ exists). `npm run check:slop` prints every violation; tests/slop.test.ts runs the same checks.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { reasonPunctuationProblem } from './reason.mjs';

export interface Violation {
  rule: number;
  file: string;
  detail: string;
}

interface CssRule {
  selector: string;
  body: string;
  media: string | null;
}

/** Flat list of style rules with the @media (if any) they sit in. Comments stripped. */
export function cssRules(css: string): CssRule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: CssRule[] = [];
  const stack: string[] = [];
  let i = 0;
  let head = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '{') {
      const sel = head.trim();
      head = '';
      if (sel.startsWith('@media') || sel.startsWith('@container') || sel.startsWith('@supports')) {
        stack.push(sel);
      } else if (sel.startsWith('@keyframes')) {
        // keep keyframes as one rule so their bodies are still checked
        let depth = 1;
        let j = i + 1;
        while (j < src.length && depth) {
          if (src[j] === '{') depth++;
          else if (src[j] === '}') depth--;
          j++;
        }
        out.push({ selector: sel, body: src.slice(i + 1, j - 1), media: stack.at(-1) ?? null });
        i = j;
        continue;
      } else {
        const end = src.indexOf('}', i);
        out.push({ selector: sel, body: src.slice(i + 1, end), media: stack.find((m) => m.startsWith('@media')) ?? null });
        i = end + 1;
        continue;
      }
    } else if (c === '}') {
      stack.pop();
      head = '';
    } else {
      head += c;
    }
    i++;
  }
  return out;
}

const HANGUL = /[가-힣]/;
/** String literals and template literals that contain Hangul (the UI copy). */
export function uiStrings(code: string): string[] {
  const noComments = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  const out: string[] = [];
  for (const m of noComments.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const s = m[1] ?? m[2] ?? m[3] ?? '';
    if (HANGUL.test(s)) out.push(s);
  }
  return out;
}

/** Visible text and aria-labels of an HTML document (tags, comments and <style>/<script> removed). */
export function htmlStrings(html: string): string[] {
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(style|script)[\s\S]*?<\/\1>/g, '');
  const out: string[] = [];
  for (const m of body.matchAll(/aria-label="([^"]*)"|content="([^"]*)"/g)) {
    const s = m[1] ?? m[2] ?? '';
    if (HANGUL.test(s)) out.push(s);
  }
  for (const t of body.replace(/<[^>]+>/g, '\n').split('\n')) if (HANGUL.test(t)) out.push(t.trim());
  return out;
}

const SHADOW = /gradient|box-shadow|text-shadow|drop-shadow|backdrop-filter/;
const SYMBOLS = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2728}\u{2665}\u{2661}\u{21C4}]/u;
const WORDS =
  /AI|맞춤|알고리즘|추천|당신|완벽한|특별한|최고의|숨은|인생샷|힐링|감성|잊지 못할|다양한|매력적인|엄선|딱 맞는|어떨까요|도와드릴게요|걱정 마세요|되어집니다|가능합니다|할 수 있습니다/;
const FORMAL = /[습입됩합]니다|십시오/; // 합쇼체: 해요체 only (§9)
// 15 · 17 · 20 · 24px, written in rem so a larger browser text size (or root font-size 200%) scales them.
const FONT_SIZES = new Set(['0.9375rem', '1.0625rem', '1.25rem', '1.5rem']);
/** The one exception (SPEC §3.2, design.md F2): the fallback date field, never under 16px or iOS zooms in. */
const fontSizeOk = (selector: string, size: string) => FONT_SIZES.has(size) || (selector === '.date-in' && size.replace(/\s+/g, '') === 'max(1rem,16px)');
/** design/SPEC.md §10 forms that make a place sentence read as a template ("~하기 좋아요", 인생샷 …),
 * with the 3판 additions (겉바속촉, 돈까스, 아름다운, 여유를 누려요, 공간이에요).
 * "공기 좋은" is a noun + adjective, not the "~기 좋은" template; "…에 있어요" is not "~에 있어(서)". */
export const REASON_BANNED =
  /(?<!공)기 좋아요|(?<!공)기 좋은|인생샷|힐링|다양한|특별한|완벽한|최고의|숨은 보석|숨은 명소|감성 넘치는|잊지 못할|매력적인|[을를] 통해|에 있어서|할 수 있습니다|가능합니다|되어집니다|여유를 즐겨요|겉바속촉|돈까스|아름다운|여유를 누려요|공간이에요/;
const WEIGHTS = new Set(['400', '600', '700']);
const RADII = /^(var\(--r-(ctl|photo|thumb|sheet)\)( var\(--r-(ctl|photo|thumb|sheet)\))*( 0 0)?|6px|4px)$/;
// #18 (3판): selection is a check, weight or underline — never a filled surface.
const SEL_TOKEN = /--sel-/;
const ACCENT_OK = new Set(['.saved-btn svg', '.heart[aria-pressed="true"]']);
const FIXED_HEIGHT_OK = /^(\.heart|\.ghost \.bar|\.sr|\.ph img|\.ghost \.bar:first-child|\.more-end)$/;

export function checkCss(file: string, css: string, v: Violation[]) {
  const add = (rule: number, detail: string) => v.push({ rule, file, detail });
  if (SHADOW.test(css)) add(1, css.match(SHADOW)![0]);
  if (/@font-face|fonts\.googleapis|cdn/.test(css)) add(16, 'external font');
  if (SEL_TOKEN.test(css)) add(18, css.match(/--sel-[\w-]*/)![0]);
  for (const r of cssRules(css)) {
    const sels = r.selector.split(',').map((s) => s.trim());
    const isRoot = r.selector === ':root';
    for (const m of r.body.matchAll(/content:\s*"([^"]*)"/g)) if (SYMBOLS.test(m[1])) add(2, `${r.selector} content ${m[1]}`);
    for (const m of r.body.matchAll(/font-size:\s*([^;]+)/g)) if (!fontSizeOk(r.selector, m[1].trim())) add(7, `${r.selector} font-size ${m[1]}`);
    for (const m of r.body.matchAll(/font-weight:\s*([^;]+)/g)) if (!WEIGHTS.has(m[1].trim())) add(8, `${r.selector} font-weight ${m[1]}`);
    if (!isRoot && /#[0-9a-f]{3,8}\b|rgba?\(/i.test(r.body)) add(9, `${r.selector} colour literal`);
    if (/var\(--accent\)/.test(r.body) && !sels.every((s) => ACCENT_OK.has(s))) add(10, `${r.selector} uses --accent`);
    for (const m of r.body.matchAll(/opacity:\s*([^;]+)/g)) {
      const ok = m[1].trim() === '0.72' || (m[1].trim() === '0' && r.selector.startsWith('@keyframes'));
      if (!ok) add(11, `${r.selector} opacity ${m[1]}`);
    }
    if (!isRoot && /rgb\([^)]*\/[^)]*\)/.test(r.body)) add(11, `${r.selector} translucent colour`);
    for (const m of r.body.matchAll(/border-radius:\s*([^;]+)/g)) if (!RADII.test(m[1].trim())) add(12, `${r.selector} radius ${m[1]}`);
    if (/(^|[;\s])(animation|transition)\s*:/.test(r.body)) {
      if (!r.media?.includes('prefers-reduced-motion: no-preference')) add(13, `${r.selector} moves outside reduced-motion guard`);
      for (const d of r.body.matchAll(/(\d+)ms/g)) if (Number(d[1]) > 240) add(13, `${r.selector} ${d[0]}`);
      if (sels.some((s) => /(^|\s)\.card\b/.test(s))) add(13, `${r.selector} animates a card`);
    }
    if (/text-align:\s*center/.test(r.body)) add(14, `${r.selector} centred`);
    for (const m of r.body.matchAll(/(^|[;\s])height:\s*([^;]+)/g)) {
      if (!sels.every((s) => FIXED_HEIGHT_OK.test(s))) add(15, `${r.selector} height ${m[2]}`);
    }
    const pressedFill = sels.some((s) => /\[aria-(pressed|current)(=["']?(true|page)["']?(\s+i)?)?\]/.test(s) && !s.startsWith('.saved-btn'));
    const fills = [...r.body.matchAll(/(^|[;\s])background(-color)?\s*:\s*([^;]+)/g)].some((m) => !/^(none|transparent|initial)$/.test(m[3].trim()));
    if (pressedFill && fills) add(18, `${r.selector} fills the selection`);
  }
}

export function checkStrings(file: string, strings: string[], v: Violation[]) {
  const add = (rule: number, detail: string) => v.push({ rule, file, detail });
  for (const s of strings) {
    if (SYMBOLS.test(s)) add(2, s);
    if (/[!—–]/.test(s)) add(3, s);
    const w = s.match(WORDS);
    if (w) add(4, `${w[0]} in "${s}"`);
    if (FORMAL.test(s)) add(5, s);
    // a noun ending never takes a full stop (only "…요." sentences do)
    if (/[가-힣]\.$/.test(s) && !/요\.$/.test(s)) add(6, s);
  }
}

/** #17 banned forms and #19 punctuation (3판: no full stop, one sentence) over the shipped reasons. */
export function checkReasons(file: string, spots: readonly { id: string; reason: string }[], v: Violation[]) {
  for (const s of spots) {
    const m = s.reason.match(REASON_BANNED);
    if (m) v.push({ rule: 17, file, detail: `${m[0]} in ${s.id}: ${s.reason}` });
    const p = reasonPunctuationProblem(s.reason);
    if (p) v.push({ rule: 19, file, detail: `${p} in ${s.id}: ${s.reason}` });
  }
}

function listFiles(dir: string, ext: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? listFiles(join(dir, d.name), ext) : ext.test(d.name) ? [join(dir, d.name)] : [],
  );
}

export function checkSlop(root: string, opts: { dist?: boolean } = {}): Violation[] {
  const v: Violation[] = [];
  const read = (f: string) => readFileSync(f, 'utf8');
  for (const f of listFiles(join(root, 'src'), /\.css$/)) checkCss(f, read(f), v);
  for (const f of listFiles(join(root, 'src'), /\.ts$/)) {
    const code = read(f);
    if (SHADOW.test(code)) v.push({ rule: 1, file: f, detail: code.match(SHADOW)![0] });
    if (SEL_TOKEN.test(code)) v.push({ rule: 18, file: f, detail: code.match(/--sel-[\w-]*/)![0] });
    checkStrings(f, uiStrings(code), v);
  }
  const indexHtml = read(join(root, 'index.html'));
  if (/@font-face|fonts\.googleapis|fonts\.gstatic/.test(indexHtml)) v.push({ rule: 16, file: 'index.html', detail: 'external font' });
  if (SEL_TOKEN.test(indexHtml)) v.push({ rule: 18, file: 'index.html', detail: indexHtml.match(/--sel-[\w-]*/)![0] });
  checkStrings('index.html', htmlStrings(indexHtml), v);
  const manifest = JSON.parse(read(join(root, 'public/manifest.webmanifest'))) as Record<string, unknown>;
  checkStrings('manifest.webmanifest', [manifest.name, manifest.short_name, manifest.description].filter((x): x is string => typeof x === 'string'), v);
  // #17 · #19: the place sentences are on screen as much as the UI copy.
  checkReasons('spots.json', JSON.parse(read(join(root, 'public/spots.json'))), v);
  if (opts.dist) {
    for (const f of listFiles(join(root, 'dist/assets'), /\.css$/)) {
      const css = read(f);
      if (SHADOW.test(css)) v.push({ rule: 1, file: f, detail: css.match(SHADOW)![0] });
      if (/@font-face|fonts\.googleapis/.test(css)) v.push({ rule: 16, file: f, detail: 'external font' });
      if (SEL_TOKEN.test(css)) v.push({ rule: 18, file: f, detail: css.match(/--sel-[\w-]*/)![0] });
    }
    for (const f of listFiles(join(root, 'dist/assets'), /\.js$/)) checkStrings(f, uiStrings(read(f)), v);
  }
  return v;
}

// CLI: npm run check:slop
if (process.argv[1] && /check-slop\.ts$/.test(process.argv[1])) {
  const root = resolve(process.argv[1], '../..');
  const found = checkSlop(root, { dist: existsSync(join(root, 'dist')) });
  for (const x of found) console.log(`#${x.rule}  ${x.file}  ${x.detail}`);
  console.log(found.length ? `${found.length} violation(s)` : 'slop checklist: 0 violations');
  process.exitCode = found.length ? 1 : 0;
}
