# Plan: 홈 개편 A′ + 비 소식

Spec: `specs/home-refresh.md`. ADR-0075·0076.

## 단위 (순서대로. 단위마다 검증 → 커밋 → 다음)

| # | 단위 | 주로 건드리는 곳 | 새 테스트 |
|---|---|---|---|
| U1 | 결과 화면 작은 고침: 실내 표시, 고르는 방식 한 줄, 큰 카드 길찾기 버튼, 간격 | `render.ts`(basisLabel·results), `style.css`, SPEC §6 결과 절 | app/scenarios 테스트: 실내만이면 `#basis`에 「· 실내만」, 범위별 문장, 큰 카드만 `.go` 스타일 클래스 |
| U2 | 해 지는 시각 계산 | 새 `src/sun.ts` | `tests/sun.test.ts`: 4개 기준값 ±2분, 15곳 모두 17~20시 |
| U3 | 홈 A′ 배치: 앱 이름, 오늘 판(날짜 + 접힌 정보 + 장날 줄), 질문 설명, 기분 줄 사진·예시, 장날 묶음, 다른 동네 묶음, 출처 | `index.html` #home, `render.ts` home, `app.ts`(데이터 도착 시 홈 다시 그림), `style.css`, `scripts/check-slop.ts`(고정 높이 화이트리스트에 사진 칸만), SPEC §1-1·§6 홈, design.md | 홈 렌더 테스트: origin 없음 → 섬 전체 상위, 지역 기준 → `pool` 앞 2개와 같음, 장날 0곳이면 숨김, 누를 줄 최대 1개, 다른 동네에 지금 동네 없음 |
| U4 | 비 소식 함수 | 새 `functions/api/rain.ts` + `functions/_lib/kma.ts`(격자·발표 시각·파싱), `tsconfig` 범위 | `tests/rain-fn.test.ts`: 격자 표, 발표 시각 경계(02:09→전날 23시, 02:10→02시), POP 파싱, 잘못된 area 400, 키 없음 204 |
| U5 | 비 소식 앱 쪽: 요청·세션 캐시·오늘 판 줄·「실내만 볼까요?」→ 실내 켬, 서비스워커 `/api/` 제외, privacy 문장, SPEC §8 외부 요청 | `app.ts`/`effects.ts`, `store.ts`(`jeju.rain` parse), `render.ts`, `sw/sw.js`, `public/privacy.html`, `tests/deploy.test.ts` | store parse 테스트, sw 테스트(`/api/` 미캐시), 오늘 판 우선순위(비 > 장날), 실패 시 숨김 |

## 지킬 불변식 (탐색 결과 기준)

- **nav**: 홈은 `replaceState`(depth 0)이고, 결과는 홈에서 탭했을 때만 push한다. 홈 묶음의 링크(다른 동네)는 일반 이동이고 history를 건드리지 않는다.
- **reduce**는 순수 함수로 둔다. 비 응답은 `req` id로 오래된 응답을 버린다(`isReq` 패턴). 같은 기분 no-op, 400ms·300ms 규칙은 그대로 둔다.
- **render**는 시그니처로 멱등이다. 홈 사진은 `spots`·기준·실내·날짜가 바뀔 때만 다시 그린다.
- **store**: 새 키는 `parse*` 검증을 거치고 버전 필드를 둔다. 기존 키와 형식은 바꾸지 않는다.
- **추적**: 홈 사진·묶음 탭은 새 이벤트를 만들지 않는다(기존 tap은 기분 버튼만).
- **서비스워커**: `/api/`는 네트워크만 쓴다. VERSION은 기존 해시 규칙을 따른다.
- **슬롭 체크리스트**: 새 문구도 검사 대상이다. `›`·이모지·「추천」·가운데 정렬은 금지하고, 글자 크기는 4단계만 쓴다.

## 단위마다 검증 (모두 통과해야 커밋)

1. `npx tsc --noEmit`
2. `npx vitest run` — 기준선 706 통과에서 줄지 않는다.
3. `npm run check:slop` 0건
4. `npm run build` 후 JS+CSS gzip 50KB 이하(측정해서 커밋 메시지에 적는다)
5. `npm run e2e -w @jeju/web` 전부 통과. 기준선 수는 시작 전에 기록한다.
6. 390px 스크린숏(Playwright): 홈 첫 화면, 홈 전체, 결과 화면. `apps/web/design/qa/home-refresh/`에 둔다.

## Plan Review 반영 (2026-10-03, 코드 근거 확인 — 아래가 위 표·Spec보다 우선)

1. **배포·함수 위치**: 실제 배포는 `apps/web`에서 `wrangler pages deploy dist`로 하는 직접 업로드다(프로젝트 `gwichana-jeju`, Git 연결 없음).
   - 그래서 함수는 `apps/web/functions/`에 둔다.
   - `docs/deploy.md`를 직접 업로드 기준으로 고치고 Git 연결 절에 「functions는 루트 기준」 경고를 단다(U4).
