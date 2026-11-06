// 오늘 서울 둘러보기 (ADR-0114 7, ADR-0117 5, ADR-0124 6): opening the browse view and a card's sheet over 서울 홈, and
// counting them to our own collector only. A feature controller of mountApp (ADR-0126).
import { culturePart } from '../region/release';
import { dwellBucket, type UsageEvent } from '../usage/track';
import type { AppCtx } from './ctx';

export function createBrowse(app: AppCtx) {
  // --- 오늘 서울 둘러보기 (ADR-0114 7): our own collector only (never GA4·네이버), no item, no position ---
  let browsing: { at: number; cards: number } | null = null;
  /** never under a webdriver, like the first screen's (QA runs must not move the verdict) */
  const countBrowse = (ev: UsageEvent) => void (app.nav0?.webdriver || app.tracker.track(ev));
  function openBrowse() {
    if (app.state.overlay || app.state.view !== 'home' || app.guarded('browse')) return;
    app.openOverlay('browse');
    if (app.state.overlay !== 'browse') return;
    browsing = { at: app.now(), cards: 0 };
    countBrowse({ e: 'browse_open', d: app.state.today });
  }
  /** Left (closed, or the page hidden: a map app opened from it may never bring it back), once per opening. */
  function endBrowse() {
    const b = browsing;
    if (!b) return;
    browsing = null;
    countBrowse({ e: 'browse_done', secs: dwellBucket(app.now() - b.at), rows: Math.min(10, culturePart()?.scrolledRows() ?? 0), cards: Math.min(2, b.cards) as 0 | 1 | 2, d: app.state.today });
    app.tracker.flush();
  }
  /** A card's sheet over 서울 홈 (ADR-0117 5): an entry of its own (back closes it). `slot` (ADR-0124 6): what the card was
   * on its shelf, its data-slot. */
  function openBrowseCard(id: string | undefined, slot?: string) {
    if (app.state.overlay || app.state.view !== 'home' || !id || app.guarded('browse-card')) return;
    app.hush();
    app.dispatch({ type: 'browseCard', id });
    if (!app.state.overlay) return; // not taken (no list for today)
    app.nav.push({ view: app.state.view, overlay: 'browse-card' });
    if (browsing) browsing.cards++;
    countBrowse({ e: 'browse_card', d: app.state.today, ...(slot === 'new' || slot === 'pull' || slot === 'base' ? { slot } : {}) });
  }
  return { countBrowse, openBrowse, endBrowse, openBrowseCard };
}
