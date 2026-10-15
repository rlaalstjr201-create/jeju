// Static landing pages (specs/seo-landing.md, ADR-0072): the 허브 /jeju/, 세부 지역 15쪽, keyword-gate 조합 쪽, and one
// page per place under /jeju/<area>/<place-slug>/. Pure functions, no files: scripts/build-landing.mjs reads the
// inputs, calls buildSite() and the checks below, and writes dist/. The rules the app uses are imported, not copied:
// 지역 배정 = nearestArea, 이동 시간 = travel/travelText, 지도 링크 = goLink/naverSearchUrl (ADR-0071 네이버지도 기본).
import { createHash } from 'node:crypto';
import { AREAS, AREA_GROUPS, nearestArea, type Area } from '../src/areas';
import { cleanName } from '../src/data';
import { logoInner } from '../src/logo';
import { bookLink, goLink, naverSearchUrl, TERMINALS } from '../src/links';
import { distanceKm, islandOf, listed, travel, travelText, type Mood, type Spot } from '../src/pick';
import { visibleText } from './seo/crawl-parse.mjs';

export const BRAND = '여차나:제주';
/** seo-analyst §0 — the entity sentence, word for word (here in 해요체 for the page body). */
export const ENTITY =
  '여차나:제주는 여차하면 나서는 P를 위한 여행동반자로, 계획 없이 다니는 여행자가 지금 있는 곳에서 기분 하나로 갈 곳 3곳을 받는 제주 무계획 여행 앱이에요.';
/** The same sentence as index.html's JSON-LD (plain style, as seo-analyst §0 writes it). */
const ENTITY_LD = ENTITY.replace(/이에요(?=\.$)/, '이다');
export const HUB = '/jeju/';
export const CSS_PATH = '/jeju/landing.css';
/** OQ6: places per mood on an area page; 2단계 조합 쪽. */
export const PER_MOOD = 5;
export const PER_COMBO = 12;
/** Place page: nearby places in the same area (3–5). */
export const NEARBY = 5;
/** 지역 쪽 「비 오는 날」 절 (ADR-0065): indoor 쉬기·새로운 거 places; an area with fewer gets no section. */
export const RAIN_MIN = 10;
const MOODS: readonly Mood[] = ['rest', 'walk', 'new', 'food'];
/** Screen names of the moods (docs/context.md 기분). */
export const MOOD_NAME: Record<Mood | 'any', string> = {
  rest: '푹 쉬고 싶어',
  walk: '좀 걷고 싶어',
  new: '새로운 거 해보고 싶어',
  food: '맛있는 거 먹고 싶어',
  any: '아무거나 골라줘',
};
const MOOD_GLOSS: Record<Mood | 'any', string> = {
  rest: '쉬어 갈 곳',
  walk: '산책길, 오름, 올레길처럼 걸을 곳',
  new: '구경하거나 체험할 곳',
  food: '식사, 카페·디저트',
  any: '쉬기·걷기·새로운 거에서 한 곳씩',
};
/** One sentence per area, written for these pages (never VisitJeju text, specs/seo-landing.md). */
export const AREA_LINE: Record<Area['slug'], string> = {
  hangyeong: '제주 서쪽 끝 바닷가예요. 수월봉 해안과 차귀도가 보이는 포구가 있어요.',
  hallim: '협재·금능 해변과 한림항이 있는 서쪽 바닷가예요. 비양도 가는 배도 한림항에서 떠요.',
  aewol: '제주시 서쪽 바닷가 마을이에요. 한담 해안 산책로를 따라 카페가 이어져요.',
  sinjeju: '공항에서 가까운 시내예요. 도착한 날이나 떠나는 날 들르기 쉬워요.',
  gujeju: '동문시장과 제주항이 있는 옛 시내예요. 걸어서 다닐 곳이 모여 있어요.',
  jocheon: '함덕 해변이 있는 제주시 동쪽 바닷가예요. 오름과 숲길도 가까워요.',
  gujwa: '월정리·세화 바닷가와 오름이 많은 동쪽 마을이에요.',
  udo: '성산포항에서 배를 타고 들어가는 섬이에요. 섬 안의 곳끼리는 가까워요.',
  daejeong: '모슬포항이 있는 남서쪽 끝이에요. 가파도·마라도 가는 배는 운진항에서 떠요.',
  andeok: '산방산과 용머리해안이 있는 남서쪽 마을이에요.',
  jungmun: '주상절리와 중문 해변, 관광단지가 모인 남쪽 바닷가예요.',
  seogwipo: '올레시장과 천지연폭포가 있는 서귀포 시내예요. 시내 곳끼리 가까워요.',
  namwon: '위미·남원 포구가 이어지는 남동쪽 바닷가 마을이에요.',
  pyoseon: '표선 해변과 성읍민속마을이 있는 동남쪽이에요.',
  seongsan: '성산일출봉과 성산포항이 있는 동쪽 끝이에요. 우도 가는 배도 성산포항에서 떠요.',
};
/** Words a place slug may not be: the mood segment of a 조합 쪽 (/jeju/<area>/<mood>/) and the stylesheet. */
const RESERVED = new Set(['rest', 'walk', 'new', 'food', 'any', 'landing', 'place']);

