// 써 본 사람에게 묻는 짧은 설문 (ADR-0081, specs/survey.md). When the home's one line may show, and what 보내기
// sends. Pure: the device record comes in, a decision or a body goes out.

/** `localStorage['jeju.survey']`, this device only. */
export interface SurveyRec {
  /** a card's place link or 길찾기 was opened on this device */
  map?: boolean;
  /** visits in which the home line was drawn */
  shown?: number;
  /** the line was tapped */
  tapped?: boolean;
}

/** Visits with the line on screen before it stops by itself. */
export const SURVEY_VISITS = 3;

export function parseSurvey(v: unknown): SurveyRec {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const out: SurveyRec = {};
  if (o.map === true) out.map = true;
  if (typeof o.shown === 'number' && Number.isInteger(o.shown) && o.shown > 0) out.shown = o.shown;
  if (o.tapped === true) out.tapped = true;
  return out;
}

/** The record as read when the app opened: a map opened in an earlier visit, not tapped, fewer than 3 visits. */
export const surveyDue = (rec: SurveyRec) => !!rec.map && !rec.tapped && (rec.shown ?? 0) < SURVEY_VISITS;

export const WENT = ['went', 'not', 'yet'] as const;
export const PAINS = ['far', 'closed', 'meh', 'gps', 'slow'] as const;
export const TEXT_MAX = 500;

export interface FeedbackBody {
  went?: (typeof WENT)[number];
  pains?: (typeof PAINS)[number][];
  pain?: string;
  wish?: string;
  v: string;
}

/** What the form says, as sent; null when nothing was chosen or written (보내기 then just closes). */
export function feedbackBody(form: { went: string | null; pains: readonly string[]; pain: string; wish: string }, v: string): FeedbackBody | null {
  const body: FeedbackBody = { v };
  const went = WENT.find((w) => w === form.went);
  if (went) body.went = went;
  const pains = PAINS.filter((p) => form.pains.includes(p));
  if (pains.length) body.pains = pains;
  const pain = form.pain.trim().slice(0, TEXT_MAX);
  if (pain) body.pain = pain;
  const wish = form.wish.trim().slice(0, TEXT_MAX);
  if (wish) body.wish = wish;
  return body.went || body.pains || body.pain || body.wish ? body : null;
}
