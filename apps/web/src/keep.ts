// Keeping saves without a login (ADR-0063 2): the backup link, in-app browser detection and the home-screen
// nudge's kind. Pure functions, no DOM state; app.ts wires them up.
import { addDays, isDay, type Day } from './dates';
import { DEFAULT_MAP_APP, MAP_APPS, type MapApp } from './links';
import { MAX_SAVED, normalizeEntries } from './store';
import type { SavedEntry } from './types';

// --- backup link: the saved list after `#s=` (a fragment never reaches a server or its logs) ---
// Bytes, then base64url. [version 1] then per day: [day: varint days since EPOCH][count: varint][ids…], days
// ascending, ids in the user's order. An id is [0][16 bytes] when it is a lowercase UUID (every spot id
// today), else [length 1–255][UTF-8]. 비 와요(실내만) on (ADR-0065) adds `&r=1` after the list; a map app other
// than 네이버지도 (ADR-0071) adds `&m=kakao` or `&m=tmap`.
export const BACKUP_HASH = '#s=';
const INDOOR_FLAG = 'r=1';
const MAP_FLAG = 'm=';
const VERSION = 1;
const EPOCH: Day = '2020-01-01';
const MAX_DAY = 36_600; // ~2120
const MAX_CHARS = 20_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY_MS = 86_400_000;
const dayIndex = (d: Day) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${EPOCH}T00:00:00Z`)) / DAY_MS);

function varint(out: number[], n: number) {
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s: string): Uint8Array | null {
  if (!s || s.length > MAX_CHARS || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** The saved list as a compact URL-safe string (ids that cannot be written, days before 2020: left out). */
export function encodeBackup(entries: readonly SavedEntry[]): string {
  const out: number[] = [VERSION];
  const enc = new TextEncoder();
  const list = normalizeEntries(entries.filter((e) => isDay(e.date) && dayIndex(e.date) >= 0 && dayIndex(e.date) <= MAX_DAY));
  for (let i = 0; i < list.length; ) {
    const day = list[i].date;
    const ids: number[][] = [];
    for (; i < list.length && list[i].date === day; i++) {
      const id = list[i].id;
      if (UUID.test(id)) ids.push([0, ...id.replace(/-/g, '').match(/../g)!.map((h) => parseInt(h, 16))]);
      else {
        const b = [...enc.encode(id)];
        if (b.length && b.length < 256) ids.push([b.length, ...b]);
      }
    }
    if (!ids.length) continue;
    varint(out, dayIndex(day));
    varint(out, ids.length);
    for (const b of ids) out.push(...b);
  }
  return toBase64Url(Uint8Array.from(out));
}

/** The saved list in a backup string, validated (version, days, ids, length) — or null for anything else.
 * An empty list is null too: there is nothing to bring over. */
export function decodeBackup(s: string): SavedEntry[] | null {
  const b = fromBase64Url(s);
  if (!b || b[0] !== VERSION) return null;
  const dec = new TextDecoder('utf-8', { fatal: true });
  let i = 1;
  const read = (): number | null => {
    let n = 0;
    let mul = 1;
    for (let k = 0; k < 5 && i < b.length; k++) {
      const x = b[i++];
      n += (x & 0x7f) * mul;
      if (x < 0x80) return n;
      mul *= 0x80;
    }
    return null;
  };
  const out: SavedEntry[] = [];
  while (i < b.length) {
    const d = read();
    const count = read();
    if (d === null || count === null || d > MAX_DAY || count < 1 || out.length + count > MAX_SAVED) return null;
    const date = addDays(EPOCH, d);
    for (let order = 0; order < count; order++) {
      const len = b[i++];
      if (len === undefined) return null;
      let id: string;
      if (len === 0) {
        if (i + 16 > b.length) return null;
        const hex = [...b.slice(i, i + 16)].map((x) => x.toString(16).padStart(2, '0')).join('');
        id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        i += 16;
      } else {
        if (i + len > b.length) return null;
        try {
          id = dec.decode(b.slice(i, i + len));
        } catch {
          return null;
        }
        i += len;
      }
      out.push({ id, date, order });
    }
  }
  return out.length ? normalizeEntries(out) : null;
}

/** The app's own address: its base (vite `base`), no path, query or hash. */
export function appHome(href: string): string {
  return new URL(import.meta.env.BASE_URL ?? '/', href).href;
}

/** The app's address with the saved list after `#s=` (and 비 와요 when it is on, the map app when it is not 네이버지도). */
export function backupUrl(home: string, entries: readonly SavedEntry[], indoor = false, mapApp: MapApp = DEFAULT_MAP_APP): string {
  const app = mapApp !== DEFAULT_MAP_APP ? `&${MAP_FLAG}${mapApp}` : '';
  return `${home.split('#')[0]}${BACKUP_HASH}${encodeBackup(entries)}${indoor ? `&${INDOOR_FLAG}` : ''}${app}`;
}

/** A location hash: not a backup at all, or a backup (entries null when it does not read; `indoor` only when
 * the link says 비 와요 was on; `mapApp` only when the link names one). */
export function readBackup(hash: string): { found: false } | { found: true; entries: SavedEntry[] | null; indoor?: true; mapApp?: MapApp } {
  if (!hash.startsWith(BACKUP_HASH)) return { found: false };
  const [list, ...flags] = hash.slice(BACKUP_HASH.length).split('&');
  const entries = decodeBackup(list);
  if (!entries) return { found: true, entries };
  const app = flags.find((f) => f.startsWith(MAP_FLAG))?.slice(MAP_FLAG.length) as MapApp | undefined;
  return { found: true, entries, ...(flags.includes(INDOOR_FLAG) ? { indoor: true as const } : {}), ...(app && MAP_APPS.includes(app) ? { mapApp: app } : {}) };
}

// --- in-app browsers (ADR-0063 2b): each keeps its own storage, apart from the phone's browser ---
export type InApp = 'kakaotalk' | 'instagram' | 'facebook' | 'naver' | 'line' | 'daum';
const IN_APP: readonly [InApp, RegExp][] = [
  ['kakaotalk', /KAKAOTALK/i],
  ['naver', /NAVER\(inapp/i],
  ['daum', /DaumApps/i],
  ['line', /\bLine\/\d/],
  ['instagram', /\bInstagram\b/],
  ['facebook', /FBAN|FBAV|FB_IAB/],
];

export function inAppOf(ua: string): InApp | null {
  return IN_APP.find(([, re]) => re.test(ua))?.[0] ?? null;
}

/** KakaoTalk's own way out to the phone's browser. */
export function kakaoExternal(url: string): string {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
}

// --- home-screen nudge (ADR-0063 2d) ---
export type InstallHow = 'ios' | 'prompt';
/** iOS: the share sheet (no prompt API; iPadOS says Macintosh but has touch). Elsewhere only when the browser
 * has offered its install prompt. Never once installed, never inside an in-app browser. */
export function installHow(o: { ua: string; touch: number; standalone: boolean; prompt: boolean }): InstallHow | null {
  if (o.standalone || inAppOf(o.ua)) return null;
  if (/iPhone|iPad|iPod/.test(o.ua) || (/Macintosh/.test(o.ua) && o.touch > 1)) return 'ios';
  return o.prompt ? 'prompt' : null;
}

/** Text onto the clipboard; false when the browser would not (no permission, an old WebView). */
export async function copyText(doc: Document, text: string): Promise<boolean> {
  try {
    await doc.defaultView!.navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* try the old way */
  }
  try {
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'sr';
    doc.body.append(ta);
    ta.select();
    const ok = doc.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