// --- slugs (OQ5: 영문) ------------------------------------------------------------------------------------------
const CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const JUNG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const JONG = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
/** A final consonant read before a vowel (the next syllable starts with ㅇ) moves over: 한라 → hanra, 협재 → hyeopjae. */
const JONG_LINK = ['', 'g', 'kk', 'ks', 'n', 'nj', 'nh', 'd', 'r', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h'];

/** 국어의 로마자 표기법 by letter, with two sound rules only (연음, ㄹㄹ → ll): readable, not exact. */
export function romanize(word: string): string {
  const syl = [...word].map((ch) => {
    const c = ch.codePointAt(0)! - 0xac00;
    return c >= 0 && c < 11172 ? { cho: Math.floor(c / 588), jung: Math.floor((c % 588) / 28), jong: c % 28 } : null;
  });
  let out = '';
  syl.forEach((s, i) => {
    if (!s) return;
    const next = syl[i + 1];
    let jong = JONG[s.jong];
    if (next && next.cho === 11 && s.jong !== 21) jong = JONG_LINK[s.jong];
    else if (next && s.jong === 8 && next.cho === 5) jong = 'l';
    const cho = i > 0 && syl[i - 1]?.jong === 8 && s.cho === 5 ? 'l' : CHO[s.cho];
    out += cho + JUNG[s.jung] + jong;
  });
  return out;
}

/** 「협재 해수욕장」 → hyeopjae-haesuyokjang, 「버거307 협재점」 → beogeo-307-hyeopjaejeom. Latin and digits stay. */
export function slugBase(name: string): string {
  const words = cleanName(name).match(/[가-힣]+|[a-z0-9]+/gi) ?? [];
  let out = '';
  for (const w of words) {
    const part = /[가-힣]/.test(w) ? romanize(w) : w.toLowerCase();
    if (!part) continue;
    if (out && out.length + 1 + part.length > 60) break;
    out = out ? `${out}-${part}` : part;
  }
  return out.slice(0, 60).replace(/-+$/, '') || 'place';
}

export interface SlugEntry {
  slug: string;
  /** the area of the page's first address, so a move to another area can be redirected */
  area: string;
}
export type SlugRegistry = Record<string, SlugEntry>;

/** Slugs for ids the registry does not know yet. Existing entries never change, and a slug once given is never
 * given again (a removed place's address stays reserved): a clash gets -2, -3 … New ids are taken in id order. */
export function assignSlugs(spots: readonly Pick<Spot, 'id' | 'name' | 'lat' | 'lng'>[], registry: SlugRegistry): SlugRegistry {
  const taken = new Set(Object.values(registry).map((e) => e.slug));
  const added: SlugRegistry = {};
  for (const s of [...spots].filter((x) => !registry[x.id]).sort((a, b) => a.id.localeCompare(b.id))) {
    const base = slugBase(s.name);
    let slug = RESERVED.has(base) ? `${base}-2` : base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    added[s.id] = { slug, area: nearestArea(s).slug };
  }
  return added;
}

// --- model ------------------------------------------------------------------------------------------------------
export interface Place {
  spot: Spot;
  area: Area;
  slug: string;
  url: string;
}
export interface Combo {
  area: Area;
  mood: Mood;
  query: string;
  url: string;
  /** narrows 새로운 거 when the search words say so: 체험 → do, 구경 → sight */
  sub?: 'do' | 'sight';
}
export interface SiteInput {
  spots: Spot[];
  slugs: SlugRegistry;
  /** ids that get no page (the quality bar: a reason that repeats source text); they stay in the app */
  exclude?: ReadonlySet<string>;
  /** keyword-gate targets whose landing is /jeju/<area>/<mood>/ (2단계) */
  combos?: { area: string; mood: Mood; query: string }[];
  /** SITE_URL, no trailing slash ('' = relative) */
  site: string;
  /** OQ2 + ADR-0072: VisitJeju photos as hotlinks; false = LANDING_PHOTOS=0 */
  photos: boolean;
  /** spots.json's last change (YYYY-MM-DD), or null */
  dataDate: string | null;
}
export interface SitePage {
  path: string;
  kind: 'hub' | 'area' | 'combo' | 'place';
  html: string;
  /** the page's place (place pages), for the checks */
  id?: string;
}
export interface Site {
  pages: SitePage[];
  places: Place[];
  combos: Combo[];
  /** `/old/ /new/ 301` lines for places whose area changed since their first address */
  redirects: string[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const areaPath = (a: Area) => `${HUB}${a.slug}/`;
/** 「애월(한담)」; landmarks that are no place name (공항 근처, 배로 가는 섬) are left out. */
export const areaTitle = (a: Area) => (/근처|섬/.test(a.landmark) ? a.label : `${a.label}(${a.landmark})`);
const appLink = (a: Area, mood?: Mood) => `/?area=${a.slug}${mood ? `&mood=${mood}` : ''}`;
/** Indoor places for a rainy day: 쉬기·새로운 거 only (식사·카페 have their own mood). */
const rainy = (p: Place) => p.spot.indoor && (p.spot.mood === 'rest' || p.spot.mood === 'new');

/** What the place is, in the app's words: the food and 새로운 거 tabs (ADR-0028, ADR-0064). */
export function kindOf(s: Spot): string {
  if (s.mood === 'food') return s.sub === 'cafe' ? '카페·디저트' : '식사';
  if (s.mood === 'new') return s.sub === 'do' ? '체험' : s.sub === 'sight' ? '구경' : '새로운 곳';
  return s.mood === 'walk' ? '걸을 곳' : '쉬어 갈 곳';
}
const schemaType = (s: Spot) => (s.mood === 'food' ? (s.sub === 'cafe' ? 'CafeOrCoffeeShop' : 'Restaurant') : 'TouristAttraction');

/** The app's order inside one area (specs/ranking.md without the user's position): score, then the trip from the
 * area centre, then id. */
function rank(list: Place[]): Place[] {
  return [...list].sort(
    (a, b) => b.spot.score - a.spot.score || distanceKm(a.area, a.spot) - distanceKm(b.area, b.spot) || a.spot.id.localeCompare(b.spot.id),
  );
}

export function buildSite(input: SiteInput): Site {
  const { site, photos } = input;
  const exclude = input.exclude ?? new Set<string>();
  const redirects: string[] = [];
  const places: Place[] = [];
  for (const spot of input.spots) {
    const reg = input.slugs[spot.id];
    if (!reg) throw new Error(`no slug for ${spot.id} (${spot.name}): run npm run landing:slugs`);
    if (exclude.has(spot.id)) continue;
    // ADR-0074: only what the app can pick — a 체험 without a verified booking route gets no page
    if (!listed(spot)) continue;
    const area = nearestArea(spot);
    const url = `${areaPath(area)}${reg.slug}/`;
    places.push({ spot, area, slug: reg.slug, url });
    if (reg.area !== area.slug) redirects.push(`${HUB}${reg.area}/${reg.slug}/ ${url} 301`);
  }
  const byArea = new Map(AREAS.map((a) => [a.slug, rank(places.filter((p) => p.area.slug === a.slug))]));
  const combos: Combo[] = (input.combos ?? []).flatMap((c) => {
    const area = AREAS.find((a) => a.slug === c.area);
    if (!area) return [];
    const sub = c.mood === 'new' ? (/체험/.test(c.query) ? 'do' : /구경/.test(c.query) ? 'sight' : undefined) : undefined;
    return [{ area, mood: c.mood, query: c.query, url: `${areaPath(area)}${c.mood}/`, ...(sub ? { sub } : {}) }];
  });
  const ctx: Ctx = { site, photos, dataDate: input.dataDate, byArea, combos };
  const pages: SitePage[] = [{ path: HUB, kind: 'hub', html: hubPage(ctx) }];
  for (const a of AREAS) pages.push({ path: areaPath(a), kind: 'area', html: areaPage(ctx, a) });
  for (const c of combos) pages.push({ path: c.url, kind: 'combo', html: comboPage(ctx, c) });
  for (const p of places) pages.push({ path: p.url, kind: 'place', html: placePage(ctx, p), id: p.spot.id });
  return { pages, places, combos, redirects };
}

// --- pages ------------------------------------------------------------------------------------------------------
interface Ctx {
  site: string;
  photos: boolean;
  dataDate: string | null;
  byArea: Map<string, Place[]>;
  combos: Combo[];
}
interface Crumb {
  name: string;
  path: string;
}
const DOCTYPE = '<!doctype html>';
const ld = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
const crumbsLd = (ctx: Ctx, crumbs: Crumb[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${ctx.site}${c.path}` })),
});
const rootCrumbs = (): Crumb[] => [
  { name: BRAND, path: '/' },
  { name: '제주 무계획 여행', path: HUB },
];
const geo = (p: { lat: number; lng: number }) => ({ '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng });
const credit = (ctx: Ctx) =>
  `<p class="credit">${ctx.photos ? '정보·사진' : '정보'}: 비짓제주(제주관광공사) · <a href="https://www.visitjeju.net" rel="noopener">visitjeju.net</a></p>`;

function layout(ctx: Ctx, o: { path: string; title: string; description: string; crumbs: Crumb[]; graph: unknown[]; body: string; image?: string }): string {
  const url = `${ctx.site}${o.path}`;
  const og = ctx.site
    ? `\n<meta property="og:url" content="${esc(url)}">\n<meta property="og:image" content="${esc(o.image ?? `${ctx.site}/og.png`)}">`
    : '';
  const nav = o.crumbs
    .map((c, i) => (i === o.crumbs.length - 1 ? `<li aria-current="page">${esc(c.name)}</li>` : `<li><a href="${c.path}">${esc(c.name)}</a></li>`))
    .join('');
  return `${DOCTYPE}
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:locale" content="ko_KR">${og}
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="stylesheet" href="${CSS_PATH}">
<script type="application/ld+json">${ld({ '@context': 'https://schema.org', '@graph': [...o.graph, crumbsLd(ctx, o.crumbs)] })}</script>
</head>
<body>
<header class="top"><a class="logo" href="/">${logoInner()}</a></header>
<main>
<nav class="crumbs" aria-label="지금 보는 곳"><ol>${nav}</ol></nav>
${o.body}
</main>
<footer class="foot">
${credit(ctx)}
${ctx.dataDate ? `<p>장소 정보 기준 ${ctx.dataDate}. 영업 여부와 시간은 지도 앱에서 확인해 주세요.</p>` : '<p>영업 여부와 시간은 지도 앱에서 확인해 주세요.</p>'}
<p><a href="/privacy">개인정보 처리 안내</a></p>
</footer>
</body>
</html>
`;
}

const thumb = (ctx: Ctx, s: Spot, cls: string, alt = '', eager = false) =>
  ctx.photos && s.image
    ? `<div class="ph ${cls}"><img src="${esc(s.image)}" alt="${esc(alt)}" referrerpolicy="no-referrer" ${eager ? '' : 'loading="lazy" '}decoding="async"${cls === 'hero' ? ' width="600" height="400"' : ' width="72" height="72"'}></div>`
    : '';

/** One line of facts under a listed place: 구경/체험 · 실내 · 장날. */
function tags(s: Spot): string {
  const t = [kindOf(s)];
  if (s.indoor) t.push('실내');
  if (s.market) t.push(`장날 ${s.market.label}`);
  return t.join(' · ');
}

function placeRow(ctx: Ctx, p: Place, from: string): string {
  const trip = travelText(travel(p.area, false, p.spot), from);
  return `<li class="row">${thumb(ctx, p.spot, 'sq')}<div><a class="name" href="${p.url}">${esc(cleanName(p.spot.name))}</a><p class="reason">${esc(p.spot.reason)}</p><p class="meta">${esc(tags(p.spot))} · ${esc(trip)}</p></div></li>`;
}

function itemList(ctx: Ctx, name: string, list: Place[]) {
  return {
    '@type': 'ItemList',
    name,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: list.length,
    itemListElement: list.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': schemaType(p.spot),
        name: cleanName(p.spot.name),
        description: p.spot.reason,
        geo: geo(p.spot),
        url: `${ctx.site}${p.url}`,
        ...(ctx.photos && p.spot.image ? { image: p.spot.image } : {}),
      },
    })),
  };
}

function hubPage(ctx: Ctx): string {
  const groups = AREA_GROUPS.map(
    (g) =>
      `<h3>${g.heading}</h3>\n<ul class="areas">${AREAS.filter((a) => a.group === g.group)
        .map((a) => `<li><a href="${areaPath(a)}">${esc(areaTitle(a))}</a> <span class="meta">${ctx.byArea.get(a.slug)!.length}곳</span></li>`)
        .join('')}</ul>`,
  ).join('\n');
  const combos = ctx.combos.length
    ? `<h2>동네와 기분을 함께</h2>\n<ul class="areas">${ctx.combos.map((c) => `<li><a href="${c.url}">${esc(c.query)}</a></li>`).join('')}</ul>`
    : '';
  const total = [...ctx.byArea.values()].reduce((n, l) => n + l.length, 0);
  const body = `<h1>P를 위한 제주 무계획 여행</h1>
<p class="lead">${ENTITY}</p>
<p>일정이나 코스는 짜 드리지 않아요. 지금 있는 곳과 기분 하나만 고르면 갈 만한 곳 3곳을 골라 드리고, 차로 몇 분인지 함께 보여 드려요. 멀리 갈지 가까이 갈지는 걸어서, 차로 30분, 차로 1시간 중에서 골라요.</p>
<p><a class="go" href="/">앱에서 지금 3곳 보기</a></p>
<h2>기분은 다섯 가지</h2>
<ul class="moods">${(['rest', 'walk', 'new', 'food', 'any'] as const).map((m) => `<li><b>${MOOD_NAME[m]}</b> <span class="meta">${MOOD_GLOSS[m]}</span></li>`).join('')}</ul>
<h2>동네 15곳</h2>
<p>동네를 고르면 그 근처에서 기분마다 먼저 나오는 곳을 볼 수 있어요. 모두 ${total.toLocaleString('ko-KR')}곳이에요.</p>
${groups}
${combos}`;
  return layout(ctx, {
    path: HUB,
    title: `P를 위한 제주 무계획 여행 · ${BRAND}`,
    description: '계획 없이 제주에 왔다면, 지금 기분 하나만 고르세요. 동네 15곳에서 갈 만한 곳을 기분별로 볼 수 있어요.',
    crumbs: rootCrumbs(),
    graph: [
      {
        '@type': 'CollectionPage',
        name: 'P를 위한 제주 무계획 여행',
        description: ENTITY_LD,
        inLanguage: 'ko',
        url: `${ctx.site}${HUB}`,
        isPartOf: { '@type': 'WebSite', name: BRAND, url: `${ctx.site}/` },
      },
      {
        '@type': 'ItemList',
        name: '제주 동네 15곳',
        numberOfItems: AREAS.length,
        itemListElement: AREAS.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: areaTitle(a), url: `${ctx.site}${areaPath(a)}` })),
      },
    ],
    body,
  });
}

/** The areas nearest to this one (centre to centre), for 이웃 동네. */
const neighbours = (a: Area, n = 3) =>
  AREAS.filter((x) => x !== a)
    .map((x) => ({ x, km: distanceKm(a, x) }))
    .sort((p, q) => p.km - q.km)
    .slice(0, n)
    .map((p) => p.x);

function areaPage(ctx: Ctx, a: Area): string {
  const list = ctx.byArea.get(a.slug)!;
  const from = `${a.label} 중심에서`;
  const sections = MOODS.map((m) => {
    const top = list.filter((p) => p.spot.mood === m).slice(0, PER_MOOD);
    return `<section aria-labelledby="m-${m}">
<h2 id="m-${m}">${MOOD_NAME[m]}</h2>
<ol class="list">${top.map((p) => placeRow(ctx, p, from)).join('')}</ol>
<p><a class="tbtn" href="${appLink(a, m)}">앱에서 ${esc(a.label)} 근처 3곳 보기</a></p>
</section>`;
  }).join('\n');
  const index = MOODS.map((m) => {
    const all = list.filter((p) => p.spot.mood === m);
    return `<h3>${MOOD_NAME[m]} <span class="meta">${all.length}곳</span></h3>\n<ul class="idx">${all.map((p) => `<li><a href="${p.url}">${esc(cleanName(p.spot.name))}</a></li>`).join('')}</ul>`;
  }).join('\n');
  const indoor = list.filter(rainy);
  const rain =
    indoor.length >= RAIN_MIN
      ? `\n<section aria-labelledby="rain">
<h2 id="rain">비 오는 날, ${esc(a.label)} 실내</h2>
<p>비가 오면 앱에서 「비 와요(실내만)」를 켜 보세요. ${esc(a.label)} 근처 실내 쉬기·구경·체험 ${indoor.length}곳 중 먼저 갈 만한 곳이에요.</p>
<ol class="list">${indoor.slice(0, PER_MOOD).map((p) => placeRow(ctx, p, from)).join('')}</ol>
<p><a class="tbtn" href="${appLink(a)}&indoor=1">앱에서 ${esc(a.label)} 실내 3곳 보기</a></p>
</section>`
      : '';
  const near = neighbours(a);
  const combos = ctx.combos.filter((c) => c.area === a);
  const body = `<h1>${esc(a.label)} 근처에서 지금 뭐 할까</h1>
<p class="lead">${esc(AREA_LINE[a.slug])} 기분 하나만 고르면 앱이 근처 3곳을 골라 드려요.</p>
<p class="meta">여기 순서는 ${esc(a.label)} 중심에서 잰 거예요. 앱에서는 ${esc(a.label)} 근처 3곳을 지금 다시 골라요.</p>
<p><a class="go" href="${appLink(a)}">앱에서 ${esc(a.label)} 근처 3곳 보기</a></p>
${sections}${rain}
${combos.length ? `<h2>기분과 함께</h2>\n<ul class="areas">${combos.map((c) => `<li><a href="${c.url}">${esc(c.query)}</a></li>`).join('')}</ul>` : ''}
<h2>${esc(a.label)} 근처 전체 ${list.length}곳</h2>
${index}
<h2>이웃 동네</h2>
<ul class="areas">${near.map((x) => `<li><a href="${areaPath(x)}">${esc(areaTitle(x))}</a></li>`).join('')}<li><a href="${HUB}">동네 15곳 모두</a></li></ul>`;
  return layout(ctx, {
    path: areaPath(a),
    title: `${areaTitle(a)} 근처, 지금 갈 만한 곳 · ${BRAND}`,
    description: `${a.label} 근처에서 기분 하나만 고르세요. 쉬기·걷기·새로운 거·먹기마다${rain ? ', 비 오는 날 실내까지' : ''} 먼저 갈 만한 곳을 모았어요.`,
    crumbs: [...rootCrumbs(), { name: a.label, path: areaPath(a) }],
    graph: [
      {
        '@type': 'TouristDestination',
        name: a.label,
        description: AREA_LINE[a.slug],
        geo: geo(a),
        containedInPlace: { '@type': 'AdministrativeArea', name: '제주특별자치도' },
        url: `${ctx.site}${areaPath(a)}`,
      },
      ...MOODS.map((m) => itemList(ctx, `${a.label} 근처, ${MOOD_NAME[m]}`, list.filter((p) => p.spot.mood === m).slice(0, PER_MOOD))),
    ],
    body,
  });
}

function comboPage(ctx: Ctx, c: Combo): string {
  const a = c.area;
  const top = ctx.byArea
    .get(a.slug)!
    .filter((p) => p.spot.mood === c.mood && (!c.sub || p.spot.sub === c.sub))
    .slice(0, PER_COMBO);
  const body = `<h1>${esc(c.query)}</h1>
<p class="lead">${esc(AREA_LINE[a.slug])} ${esc(a.label)} 근처에서 「${MOOD_NAME[c.mood]}」${c.sub ? `의 ${c.sub === 'do' ? '체험' : '구경'} 탭을` : '를'} 누르면 먼저 나오는 곳 ${top.length}곳이에요.</p>
<p class="meta">거리는 ${esc(a.label)} 중심에서 잰 거예요. 앱에서는 ${esc(a.label)} 근처 3곳을 지금 다시 골라요.</p>
<p><a class="go" href="${appLink(a, c.mood)}">앱에서 지금 3곳 보기</a></p>
<ol class="list">${top.map((p) => placeRow(ctx, p, `${a.label} 중심에서`)).join('')}</ol>
<p><a class="tbtn" href="${areaPath(a)}">${esc(a.label)} 근처 다른 기분도 보기</a></p>`;
  return layout(ctx, {
    path: c.url,
    title: `${c.query}, 지금 할 만한 곳 · ${BRAND}`,
    description: `${c.query}, 지금 할 만한 곳 ${top.length}곳. 기분 하나만 고르면 앱이 근처 3곳을 골라 드려요.`,
    crumbs: [...rootCrumbs(), { name: a.label, path: areaPath(a) }, { name: c.query, path: c.url }],
    graph: [itemList(ctx, c.query, top)],
    body,
  });
}

function placePage(ctx: Ctx, p: Place): string {
  const { spot: s, area: a } = p;
  const name = cleanName(s.name);
  const nearby = ctx.byArea
    .get(a.slug)!
    .filter((x) => x !== p)
    .map((x) => ({ x, km: distanceKm(s, x.spot) }))
    .sort((u, v) => u.km - v.km || u.x.spot.id.localeCompare(v.x.spot.id))
    .slice(0, NEARBY)
    .map(({ x }) => x);
  const go = goLink(s, null, false, false, 'naver');
  // 예약 (ADR-0074): the same verified route as the app's 체험 card
  const book = bookLink(s);
  const island = islandOf(s);
  const facts = [
    `<li><b>동네</b> <a href="${areaPath(a)}">${esc(areaTitle(a))}</a>, ${esc(travelText(travel(a, false, s), `${a.label} 중심에서`))}</li>`,
    `<li><b>기분</b> 「${MOOD_NAME[s.mood]}」, ${esc(kindOf(s))}</li>`,
    `<li><b>비 오는 날</b> ${s.indoor ? '실내라 「비 와요(실내만)」를 켜도 나와요' : '바깥이라 「비 와요(실내만)」를 켜면 빠져요'}</li>`,
    ...(s.market ? [`<li><b>오일장</b> 장날은 매달 ${esc(s.market.label)}이에요. 장날에는 앱에서 먼저 나와요</li>`] : []),
    ...(island ? [`<li><b>배</b> ${island}에 있어요. 배는 ${esc(TERMINALS[island].name)}에서 타요</li>`] : []),
  ];
  const body = `<h1>${esc(name)}</h1>
${thumb(ctx, s, 'hero', `${name} 사진`, true)}${ctx.photos && s.image ? '\n<p class="meta">사진: 비짓제주(제주관광공사)</p>' : ''}
<p class="lead">${esc(s.reason)}</p>
<ul class="facts">${facts.join('')}</ul>
<p class="links"><a class="go" href="${esc(go.href)}" rel="noopener">네이버지도로 ${go.text}</a> <a class="tbtn" href="${esc(naverSearchUrl(s))}" rel="noopener">네이버지도에서 보기</a>${book ? ` <a class="tbtn" href="${esc(book.href)}" rel="noopener" aria-label="${esc(book.aria)}">${esc(book.text)}</a>` : ''}</p>
<p><a class="tbtn" href="${appLink(a, s.mood)}">앱에서 근처 3곳 보기</a></p>
<h2>가까운 곳</h2>
<ul class="near">${nearby
    .map((x) => `<li><a href="${x.url}">${esc(cleanName(x.spot.name))}</a> <span class="meta">${esc(kindOf(x.spot))} · ${esc(travelText(travel(s, true, x.spot)))}</span></li>`)
    .join('')}</ul>`;
  const title = `${name}, ${areaTitle(a)} 근처 ${kindOf(s)} · ${BRAND}`;
  return layout(ctx, {
    path: p.url,
    title,
    description: `${s.reason}. ${a.label} 근처에서 「${MOOD_NAME[s.mood]}」를 누르면 나오는 곳이에요.`,
    crumbs: [...rootCrumbs(), { name: a.label, path: areaPath(a) }, { name, path: p.url }],
    image: ctx.photos && s.image ? s.image : undefined,
    graph: [
      {
        '@type': schemaType(s),
        name,
        description: s.reason,
        geo: geo(s),
        url: `${ctx.site}${p.url}`,
        hasMap: naverSearchUrl(s),
        ...(ctx.photos && s.image ? { image: s.image } : {}),
        containedInPlace: { '@type': 'TouristDestination', name: a.label, url: `${ctx.site}${areaPath(a)}` },
      },
    ],
    body,
  });
}

// --- sitemap ----------------------------------------------------------------------------------------------------
/** sitemap.xml, or (more than `max` URLs, the protocol's limit is 50,000) an index plus sitemap-N.xml files.
 * `lastmod`: one date for every URL, or each page's own (pageLastmods); an index file gets its URLs' latest. */
export function sitemapFiles(paths: string[], site: string, lastmod: string | null | Record<string, string>, max = 45000): Record<string, string> {
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const dateOf = (p: string) => (typeof lastmod === 'string' ? lastmod : lastmod?.[p] ?? null);
  const tag = (d: string | null) => (d ? `<lastmod>${d}</lastmod>` : '');
  const urlset = (ps: string[]) =>
    `${head}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${ps.map((p) => `<url><loc>${esc(`${site}${p}`)}</loc>${tag(dateOf(p))}</url>`).join('\n')}\n</urlset>\n`;
  if (paths.length <= max) return { 'sitemap.xml': urlset(paths) };
  const out: Record<string, string> = {};
  const latest: Record<string, string | null> = {};
  for (let i = 0; i * max < paths.length; i++) {
    const ps = paths.slice(i * max, (i + 1) * max);
    out[`sitemap-${i + 1}.xml`] = urlset(ps);
    latest[`sitemap-${i + 1}.xml`] = ps.map(dateOf).reduce<string | null>((a, d) => (d && (!a || d > a) ? d : a), null);
  }
  out['sitemap.xml'] = `${head}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(out)
    .map((f) => `<sitemap><loc>${esc(`${site}/${f}`)}</loc>${tag(latest[f])}</sitemap>`)
    .join('\n')}\n</sitemapindex>\n`;
  return out;
}

// --- per-page lastmod (audit D4, ADR-0079 4: IndexNow sends only pages that changed) --------------------------------
export interface LastmodEntry {
  hash: string;
  lastmod: string;
}
/** What a page says, for telling whether it changed: its <main> (the shared header, footer with the data date, and
 * head are left out), with the site address and photos taken out — a SITE_URL or LANDING_PHOTOS=0 build is the same
 * page. */
export function contentHash(html: string, site: string): string {
  let main = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/)?.[1] ?? html;
  if (site) main = main.split(site).join('');
  main = main.replace(/<img\b[^>]*>/g, '').replace(/<p class="meta">사진: [^<]*<\/p>/g, '');
  // and the boxes they sat in (`<div class="ph sq"></div>`), now empty; the photo's credit line went with it
  for (let was = ''; was !== main; ) [was, main] = [main, main.replace(/<(\w+)\b[^>]*>\s*<\/\1>/g, '')];
  main = main.replace(/\s+/g, ' ');
  return createHash('sha256').update(main).digest('hex').slice(0, 16);
}
/** Each page's lastmod: kept while its hash is the same, `today` when it changed or is new. With no record yet
 * (`prev` null) every page starts at `start` (the data date the sitemap used before), so the first run changes
 * nothing for IndexNow. Pages that are gone are dropped. Same input, same output (idempotent). */
export function pageLastmods(prev: Record<string, LastmodEntry> | null, hashes: Record<string, string>, today: string, start: string | null): Record<string, LastmodEntry> {
  const out: Record<string, LastmodEntry> = {};
  for (const path of Object.keys(hashes).sort()) {
    const hash = hashes[path];
    const old = prev?.[path];
    out[path] = { hash, lastmod: old && old.hash === hash ? old.lastmod : prev ? today : start ?? today };
  }
  return out;
}
/** Today in Jeju (Asia/Seoul, UTC+9, no DST). */
export const kstDay = (now: Date) => new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

// --- checks (the quality bar, specs/seo-landing.md 「품질 기준」) ------------------------------------------------
/** Whitespace-free visible text — what the checks compare. */
export const flatText = (html: string) => visibleText(html).replace(/\s+/g, '');
/** The page's own content: <main> without the site header and footer every page shares (duplicate detection looks
 * past boilerplate too). */
export const mainText = (html: string) => flatText(html.match(/<main>([\s\S]*)<\/main>/)?.[1] ?? html);

/** L4: a run of `n` characters of source text (VisitJeju introduction and the summaries made from it) in a page.
 * Place names are facts, not text: they are cut out of the page before comparing. */
export function sourceCopies(pages: { path: string; html: string }[], sources: string[], names: string[], n = 20): { path: string; run: string }[] {
  const grams = new Set<string>();
  for (const src of sources) {
    const t = src.replace(/\s+/g, '');
    for (let i = 0; i + n <= t.length; i++) grams.add(t.slice(i, i + n));
  }
  const cut = [...new Set(names.map((x) => x.replace(/\s+/g, '')).filter((x) => x.length >= 4))].sort((a, b) => b.length - a.length);
  const out: { path: string; run: string }[] = [];
  for (const p of pages) {
    let text = flatText(p.html);
    for (const nm of cut) if (text.includes(nm)) text = text.split(nm).join('|');
    for (let i = 0; i + n <= text.length; i++) {
      const run = text.slice(i, i + n);
      if (!run.includes('|') && grams.has(run)) {
        out.push({ path: p.path, run });
        break;
      }
    }
  }
  return out;
}

/** Reason sentences that repeat `n` characters of their own source text: those places get no page. */
export function copiedReasons(spots: Pick<Spot, 'id' | 'reason'>[], sourceOf: (id: string) => string[], n = 20): Set<string> {
  const out = new Set<string>();
  for (const s of spots) {
    const r = s.reason.replace(/\s+/g, '');
    const src = sourceOf(s.id).map((t) => t.replace(/\s+/g, '')).join('|');
    for (let i = 0; i + n <= r.length; i++) {
      if (src.includes(r.slice(i, i + n))) {
        out.add(s.id);
        break;
      }
    }
  }
  return out;
}

const SHINGLE = 5;
function shingles(text: string): Uint32Array {
  const set = new Set<number>();
  for (let i = 0; i + SHINGLE <= text.length; i++) {
    let h = 0x811c9dc5;
    for (let j = i; j < i + SHINGLE; j++) h = Math.imul(h ^ text.charCodeAt(j), 0x01000193);
    set.add(h >>> 0);
  }
  return Uint32Array.from(set).sort();
}
function jaccard(a: Uint32Array, b: Uint32Array): number {
  let i = 0;
  let j = 0;
  let both = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      both++;
      i++;
      j++;
    } else if (a[i] < b[j]) i++;
    else j++;
  }
  return both / (a.length + b.length - both || 1);
}

const HASHES = 128;
/** The most alike pairs of pages (5-character shingles of the <main> text, Jaccard). Every pair is estimated with
 * 128 MinHashes (standard error ≤ 0.045); pairs estimated within 0.15 of `min` get the exact Jaccard.
 * `min`: report pairs at or above it. */
export function similarPairs(pages: { path: string; html: string }[], min: number): { a: string; b: string; sim: number }[] {
  const sets = pages.map((p) => shingles(mainText(p.html)));
  const seeds = Array.from({ length: HASHES }, (_, i) => Math.imul(i + 1, 0x9e3779b1) >>> 0);
  const sig = new Uint32Array(pages.length * HASHES);
  sets.forEach((set, idx) => {
    const row = sig.subarray(idx * HASHES, (idx + 1) * HASHES).fill(0xffffffff);
    for (const x of set) {
      for (let h = 0; h < HASHES; h++) {
        let v = Math.imul(x ^ seeds[h], 0x85ebca6b);
        v = (Math.imul(v ^ (v >>> 13), 0xc2b2ae35) ^ (v >>> 16)) >>> 0;
        if (v < row[h]) row[h] = v;
      }
    }
  });
  const need = Math.max(0, Math.floor((min - 0.15) * HASHES));
  const out: { a: string; b: string; sim: number }[] = [];
  for (let i = 0; i < pages.length; i++) {
    const oi = i * HASHES;
    for (let j = i + 1; j < pages.length; j++) {
      const oj = j * HASHES;
      let same = 0;
      for (let h = 0; h < HASHES; h++) if (sig[oi + h] === sig[oj + h]) same++;
      if (same < need) continue;
      const sim = jaccard(sets[i], sets[j]);
      if (sim >= min) out.push({ a: pages[i].path, b: pages[j].path, sim });
    }
  }
  return out.sort((x, y) => y.sim - x.sim);
}

/** Share of a page's shingles that are not template: not found on half or more of the pages of its kind. */
export function ownShare(pages: { path: string; html: string }[]): { path: string; share: number }[] {
  const sets = pages.map((p) => shingles(mainText(p.html)));
  const df = new Map<number, number>();
  for (const s of sets) for (const x of s) df.set(x, (df.get(x) ?? 0) + 1);
  const common = pages.length / 2;
  return pages.map((p, i) => {
    const s = sets[i];
    let own = 0;
    for (const x of s) if ((df.get(x) ?? 0) < common) own++;
    return { path: p.path, share: s.length ? own / s.length : 0 };
  });
}
