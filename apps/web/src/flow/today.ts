// 오늘 판's timed parts (ADR-0126): the 노을 timer (ADR-0083, 밤 ADR-0091) and 비 소식 (ADR-0076).
// mountApp calls duskTimer and askRain after every draw (drawn) and resetDusk on a new minute (tick).
import { minuteOf } from '../dates';
import { fetchRain } from '../effects';
import { DUSK_LEAD_MIN, sunPoint } from '../pick/home';
import { sunriseMinutes, sunsetMinutes } from '../pick/sun';
import { homeOrigin, rainArea } from '../state';
import { RAIN_TTL_MS } from '../store';
import type { AppCtx } from './ctx';

/** a failed 비 소식 ask is tried again this soon (오늘 근처 lists follow the same pace) */
export const RAIN_RETRY_MS = 5 * 60_000;

export function createToday(app: AppCtx) {
  /** 노을 줄 (ADR-0083): one timer to the next moment 노을 볼 곳 opens (2시간 30분 before the sunset at the home's
   * point) or closes (the sunset), set again when that point or the day changes. No minute-by-minute ticking.
   * 밤 (ADR-0091) runs from that sunset to the sunrise, so the sunrise is a moment too. */
  let duskKey = '';
  let duskAt: ReturnType<typeof setTimeout> | null = null;
  /** the next duskTimer() sets the timer again (tick: a new minute was read) */
  function resetDusk() {
    duskKey = '';
  }
  /** before the sunrise (0), then before (1), in (2) or after (3) the 노을 window at the home's point today; -1 unknown */
  function duskPhase(clock: number | null): number {
    if (clock == null) return -1;
    const p = sunPoint(homeOrigin(app.state), app.state.dest, app.state.sgg);
    const set = sunsetMinutes(p, app.state.today);
    return clock < sunriseMinutes(p, app.state.today) ? 0 : clock < set - DUSK_LEAD_MIN ? 1 : clock < set ? 2 : 3;
  }
  function duskTimer() {
    const p = sunPoint(homeOrigin(app.state), app.state.dest, app.state.sgg);
    const key = `${p.lat},${p.lng}|${app.state.today}`;
    if (key === duskKey) return;
    duskKey = key;
    if (duskAt) {
      clearTimeout(duskAt);
      app.timers.delete(duskAt);
      duskAt = null;
    }
    const now = minuteOf(app.clockNow());
    // a new point can put now on the other side of an edge (another basis, another sunset): redraw, like tick()
    if (duskPhase(now) !== duskPhase(app.state.clock)) {
      duskKey = '';
      return app.dispatch({ type: 'clock', clock: now }); // its own duskTimer() call sets the timer
    }
    const set = sunsetMinutes(p, app.state.today);
    const rise = sunriseMinutes(p, app.state.today);
    const next = now < rise ? rise : now < set - DUSK_LEAD_MIN ? set - DUSK_LEAD_MIN : now < set ? set : null;
    if (next == null) return; // after the sunset: the midnight tick reads the clock again
    duskAt = app.later((next - now) * 60_000 + 500, () => {
      duskAt = null;
      duskKey = '';
      app.dispatch({ type: 'clock', clock: minuteOf(app.clockNow()) });
    });
  }

  // --- 비 소식 (ADR-0076): asked for the area the home speaks for, again once an answer is 30 minutes old (or 5
  // minutes after a failed ask); the session keeps an answer 30 minutes. One ask in flight at a time. ---
  let rainAsked: { area: string; at: number; ok: boolean } | null = null;
  let rainBusy = false;
  function askRain() {
    const area = rainArea(app.state);
    if (!area || !app.deps.fetch || rainBusy) return;
    const now = app.clockNow().getTime();
    if (rainAsked?.area === area && now - rainAsked.at < (rainAsked.ok ? RAIN_TTL_MS : RAIN_RETRY_MS)) return;
    const kept = app.store.readRain(now);
    if (kept?.area === area) {
      rainAsked = { area, at: kept.at, ok: true };
      return app.dispatch({ type: 'rain', area, rain: kept.rain });
    }
    rainBusy = true;
    fetchRain(area, app.deps.fetch).then((rain) => {
      rainBusy = false;
      if (app.signal.aborted) return;
      const at = app.clockNow().getTime();
      rainAsked = { area, at, ok: rain !== null };
      // a failed ask after an expired answer must not leave the old rain row up for hours; a first one settles the row
      // as none (render.ts stops holding its place)
      if (rain === null) return void (!(app.state.rain?.area === area && !app.state.rain.rain) && app.dispatch({ type: 'rain', area, rain: false }));
      app.store.writeRain({ v: 1, area, at, rain });
      app.dispatch({ type: 'rain', area, rain });
    });
  }
  return { duskPhase, duskTimer, resetDusk, askRain };
}
