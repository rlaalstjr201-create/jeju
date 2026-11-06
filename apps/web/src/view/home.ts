// 홈 A′ (ADR-0075): 오늘 판, the moods' 「예:」 and photos, the sections under 아무거나, and the survey line
// (ADR-0081). A section of the renderer (ADR-0126): render.ts calls renderHome·renderSurvey in its fixed order.
import { showPhotos } from '../later';
import { DEST } from '../region/dest';
import { BUSAN, NATION, culturePart } from '../region/release';
import { longDay } from '../dates';
import { duskNow, homeOrigin, moodExamples, moodShelf, nightHome, nowSpot, openMarkets, otherAreas, rainNow, sunPoint, sunsetSpots, SUNSET_LIST_MAX, todayActs, type MarketRow, type TodayAct } from '../pick/home';
import { goLink } from '../pick/links';
import { marketText } from '../pick/market';
import { travel, travelText, type Button, type Spot } from '../pick/pick';
import { openPhase, pickSpots, rainArea, whenDay, type State } from '../state';
import { sunsetText } from '../pick/sun';
import type { Origin } from '../types';
import { COPY, BUSAN_COPY, destNameOf, PLACE, splitName, homeCopy } from '../copy';
import { el, setAttr, setText } from './dom';
import type { Kit } from './kit';

/** ADR-0093: the app's languages, each named in itself. */
const LANGS = [
  ['ko', '한국어'],
  ['en', 'English'],
  ['zh-Hans', '简体中文'],
  ['ja', '日本語'],
];

