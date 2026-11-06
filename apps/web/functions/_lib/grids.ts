// 비 소식 ?grid= (plans/nationwide-app.md 5): the only cells the app sends — the 자동 지역's 시군구 centres'
// (data/nation/index.json, as this build ships it), by the same kmaGrid as src/region/nation-part.ts grid(). Any other cell
// would be a cache miss of its own and a call on the agency's daily quota, which Jeju's and Busan's 비 소식 share
// (predeploy review m-1). Not in kma.ts: the app's nation part imports that, and must not carry the index.
import nation from '../../data/nation/index.json';
import { kmaGrid } from './kma';

export const NATION_GRIDS: ReadonlySet<string> = new Set(
  (nation as { sgg: { lat: number; lng: number }[] }).sgg.map((s) => {
    const g = kmaGrid(s.lat, s.lng);
    return `${g.nx},${g.ny}`;
  }),
);
