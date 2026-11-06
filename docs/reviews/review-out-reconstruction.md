# review/out 복원 (2026-10-17)

## 무슨 일

2026-10-17 사고로 `apps/web/review/out/`(전 항목 검수 AI 판정, ADR-0028)이 지워졌다. git이 무시하던 폴더라 사본이 어디에도 없었다. 주인 승인(「가로 진행해」)으로 커밋된 자료에서 다시 만들고, 이번부터 git에 넣는다(루트 `.gitignore`의 `out/` 뒤 `!apps/web/review/out/`).

## 어떻게 만들었나

`scripts/build-spots.mjs`가 판정에서 읽는 것은 `id`·`keep`·`mood`·`reason` 넷뿐이다. 이것만 커밋된 자료에서 가져왔다.

- **keep 3,003건**: 전 항목 검수 첫 빌드 `public/spots.json@af3f008`에 실린 곳. 그때 빌드는 판정 `reason`을 `trim()`만 해서 실었으므로 `mood`·`reason`은 원래 판정과 같다(`review/copy/input-NN.json`의 `oldReason` 3,003건과도 전부 일치).
- **keep 2건, mood·reason 없음**: `FAITHFULNESS_DROP`의 두 id. 충실성 감사가 keep 판정을 빼낸 곳이라 keep은 근거가 있고, 문장·기분은 잃었다. 빌드는 기분·문장을 보기 전에 이 둘을 뺀다.
- **reject 240건**: 커밋된 어떤 spots.json에도 없는 곳. `keep:false`, 버린 사유는 `null`로 두었다. 원래 사유(REPORT.md: INSUFFICIENT_INFO 114 등)는 잃었다. REPORT.md 기준 keep은 3,006이라, 이 240건 가운데 1건은 원래 keep이었는데 이유 문장 규칙에 걸려 빠졌을 수 있다. 어느 것인지는 알 수 없다. 출하 결과는 같다.
- 모든 항목에 `reconstructed` 필드로 출처를 적었다. `evidence`·`confidence`·`dropReason`, 그리고 batch/adj 구분은 잃었다. 파일은 `review/input/batch-NNN.json`과 같은 단위로 `batch-NNN.json` 65개를 만들었고 `adj-*`는 없다. 오일장(batch-900)은 원래대로 `review/market/verdicts.json`이 맡는다.
- 지어낸 문장은 없다.

## 검증

`SPOTS_OUT=<임시 경로> node scripts/build-spots.mjs`로 빌드했다. 출력 경로를 바꾸는 환경변수는 이번에 더했고, 실제 `public/spots.json`은 건드리지 않았다.

- 통과: 2,964곳, 순서, `reason`을 뺀 모든 필드가 같다. unreviewed 0, 빌드 가드도 모두 통과했다.
- 다른 점: 512곳은 `reason`이 다르다. 이 512곳의 `reason`만 커밋본 값으로 바꾸면 바이트까지 같다.
- 512곳이 다른 이유는 판정이 아니다. 이 곳들은 `review/copy` 문장 층(out·div1·div2)이 판정 문장을 덮어쓴다. 판정 `reason`에 출하 문장을 넣어 다시 빌드해도 512곳은 그대로 다르다. 출하 문장 대부분은 커밋된 어떤 `review/copy` 파일에도 없고, 745485b·4f087b5 때 커밋되지 않은 문장 층으로 빌드된 것으로 보인다.
- **고정 (주인 승인 2026-10-17 「응 고정하고 푸시해줘」)**: 512곳의 출하 문장을 커밋된 `public/spots.json`에서 그대로 옮겨 `review/copy/fix-05.json`(`{id, reason, was}`, `was`는 그 전 층이 내던 문장)에 넣었다. fix-NN은 빌드가 마지막에 읽는 층이라 스크립트는 고치지 않았다. 이제 `SPOTS_OUT`으로 빌드한 결과가 커밋본과 바이트까지 같다(sha256 c88acb84…3821).
- `tests/data.test.ts`의 「모든 입력 항목에 판정이 있다」 검사는 이제 건너뛰지 않고 실행되며 통과한다.