export function createHome(kit: Kit) {
  const { doc, els, opts, icon, setGo, afterPaint } = kit;
  // --- 홈 A′ (ADR-0075): 오늘 판, the moods' 「예:」 and photos, the sections under 아무거나. Redrawn only when
  // what they show changes (the data, basis, range, 실내, the day, the tabs, the map app). Nothing with a photo
  // or a link is drawn before the data is in: the rows' min-height holds the place, no grey slots (§14). ---
  let homeSig = '';
  /** the latest home draw (a staged step of an older one is dropped) and whether the data has been drawn in full */
  let homeGen = 0;
  let homeFilled = false;
  let homeSpots: Spot[] | null = null;
  let homeVisited: readonly string[] = [];
  let todayText = '';
  let homeDated = false;
  function setHomeDate(text: string) {
    todayText = text;
    if (!homeDated) setText(els.date, text);
  }
  const ARROW = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  /** `data-id`: a photo that fails is remembered like a card's (app.ts) and the next draw skips it. Under the 시작 화면
   * (.yc-start) nothing of the home shows: its photos are asked for only once it goes (start.ts showPhotos, ADR-0116). */
  const homePhoto = (spot: Spot, lazy: boolean) =>
    el(doc, 'img', { [doc.documentElement.classList.contains('yc-start') ? 'data-later' : 'src']: spot.image!, alt: '', ...(lazy ? { loading: 'lazy' } : {}), decoding: 'async', referrerpolicy: 'no-referrer', 'data-id': spot.id });

  function todayRow(row: MarketRow, dated: boolean): HTMLElement {
    // a jump to 오늘 장 서는 곳 below (app.ts scrolls; the address and history stay as they are)
    const a = el(doc, 'a', { class: 'act', href: '#market', 'data-action': 'to-market' });
    const txt = el(doc, 'span');
    const [pre, post] = COPY.marketRow(dated);
    txt.append(pre, el(doc, 'b', {}, PLACE.name(row.spot)), `${post}\u00a0· ${row.where}`);
    a.append(txt, icon(ARROW));
    return a;
  }

  /** 노을 볼 곳 N곳 · 차로 45분 안: a jump to the 노을 볼 곳 section below, like the market row (ADR-0083). */
  function sunsetRow(n: number): HTMLElement {
    const a = el(doc, 'a', { class: 'act', href: '#sunset', 'data-action': 'to-sunset' });
    const txt = el(doc, 'span');
    txt.append(el(doc, 'b', {}, COPY.sunsetPlaces), COPY.sunsetCount(n));
    a.append(txt, icon(ARROW));
    return a;
  }

  /** 노을 볼 곳: the nearest few, each 길찾기 in one tap like the market rows. */
  function sunsetSection(s: State, rows: MarketRow[], origin: Origin): HTMLElement {
    const sec = el(doc, 'section', { id: 'sunset', class: 'more-sec', 'aria-labelledby': 'sunset-h' });
    sec.append(el(doc, 'h2', { id: 'sunset-h', tabindex: '-1' }, COPY.sunsetPlaces));
    const list = el(doc, 'ul', { class: 'mk-list' });
    for (const { spot, where } of rows.slice(0, SUNSET_LIST_MAX)) {
      const g = goLink(spot, origin.point, false, origin.isPoint, s.mapApp);
      const a = el(doc, 'a', { class: 'mk', href: g.href, target: '_blank', rel: 'noopener', 'aria-label': COPY.goAria(PLACE.name(spot), g.mode === 'foot', g.app, g.terminal) });
      const txt = el(doc, 'span', { class: 'txt' });
      txt.append(el(doc, 'span', { class: 'nm' }, PLACE.name(spot)), el(doc, 'span', { class: 'meta' }, where));
      if (spot.image && !s.broken.includes(spot.id)) a.append(homePhoto(spot, true));
      a.append(txt);
      const li = el(doc, 'li');
      li.append(a);
      list.append(li);
    }
    sec.append(list);
    return sec;
  }

  /** 비 소식: 실내만 볼까요? turns 실내만 on (ADR-0065's switch); with it on already, says so and offers 모두 보기. */
  function rainRow(indoor: boolean): HTMLElement {
    const txt = el(doc, 'span', { class: 'txt' });
    txt.append(indoor ? COPY.rainOn : COPY.rainAsk, ' ', el(doc, 'span', { class: 'src' }, COPY.rainFrom));
    if (indoor) {
      const row = el(doc, 'div', { class: 'act rain' });
      row.append(txt, el(doc, 'button', { type: 'button', class: 'all', 'data-action': 'rain-all' }, COPY.rainAll));
      return row;
    }
    const b = el(doc, 'button', { type: 'button', class: 'act rain', 'data-action': 'rain-indoor' });
    b.append(txt, icon(ARROW));
    return b;
  }

  function marketSection(s: State, rows: MarketRow[], origin: Origin | null, dated: boolean): HTMLElement {
    const sec = el(doc, 'section', { id: 'market', class: 'more-sec', 'aria-labelledby': 'market-h' });
    sec.append(el(doc, 'h2', { id: 'market-h', tabindex: '-1' }, COPY.marketHead(dated)));
    const list = el(doc, 'ul', { class: 'mk-list' });
    for (const { spot, where } of rows) {
      // 길찾기 to the market in one tap (ADR-0067), in the chosen map app
      const g = goLink(spot, origin?.point ?? null, false, origin?.isPoint ?? false, s.mapApp);
      const a = el(doc, 'a', { class: 'mk', href: g.href, target: '_blank', rel: 'noopener', 'aria-label': COPY.goAria(PLACE.name(spot), g.mode === 'foot', g.app, g.terminal) });
      const txt = el(doc, 'span', { class: 'txt' });
      txt.append(el(doc, 'span', { class: 'nm' }, PLACE.name(spot)), el(doc, 'span', { class: 'meta' }, `${marketText(spot.market!, whenDay(s), dated)}\u00a0· ${where}`));
      if (spot.image && !s.broken.includes(spot.id)) a.append(homePhoto(spot, true));
      a.append(txt);
      const li = el(doc, 'li');
      li.append(a);
      list.append(li);
    }
    sec.append(list);
    return sec;
  }

  function areasSection(s: State, spots: Spot[], origin: Origin | null): HTMLElement {
    const sec = el(doc, 'section', { class: 'more-sec', 'aria-labelledby': 'areas-h' });
    sec.append(el(doc, 'h2', { id: 'areas-h' }, COPY.areasHead));
    const grid = el(doc, 'ul', { class: 'tiles' });
    // the area pages (ADR-0072): plain links, no history of ours
    for (const { area, photo } of otherAreas(spots, origin, s.broken)) {
      const a = el(doc, 'a', { class: 'tile', href: `/jeju/${area.slug}/` });
      if (photo) a.append(homePhoto(photo, true));
      a.append(el(doc, 'span', { class: 'nm' }, area.label), el(doc, 'span', { class: 'lm' }, area.landmark));
      const li = el(doc, 'li');
      li.append(a);
      grid.append(li);
    }
    sec.append(grid);
    return sec;
  }

  function homeSigOf(s: State, origin: Origin | null): string {
    // a GPS fix that moved is another place: its own photos, markets and 동네
    const at = origin ? `${origin.key}@${origin.point.lat.toFixed(3)},${origin.point.lng.toFixed(3)}` : '';
    const dusk = !!origin && s.when === 'now' && duskNow(s.clock, origin.point, whenDay(s));
    // 밤 (ADR-0091): 「예:」 put 야외 산길 and islands by boat after the others from the sunset to the sunrise
    // 지금 닫힌 곳 (ADR-0111): the half hour, where it decides what is shut
    // 서울 홈의 선반 (ADR-0117): drawn once the culture chunk is in
    return [at, s.reach, s.indoor, whenDay(s), s.when === 'now', s.sub, s.newSub, s.mapApp, s.broken.length, rainNow(s), dusk, nightHome(s, origin), s.dest, s.listFailed, openPhase(s, s.clock), !!culturePart()].join('|') + (s.culture ? `|${s.culture.day}|${s.culture.minute}` : '');
  }

  /** 지금 여기서 (ADR-0101, specs/home-v2.md 1): the one place the 아무거나 rule would show first, over the moods; not drawn
   * while no place with a photo can be shown. The card's name is not a link: its one tap is 길찾기. Until the data is in,
   * the empty card keeps its place (.now:empty): the moods under it do not move when it comes. A list that did not come
   * (s.listFailed) takes it away: no empty grey card is left up. */
  function renderNow(s: State, spots: Spot[] | null, origin: Origin | null): Spot | null {
    const spot = spots ? nowSpot(s, spots, origin) : null;
    if (!spot) {
      els.now.hidden = !!spots || s.listFailed;
      els.now.replaceChildren();
      setAttr(els.now, 'aria-label', null);
      return null;
    }
    const photo = el(doc, 'div', { class: 'now-photo' });
    // under the 시작 화면 held back like the mood photos (homePhoto, ADR-0116)
    photo.append(el(doc, 'img', { [doc.documentElement.classList.contains('yc-start') ? 'data-later' : 'src']: spot.image!, alt: '', fetchpriority: 'high', decoding: 'async', referrerpolicy: 'no-referrer', 'data-id': spot.id }));
    const head = el(doc, 'div');
    // the word over the name and, with a basis, how far, on its line (the first screen is short of height)
    const kick = el(doc, 'p', { class: 'now-kick' }, COPY.nowKicker);
    if (origin) kick.append(el(doc, 'span', { class: 'now-meta' }, ` · ${travelText(travel(origin.point, origin.isPoint, spot))}`));
    head.append(kick, el(doc, 'h2', { class: 'now-name' }, splitName(PLACE.name(spot)).main));
    const go = el(doc, 'a', { class: 'tbtn go', target: '_blank', rel: 'noopener' });
    setGo(go, spot, origin, s.reach, s.mapApp);
    const row = el(doc, 'div', { class: 'now-row' });
    row.append(go);
    const body = el(doc, 'div', { class: 'now-body' });
    body.append(head, row);
    els.now.replaceChildren(photo, body);
    setAttr(els.now, 'aria-label', COPY.nowKicker);
    els.now.hidden = false;
    return spot;
  }

  /** 서울 홈's mood shelves (ADR-0117; browse.ts MOOD_SHELVES, not imported: the entry stays out of the culture chunk's modules) */
  const MOOD_KEYS = ['rest', 'walk', 'new', 'famous', 'food'] as const;
  /** the mood buttons' own words (another language's, i18n/apply.ts): the shelves' headings */
  const shelfLabels = () => Object.fromEntries(MOOD_KEYS.map((m) => [m, els.moods.find((b) => b.dataset.mood === m)?.querySelector('.label')?.textContent ?? m])) as Record<(typeof MOOD_KEYS)[number], string>;

  function renderHome(s: State) {
    const dated = s.when !== 'now';
    homeDated = dated;
    // date mode (specs/date-mode.md): the board is about the day being viewed
    setText(els.date, dated ? longDay(s.when) : todayText);
    const hc = homeCopy(s);
    setText(els.ask, hc.ask);
    setText(els.lede, hc.lede);
    const origin = homeOrigin(s);
    // a row's place, held from the first paint when the last visit said a row would be up now (index.html yc-row, app.ts
    // keepRow), until what decides the row is in — the list and 비 소식's answer — or the list did not come
    const area = rainArea(s);
    if (s.listFailed || (s.spots && (!area || s.rain?.area === area))) doc.documentElement.classList.remove('yc-row');
    const sig = homeSigOf(s, origin);
    if (sig === homeSig && s.spots === homeSpots && s.visited === homeVisited) return;
    homeSig = sig;
    homeSpots = s.spots;
    homeVisited = s.visited;
    // 뺀 곳 (ADR-0087) are left out of 「예:」, 노을 볼 곳 and 오늘 장 서는 곳, as from the cards
    const spots = s.spots && pickSpots(s.spots, s.visited);
    const day = whenDay(s);
    const markets = spots ? openMarkets(spots, origin, day) : [];
    // without a basis no market goes on the board under 「내 위치 근처」: it could be across the island (ADR-0075
    // Amendment 1); the 오늘 장 서는 곳 section below still lists them, each with its area
    // 노을 볼 곳 (ADR-0083): today only, with a basis, in the hours before the sunset there
    const sunset = spots && origin && !dated && duskNow(s.clock, origin.point, day) ? sunsetSpots(spots, origin, day) : [];
    const acts = todayActs(origin ? markets : [], rainNow(s), sunset);
    const sunsetOn = acts.some((a) => a.k === 'sunset');
    const folded = acts.slice(1).filter((a): a is Extract<TodayAct, { k: 'market' }> => a.k === 'market');
    const facts = [COPY.sunset(sunsetText(sunPoint(origin, s.dest, s.sgg), day)), ...folded.map((a) => COPY.marketFold(dated, PLACE.name(a.row.spot)))];
    // "·" held to the word before it by a no-break space (§3.2): a line never starts with "·"
    setText(els.todayFacts, facts.map((f) => `\u00a0· ${f}`).join(''));
    els.today.querySelector(':scope > .act')?.remove();
    const first = acts[0];
    if (first) els.today.append(first.k === 'rain' ? rainRow(s.indoor) : first.k === 'sunset' ? sunsetRow(first.rows.length) : todayRow(first.row, dated));
    // until the data is in (.wait marks it); a row's place is held only at the times the last visit said one would be up
    // (yc-row, above)
    els.today.classList.toggle('wait', !spots);
    const here = renderNow(s, spots || null, origin);
    // 서울 홈 (ADR-0117): the shelves where the moods were (their buttons hidden, 아무거나 under them; 지금 여기서's place not
    // again on them). A redraw that changes nothing keeps the block; one that does keeps each shelf's sideways scroll and
    // the focused card (Amendment 4)
    const shelves = NATION && s.dest === 'seoul' && !dated && origin && spots ? culturePart()?.shelvesBlock(doc, s, origin, Object.fromEntries(MOOD_KEYS.map((m) => [m, moodShelf(s, spots, origin, m)])), shelfLabels(), (x) => ({ id: x.id, name: splitName(PLACE.name(x)).main, image: x.image!, trip: travelText(travel(origin.point, origin.isPoint, x)) }), here) : null;
    const old = doc.getElementById('shelves');
    if (shelves !== old) {
      // read before it goes; put back once the new block is in the page (a box out of it has no scroll)
      const left = new Map([...(old?.querySelectorAll<HTMLElement>('[data-shelf]') ?? [])].map((r) => [r.dataset.shelf, r.scrollLeft]));
      const focused = old?.contains(doc.activeElement) ? (doc.activeElement as HTMLElement) : null;
      if (shelves && old) old.replaceWith(shelves);
      else if (shelves) els.lede.after(shelves);
      else old?.remove();
      for (const r of shelves?.querySelectorAll<HTMLElement>('[data-shelf]') ?? []) if (left.get(r.dataset.shelf)) r.scrollLeft = left.get(r.dataset.shelf)!;
      const same = focused && shelves ? [...shelves.querySelectorAll<HTMLElement>('button')].find((b) => b.dataset.id === focused.dataset.id && b.dataset.pin === focused.dataset.pin && b.dataset.mood === focused.dataset.mood && b.className === focused.className) : null;
      same?.focus({ preventScroll: true });
    }
    els.lede.hidden = !!shelves;
    const moodList = els.moods[0]?.closest('ul');
    if (moodList) moodList.hidden = !!shelves;

    /** what the rows drawn so far in this draw show (top down): 유명한 데's 「예:」 passes over them (ADR-0092 7) */
    const drawn: string[] = [];
    /** `only`: the mood rows to draw (all five when missing) */
    const examples = (only?: readonly Button[]) => {
      if (shelves) return;
      for (const b of els.moods) {
        const mood = b.dataset.mood;
        if (!mood || mood === 'any' || (only && !only.includes(mood as Button))) continue;
        b.querySelector('.ex')?.remove();
        b.querySelector('.pair')?.remove();
        const ex = spots ? moodExamples(s, spots, origin, mood as Exclude<Button, 'any'>, mood === 'famous' ? drawn : undefined) : [];
        if (mood !== 'famous') drawn.push(...ex.map((x) => x.id));
        if (!ex.length) continue;
        // 「예:」 — an example, not a promise (ADR-0075 3); 「제주 인기:」 while the basis is not known (Amendment 1)
        const names = ex.map((x) => splitName(PLACE.name(x)).main);
        b.querySelector('.txt')!.append(el(doc, 'span', { class: 'ex sr' }, origin || s.dest === 'nation' ? COPY.example(names) : BUSAN && s.dest !== 'jeju' ? BUSAN_COPY.examplePopular(destNameOf(s), names) : COPY.examplePopular(names)));
        const pair = el(doc, 'span', { class: 'pair', 'aria-hidden': 'true' });
        // the second photo is not shown (.pair img + img): lazy, so it does not hold up the first ones on a slow line
        pair.append(...ex.map((x, i) => homePhoto(x, i > 0)));
        b.querySelector('.i-check')!.before(pair);
      }
    };
    // the sections under 아무거나: 노을 볼 곳 and 오늘 장 서는 곳, then 다른 동네, the credit and 설정
    const sections = (): HTMLElement[] => {
      const nodes: HTMLElement[] = [];
      // 오늘 근처에서 하는 것 (ADR-0112) is not on 서울 홈 any more: its shelves are (ADR-0117 5)
      if (sunsetOn && origin) nodes.push(sunsetSection(s, sunset, origin));
      if (markets.length) nodes.push(marketSection(s, markets, origin, dated));
      return nodes;
    };
    // an area's photo is not a pick: from the data as it is
    // 다른 동네 둘러보기 links the area pages, which Busan has none of (specs/busan.md 1.4)
    const areas = () => (BUSAN && s.dest !== 'jeju' ? el(doc, 'span', { hidden: '' }) : areasSection(s, s.spots!, origin));
    const tail = (): HTMLElement[] => {
      // the coastline the 노을 places were worked out from (ODbL): credited while they are shown
      const credit = el(doc, 'p', { class: 'credit' }, BUSAN && DEST[s.dest].credit === 'tour' ? BUSAN_COPY.homeCredit : COPY.homeCredit);
      if (sunsetOn) credit.append(COPY.sunsetCredit, el(doc, 'a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, COPY.osm));
      // settings reachable with nothing saved yet (heuristic audit H5): they live under the saved list
      // ADR-0093: then the other languages, each in its own words; a link opens the app again in it
      const langs = el(doc, 'p', { class: 'lang-line' });
      for (const [lang, name] of LANGS.filter(([l]) => l !== (doc.documentElement.lang || 'ko'))) {
        langs.append(...(langs.firstChild ? [' · '] : []), el(doc, 'a', { href: `/?lang=${lang}`, hreflang: lang, lang }, name));
      }
      return [credit, el(doc, 'button', { type: 'button', class: 'tbtn settings', 'data-action': 'settings' }, COPY.homeSettings), langs];
    };
    const gen = ++homeGen;
    // The first time the data is drawn (opts.stageHome): 노을 볼 곳 and 오늘 장 서는 곳 at once, with the 오늘 판 row
    // that jumps to them; the moods' 「예:」 and photos a frame later, two rows at a time, then 다른 동네 (its tiles
    // over two frames), the credit and 설정 — every step its own short task and frame instead of one long one. A step
    // a newer draw has overtaken is dropped (that draw starts again). Any later redraw is done in place, at once.
    if (opts.stageHome && spots && !homeFilled) {
      els.homeMore.replaceChildren(...sections());
      let late: Element[] = [];
      const steps = [
        () => examples(['rest', 'walk']),
        () => examples(['new', 'famous']),
        () => examples(['food']),
        () => {
          const sec = areas();
          late = [...sec.querySelectorAll(':scope > .tiles > li')].slice(6);
          for (const li of late) li.remove();
          els.homeMore.append(sec);
        },
        () => {
          els.homeMore.querySelector('.tiles')?.append(...late);
          // the 시작 화면 may have gone while these tiles were out of the page (start.ts showPhotos missed them)
          if (!doc.documentElement.classList.contains('yc-start')) showPhotos(doc);
          els.homeMore.append(...tail());
          homeFilled = true;
        },
      ];
      const run = (i: number) =>
        afterPaint(() => {
          if (gen !== homeGen) return;
          steps[i]();
          if (i + 1 < steps.length) run(i + 1);
        });
      run(0);
      return;
    }
    examples();
    els.homeMore.replaceChildren(...(spots ? [...sections(), areas(), ...tail()] : []));
  }

  /** ADR-0081: one text button at the very bottom of the home, only while it is due and 기록 is on. Absent
   * otherwise (the home is then exactly as it was). */
  let surveyEl: HTMLElement | null = null;
  function renderSurvey(s: State) {
    const on = s.surveyLine && s.tracking;
    if (on && !surveyEl) {
      surveyEl = el(doc, 'p', { class: 'survey' });
      surveyEl.append(el(doc, 'button', { type: 'button', class: 'tbtn', 'data-action': 'survey' }, COPY.surveyLine));
      els.homeMore.after(surveyEl);
    } else if (!on && surveyEl) {
      surveyEl.remove();
      surveyEl = null;
    }
  }
  return { renderHome, renderSurvey, setHomeDate };
}
