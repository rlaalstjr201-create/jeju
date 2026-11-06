// The sheets (basis, area, 숙소, day, settings, feedback): built when one opens, patched while it stays open, focus
// and inert handled here. A section of the renderer (ADR-0126): render.ts calls renderSheet in its fixed order.
import { areaLabel } from '../region/areas';
import { DEST, DESTS } from '../region/dest';
import { BUSAN, NATION, OPEN_AREAS, culturePart } from '../region/release';
import { DAYS_AHEAD, addDays, longDay, type Day } from '../dates';
import { homeOrigin } from '../pick/home';
import { REACHES } from '../pick/pick';
import { type State } from '../state';
import { PAINS, TEXT_MAX, WENT } from '../usage/survey';
import type { Overlay } from '../types';
import { COPY, BUSAN_COPY, destNameOf, dayName, nationOutside } from '../copy';
import { el, setText } from './dom';
import type { SheetKit } from './kit';
import { CHECK, SEARCH } from './icons';

export function createSheet(kit: SheetKit) {
  const { doc, els, win, timers, later, motion, icon, areaGroups, option, afterPaint } = kit;
  // --- sheet ---
  let sheetSig = '';
  let prevOverlay: Overlay = null;
  let opener: HTMLElement | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  /** 주소·숙소 검색's answer last told (patchAddr) */
  let geoSaid: State['geo'] | null = null;
  function sheetSigOf(s: State): string {
    // Only what the user changes in a sheet. News that arrives while it is open — a 숙소 GPS failure, a GPS
    // denial — is patched in place (patchSheet): a rebuild under the finger would reset its scroll and focus.
    // 의견 보내기 keeps what is typed: rebuilt only when it turns into 고마워요
    if (s.overlay === 'feedback') return `feedback|${s.feedbackSent}`;
    // 오늘 서울 둘러보기: the screen is built once per list and point — a card's sheet opening over it, or the minute read
    // again, never resets how far its shelves were scrolled (patchSheet puts the card's sheet on and takes it off)
    if (s.overlay === 'browse' || s.overlay === 'browse-card') return `browse|${s.culture?.day}|${homeOrigin(s)?.key ?? ''}|${s.mapApp}`;
    const move = s.overlay === 'move' && s.moveTarget ? `${s.moveTarget.id}|${s.moveTarget.date}` : '';
    return `${s.overlay}|${s.basis}|${s.region}|${s.stay?.area ?? ''}|${s.stay?.source ?? ''}|${s.reach}|${s.indoor}|${s.when}|${s.today}|${move}|${s.dest}|${s.destPick}`;
  }

  /** 「여행지 | 내 위치」 (ADR-0103): how the destination is decided — by the position (내 위치: the basis 지금 있는 곳, which
   * follows the position into another destination) or picked (여행지: any other basis, or that side pressed in this sheet).
   * Under 여행지 its chips, one row that scrolls sideways inside itself instead of wrapping. */
  function destToggle(panel: HTMLElement, s: State) {
    const pick = s.destPick || s.basis !== 'gps';
    const seg = optRow(
      option(BUSAN_COPY.destHead, null, { 'data-seg': 'pick', 'aria-pressed': String(pick) }),
      option(BUSAN_COPY.destGps, null, { 'data-seg': 'gps', 'aria-pressed': String(!pick) }),
    );
    seg.classList.add('seg-row');
    const box = el(doc, 'div', { class: 'opts seg', role: 'group', 'aria-label': BUSAN_COPY.destHead });
    box.append(seg);
    panel.append(box);
    if (!pick) return;
    const chips = el(doc, 'div', { class: 'chips', role: 'group', 'aria-label': BUSAN_COPY.destHead });
    for (const d of [...DESTS, 'nation' as const]) {
      const b = el(doc, 'button', { type: 'button', class: 'tbtn', 'data-dest': d, 'aria-pressed': String(s.dest === d) });
      b.append(el(doc, 'span', { class: 'nm' }, BUSAN_COPY.destName[d]));
      chips.append(b);
    }
    panel.append(chips);
  }
  /** 주소·숙소 검색 (ADR-0103) under its option: the words, then 검색 */
  function addrBox(): HTMLElement {
    const box = el(doc, 'div', { class: 'addr' });
    // a name or an address, not prose: no spelling underline, no capital or correction on a phone's keyboard
    const q = el(doc, 'input', { type: 'search', class: 'date-in addr-q', 'aria-label': BUSAN_COPY.addrSearch, placeholder: BUSAN_COPY.addrSearch, maxlength: '40', enterkeyhint: 'search', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' });
    // what was typed survives a rebuild of the sheet (언제 picked meanwhile)
    q.value = els.sheet.querySelector<HTMLInputElement>('.addr-q')?.value ?? '';
    const go = el(doc, 'button', { type: 'button', class: 'tbtn addr-go', 'data-action': 'addr-go', 'aria-label': BUSAN_COPY.addrGo });
    go.append(icon(SEARCH));
    box.append(q, go);
    return box;
  }
  /** The search's answers as option rows under 주소·숙소, and why there are none; patched, never a rebuild (the words typed stay). */
  function patchAddr(s: State) {
    const row = els.sheet.querySelector<HTMLElement>('.addr')?.closest<HTMLElement>('.optrow');
    if (!row) return;
    const go = row.querySelector<HTMLButtonElement>('.addr-go')!;
    // asking: never `disabled` (the focus on it would drop to the page) — marked, and app.ts searchAddr ignores it
    for (const a of ['aria-busy', 'aria-disabled']) {
      if (s.geo.pending) go.setAttribute(a, 'true');
      else go.removeAttribute(a);
    }
    const hits = s.geo.hits ?? [];
    const sig = JSON.stringify(hits);
    if (row.dataset.hits !== sig) {
      row.dataset.hits = sig;
      for (const r of els.sheet.querySelectorAll('.hit-row')) r.remove();
      row.after(
        ...hits.map((h, i) => {
          const r = optRow(option(h.name, h.addr, { 'data-hit': String(i) }));
          r.classList.add('hit-row');
          return r;
        }),
      );
    }
    const err = els.sheet.querySelector<HTMLElement>('.addr-err');
    if (err) {
      setText(err, s.geo.error ? BUSAN_COPY.addrError[s.geo.error] : '');
      err.hidden = !s.geo.error;
    }
    // told to a screen reader once per answer (polite): how many were found, or why none — not again when the sheet is rebuilt
    const live = els.sheet.querySelector<HTMLElement>('.addr-live');
    if (live && s.geo !== geoSaid) {
      geoSaid = s.geo;
      live.textContent = s.geo.pending ? '' : s.geo.error ? BUSAN_COPY.addrError[s.geo.error] : s.geo.hits ? BUSAN_COPY.addrFound(s.geo.hits.length) : '';
    }
  }

  /** A thin-rule list of rows under its own group heading (the 언제 / 어디 / 얼마나 parts of the basis sheet). */
  function optGroup(parent: HTMLElement, id: string, heading: string | null, rows: HTMLElement[]): HTMLElement {
    const opts = el(doc, 'div', { class: 'opts', role: 'group' });
    if (heading) {
      const h = el(doc, 'p', { class: 'group-h', id });
      h.append(el(doc, 'span', {}, heading));
      parent.append(h);
      opts.setAttribute('aria-labelledby', id);
    }
    opts.append(...rows);
    parent.append(opts);
    return opts;
  }
  function optRow(...children: HTMLElement[]): HTMLElement {
    const row = el(doc, 'div', { class: 'optrow' });
    row.append(...children);
    return row;
  }
  /** A touch screen's pointer (phones, in-app browsers); never where matchMedia is missing (jsdom). */
  const coarse = () => {
    try {
      return !!win?.matchMedia?.('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  };
  /** 날짜 고르기: an option that opens the browser's own date picker (today to a year on), with the native
   * input kept beside it. Where showPicker() is missing the input itself is shown with 이 날로 (app.ts).
   * On a touch screen the input itself lies see-through over the option, so the finger lands on it and the OS
   * opens its picker: iOS Safari and in-app browsers open nothing from showPicker() on a hidden field. */
  function pickDay(s: State, picked: Day | null): HTMLElement[] {
    const range = { type: 'date', min: s.today, max: addDays(s.today, DAYS_AHEAD), 'aria-label': COPY.pickDay };
    if (coarse()) {
      const tap = el(doc, 'input', { ...range, class: 'date-tap', ...(picked ? { value: picked } : {}) });
      if (tap.type === 'date') {
        const row = el(doc, 'label', { class: 'opt' });
        row.append(...option(COPY.pickDay, picked ? longDay(picked) : null, {}).childNodes, tap);
        return [row];
      }
    }
    const input = el(doc, 'input', { ...range, class: 'sr', tabindex: '-1', 'aria-hidden': 'true', 'data-action': 'day-input' });
    input.value = picked ?? '';
    const box = el(doc, 'div', { class: 'date-fb' });
    box.append(input, el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'day-ok', hidden: '' }, COPY.dayOk));
    return [option(COPY.pickDay, picked ? longDay(picked) : null, { 'data-action': 'pick-day', 'aria-pressed': String(!!picked) }), box];
  }

  /** 의견 보내기 (ADR-0081): the option rows hold a real radio / checkbox (the browser keeps what is chosen, so
   * nothing is lost while it is open); two text boxes; 보내기. app.ts reads it all on 보내기. */
  function feedbackForm(panel: HTMLElement) {
    const choice = (type: 'radio' | 'checkbox', name: string, value: string, label: string) => {
      const row = el(doc, 'label', { class: 'opt' });
      const text = el(doc, 'span');
      text.append(el(doc, 'span', { class: 'nm' }, label));
      row.append(el(doc, 'input', { type, name, value, class: 'sr' }), text, icon(CHECK));
      return optRow(row);
    };
    const box = (id: string, label: string) => {
      const wrap = el(doc, 'div', { class: 'fb-box' });
      wrap.append(el(doc, 'label', { class: 'group-h', for: id }, label), el(doc, 'textarea', { id, class: 'date-in fb-in', rows: '3', maxlength: String(TEXT_MAX) }));
      return wrap;
    };
    panel.append(el(doc, 'p', { class: 'note' }, COPY.feedbackNote));
    optGroup(panel, 'went-h', COPY.wentHead, WENT.map((w) => choice('radio', 'fb-went', w, COPY.went[w]))).setAttribute('role', 'radiogroup');
    optGroup(panel, 'pain-h', COPY.painHead, PAINS.map((p) => choice('checkbox', 'fb-pain', p, COPY.pains[p])));
    panel.querySelector('#pain-h')?.append(el(doc, 'span', { class: 'order' }, COPY.painMany));
    panel.append(box('fb-pain-text', COPY.painText), box('fb-wish', COPY.wishText));
    panel.append(el(doc, 'button', { type: 'button', class: 'primary fb-send', 'data-action': 'feedback-send' }, COPY.send));
  }

  function buildSheet(s: State) {
    const overlay = s.overlay!;
    if (overlay === 'browse' || overlay === 'browse-card') {
      // a card's sheet over 서울 홈 (ADR-0117 5: no screen under it any more): it comes in patchSheet (culture-view.ts patchBrowse)
      els.sheet.replaceChildren();
      return;
    }
    const scrim = el(doc, 'div', { class: 'scrim', 'data-action': 'close' });
    const panel = el(doc, 'section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' });
    const title =
      overlay === 'basis' ? COPY.basisSheet : overlay === 'move' ? COPY.moveSheet : overlay === 'feedback' ? (s.feedbackSent ? COPY.thanks : COPY.feedbackSheet) : overlay === 'culture' ? (culturePart()?.CULTURE_COPY.head ?? '') : COPY.staySheet;
    panel.append(el(doc, 'h2', { id: 'sheet-title', tabindex: '-1' }, title));
    if (overlay === 'basis') {
      // 여행지 (specs/busan.md 1.4): the sheet's first row, with the switch on — the one in use pressed
      // the nation build (with 강원 and 다른 곳, its part asked for when pressed: app.ts pickDest): 「여행지 | 내 위치」 (ADR-0103)
      if (NATION) destToggle(panel, s);
      else if (BUSAN) {
        // one compact line, like 언제 (the `--mode busan` rollback's 제주 · 부산)
        const row = optRow(...DESTS.filter((d) => !DEST[d].sgg).map((d) => option(BUSAN_COPY.destName[d], null, { 'data-dest': d, 'aria-pressed': String(s.dest === d) })));
        row.classList.add('when-row');
        optGroup(panel, 'dest-h', BUSAN_COPY.destHead, [row]);
      }
      // 언제 (specs/date-mode.md): 지금 · 내일 · 날짜 고르기 on one compact row, so 어디 comes sooner.
      // Choosing one keeps the sheet open for 어디.
      const tomorrow = addDays(s.today, 1);
      const picked = s.when !== 'now' && s.when !== tomorrow ? s.when : null;
      const when = optRow(
        option(COPY.whenNow, null, { 'data-when': 'now', 'aria-pressed': String(s.when === 'now') }),
        option(COPY.tomorrow, null, { 'data-when': tomorrow, 'aria-pressed': String(s.when === tomorrow) }),
        ...pickDay(s, picked),
      );
      when.classList.add('when-row');
      optGroup(panel, 'when-h', COPY.whenHead, [when]);
      // 어디: a thin-rule list of two rows; 다시 정하기 sits at the end of the 숙소 row, beside its option (§6.10).
      // The 지금 있는 곳 row's "위치 권한이 꺼져 있어요" line comes and goes in patchSheet.
      // the nation build: 주소·숙소, its search box on the row's own second line (ADR-0103)
      const stayRow = optRow(option(NATION ? BUSAN_COPY.addrOption : COPY.stayOption, s.stay ? COPY.stayArea(areaLabel(s.stay.area, OPEN_AREAS)) : COPY.stayUnset, { 'data-basis': 'stay', 'aria-pressed': String(s.basis === 'stay') }));
      if (s.stay) stayRow.append(el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'restay' }, COPY.restay));
      if (NATION) stayRow.append(addrBox());
      // the 동네 in use shows here, checked, not only far down in the index (heuristic audit H6); under it, where its line
      // 「다른 동네는 아래에서 골라요」 was, 다른 동네 고르기 goes down to that index (ADR-0090 6, app.ts)
      const regionRow: HTMLElement[] = [];
      if (s.basis === 'region' && s.region) {
        const row = optRow(option(COPY.basisRegion(areaLabel(s.region, OPEN_AREAS)), null, { 'data-action': 'close', 'aria-pressed': 'true' }), el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'other-area' }, COPY.otherArea));
        row.classList.add('other-row');
        regionRow.push(row);
      }
      optGroup(panel, 'where-h', COPY.whereHead, [optRow(option(COPY.gpsOption, null, { 'data-basis': 'gps', 'aria-pressed': String(s.basis === 'gps') })), stayRow, ...regionRow]);
      // the search's line, seen; what a screen reader is told is the polite .addr-live beside it (patchAddr)
      if (NATION) panel.append(el(doc, 'p', { class: 'form-err addr-err', hidden: '' }), el(doc, 'p', { class: 'sr addr-live', role: 'status' }));
      // 얼마나 (ADR-0060): right under the 어디 rows, before the 동네 index, so it is in view without scrolling.
      // The same thin-rule rows with a check. Choosing one closes the sheet.
      optGroup(panel, 'reach-h', COPY.reachHead, REACHES.map((r) => optRow(option(COPY.reach[r], null, { 'data-reach': r, 'aria-pressed': String(s.reach === r) }))));
      // 비 와요(실내만) (ADR-0065): one row of its own, the same thin-rule option with a check when on. Choosing it
      // closes the sheet, like 얼마나.
      optGroup(panel, 'weather-h', COPY.weatherHead, [optRow(option(COPY.indoorToggle, null, { 'data-indoor': '', 'aria-pressed': String(s.indoor) }))]);
      areaGroups(panel, 'basis', s.basis === 'region' ? s.region : null, s.dest, s.sgg);
    } else if (overlay === 'move') {
      // 다른 날로: the days that have saved places (today on), the row's own checked, then 날짜 고르기.
      const from = s.moveTarget?.date ?? '';
      const days = [...new Set(s.saved.map((e) => e.date).filter((d) => d >= s.today))].sort();
      optGroup(panel, 'move-h', null, [
        ...days.map((d) => optRow(option(dayName(s.today, d), null, { 'data-day': d, 'aria-pressed': String(d === from) }))),
        optRow(...pickDay(s, null)),
      ]);
    } else if (overlay === 'feedback') {
      if (s.feedbackSent) panel.append(el(doc, 'p', { class: 'note' }, COPY.thanksNote));
      else feedbackForm(panel);
    } else if (overlay === 'culture') {
      const origin = homeOrigin(s);
      if (origin && s.dest === 'seoul' && s.culture?.day === s.today) culturePart()?.sheetBody(doc, panel, s, origin);
    } else {
      panel.append(
        el(doc, 'p', { class: 'note' }, COPY.stayNote),
        el(doc, 'button', { type: 'button', class: 'primary', 'data-action': 'stay-here' }, COPY.stayHere),
        el(doc, 'p', { class: 'form-err', role: 'alert', hidden: '' }),
      );
      areaGroups(panel, 'stay', s.stay?.source === 'area' ? s.stay.area : null, s.dest, s.sgg);
    }
    panel.append(el(doc, 'button', { type: 'button', class: 'sheet-close', 'data-action': 'close' }, COPY.close));
    els.sheet.replaceChildren(scrim, panel);
  }

  function patchSheet(s: State) {
    // 오늘 서울 둘러보기's card sheet on or off over the screen (culture-view.ts)
    if (s.overlay === 'browse' || s.overlay === 'browse-card') return void culturePart()?.patchBrowse(doc, els.sheet, s, homeOrigin(s));
    const gps = els.sheet.querySelector<HTMLButtonElement>('[data-basis="gps"]');
    if (gps) {
      const sub = gps.querySelector('.lm');
      if (s.lastFail === 'denied') {
        if (!sub) gps.querySelector('.nm')!.after(el(doc, 'span', { class: 'lm' }, COPY.gpsOff));
      } else sub?.remove();
    }
    const here = els.sheet.querySelector<HTMLButtonElement>('[data-action="stay-here"]');
    if (here) {
      here.disabled = s.stayForm.pending;
      setText(here, s.stayForm.pending ? COPY.locating : COPY.stayHere);
    }
    if (NATION) patchAddr(s);
    const err = els.sheet.querySelector<HTMLElement>('.form-err:not(.addr-err)');
    if (err) {
      // The button stays a button; the reason goes on its own line (S09).
      setText(err, s.stayForm.error ? (s.stayForm.error === 'outside' && nationOutside(s, s.stayForm.at, true)) || (BUSAN && s.stayForm.error === 'outside' && s.dest !== 'jeju' && s.dest !== 'nation' ? BUSAN_COPY.stayOutside(destNameOf(s)) : COPY.stayError[s.stayForm.error]) : '');
      err.hidden = !s.stayForm.error;
    }
  }

  function focusSheet(atDest = false) {
    // a day picked on a touch screen is the see-through field's value (pickDay), not a pressed option
    // (the 여행지 row is not where a choice is made each time: focus starts below it, as before it was there)
    // opened from the name line (ADR-0094 Amendment 3): on the 여행지 in use
    // (「여행지 | 내 위치」 the same, ADR-0103: on its chip in use, else on its side pressed)
    const dest = atDest ? els.sheet.querySelector<HTMLElement>('.sheet [data-dest][aria-pressed="true"]') ?? els.sheet.querySelector<HTMLElement>('.sheet [data-seg][aria-pressed="true"]') : null;
    const pick = dest ?? els.sheet.querySelector<HTMLElement>('.sheet [aria-pressed="true"]:not([data-dest]):not([data-seg]), .sheet .date-tap[value]') ?? els.sheet.querySelector<HTMLElement>('#sheet-title');
    pick?.focus({ preventScroll: true });
  }

  /** The page under an open sheet goes inert after the sheet's first frame, or at the first key or pointer press
   * before that (flushInert); never once the sheet is closed again. */
  let inertQueued = false;
  function inertNow() {
    inertQueued = false;
    if (prevOverlay) els.app.setAttribute('inert', '');
  }
  function queueInert() {
    if (inertQueued) return;
    inertQueued = true;
    afterPaint(() => {
      if (inertQueued) inertNow();
    });
  }
  const flushInert = () => {
    if (inertQueued) inertNow();
  };
  doc.addEventListener('keydown', flushInert, true);
  doc.addEventListener('pointerdown', flushInert, true);
  function disposeSheet() {
    inertQueued = false;
    doc.removeEventListener('keydown', flushInert, true);
    doc.removeEventListener('pointerdown', flushInert, true);
  }

  function renderSheet(s: State) {
    if (s.overlay && !prevOverlay) {
      // who opened it (before the page goes inert and drops focus): focus goes back there on close
      const active = doc.activeElement as HTMLElement | null;
      opener = active && active !== doc.body && !els.sheet.contains(active) ? active : null;
    }
    // Everything behind the sheet is inert: no Tab or tap reaches it (S58). On opening it is set once the sheet's
    // first frame is painted (queueInert): restyling the page under the sheet is then not part of the tap's frame.
    // Until that moment the scrim covers the page, the focus is in the sheet and Tab is held there, and a key or
    // pointer press sets it first. Lifted at once, before focus goes back to the opener — focus() on an element
    // inside an inert subtree silently does nothing.
    if (s.overlay && !prevOverlay) queueInert();
    else if (s.overlay) els.app.setAttribute('inert', '');
    else els.app.removeAttribute('inert');
    if (s.overlay) {
      if (closeTimer) {
        // Reopened while the close animation was still running: take the node back.
        clearTimeout(closeTimer);
        timers.delete(closeTimer);
        closeTimer = null;
        els.sheet.classList.remove('closing');
        sheetSig = '';
      }
      const sig = sheetSigOf(s);
      if (sig !== sheetSig) {
        const focusInside = !!prevOverlay && els.sheet.contains(doc.activeElement);
        const switched = prevOverlay !== s.overlay;
        sheetSig = sig;
        buildSheet(s);
        els.sheet.hidden = false;
        if (switched || focusInside) focusSheet(switched && opener?.id === 'logo');
      }
      patchSheet(s);
    } else if (prevOverlay) {
      sheetSig = '';
      const done = () => {
        closeTimer = null;
        els.sheet.classList.remove('closing');
        els.sheet.replaceChildren();
        els.sheet.hidden = true;
      };
      if (motion()) {
        els.sheet.classList.add('closing');
        closeTimer = later(190, done);
      } else done();
      // 다른 날로 moved its row: the row (a new node, keyed by its new day) gets the focus back
      const moved =
        opener && !opener.isConnected && opener.dataset.action === 'move-day' && s.moveTarget
          ? [...els.savedList.querySelectorAll<HTMLElement>('[data-action="move-day"]')].find((b) => b.dataset.id === s.moveTarget!.id && b.dataset.date === s.moveTarget!.date)
          : null;
      const back = opener?.isConnected && !opener.closest('[hidden]') ? opener : (moved ?? els.basis);
      opener = null;
      back.focus?.({ preventScroll: true });
    }
    prevOverlay = s.overlay;
  }
  return { renderSheet, disposeSheet };
}
