// proto-d 2판(A′·B′) 공용. public/spots.json을 읽어 앱과 같은 규칙(specs/ranking.md)으로 고른다:
// 차로 30분 안 → 점수 높은 순 → 그날 장 서는 오일장 → 가까운 순. 순환·저장은 없다(목업).
// 쿼리: area(15곳 이름), t(HH:MM, 지금 시각 가정), rain=1(비 예보 가정 — 실제 연동은 새 ADR), indoor=1, mood, v=b.
const AREAS = [
  ['한경', 'hangyeong', '수월봉', 33.3274, 126.2212], ['한림', 'hallim', '협재', 33.3957, 126.2651],
  ['애월', 'aewol', '한담', 33.4475, 126.3678], ['신제주', 'sinjeju', '공항 근처', 33.487, 126.488],
  ['구제주', 'gujeju', '동문시장', 33.5125, 126.526], ['조천', 'jocheon', '함덕', 33.5012, 126.6668],
  ['구좌', 'gujwa', '월정리', 33.5189, 126.8079], ['우도', 'udo', '배로 가는 섬', 33.5079, 126.9538],
  ['대정', 'daejeong', '모슬포', 33.2472, 126.2689], ['안덕', 'andeok', '산방산', 33.2693, 126.3295],
  ['중문', 'jungmun', '주상절리', 33.2576, 126.4205], ['서귀포 시내', 'seogwipo', '올레시장', 33.2573, 126.5338],
  ['남원', 'namwon', '위미', 33.3053, 126.6735], ['표선', 'pyoseon', '성읍', 33.3643, 126.7973],
  ['성산', 'seongsan', '일출봉', 33.4387, 126.9026],
].map(([name, slug, landmark, lat, lng]) => ({ name, slug, landmark, lat, lng }));

const Q = new URLSearchParams(location.search);
const AREA = AREAS.find(a => a.name === Q.get('area')) || AREAS[4];
const NOW = Q.get('t') || '14:00';
const RAIN = Q.get('rain') === '1';
const INDOOR = Q.get('indoor') === '1';
const DAY = 2; // 2026-10-02
const SUNSET = '18:14'; // 2026-10-02 제주 일몰(목업 고정값)
const LIVE = 'https://gwichana-jeju.pages.dev';

