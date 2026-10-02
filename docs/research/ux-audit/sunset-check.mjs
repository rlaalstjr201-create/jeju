// 노을 속성 실현성 시험(2026-10-03). 입력: OSM 해안선 $TEMP/jeju-coast.json (Overpass: way["natural"="coastline"](33.10,126.10,33.60,127.00); out geom; — ODbL, © OpenStreetMap contributors).
// 실행: (apps/web에서) node ../../docs/research/ux-audit/sunset-check.mjs 300
import fs from 'fs';
const coast = JSON.parse(fs.readFileSync(process.env.TEMP + '/jeju-coast.json')).elements;
const spots = JSON.parse(fs.readFileSync('public/spots.json')).filter(s => !s.hide);
const rad = Math.PI / 180, R = 6371000;
const segs = [];
for (const w of coast) { const g = w.geometry; for (let i = 0; i + 1 < g.length; i++) segs.push([g[i].lon, g[i].lat, g[i + 1].lon, g[i + 1].lat]); }
function sunsetAz(d) { const n = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5); const dec = -23.44 * Math.cos(2 * Math.PI / 365 * (n + 10)) * rad; return 360 - Math.acos(Math.sin(dec) / Math.cos(33.5 * rad)) / rad; }
// 장소에서 해 지는 방향으로 L m 선을 긋고 해안선과 만나는 점들까지의 거리
function hits(s, az, L) {
  const kx = 1 / (R * Math.cos(s.lat * rad) * rad), ky = 1 / (R * rad);
  const ex = s.lng + Math.sin(az * rad) * L * kx, ey = s.lat + Math.cos(az * rad) * L * ky;
  const out = [];
  for (const [x1, y1, x2, y2] of segs) {
    if (Math.max(x1, x2) < Math.min(s.lng, ex) || Math.min(x1, x2) > Math.max(s.lng, ex) || Math.max(y1, y2) < Math.min(s.lat, ey) || Math.min(y1, y2) > Math.max(s.lat, ey)) continue;
    const d = (ex - s.lng) * (y2 - y1) - (ey - s.lat) * (x2 - x1); if (!d) continue;
    const t = ((x1 - s.lng) * (y2 - y1) - (y1 - s.lat) * (x2 - x1)) / d, u = ((x1 - s.lng) * (ey - s.lat) - (y1 - s.lat) * (ex - s.lng)) / d;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push(t * L);
  }
  return out.sort((a, b) => a - b);
}
// 판정: 해 지는 방향 ±10° 세 줄 중 하나라도 — 첫 해안선이 NEAR m 안, 그 뒤 20km 동안 다시 육지(본섬)에 닿지 않음(섬 하나 = 2번 교차는 허용)
const NEAR = +process.argv[2] || 300;
function view(s, az) {
  return [-10, 0, 10].some(o => { const h = hits(s, az + o, 20000); return h.length % 2 === 1 && h[0] <= NEAR; });
}
const azs = { '10월(오늘)': sunsetAz(new Date('2026-10-03')), '6월': sunsetAz(new Date('2026-06-21')), '12월': sunsetAz(new Date('2026-12-21')) };
const kw = s => /노을|일몰|석양|해넘이/.test(s.reason);
for (const [k, az] of Object.entries(azs)) {
  const pos = spots.filter(s => view(s, az));
  const kwAll = spots.filter(kw);
  console.log(`${k} 방위 ${az.toFixed(0)}° | 바다로 해 지는 게 보이는 곳 ${pos.length} (기분별 ${JSON.stringify(pos.reduce((m, s) => (m[s.mood] = (m[s.mood] || 0) + 1, m), {}))}) | 글에 노을 32곳 중 ${kwAll.filter(s => pos.includes(s)).length}`);
  if (k.startsWith('10')) {
    console.log('  놓친 곳:', kwAll.filter(s => !pos.includes(s)).map(s => s.name).join(', '));
    console.log('  표본:', pos.filter(s => !kw(s)).sort(() => .5 - Math.random()).slice(0, 15).map(s => s.name).join(', '));
  }
}
const az = azs['10월(오늘)'];
const geo = spots.filter(s => view(s, az));
const seaWord = s => /바다|오션|해변|해안|포구|노을|일몰|수평선|해수욕/.test(s.reason);
const layer2 = geo.filter(s => s.indoor === false || seaWord(s));
const oreum = spots.filter(s => s.mood === 'walk' && /오름|봉$|봉\(|산$/.test(s.name));
const final = [...new Set([...layer2, ...spots.filter(kw)])];
console.log('2층(실외 또는 소개글에 바다 단어)', layer2.length, '기분별', JSON.stringify(layer2.reduce((m, s) => (m[s.mood] = (m[s.mood] || 0) + 1, m), {})), '| + 글에 노을 = ', final.length, '| 오름 후보(별도 판정)', oreum.length);
console.log('  2층 표본(노을 글 제외):', layer2.filter(s => !kw(s)).sort(() => .5 - Math.random()).slice(0, 20).map(s => `${s.name}[${s.mood}]`).join(', '));
console.log('  2층에서 빠진 식당 표본:', geo.filter(s => !layer2.includes(s)).slice(0, 10).map(s => s.name).join(', '));
