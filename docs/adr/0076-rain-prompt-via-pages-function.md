# ADR-0076: 비 소식은 기상청 단기예보를 Pages Function 하나로 받는다 — 동네 이름만 보낸다

Status: Accepted (2026-10-03). ADR-0058 「외부 요청 제한」과 SPEC §12.3(외부 요청은 사진 CDN·링크·익명 기록뿐)에 예외 하나를 더한다. ADR-0063 「서버 없음」에 첫 서버 코드를 더한다.

## Context

비가 오면 실내로 가야 한다. 이건 결정을 바꾸는 정보다. 실내 기분(ADR-0065)은 이미 있지만 시트 안에 숨어 있어서, 비가 와도 사용자가 켜지 않는다(감사 T3).

출처 비교(`docs/research/ux-audit/mockup-fixes.md` §3, 2026-10-03 확인):
- **Open-Meteo 무료 API**: 비상업 전용이다. KMA 모델은 2026년 3월부터 값이 null이다.
- **기상청 단기예보**(data.go.kr 15084084): 공공누리 1유형(출처 표시)이라 상업 이용이 된다. 무료이고 하루 1만 건까지 쓸 수 있다. 다만 서비스 키를 숨겨야 한다.

사용자가 「기상청 + 서버 함수」를 골랐다(2026-10-03).

## Decision

1. **함수**: `apps/web/functions/api/rain.ts`(Cloudflare Pages Functions).
   - 요청: `GET /api/rain?area=<slug>`. slug는 15곳 중 하나이고, 아니면 400을 돌려준다.
   - 기상청 격자(nx, ny)는 15곳 중심 좌표로 미리 계산한 표를 쓴다.
   - 가장 최근 발표분(02·05·…·23시 + 10분)의 `getVilageFcst`를 읽는다. 지금부터 3시간 안 강수확률(POP)의 최댓값을 돌려준다.
   - 응답: `{ area, pop, rain: pop >= 60, base, from: "기상청" }`.
2. **키**: 환경 비밀 `KMA_SERVICE_KEY`(`wrangler pages secret put`). 키가 없거나 기상청이 실패하면 `204`와 `no-store`를 돌려주고, 앱은 줄을 숨긴다.
3. **캐시**:
   - 함수 쪽: 동네 × 발표 시각으로 엣지 캐시하고, `Cache-Control: public, max-age=0, s-maxage=1800`(브라우저는 저장하지 않는다 — 리뷰 반영 2026-10-03).
   - 서비스워커: `/api/`는 캐시하지 않는다(네트워크만).
   - 앱: `sessionStorage`에 30분 저장한다.
4. **개인정보**:
   - 앱은 **동네 이름만** 보낸다. GPS 기준이면 기기 안에서 가장 가까운 동네로 바꿔 보낸다. 좌표는 기기 밖으로 나가지 않는다(privacy.html 문장 유지 + 날씨 문장 추가).
   - 요청에는 사용 기록·식별자를 붙이지 않는다.
5. **보여 주는 조건**:
   - `rain === true`일 때만 오늘 판에 「비 소식 · 실내만 볼까요?」를 띄운다. 누르면 실내만이 켜진다(ADR-0065). 자동으로 켜지는 않는다.
   - 맑은 날에는 날씨를 쓰지 않는다.
   - 출처 「날씨: 기상청」을 그 줄 옆에 단다.
6. **배포**: `wrangler pages deploy dist`를 `apps/web`에서 돌리면 `functions/`가 같이 올라간다. 함수는 앱 번들과 별개라 50KB 예산에 들어가지 않는다.

## Consequences

- 이 프로젝트의 첫 서버 코드다. 테스트는 vitest 단위 테스트(격자 표, 발표 시각, 응답 파싱)와 키 없는 204다.
- 사용자 할 일: data.go.kr에서 「기상청_단기예보 조회서비스」 활용 신청(자동 승인) → 키를 `wrangler pages secret put KMA_SERVICE_KEY --project-name gwichana-jeju`.
- 기상청 API가 바뀌거나 멈추면 줄이 조용히 사라진다. 다른 기능은 영향이 없다.
