#!/usr/bin/env node
// 사전등록 예측 기록 — TODO-after-deploy.
//
// seoulist scripts/seo-forecast.mjs는 GSC 28일 기준선과 널 모델(no_change·trend)을 기록하고, 지평 후 seo-verify가
// 널을 이겼는지로 채점한다. P의 여행은 아직 배포 전이라 기준선이 없다 — 기준선 없이 예측을 쓰면 런칭 주
// 2일 표본으로 기준선을 깔았던 seoulist 사고(data/seo-model.json baseline_invalidated)를 처음부터 반복한다.
//
// 언제 켜나: 배포 + GSC 연결 + 확정 데이터 28일(첫 노출일 기준). 그 전에는 아무것도 쓰지 않는다.
// 무엇을 예측하나: 규모(「월 N명」)가 아니라 data/seo/keywords.json target 검색어의 순위 구간(p10~p90)과
//   색인 쪽수. 채점 산술은 score.mjs(검증됨)를 쓴다.
import { sourcesStatus } from './gsc.mjs';

const gsc = sourcesStatus().find((s) => s.name === 'gsc');
console.log('\n■ seo:forecast — 아직 쓰지 않는다 (TODO-after-deploy)\n');
console.log(`   GSC: ${gsc.connected ? '연결됨' : `미연결 — ${gsc.why}`}`);
console.log('   조건: 배포 · GSC 연결 · 첫 노출 후 확정 데이터 28일. 그 전의 기준선은 무효다(docs/seo/README.md).');
console.log('   기록은 data/seo/forecasts/<날짜>.json — 형식은 .claude/skills/seo-geo/references/measurement.md\n');
process.exit(0);
