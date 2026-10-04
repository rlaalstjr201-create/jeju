// 의견 보내기 (ADR-0081, specs/survey.md "받는 쪽"): one host-agnostic handler on the Fetch API. POST one
// JSON object of known fields → validated → one row (Jeju day, answers, app version). The day is the
// server's; nothing else of the request is read: no IP, user agent, cookie or header is looked at or stored.
import { dayOf, type Day } from '../src/dates';

export const FEEDBACK_MAX_BYTES = 4 * 1024;
export const FEEDBACK_MAX_TEXT = 500;
/** rows kept per Jeju day (abuse stop, ADR-0081 3); past it the answer is still 204, nothing is stored. */
export const FEEDBACK_DAILY_CAP = 200;

export const WENT = ['went', 'not', 'yet'] as const;
export const PAINS = ['far', 'closed', 'meh', 'gps', 'slow'] as const;
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
}

const FIELDS = new Set(['went', 'pains', 'pain', 'wish', 'v']);
const VERSION = /^[0-9a-z.-]{1,20}$/;
const isText = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= FEEDBACK_MAX_TEXT;

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

export async function handleFeedback(req: Request, store: FeedbackStore, now: () => Date = () => new Date()): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const declared = Number(req.headers.get('content-length'));
  if (declared > FEEDBACK_MAX_BYTES) return new Response(null, { status: 413 });
  const parsed = parseFeedback(await req.text());
  if (!parsed.ok) return new Response(parsed.error, { status: parsed.status });
  await store.add({ day: dayOf(now()), ...parsed.feedback }, FEEDBACK_DAILY_CAP);
  return new Response(null, { status: 204 });
}

export function memoryFeedbackStore(): FeedbackStore & { rows: FeedbackRow[] } {
  const rows: FeedbackRow[] = [];
  return {
    rows,
    async add(row, cap) {
      if (rows.filter((r) => r.day === row.day).length >= cap) return false;
      rows.push({ ...row });
      return true;
    },
  };
}
