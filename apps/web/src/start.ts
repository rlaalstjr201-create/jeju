// 시작 화면 (ADR-0096, specs/busan.md 1.2): index.html's inline scripts decide that it shows and draw it before the first
// paint (`.yc-start`, #ycStart, the words of the page's language in window.__ycT). This module takes it over once the app
// runs: the big button reads the position (the app's locate: inside an open destination or `outside`), the two
// destination buttons choose, and with location already allowed it reads without asking (M4: the cover is there from
// the first paint and only ever goes away). Used only with the switch on (app.ts).
import { areaByName, destOfArea, type Area, type SggCode } from './areas';
import { isDest, isSggDest, type Dest } from './dest';
import { locateGps, type GeoDeps } from './effects';
import { showPhotos } from './later';
import type { Point } from './pick';
import { NATION, OPEN_AREAS, loadNation, nationPart, outsideAt, releasedDestOf } from './release';
import type { NoOrigin, OutsideAt } from './types';

/** The start screen's words, in the order index.html's table keeps them per language (window.__ycT). */
export interface StartWords {
  title: string;
  gps: string;
  note: string;
  or: string;
  jeju: string;
  busan: string;
  locating: string;
  retry: string;
}

/** Why the position could not be used, per language: shown only after this module has read it, so they come with
 * Busan's part rather than in index.html's inline table (its gzip cap, ADR-0096). The page's language at mount. */
const FAILED: Record<string, Record<NoOrigin, string>> = {
  ko: { denied: '위치를 쓸 수 없어요. 여행지를 골라 주세요.', unavailable: '위치를 찾지 못했어요. 여행지를 골라 주세요.', outside: '지금은 제주·부산 밖이에요. 여행지를 골라 주세요.' },
  en: { denied: "Can't use your location. Please choose where you are.", unavailable: "Couldn't find your location. Please choose where you are.", outside: "You're outside Jeju and Busan right now. Please choose one." },
  'zh-Hans': { denied: '无法使用位置。请选择旅行地。', unavailable: '找不到你的位置。请选择旅行地。', outside: '你现在不在济州或釜山。请选择旅行地。' },
  ja: { denied: '位置情報を使えません。旅行先を選んでください。', unavailable: '現在地が見つかりませんでした。旅行先を選んでください。', outside: 'いまは済州・釜山の外にいます。旅行先を選んでください。' },
};
/** 자동 지역 (plans/nationwide-app.md 4): anywhere in Korea is open, so outside is outside Korea; 다른 곳 and 뒤로; `failed`:
 * 다른 곳's part did not come (the list's own words, render.ts loadError); `popular`: the 인기 칸 in POPULAR's order, in
 * Korean's official forms (Revised Romanization, the Hanja names: 首尔·ソウル for 서울) — a cover in another language has
 * no Korean (B13); the 시군구 lists stay Korean (plans/nationwide-app.md 8) */
// `outside` only where the position is outside Korea (nation.ts inKorea, drawn wide), `nodata` where it is in Korea (or
// not surely outside it) with no 시군구 near: nothing said about where it is (predeploy review M-1)
const NATION_WORDS: Record<string, { outside: string; nodata: string; other: string; back: string; failed: string; popular?: readonly string[] }> = {
  ko: { outside: '지금은 한국 밖이에요. 여행지를 골라 주세요.', nodata: '이 근처는 아직 장소 자료가 없어요. 여행지를 골라 주세요.', other: '다른 곳', back: '뒤로', failed: '목록을 불러오지 못했어요. 연결을 확인하고 다시 불러와 주세요.' },
  en: {
    outside: "You're outside Korea right now. Please choose where you are.",
    nodata: "We don't have place data for around here yet. Please choose where you are.",
    other: 'Somewhere else',
    back: 'Back',
    failed: "Couldn't load the list. Check your connection and try again.",
    popular: ['Seoul', 'Gangneung', 'Gyeongju', 'Jeonju', 'Yeosu', 'Sokcho'],
  },
  'zh-Hans': { outside: '你现在不在韩国。请选择旅行地。', nodata: '这附近还没有地点资料。请选择旅行地。', other: '其他地方', back: '返回', failed: '列表没加载出来。检查一下网络再试。', popular: ['首尔', '江陵', '庆州', '全州', '丽水', '束草'] },
  ja: { outside: 'いまは韓国の外にいます。旅行先を選んでください。', nodata: 'このあたりの場所データはまだありません。旅行先を選んでください。', other: 'ほかの場所', back: '戻る', failed: 'リストを読み込めませんでした。接続を確認して、もう一度読み込んでください。', popular: ['ソウル', '江陵', '慶州', '全州', '麗水', '束草'] },
};
/** 인기 칸 (plans/nationwide-app.md 13 R14): name and 시군구 (서울: 서울시청's 중구, 전주: 한옥마을's 완산구); one a 검수한 곳
 * covers opens that destination at that 시군구 (강릉·속초 → 강원's, ADR-0102 Amendment 2) */
