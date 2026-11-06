// Anonymous usage counts (ADR-0061, 0080, 0085, 0089) and the survey (ADR-0081): what is counted, once, and the
// feedback sheet's 보내기. A feature controller of mountApp (ADR-0126).
import { type Day } from '../dates';
import { seasonOn, type SeasonKind } from '../pick/season';
import { whenDay } from '../state';
import { feedbackBody } from '../usage/survey';
import { ageOf, contextOf, type EventName, type UsageEvent } from '../usage/track';
import type { AppCtx } from './ctx';

export function createUsage(app: AppCtx) {
  // --- anonymous usage counts (ADR-0061): place-level events, never a position ---
  /** `day`: the day a heart is about (dated = not today). `season`: the kind whose 철 words the card showed (ADR-0080).
   * `flow`: the saved-list fields (ADR-0085). */
  function count(e: EventName, id?: string, day?: Day, season?: SeasonKind | null, flow?: Pick<UsageEvent, 'live0' | 'past' | 'from' | 'age' | 'op'>) {
    const ev: UsageEvent = { e, ...(id ? { id } : {}), ...contextOf(app.state), ...(day ? { dated: day !== app.state.today } : {}), ...(season ? { season } : {}), ...flow };
    app.tracker.track(ev);
    if (app.state.tracking) app.deps.analytics?.event(ev);
    if (app.state.src && (e === 'tap' || e === 'map')) countSrc(e);
  }
  /** 숙소 링크 (ADR-0089): while this visit came in by one, tap / map (and the arrival's open) once more under
   * `src:<tag>`, to our own collector only (never GA4·네이버). */
  function countSrc(e: 'open' | 'tap' | 'map') {
    app.tracker.track({ e, id: `src:${app.state.src}`, d: app.state.today });
  }
  /** Each new set of 3 on screen, once: a re-render, the same 3 brought back or restored after a reload are
   * not shown again. */
  let shownSeq = 0;
  function countShown() {
    const c = app.state.cards;
    if (!c || c.seq === shownSeq || app.state.view !== 'cards' || app.state.phase.k !== 'ready') return;
    shownSeq = c.seq;
    if (c.how === 'restore') return;
    for (const card of c.list) count('shown', card.spot.id, undefined, seasonOn(card.spot.season, whenDay(app.state)));
  }
  /** The 철 a results card shows (ADR-0080); none on the saved list. */
  function seasonShown(id: string): SeasonKind | null {
    const card = app.state.view === 'cards' ? app.state.cards?.list.find((c) => c.spot.id === id) : undefined;
    return card ? seasonOn(card.spot.season, whenDay(app.state)) : null;
  }
  /** 길찾기 from a saved-list row (ADR-0085): days since that row was saved (never the day itself) and whether
   * it is under 지난 날. */
  function savedFlow(id: string, date: Day | undefined): Pick<UsageEvent, 'from' | 'age' | 'past'> | undefined {
    if (app.state.view !== 'saved' || !date) return undefined;
    const entry = app.state.saved.find((x) => x.id === id && x.date === date) ?? app.state.unsaved.find((x) => x.id === id && x.date === date);
    const age = ageOf(entry?.at, app.state.today);
    return { from: 'saved', ...(age !== undefined ? { age } : {}), ...(date < app.state.today ? { past: true as const } : {}) };
  }
  /** A link tapped twice (a 2nd tab opening) counts once. */
  const lastLink = new Map<string, number>();
  function countLink(e: 'map' | 'book', id: string, date?: Day) {
    if (e === 'map') markMap();
    const key = `${e}:${id}`;
    const t = app.now();
    const prev = lastLink.get(key);
    lastLink.set(key, t);
    if (prev !== undefined && t - prev < app.delays.guard) return;
    count(e, id, undefined, e === 'map' ? seasonShown(id) : null, e === 'map' ? savedFlow(id, date) : undefined);
    // sent now: the map app may take the page away before it goes hidden (an in-app WebView); the queue empties first
    app.tracker.flush();
  }
  // --- the survey (ADR-0081, specs/survey.md): all on this device; only 보내기 sends anything ---
  let mapMarked = !!app.survey0.map;
  /** a map opened on this device (local only): the survey line may show from the next visit */
  function markMap() {
    if (mapMarked) return;
    mapMarked = true;
    app.store.updateSurvey((r) => ({ ...r, map: true }));
  }
  let surveyCounted = false;
  /** a visit in which the line was drawn on the home counts once (3 such visits, then it stops) */
  function countSurvey() {
    if (surveyCounted || !app.state.surveyLine || !app.state.tracking || app.state.view !== 'home') return;
    surveyCounted = true;
    app.store.updateSurvey((r) => ({ ...r, shown: (r.shown ?? 0) + 1 }));
  }
  function openSurvey() {
    if (app.guarded('survey')) return;
    app.store.updateSurvey((r) => ({ ...r, tapped: true }));
    app.dispatch({ type: 'surveyTapped' });
    app.openOverlay('feedback');
  }
  /** 보내기: nothing chosen or written closes; otherwise one POST, not waited for, and 고마워요 whatever happens */
  function sendFeedback() {
    if (app.state.overlay !== 'feedback' || app.state.feedbackSent || app.guarded('feedback-send')) return;
    const checked = (name: string) => [...app.els.sheet.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((i) => i.value);
    const text = (id: string) => app.els.sheet.querySelector<HTMLTextAreaElement>(`#${id}`)?.value ?? '';
    const body = feedbackBody({ went: checked('fb-went')[0] ?? null, pains: checked('fb-pain'), pain: text('fb-pain-text'), wish: text('fb-wish') }, app.deps.appVersion ?? 'dev');
    if (!body) return app.closeOverlay();
    try {
      app.deps.postFeedback?.(JSON.stringify(body));
    } catch {
      /* the app never depends on it */
    }
    app.dispatch({ type: 'feedbackSent' });
  }
  return { count, countSrc, countShown, countLink, countSurvey, openSurvey, sendFeedback };
}
