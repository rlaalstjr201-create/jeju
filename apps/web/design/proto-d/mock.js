// proto-d 목업 공용 그리기. 값은 data.js(spots.json 발췌). 일몰 시각은 2026-10-02 제주 기준 고정값.
const SUN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="9" r="3"/><path d="M8 2v2M2.5 9h1.5M12 9h1.5M3.8 4.8l1 1M12.2 4.8l-1 1M2 13h12"/></svg>';
const GO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8l10-5-4 10-1.5-4z"/></svg>';
const mins = km => Math.max(5, Math.round(km * 1.4 / 5) * 5); // 직선 km → 차로 대략(목업용)

function renderToday(el, weather) {
  const open = D.markets.map(m => m.name.replace(/민속|오일시장|향토/g, '')).join('·');
  el.innerHTML =
    `<span><b>10월 2일 금요일</b></span>` +
    (weather ? `<span>맑음 22°</span>` : '') +
    `<span class="sun">${SUN}해 지는 시각 18:14</span>` +
    `<span>오늘 장: ${open} 오일장</span>`;
}

function renderMarkets(el) {
  el.innerHTML = D.markets.map(m =>
    `<a class="row" href="#"><img src="${m.image}" alt="${m.name}"><span><b>${m.name}</b><span class="meta">오늘 장 서는 날 · 차로 약 ${mins(m.km)}분</span></span></a>`).join('');
}

function renderAreas(el) {
  el.innerHTML = D.areas.map(a =>
    `<a class="area" href="#"><img src="${a.image}" alt="${a.name} — ${a.place}"><b>${a.name}</b><span>${a.landmark}</span></a>`).join('');
}