const POPULAR: readonly [string, SggCode][] = [
  ['서울', '11140'],
  ['강릉', '51150'],
  ['경주', '47130'],
  ['전주', '52111'],
  ['여수', '12130'],
  ['속초', '51210'],
];

export interface StartScreen {
  /** what it shows now: the first state, reading, or why the position could not be used */
  state(): 'start' | 'locating' | NoOrigin;
}

interface Inline {
  __ycT?: string[];
  __startPick?: string;
  __startTap?: unknown;
}

export interface StartDeps {
  geo: GeoDeps;
  signal: AbortSignal;
  /** chosen: by the position (`point`) or a button (`why` = what the position said before, if anything); `sgg`: the
   * 시군구 picked, the 자동 지역's or 강원's (plans/nationwide-app.md 4, ADR-0102 Amendment 2) */
  choose(d: Dest, how: 'gps' | 'pick', why: NoOrigin | null, point?: Point, sgg?: SggCode): void;
}

export function mountStart(doc: Document, deps: StartDeps): StartScreen | null {
  const box = doc.getElementById('ycStart');
  const w = doc.defaultView as (Window & Inline) | null;
  const a = w?.__ycT;
  const lang = doc.documentElement.lang;
  const N = NATION_WORDS[lang] ?? NATION_WORDS.ko;
  const T: (Pick<StartWords, 'gps' | 'locating'> & Record<NoOrigin, string>) | null = a ? { gps: a[1], locating: a[6], ...(FAILED[lang] ?? FAILED.ko) } : null;
  const big = doc.getElementById('ycGps') as HTMLButtonElement | null;
  const msg = doc.getElementById('ycMsg');
  const note = doc.getElementById('ycNote');
  const retry = doc.getElementById('ycRetry');
  if (!box || !T || !big || !msg || !note || !retry) return null;
  let now: 'start' | 'locating' | NoOrigin = 'start';
  /** where an `outside` position was, once the 자동 지역's part is in (release.ts outsideAt) */
  let at: OutsideAt | undefined;
  let done = false;

  function close() {
    done = true;
    doc.documentElement.classList.remove('yc-start');
    box!.remove();
    showPhotos(doc);
  }
  function show(next: 'start' | 'locating' | NoOrigin) {
    now = next;
    const failed = next !== 'start' && next !== 'locating';
    big!.hidden = failed;
    big!.disabled = next === 'locating';
    big!.textContent = next === 'locating' ? T!.locating : T!.gps;
    note!.hidden = failed;
    msg!.hidden = !failed;
    msg!.textContent = !failed ? '' : NATION && next === 'outside' && at === 'abroad' ? N.outside : NATION && next === 'outside' && at === 'nodata' ? N.nodata : T![next];
    retry!.hidden = next !== 'unavailable';
    // the big button that had the focus is gone: the message's first way on takes it
    const lost = !doc.activeElement || doc.activeElement === doc.body || doc.activeElement === big;
    if (failed && lost) (next === 'unavailable' ? retry! : box!.querySelector<HTMLElement>('[data-dest]'))?.focus();
  }
  function pick(d: string | undefined) {
    if (done || !isDest(d)) return;
    const why = now === 'start' || now === 'locating' ? null : now;
    close();
    deps.choose(d, 'pick', why);
  }
  /** `quiet`: location already allowed, nobody pressed anything — a failure leaves the first state (outside says so) */
  function gps(quiet = false) {
    if (done || now === 'locating') return;
    show('locating');
    void locateGps(deps.geo).then((r) => {
      if (done || deps.signal.aborted) return;
      const d = r.ok ? releasedDestOf(r.point) : null;
      if (r.ok && d) {
        close();
        deps.choose(d, 'gps', null, r.point);
        return;
      }
      at = r.ok ? outsideAt(r.point) : r.at;
      show(quiet && (r.ok || r.why !== 'outside') ? 'start' : r.ok ? 'outside' : r.why);
    });
  }

  // 자동 지역 (plans/nationwide-app.md 4): under the two destinations, the 인기 칸 (three to a row, lower: B13 keeps the
  // three ways on in the lower half at 375×812 and no scroll at 320×568) and 다른 곳, which lists the 시도 and then a 시도's
  // 시군구 in the cover's own place (its part asked for when it is not in yet)
  const main = box.querySelector<HTMLElement>(':scope > div');
  if (NATION && main) {
    box.classList.add('yc-nation');
    const button = (text: string, fn: () => void, ko = false) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = text;
      if (ko) b.lang = 'ko';
      b.addEventListener('click', (e) => (e.stopPropagation(), fn()));
      return b;
    };
    const rows = (bs: HTMLButtonElement[]) =>
      bs.reduce<HTMLElement[]>((out, b, i) => {
        if (i % 2 === 0) out.push(doc.createElement('div'));
        out[out.length - 1].append(b);
        return out;
      }, []);
    // a 시군구 of the index: the 자동 지역's, or the 검수한 곳 that covers it (its group, ADR-0102)
    const sggAreas = () => OPEN_AREAS.filter((x): x is Area & { name: SggCode } => x.group === 'nation' || isSggDest(x.group));
    const nation = (a: Area) => {
      if (done) return;
      const why = now === 'start' || now === 'locating' ? null : now;
      close();
      const d = destOfArea(a);
      deps.choose(d, 'pick', why, undefined, a.name as SggCode);
    };
    const tiles = POPULAR.flatMap(([name, c], i) => {
      const a = areaByName(c, sggAreas());
      return a ? [button(N.popular?.[i] ?? name, () => nation(a), !N.popular)] : [];
    });
    const popular = doc.createElement('div');
    popular.className = 'yc-pop';
    popular.append(...tiles);
    const panel = doc.createElement('div');
    panel.hidden = true;
    const back = (to: () => void) => {
      const b = button(N.back, to);
      b.className = 'yc-link';
      return b;
    };
    const showMain = () => {
      panel.hidden = true;
      main.hidden = false;
      other.focus();
    };
    const showSgg = (c: string) => {
      const part = nationPart()!;
      const list = sggAreas().filter((x) => part.sidoOf(x.name) === c);
      panel.replaceChildren(back(showSido), ...rows(list.map((x) => button(x.label, () => nation(x), true))));
      panel.querySelector('button')?.focus();
    };
    const showSido = () => {
      const part = nationPart()!;
      const note = part.copy.koNames ? [Object.assign(doc.createElement('p'), { textContent: part.copy.koNames })] : [];
      panel.replaceChildren(back(showMain), ...note, ...rows(part.sido().map((x) => button(x.name, () => showSgg(x.c)))));
      main.hidden = true;
      panel.hidden = false;
      panel.querySelector('button')?.focus();
    };
    let asking = false;
    const other = button(N.other, () => {
      if (asking || done) return;
      asking = true;
      void loadNation().then((ok) => {
        asking = false;
        if (done || deps.signal.aborted) return;
        if (ok) showSido();
        else {
          // not silent: the list's own words where the cover says why (the next press tries again)
          msg.hidden = false;
          msg.textContent = N.failed;
        }
      });
    });
    other.className = 'yc-link';
    main.append(...(tiles.length ? [popular] : []), other);
    box.append(panel);
  }

  const on = (type: string, fn: (e: Event) => void) => doc.addEventListener(type, fn, { signal: deps.signal });
  on('yc:dest', (e) => pick((e as CustomEvent<string>).detail));
  on('yc:start-gps', () => gps());
  // pressed before this module ran (index.html kept it)
  const early = w!.__startPick ?? null;
  const tapped = !!w!.__startTap;
  delete w!.__startPick;
  delete w!.__startTap;
  if (early) pick(early);
  else if (tapped) gps();
  else
    void deps.geo.geoPermission?.().then(
      (p) => p === 'granted' && gps(true),
      () => undefined,
    );
  return { state: () => now };
}
