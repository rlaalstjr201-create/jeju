// 예측 채점 — 순수 함수. seoulist scripts/lib/score.mjs를 그대로 옮겼다(배포 후 verify.mjs가 GSC 실측과 함께 쓴다).
// 판정 기준은 각 예측 파일의 사전등록 규칙이고 이 모듈은 집행만 한다. tests/seo-verify.test.ts가 해석해로 고정한다.

/**
 * skill = 1 − |실측−모델| / |실측−널|
 *   1  = 완벽      >0 = 널보다 나음      0 = 널과 동급      <0 = 널만 못함
 * 널이 정확히 맞은 경우(분모 0)에는 모델이 이길 방법이 없다 → 동점이면 0, 아니면 −1.
 */
export function skill(actual, model, nul) {
  const dn = Math.abs(actual - nul);
  if (dn < 1e-12) return Math.abs(actual - model) < 1e-12 ? 0 : -1;
  return 1 - Math.abs(actual - model) / dn;
}

/** 계획 이행률 — 계획에 없던 걸 더 했다고 이행률이 오르지는 않는다(계획을 채점하는 것이므로). */
export function adherenceOf(plannedLevers = {}, did = {}) {
  const keys = Object.keys(plannedLevers);
  if (!keys.length) return 1;
  let planned = 0, done = 0;
  for (const k of keys) {
    planned += plannedLevers[k];
    done += Math.min(did[k] ?? 0, plannedLevers[k]);
  }
  return planned ? done / planned : 1;
}

/**
 * 예측 하나를 실측과 대조한다.
 * actualOf: (predictionId) => number|null  — 실측 조달을 호출측이 주입한다(테스트 가능성).
 */
export function scoreRows(forecast, actualOf) {
  const rows = [];
  for (const p of forecast.predictions) {
    const actual = actualOf(p.id);
    if (actual === null || actual === undefined || Number.isNaN(actual)) {
      rows.push({ id: p.id, skipped: '실측 경로 없음' });
      continue;
    }
    const layer = p.id.endsWith('.activation') ? p.id.replace('.activation', '') : null;
    const nc = p.id === 'total_impressions' ? forecast.nulls.no_change.impressions
      : p.id === 'total_clicks' ? forecast.nulls.no_change.clicks
        : forecast.baseline_layers?.[layer]?.activation;
    const tr = p.id === 'total_impressions' ? forecast.nulls.trend.impressions
      : p.id === 'total_clicks' ? forecast.nulls.trend.clicks : nc;
    rows.push({
      id: p.id, actual, p10: p.p10, p50: p.p50, p90: p.p90,
      hit: actual >= p.p10 && actual <= p.p90,
      weight: p.weight ?? 1,
      skill_no_change: nc == null ? null : +skill(actual, p.p50, nc).toFixed(3),
      skill_trend: tr == null ? null : +skill(actual, p.p50, tr).toFixed(3),
      null_no_change: nc ?? null, null_trend: tr ?? null,
      err_pct: p.p50 ? +(100 * (actual - p.p50) / p.p50).toFixed(1) : null,
    });
  }
  return rows;
}

/**
 * 평결 — forecast.scoring_rules.verdict 의 사전등록 조건을 순서대로 적용한다.
 * 순서가 중요하다: 판정불가 사유가 먼저다. 실행되지 않은 계획을 "기각"으로 적으면
 * 모델이 틀렸다는 기록이 거짓으로 남는다.
 */
export function verdictOf({ forecast, rows, adherence, currentModelHash }) {
  const imp = rows.find((r) => r.id === 'total_impressions' && !r.skipped);
  const dominant = rows.find((r) => (r.id || '').endsWith('.activation') && !r.skipped);

  if (currentModelHash && forecast.model_hash && forecast.model_hash !== currentModelHash)
    return { verdict: '판정 불가', why: `모델이 바뀌었다 (예측 ${forecast.model_hash} ≠ 현재 ${currentModelHash}). 다른 모델의 예측은 이 모델의 성적이 아니다.` };
  if (adherence < 0.5)
    return { verdict: '판정 불가', why: `계획 이행률 ${(adherence * 100).toFixed(0)}% (<50%). 모델이 아니라 미실행을 채점하게 된다.` };
  if (!imp)
    return { verdict: '판정 불가', why: 'total_impressions 실측을 얻지 못했다.' };
  if (imp.skill_no_change <= 0)
    return { verdict: '모델 기각', why: `total_impressions 가 no_change 널만 못했다 (skill ${imp.skill_no_change}).` };

  // ⚠ 2026-07-29 개정: 원래 규칙은 지배 파라미터 적중 + skill 만 봤다. 배선 스모크 테스트에서
  // 주 예측이 80% 구간을 22% 벗어났는데도(390 vs [150~320]) "모델 유효"가 나왔다.
  // 널보다 나은 것과 불확실성을 정직하게 말한 것은 다른 주장이다 — 둘 다 요구한다.
  // (이 개정은 실측을 보기 **전에** 했다. 사전등록의 금기는 결과를 보고 고치는 것이다.)
  if (dominant?.hit && imp.hit && imp.skill_no_change > 0.2)
    return { verdict: '모델 유효', why: `지배 파라미터 적중 + 주 예측 구간 적중 + skill ${imp.skill_no_change}.` };
  if (imp.skill_no_change > 0.2 && !imp.hit)
    return { verdict: '부분 성립', why: `방향은 맞았으나 구간이 틀렸다 — skill ${imp.skill_no_change}인데 실측 ${imp.actual}이 [${imp.p10}~${imp.p90}] 밖이다. 과신이다.` };
  return { verdict: '부분 성립', why: `기각은 아니나 유효 조건 미달 (지배 파라미터 적중 ${dominant ? dominant.hit : 'n/a'} · 주 예측 적중 ${imp.hit} · skill ${imp.skill_no_change}).` };
}

/** 누적 캘리브레이션 — 한 번의 적중은 운이다. 여러 번의 적중률이 정직성의 증거다. */
export function calibration(rows) {
  const usable = rows.filter((r) => !r.skipped);
  if (!usable.length) return null;
  const hits = usable.filter((r) => r.hit).length;
  const rate = hits / usable.length;
  const sk = usable.filter((r) => r.skill_no_change != null).map((r) => r.skill_no_change).sort((a, b) => a - b);
  const beat = sk.filter((v) => v > 0).length;
  return {
    n: usable.length, hits, rate,
    // 목표 80%. 1.0이면 구간이 넓어 아무것도 주장하지 않는 것이고, 낮으면 과신이다.
    interval_verdict: rate > 0.95 ? '구간이 너무 넓다 — 아무것도 주장하지 않고 있다'
      : rate < 0.5 ? '과신이다 — 구간을 넓혀야 한다' : '정직한 범위다',
    beat_null: beat, skill_n: sk.length,
    skill_median: sk.length ? sk[Math.floor(sk.length / 2)] : null,
    adds_information: sk.length ? beat / sk.length >= 0.5 : null,
    underpowered: usable.length < 6,
  };
}
