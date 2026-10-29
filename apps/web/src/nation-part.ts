// 자동 지역's own part (plans/nationwide-app.md 9): a chunk of its own, asked for only where the 자동 지역 is in play (the
// 시작 화면's 다른 곳, a position outside the 검수한 곳, a device that chose it), like src/busan-part.ts. It reads the index and
// hands release.ts the 시군구 as areas, where a point is (regionOf), the 이름 줄's word (sggShort) and the places around a
// 시군구 (its file and its neighbours', each file asked for once).
import type { SggCode } from './areas';
import { destOf } from './busan';
import { DEST, DESTS, type Dest } from './dest';
import { filesFor, normalizeNation, parseIndex, regionOf, sggShorts } from './nation';
import { installNation } from './release';

/** The 자동 지역's own words (plans/nationwide-app.md 4·8): here rather than in render.ts, so a visit that never comes
 * here carries none of them; another language's (Lang.nation) are written in once this part is in (release.ts whenNation). */
export const NATION_COPY = {
  title: (short: string) => `여차나:${short} · P를 위한 여행동반자`,
  /** the results' 고르는 방식 line: no reason written for these places, the nearest first */
  how: '공공 데이터로 가까운 순으로 골랐어요.',
  outside: '지금은 한국 밖이에요.',
  stayOutside: '지금은 한국 밖이에요. 아래에서 숙소 동네를 골라 주세요.',
  otherSido: '다른 시도',
  /** the 시도 by code, in this language ('' or missing: the index's Korean short name) */
  sido: {} as Record<string, string>,
  /** another language: that the places and 시군구 are named in Korean ('' in Korean) */
  koNames: '',
};
export type NationCopy = typeof NATION_COPY;

const BASE = import.meta.env.BASE_URL;
const get = (path: string): Promise<unknown> =>
  fetch(`${BASE}${path}`).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json() as Promise<unknown>;
  });

/** The index read and the part installed: false when the index could not be had. */
export async function install(): Promise<boolean> {
  const ix = parseIndex(await get(`nation/index.json?v=${__NATION_V__}`).catch(() => null));
  if (!ix) return false;
  const short = sggShorts(ix);
  const sido = new Map(ix.sido.map((x) => [x.c, x.s]));
  const sidoOf = new Map(ix.sgg.map((s) => [s.c, s.s]));
  // the 시도 with a 시군구 of the 자동 지역 (Busan's and Jeju's have none), in the index's order
  const sidos = ix.sido.filter((x) => ix.sgg.some((s) => s.s === x.c)).map((x) => x.c);
  const sidoName = (c: string) => NATION_COPY.sido[c] || sido.get(c) || '';
  // a 검수한 곳 named by 시군구 (plans/nationwide-app.md 1.3) keeps its 시군구 and their records
  const curated: Partial<Record<Dest, readonly string[]>> = {};
  for (const d of DESTS) if (DEST[d].sgg) curated[d] = DEST[d].sgg;
  const curatedSgg = Object.values(curated).flat();
  const files = new Map<string, Promise<unknown>>();
  const file = (f: string) => {
    let p = files.get(f);
    if (!p) {
      p = get(`nation/${f}.json?v=${ix.files[f]}`);
      files.set(f, p);
      p.catch(() => files.delete(f)); // a failure is asked for again next time
    }
    return p;
  };
  installNation({
    list: ix.sgg.map((s) => ({ name: s.c as SggCode, slug: s.c as SggCode, label: s.n, landmark: sido.get(s.s) ?? '', lat: s.lat, lng: s.lng, group: 'nation' })),
    region: (p) => regionOf(p, ix.sgg, destOf, curated),
    short: (c) => short[c] ?? '',
    copy: NATION_COPY,
    sido: () => sidos.map((c) => ({ c, name: sidoName(c) })),
    sidoOf: (c) => sidoOf.get(c) ?? null,
    // the 동네 index (plans/nationwide-app.md 4): the 시군구 of the 시도 in use, then 다른 시도, which lists the 시도 in the
    // same place; one picked lists its 시군구 there
    areas(parent, where, selected, sgg, option) {
      const doc = parent.ownerDocument;
      const id = `areas-${where}-nation`;
      const h = doc.createElement('p');
      h.className = 'group-h';
      h.id = id;
      const grid = doc.createElement('div');
      grid.className = 'areas';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-labelledby', id);
      const on = (b: HTMLButtonElement, fn: () => void) => (b.addEventListener('click', fn), b);
      const first = () => grid.querySelector('button')?.focus();
      let now = sidoOf.get(selected ?? '') ?? sidoOf.get(sgg ?? '') ?? null;
      const show = (c: string) => {
        now = c;
        h.textContent = sidoName(c);
        grid.replaceChildren(
          ...ix.sgg.filter((s) => s.s === c).map((s) => option(s.n, null, { 'data-area': s.c, 'data-where': where, 'aria-pressed': String(s.c === selected) })),
          on(option(NATION_COPY.otherSido, null, { 'data-sido': '' }), () => (list(), first())),
        );
      };
      const list = () => {
        h.textContent = NATION_COPY.otherSido;
        grid.replaceChildren(...sidos.map((c) => on(option(sidoName(c), null, { 'data-sido': c, 'aria-pressed': String(c === now) }), () => (show(c), first()))));
      };
      if (now) show(now);
      else list();
      parent.append(h, grid);
    },
    // its own file must come; a neighbour's that does not is left out
    async spots(sgg) {
      const [own, ...near] = filesFor(sgg, ix.sgg);
      if (!own) throw new Error(`no 시군구 ${sgg}`);
      const lists = await Promise.all([file(own), ...near.map((f) => file(f).catch(() => []))]);
      return lists.flatMap((raw) => normalizeNation(raw, curatedSgg, sgg));
    },
  });
  return true;
}
