// 검색어 선택 게이트 + 순위 추적 판정 — 순수 함수. keywords.mjs가 쓰고 tests/seo-keywords.test.ts가 검증한다.
//
// 왜 있나: seoulist는 「우리가 답할 수 있나」(재고 수)만 묻고 「우리가 이길 수 있나」를 묻지 않아
// 지역+업태 일반형 헤드 쿼리(`best korean bbq in seoul` 57위 등)에 허브를 만들었다. 허브 91쿼리 중 39가
// 계통적으로 지는 모양이었고(docs/seo/seoulist-postmortem.md), 외부 링크 0건인 새 도메인은 부스트가 걷힌 뒤
// 콘텐츠 쿼리에서 50~80위로 밀렸다. 이 게이트는 **페이지·콘텐츠 작업 전에** 그 질문을 강제한다.
//
// 규칙은 사전등록이다. 데이터를 보고 가중치를 바꾸지 않는다 — 바꾸면 RUBRIC_VERSION을 올리고 이유를 적는다.

export const RUBRIC_VERSION = 1;

/** 축마다 0~2점. 정의는 .claude/skills/seo-geo/references/keyword-gate.md와 같아야 한다. */
export const AXES = ['demand', 'competition', 'intent_fit', 'uniqueness', 'inventory'];

/** 킬 기준 — 하나라도 참이면 점수와 상관없이 kill. 산문으로 살리지 않는다. */
export const KILLS = {
  K1_intent: '검색 의도가 우리가 줄 수 없는 것이다(밈·뜻풀이·뉴스·일정표·예약·가격 등)',
  K2_data: '답하려면 우리 데이터에 없는 속성이 필요하다(실내·날씨·영업 중·가격·평점·반려동물 등)',
  K3_portal_wall: '상위 10이 포털·OTA·공식·네이버 블록으로 막혀 있고 웹문서 자리가 없다 (competition 0 + 헤드)',
  K4_thin: '그 조합의 장소가 10곳 미만이다 — 얇은 페이지는 만들지 않는다',
  K5_brand_collision: '같은 말을 쓰는 더 강한 주체(책·언론·서비스)가 있어 우리 브랜드로 읽히지 않는다',
};

/**
 * 후보 하나를 판정한다.
 * c: { query, brand?, scores: {demand, competition, intent_fit, uniqueness, inventory}, kills: [K..], head?: bool, serp?: {observed?} }
 * → { total, verdict: 'target'|'watch'|'kill'|'brand', why }
 */
export function judge(c) {
  const kills = (c.kills || []).filter((k) => k in KILLS);
  const s = c.scores || {};
  const missing = AXES.filter((a) => ![0, 1, 2].includes(s[a]));
  if (missing.length) return { total: null, verdict: 'invalid', why: `점수 없음/범위 밖: ${missing.join(',')}` };
  const total = AXES.reduce((a, k) => a + s[k], 0);
  if (c.brand) return { total, verdict: 'brand', why: '브랜드 검색어 — 경쟁이 아니라 존재 확인 대상이다' };
  if (kills.length) return { total, verdict: 'kill', why: kills.map((k) => `${k}: ${KILLS[k]}`).join(' / ') };
  // competition 0인 헤드는 점수가 높아도 이기지 못한다(seoulist 지역+업태 일반형 AUC 0.328).
  if (c.head && s.competition === 0) return { total, verdict: 'kill', why: `K3_portal_wall: ${KILLS.K3_portal_wall}` };
  if (c.serp && c.serp.observed === false) return { total, verdict: 'watch', why: 'SERP를 아직 보지 않았다 — 경쟁 판단 없이 target으로 올리지 않는다' };
  if (s.demand === 0) return { total, verdict: 'watch', why: '수요 신호가 없다(자동완성·GSC 0). 랜딩을 만들지 않고 다음 점검 때 다시 본다' };
  if (total >= 7 && s.competition >= 1 && s.intent_fit === 2) return { total, verdict: 'target', why: `${total}/10 · 경쟁 ${s.competition} · 의도 일치` };
  return { total, verdict: 'watch', why: `${total}/10 — target 기준(7점·경쟁≥1·의도 2) 미달` };
}