const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const km = (a, b) => {
  const r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLn = (b.lng - a.lng) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLn / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const drive = k => Math.max(5, Math.round(((k * 1.3) / 40) * 60 / 5) * 5); // pick.ts driveMinutes
const fmt = m => m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`;
const openToday = s => !!(s.market && s.market.days.includes(DAY));

function pool(spots, { mood, sub, indoor = false, max = 30, test } = {}) {
  const list = spots.filter(s => !s.hide && (!mood || s.mood === mood) && (!sub || s.sub === sub) && (!indoor || s.indoor) && (!test || test(s)))
    .map(s => { const k = km(AREA, s); return { s, k, min: drive(k), open: openToday(s) }; });
  let near = list.filter(c => c.min <= max);
  if (near.length < 3 && !test) near = [...list].sort((a, b) => a.k - b.k).slice(0, 3);
  return near.sort((a, b) => b.s.score - a.s.score || Number(b.open) - Number(a.open) || a.k - b.k || a.s.id.localeCompare(b.s.id));
}
const POOLS = { rest: {}, walk: {}, new: {}, food: { sub: 'meal' } };
const LABEL = { rest: '푹 쉬고 싶어', walk: '좀 걷고 싶어', new: '새로운 거 해보고 싶어', food: '맛있는 거 먹고 싶어' };
// 기분이 사진 한 장으로 좁게 읽히지 않게, 그 기분에 실제로 섞여 나오는 종류를 한 줄로(판정 문서 Q5)
const RANGE = { rest: '카페·바다·쉼터', walk: '산책로·오름·숲길', new: '체험·전시·시장', food: '식사 · 카페는 안에서' };
const moodPool = m => window.SPOTS ? pool(SPOTS, { mood: m, ...POOLS[m], indoor: INDOOR }) : [];

const keep = (extra = {}) => {
  const p = new URLSearchParams({ area: AREA.name, t: NOW, ...(RAIN ? { rain: 1 } : {}), ...(INDOOR ? { indoor: 1 } : {}), ...extra });
  for (const [k, v] of [...p]) if (v === '' || v === 'null') p.delete(k);
  return p.toString();
};

async function load() {
  window.SPOTS = await (await fetch('../../public/spots.json')).json();
}

/** 오늘 줄: 행동이 생길 때만 줄을 보탠다. 날짜는 늘, 비·노을·장날은 조건이 맞을 때만 누를 수 있는 줄로. */
function today(el, page) {
  const rows = [`<p class="t-date"><b>10월 2일 금요일</b></p>`];
  if (RAIN) {
    rows.push(INDOOR
      ? `<p class="t-row">☂ 비 소식이 있어 <b>실내만</b> 보고 있어요 <a href="${page}?${keep({ indoor: '' })}">모두 보기</a></p>`
      : `<a class="t-row act" href="${page}?${keep({ indoor: 1 })}">☂ 오후에 비 소식 · <b>실내만 볼까요?</b><span class="go">›</span></a>`);
  }
  const left = toMin(SUNSET) - toMin(NOW);
  const sunset = SPOTS && pool(SPOTS, { max: 45, test: s => /노을|일몰|석양|해넘이/.test(s.reason) });
  if (left > 0 && left <= 150 && sunset.length && !INDOOR) {
    rows.push(`<a class="t-row act" href="result2.html?${keep({ mood: 'sunset' })}">${SUN_ICON} 해 지기 ${fmt(left)} 전 · <b>노을 볼 곳 ${Math.min(3, sunset.length)}</b><span class="go">›</span></a>`);
  } else rows.push(`<p class="t-row">${SUN_ICON} 해 지는 시각 ${SUNSET}</p>`);
  const mk = SPOTS && pool(SPOTS, { test: s => openToday(s) })[0];
  if (mk) rows.push(`<a class="t-row act" href="#market">오늘 <b>${mk.s.name}</b> 장날 · 차로 약 ${fmt(mk.min)}<span class="go">›</span></a>`);
  el.innerHTML = rows.join('');
}
const SUN_ICON = '<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="9" r="3"/><path d="M8 2v2M2.5 9h1.5M12 9h1.5M3.8 4.8l1 1M12.2 4.8l-1 1M2 13h12"/></svg>';
const GO_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8l10-5-4 10-1.5-4z"/></svg>';

/** 오늘 장 블록: 차로 30분 안에서 오늘 장이 서는 곳만. 없으면 블록째 숨김. */
function markets(el) {
  const mk = pool(SPOTS, { test: s => openToday(s) });
  if (!mk.length) { el.hidden = true; return; }
  el.querySelector('.list').innerHTML = mk.map(c =>
    `<a class="row" href="${LIVE}"><img src="${c.s.image}" alt="${c.s.name}" loading="lazy"><span><b>${c.s.name}</b><span class="meta">오늘 장 서는 날 · 차로 약 ${fmt(c.min)}</span></span></a>`).join('');
}

/** 다른 동네: 지금 동네는 빼고, 이미 있는 지역 페이지(/jeju/<slug>/)로. 사진은 늦게 불러온다. */
function areas(el) {
  el.innerHTML = AREAS.filter(a => a !== AREA).map(a => {
    const p = SPOTS.filter(s => !s.hide && s.image && s.mood !== 'food' && km(a, s) < 5).sort((x, y) => y.score - x.score || km(a, x) - km(a, y))[0];
    return `<a class="area" href="${LIVE}/jeju/${a.slug}/"><img src="${p ? p.image : ''}" alt="" loading="lazy"><b>${a.name}</b><span>${a.landmark}</span></a>`;
  }).join('');
}
