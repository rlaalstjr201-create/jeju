// 자동 지역's own part (plans/nationwide-app.md 9): a chunk of its own, asked for only where the 자동 지역 is in play (the
// 시작 화면's 다른 곳, a position outside the 검수한 곳, a device that chose it), like src/busan-part.ts. It reads the index and
// hands release.ts the 시군구 as areas, where a point is (regionOf), the 이름 줄's word (sggShort) and the places around a
// 시군구 (its file and its neighbours', each file asked for once).
import type { SggCode } from './areas';
import { destOf } from './busan';
import { DEST, DESTS, type Dest } from './dest';
import { filesFor, normalizeNation, parseIndex, regionOf, sggShorts } from './nation';
import { installNation } from './release';

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
    areas: ix.sgg.map((s) => ({ name: s.c as SggCode, slug: s.c as SggCode, label: s.n, landmark: sido.get(s.s) ?? '', lat: s.lat, lng: s.lng, group: 'nation' })),
    region: (p) => regionOf(p, ix.sgg, destOf, curated),
    short: (c) => short[c] ?? '',
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