/** keywords.json 검증 — 기록된 verdict가 규칙 판정과 같아야 한다(산문으로 뒤집지 않는다). */
export function validateKeywords(doc) {
  const errors = [], warns = [];
  if (!doc || !Array.isArray(doc.candidates)) return { errors: ['candidates 배열이 없다'], warns };
  if (doc.rubric_version !== RUBRIC_VERSION) errors.push(`rubric_version ${doc.rubric_version} ≠ 코드 ${RUBRIC_VERSION}`);
  const seen = new Set();
  for (const c of doc.candidates) {
    const n = `「${c.query}」`;
    if (!c.query) { errors.push('query 없음'); continue; }
    if (seen.has(c.query)) errors.push(`${n} 중복`);
    seen.add(c.query);
    const j = judge(c);
    if (j.verdict === 'invalid') errors.push(`${n} ${j.why}`);
    else if (c.verdict !== j.verdict) errors.push(`${n} 기록 verdict ${c.verdict} ≠ 규칙 판정 ${j.verdict} (${j.why})`);
    if (!c.rationale) errors.push(`${n} rationale 없음 — 왜 이 점수인지가 남아야 다음 점검이 반박할 수 있다`);
    if (!c.serp?.checked_at || !c.serp?.source) errors.push(`${n} serp.checked_at·source 없음 — 경쟁 판단의 근거가 없다`);
    // 네이버 SERP를 직접 못 봤으면 「경쟁 약함(2)」을 줄 수 없다 — 한국어 검색의 절반 이상이 네이버다.
    if (c.scores?.competition === 2 && c.serp?.naver_observed !== true) errors.push(`${n} competition 2인데 네이버 SERP 미관측 — 최대 1`);
    if (c.verdict === 'target' && !c.landing) warns.push(`${n} target인데 landing(받을 URL)이 정해지지 않았다`);
  }
  return { errors, warns };
}

/**
 * 순위 추적 판정(배포 후). 사전등록 규칙 — 주 단위.
 * e: { verdict, indexed_at?: 'YYYY-MM-DD', track: [{ week:'YYYY-MM-DD', google_pos?, naver_pos?, impressions?, clicks? }] }
 * → { action, why }
 *   action: wait | push | meta | hold | pivot | kill
 */
export function pivotOf(e, today) {
  if (e.verdict !== 'target') return { action: 'hold', why: 'target만 추적한다' };
  if (!e.indexed_at) return { action: 'wait', why: '색인 확인 전 — GSC URL 검사·네이버 웹문서 노출 확인이 먼저' };
  const weeks = Math.floor((Date.parse(today) - Date.parse(e.indexed_at)) / (7 * 864e5));
  const t = (e.track || []).slice(-3);
  const last = t[t.length - 1] || {};
  const pos = [last.google_pos, last.naver_pos].filter((x) => typeof x === 'number');
  const best = pos.length ? Math.min(...pos) : null;
  const imp = t.reduce((a, r) => a + (r.impressions || 0), 0);
  if (weeks < 4) return { action: 'wait', why: `색인 ${weeks}주 — 4주 전에는 판정하지 않는다(신규 부스트·흔들림)` };
  if (best === null && imp === 0) {
    return weeks >= 8 ? { action: 'kill', why: `색인 ${weeks}주인데 노출 0 — 수요가 없거나 이 모양으로는 안 불린다. 랜딩은 남기되 작업을 접는다` }
      : { action: 'wait', why: `색인 ${weeks}주 · 노출 0 — 8주까지 본다` };
  }
  if (best !== null && best <= 10) {
    const clicks = t.reduce((a, r) => a + (r.clicks || 0), 0);
    return imp >= 30 && clicks === 0 ? { action: 'meta', why: `10위 안(${best})인데 최근 노출 ${imp} · 클릭 0 — 제목·설명 문제` }
      : { action: 'hold', why: `10위 안(${best}) — 손대지 않는다(자기잠식 금지)` };
  }
  if (best !== null && best <= 20) return { action: 'push', why: `${best}위 — 내부링크·본문 보강·오프사이트 언급 1건` };
  return weeks >= 8 ? { action: 'pivot', why: `색인 ${weeks}주인데 ${best ?? '순위 밖'} — 더 좁은 검색어(지역·기분·조건 조합)로 옮긴다` }
    : { action: 'wait', why: `${best}위 · 색인 ${weeks}주 — 8주까지 본다` };
}
