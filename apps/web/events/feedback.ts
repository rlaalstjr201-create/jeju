// 의견 보내기 (ADR-0081, specs/survey.md "받는 쪽"): one host-agnostic handler on the Fetch API. POST one
// JSON object of known fields → validated → one row (Jeju day, answers, app version). The day is the
// server's; nothing else of the request is read: no IP, user agent, cookie or header is looked at or stored.
import { dayOf, type Day } from '../src/dates';
import { PAINS, TEXT_MAX, WENT } from '../src/usage/survey';

const FEEDBACK_MAX_BYTES = 4 * 1024;
/** rows kept per Jeju day (abuse stop, ADR-0081 3); past it the answer is still 204, nothing is stored. */
export const FEEDBACK_DAILY_CAP = 200;

export type Went = (typeof WENT)[number];
export type Pain = (typeof PAINS)[number];

export interface Feedback {
  went?: Went;
  pains?: Pain[];
  /** 그 밖에 불편했던 점 */
  pain?: string;
  /** 있었으면 하는 것 */
  wish?: string;
  /** app version */
  v: string;
}

export interface FeedbackRow extends Feedback {
  day: Day;
}

export interface FeedbackStore {
  /** Stores the row unless `cap` rows of that day are already in; true when stored. */
  add(row: FeedbackRow, cap: number): Promise<boolean>;
  /** One answer turned away by the cap on `day` (counted, nothing of it kept). */
  capped(day: Day): Promise<void>;
}

const FIELDS = new Set(['went', 'pains', 'pain', 'wish', 'v']);
const VERSION = /^[0-9a-z.-]{1,20}$/;
/** control and bidi-override characters; a newline and a tab are allowed */
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const isText = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= TEXT_MAX && !CONTROL.test(v);

export type Parsed = { ok: true; feedback: Feedback } | { ok: false; status: 400 | 413; error: string };

export function parseFeedback(body: string): Parsed {
  if (new TextEncoder().encode(body).length > FEEDBACK_MAX_BYTES) return { ok: false, status: 413, error: 'too large' };
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, error: 'not JSON' };
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, status: 400, error: 'not an object' };
  const o = v as Record<string, unknown>;
  const bad = (error: string): Parsed => ({ ok: false, status: 400, error });
  const extra = Object.keys(o).find((k) => !FIELDS.has(k));
  if (extra) return bad(`unknown field ${extra}`);
  if (typeof o.v !== 'string' || !VERSION.test(o.v)) return bad('v');
  const out: Feedback = { v: o.v };
  if (o.went !== undefined) {
    if (!WENT.includes(o.went as Went)) return bad('went');
    out.went = o.went as Went;
  }
  if (o.pains !== undefined) {
    const p = o.pains;
    if (!Array.isArray(p) || !p.length || p.length > PAINS.length || new Set(p).size !== p.length || !p.every((x) => PAINS.includes(x as Pain))) return bad('pains');
    out.pains = p as Pain[];
  }
  for (const k of ['pain', 'wish'] as const) {
    if (o[k] === undefined) continue;
    if (!isText(o[k])) return bad(k);
    out[k] = (o[k] as string).trim();
  }
  if (!out.went && !out.pains && !out.pain && !out.wish) return bad('no answer');
  return { ok: true, feedback: out };
}

/** The body as text, or null once it passes `max` bytes (read as a stream: never more than that is held). The
 * collector (handler.ts) reads its batches the same way. */
export async function readLimited(req: Request, max: number): Promise<string | null> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export async function handleFeedback(req: Request, store: FeedbackStore, now: () => Date = () => new Date()): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  // JSON only: a cross-site HTML form cannot send it without a preflight
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return new Response(null, { status: 415 });
  const length = req.headers.get('content-length');
  if (length === null) return new Response(null, { status: 411 });
  if (!(Number(length) <= FEEDBACK_MAX_BYTES)) return new Response(null, { status: 413 });
  const body = await readLimited(req, FEEDBACK_MAX_BYTES);
  if (body === null) return new Response(null, { status: 413 });
  const parsed = parseFeedback(body);
  if (!parsed.ok) return new Response(parsed.error, { status: parsed.status });
  const day = dayOf(now());
  if (!(await store.add({ day, ...parsed.feedback }, FEEDBACK_DAILY_CAP))) await store.capped(day);
  return new Response(null, { status: 204 });
}

export function memoryFeedbackStore(): FeedbackStore & { rows: FeedbackRow[]; cappedByDay: Map<Day, number> } {
  const rows: FeedbackRow[] = [];
  const cappedByDay = new Map<Day, number>();
  return {
    rows,
    cappedByDay,
    async capped(day) {
      cappedByDay.set(day, (cappedByDay.get(day) ?? 0) + 1);
    },
    async add(row, cap) {
      if (rows.filter((r) => r.day === row.day).length >= cap) return false;
      rows.push({ ...row });
      return true;
    },
  };
}
