# 독립 리뷰: 저장 목록 흐름 기록 (ADR-0085)

7단계 대체 리뷰(ADR-0058). Codex는 쓰지 않았고 Claude가 독립 리뷰함. 대상: `git diff master...worktree-agent-aeb19a38efaa4992f` (커밋 0d593f8, 5827066). 기준: `specs/saved-flow-events.md`, `docs/adr/0085-saved-flow-events.md`.

## 결론

MAJOR 0건, MINOR 3건. 개인정보 위반(시각·기기 번호·`at` 날짜 유출)은 찾지 못했고, D1 카운터 열쇠는 스펙과 같다.

## MAJOR

없음.

## MINOR

1. **보고서에 낡은 문구가 남음**: `apps/web/scripts/analytics-report.mjs:87`
   `- 날짜 모드 비율: 자체 기록에는 남지 않아요. GA4 mood_tap의 dated 값으로 봐요.`
   이제 `save:dated`/`save:now`가 D1에 쌓이고, 같은 보고서의 「저장 목록 흐름」 Q1이 그 비율을 낸다. 실패 상황: 보고서 하나 안에서 위 절은 "자체 기록에 없다"고 하고 아래 절은 Q1 값을 보여 줘서 읽는 사람이 헷갈린다. 고칠 방향: 문구를 「저장 기준은 아래 Q1. 기분 탭 기준은 GA4 mood_tap의 dated」로 바꾼다.
2. **Q2-c 분모가 배포 전후를 섞는 기간에는 작게 잡힘**: `analytics-report.mjs:35-36,49`
   `save:*` 카운터는 새 핸들러 배포 뒤부터만 쌓인다. 28일 창에 배포 전 날짜가 들어가면 분모 `save:dated+save:now`가 실제 저장 수보다 작고 Q1·Q2-c가 부풀 수 있다(분자인 목록 길찾기도 배포 뒤부터라 일부는 상쇄됨). 실패 상황: 배포 뒤 첫 4주 동안 28일 Q2-c를 그대로 읽으면 왜곡된다. 고칠 방향: 배포일 이전 창은 「일부 기간만」이라고 적거나 배포 4주 뒤부터 읽는다. 문서에만 적어 둬도 된다.
3. **브라우저 앞으로 가기로 저장 목록에 다시 들어가면 `open`이 안 셈**: `apps/web/src/app.ts:602` (`count('open')`는 `openSaved()`에만 있다. popstate의 `route` 동작과 새로고침 복원 `app.ts:1091`은 세지 않음)
   스펙 문구("다시 그려질 때는 다시 안 셈")에는 어긋나지 않는다. 실패 상황: 뒤로 → 앞으로로 목록에 다시 온 사용자는 셈에 들어가지 않아 Q2-a·Q3 분모가 약간 작다. 의도라면 스펙/주석에 한 줄 적으면 된다.

## 확인한 것 (문제 없음)

- 개인정보: `at`은 `SavedEntry`에만 있다. 백업(`keep.ts encodeBackup`)은 id와 날짜만 인코딩하므로 `at`이 들어가지 않는다. `mergeEntries`는 백업 항목을 `at` 없이 넣는다. 이벤트·GA4에는 `age`(0/1/2)만 간다. e2e A1이 POST 본문에 `"at"`과 담은 날이 없는지 확인한다.
- 검사(`events/validate.ts:49-55`): `live0`는 open에서 true만, `past`는 open이나 from=saved인 map에서 true만, `from`은 map의 'saved'만, `age`는 from=saved인 map에서 숫자 0·1·2만, `op`는 arrange에 꼭 있고 4값만 받는다. open·arrange에 id가 있으면 거부한다. 문자열 시각이 들어갈 자리는 없다.
- D1 열쇠(`events/handler.ts:24-30`): `open[:live0][:past]`, `arrange:<op>`, `saved:a<0|1|2|x>:<p|->`, `save:dated|now`로 스펙과 같다. 기존 장소 카운터도 그대로 올라간다.
- 보고서와 인기도: `renderReport`는 흐름 카운터를 장소 절에서 뺀다(`FLOW` 필터). 그래서 save 합계가 두 번 세어지거나 `saved:*`가 장소 순위에 섞이지 않는다. `aggregate.ts`도 같은 접두어를 뺀다. 장소 id 정규식은 `:`를 허용하지 않으므로 접두어와 겹치지 않는다.
- 예전 데이터: `parseEntries`/`normalizeEntries`는 `at`이 없거나 날짜가 아니어도 깨지지 않고 해당 필드만 버린다. `at`이 없으면 `age`를 빼고 보낸다. 다시 넣거나(`out.at`) 다른 날로 옮겨도(`moveToDay`) `at`이 유지되고, 위아래 이동은 spread라 그대로 남는다.
- 다시 그리기: `open`은 `openSaved()`에서만, `arrange`는 클릭 처리기에서 guard 뒤에서만 센다. 렌더 경로에는 셈이 없다. `data-date`는 저장 목록 줄(`render.ts:654`)에만 붙는다.

## 테스트 (워크트리 apps/web, 이번에 실행)

- `npm run typecheck`: 통과 (exit 0)
- `npm test`: 40개 파일 통과. 972개 통과, 1개 건너뜀(973개 중) (exit 0)
- `npm run e2e`: 브라우저 점검 73/73 통과 (exit 0)
