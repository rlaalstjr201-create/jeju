# CLAUDE.md

> Jeju Travel All-in-One 프로젝트.
> 현재 단계: **Grilling 대기 중** (도메인 미정의)

## 행동 원칙

1. **가정하지 마라** — 모호하면 묻기, 해석 후보 모두 제시.
2. **단순함 우선** — 요청 외 추가 X, 200줄→50줄 가능하면 다시 써.
3. **수술적 변경** — 요청 무관 코드/주석/포맷 손대지 마.
4. **목표 주도** — 검증 가능한 성공 기준 정의 후 루프.

> Karpathy 4원칙 (forrestchang/andrej-karpathy-skills)

## 워크플로우

1. Grilling → `docs/context.md`
2. Office Hours → `docs/office_hours.md`
3. Light Spec → `specs/<feature>.md`
4. Plan → `plans/<feature>.md`
5. Plan Review → plan-reviewer agent
6. Sub-agent build
7. Cross-model review (Codex)
8. Architecture improve

**단계 건너뛰지 마. 현재 단계 모르면 사용자에게 물어.**

## 절대 룰

- `docs/context.md` 없이 도메인 entity·용어 추정 금지.
- 외부 PRD를 도메인 권위로 삼지 마. context.md만 권위 있음.
- 스킬을 우회해서 직접 구현하지 마.

## 시작점

- 시드: `docs/grilling_seed.md`
- 첫 작업: Grilling 스킬로 인터뷰 → `docs/context.md` 생성

(아키텍처·스택·hook 룰은 context.md 완성 후 이 파일에 추가)

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo; domain glossary at `docs/context.md`, ADRs at `docs/adr/`. See `docs/agents/domain.md`.
