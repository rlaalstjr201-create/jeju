# Plan: 기준 시트 2판 (specs/sheet-v2.md, ADR-0103)

- **상태**: `State.destPick`(시트 안 `여행지` 눌림), `State.geo`(검색 중·결과·오류). 둘 다 시트를 열거나 닫을 때 비운다. 저장 없음. `Stay.source`에 `addr`.
- **그리기**(`render.ts`): `NATION`이면 `destToggle`(두 칸 + 칩 줄), `주소·숙소` 줄에 `addrBox`. 결과·오류는 `patchAddr`가 제자리에 붙인다(시트 서명에 넣지 않음 → 친 글이 남는다). `destPick`은 서명에 넣는다.
- **동작**(`app.ts`): `onSeg`, `searchAddr`(`effects.ts fetchGeo`), `pickHit`(제주 밖이면 `loadNation` 뒤 `releasedDestOf` → 다른 여행지면 `switchDest`/`toSgg` → `changeBasis` 숙소). 응답은 `stayToken`으로 시트가 바뀌면 버린다.
- **서버**: `functions/api/geo.ts`(카카오 로컬 주소+키워드, 입력 검사, IP별 1분 20회, 엣지 캐시 하루).
- **문서**: 개인정보 네 언어, SPEC 6.10·9, context.md 「기준」.
- **게이트**: tsc, vitest 세 모드, check:slop, check:jeju, e2e 두 번(`E2E_PORT=4393 E2E_DEPLOY_PORT=4397`), 진입 gzip ≤ 60,000, 인라인 ≤ 2,000.
