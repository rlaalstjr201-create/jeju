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
  const bing = cfg.bing || {};
  return [
    s('gsc', Boolean(gsc.property && env[gsc.credentials_env || 'GSC_CREDENTIALS']),
      gsc.property ? `자격증명 환경변수 ${gsc.credentials_env || 'GSC_CREDENTIALS'} 없음 — 순위는 주간 GSC 실적 화면 읽기 → gsc-import.mjs(API 실측 아님)` : 'config.gsc.property 미설정 — 배포 후 속성 등록'),
    s('ga4', Boolean(ga4.property_id && env[ga4.credentials_env || 'GA4_CREDENTIALS']),
      ga4.property_id ? `자격증명 환경변수 ${ga4.credentials_env || 'GA4_CREDENTIALS'} 없음` : 'config.ga4.property_id 미설정 — 도입 여부부터 결정(ADR-0061 익명 기록과 겹침)'),
    // 「연결」은 순위 관찰 경로가 있다는 뜻이다. 서치어드바이저 노출·클릭 수치는 여전히 없다(모르면 0이 아니다).
    s('naver', Boolean(naver.site), naver.site ? '주간 Playwright 통합검색 관찰(rank-naver.mjs)로 순위만 연결 — 서치어드바이저 노출·클릭은 API 없음' : 'config.naver.site 미설정 — 배포 후 사이트 등록'),
    s('bing', false, bing.site ? '등록됨 — 조회 연결 없음' : 'config.bing.site 미설정 — Bing Webmaster Tools(GSC 가져오기) 등록 전. IndexNow는 등록 없이 전달된다'),
  ];
}

/** GSC 실측 조달. 연결 전에는 null을 돌려준다 — 0을 돌려주면 「노출 0」이라는 거짓 관측이 남는다. */
export async function gscLayerStats() {
  return null; // TODO-after-deploy
}