2. **큰 카드 길찾기**: `--main-tint` 바탕에 **`--text` 글자**를 쓴다. `--main`은 tint 위에서 4.3:1이라 AA에 못 미친다. 아이콘은 currentColor, `min-height:48px`. e2e DR-go(`browser.e2e.mjs:2301`)는 lead 48 / 나머지 44로 고친다. SPEC §1-3을 갱신한다.
3. **홈 글자 크기는 3단계만**(24·20·15, K-inapp `e2e:2224`): 날짜·장 이름·타일 이름·「예:」 모두 0.9375rem이고 굵기로만 구분한다. 17px은 홈에 쓰지 않는다.
4. **고정 높이**: `FIXED_HEIGHT_OK`를 넓히지 않는다. 사진은 `width` + `aspect-ratio:1`, 줄·버튼은 `min-height`.
5. **회색 사진 자리 없음**(SPEC §14): 데이터가 오기 전에는 사진을 그리지 않는다. 줄 `min-height`가 자리를 잡는다. `image`가 빈 곳은 건너뛴다. (ADR-0075 Consequences 문장을 이에 맞춰 고친다.)
6. **app.test S3**: 데이터 전 누를 수 있는 것 6개를 유지하고, 장날·다른 동네는 `spots`가 온 뒤에만 그린다. 기분 이름은 `<span class="label">`에 넣고, 테스트는 그 span을 읽게 바꾼다.
7. **K-inapp 배치**: `#homeNote`는 `.any` 바로 뒤에 두고 390×844 안에 남긴다. 새 묶음은 `#homeNote` 뒤에 둔다.
8. **비 응답 순서**: `isReq`를 쓰지 않는다. 상태에 `rain: {area, rain} | null`을 따로 두고, 응답의 area가 지금 area와 다르면 버린다.
9. **홈 origin**: `staticOrigin(basis, region, stay) ?? (s.origin?.key === GPS_KEY ? s.origin : null)`. 지역 origin이 GPS 모드로 새지 않게 한다. 숙소 기준의 비 소식은 `nearestArea(stay)`로 정한다. `homeSig`는 spots·origin key·reach·indoor·whenDay·newSub로 만든다(`resultsSig`와 같은 방식).
10. **pick.ts**: origin 없는 섬 전체 상위를 고르는 helper를 `pool`과 같은 필터로 export한다(U3에 pick.ts 포함).
11. **결과 한 줄**:
    - `#status`(live region)에 넣지 않는다. `#status` 앞에 live가 아닌 `<p class="how">`를 두고 `ready`일 때만 보인다.
    - 걸어서는 「걸어서 15분」으로 따로 매핑한다.
    - `pool`이 섬 전체 가까운 3곳으로 넓혔다면(카드 중 하나라도 REACH_MAX 초과) 범위 구절을 뺀다.
12. **서비스워커**: `/api/`를 그냥 지나가게 하는 줄을 `/jeju` 줄 옆에 두고, sw.test에 테스트를 더한다. **U4에 포함한다.**
13. **privacy.html**: 「서버로 보내지 않아요」 문장을 비 소식 예외에 맞게 고친다. 테스트 문자열은 유지한다. 비 소식 문장(동네 이름만, Cloudflare 접속 기록에 남을 수 있음)을 더하고 날짜를 올린다.
14. **SPEC 절 번호**: 외부 요청 규칙은 §12.3(`SPEC.md:898`)이다. §8이 아니다.
15. **함수 타입·캐시**: tsconfig include에 functions를 넣는다(Request/Response만, workers-types 없음). 엣지 캐시는 `caches.default`에 area+base 키로 한다. preview·e2e에서 `/api/rain`은 404 HTML이므로, JSON이 아니면 숨긴다. e2e는 `route('**/api/rain*')`로 비 줄을 시험한다.
16. **날짜 모드에서는 비 줄 없음**(예보는 앞으로 3시간 기준).
17. **`#basis` 줄바꿈**: 「· 실내만」이 붙어도 S48·QA4-label 한 줄 조건을 지켜야 한다. 실내 켬 e2e 사례를 더한다.

**e2e 기준선**: 64/66. 이미 실패하던 2개는 이번 작업과 무관하다.
- QA4-datein: 「could not tell the date field order」.
- T2-hit: 기준 시트 「지금」 24pt.

단위마다 이 둘 말고는 새 실패가 없어야 한다.

## 하지 않는 것

노을 줄, 사진 큰 타일(B′), 회색 바탕, 데스크톱 전용 배치, 배포(사용자 확인 뒤).
