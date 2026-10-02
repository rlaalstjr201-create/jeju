// 외부 측정 연결 상태 — Google Search Console · GA4 · 네이버 서치어드바이저.
//
// TODO-after-deploy: 지금은 전부 미연결이다. 도메인이 정해지고 배포된 뒤 docs/seo/README.md 「배포 후」 순서대로
// 연결하고, 이 파일에 실제 조회(searchAnalytics.query, GA4 runReport)를 넣는다. seoulist scripts/lib/gsc.mjs가 참고 구현이다.
// 비밀값은 저장소에 두지 않는다 — 환경변수 이름만 data/seo/config.json에 적는다.
import fs from 'node:fs';
import path from 'node:path';
import { DATA } from './load-dist.mjs';

export function loadConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, 'config.json'), 'utf8')); } catch { return {}; }
}

/** 각 소스가 쓸 수 있는가. 「확인 실패」와 「문제 없음」을 섞지 않으려고 이유를 함께 돌려준다. */
export function sourcesStatus(cfg = loadConfig(), env = process.env) {
  const s = (name, ok, why) => ({ name, connected: ok, why });
  const gsc = cfg.gsc || {};
  const ga4 = cfg.ga4 || {};
  const naver = cfg.naver || {};
  return [
    s('gsc', Boolean(gsc.property && env[gsc.credentials_env || 'GSC_CREDENTIALS']),
      gsc.property ? `자격증명 환경변수 ${gsc.credentials_env || 'GSC_CREDENTIALS'} 없음` : 'config.gsc.property 미설정 — 배포 후 속성 등록'),
    s('ga4', Boolean(ga4.property_id && env[ga4.credentials_env || 'GA4_CREDENTIALS']),
      ga4.property_id ? `자격증명 환경변수 ${ga4.credentials_env || 'GA4_CREDENTIALS'} 없음` : 'config.ga4.property_id 미설정 — 도입 여부부터 결정(ADR-0061 익명 기록과 겹침)'),
    s('naver', false, naver.site ? '서치어드바이저는 공개 API가 없다 — 웹 화면에서 주 1회 수동 기록(data/seo/keywords.json track)' : 'config.naver.site 미설정 — 배포 후 사이트 등록'),
  ];
}

/** GSC 실측 조달. 연결 전에는 null을 돌려준다 — 0을 돌려주면 「노출 0」이라는 거짓 관측이 남는다. */
export async function gscLayerStats() {
  return null; // TODO-after-deploy
}
