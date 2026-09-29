> 공유 지식: `C:\Users\rlaal\knowledge\` 참조

# CLAUDE.md

> Jeju Travel All-in-One 프로젝트.

## 행동 원칙

1. **가정하지 마라** — 모호하면 묻기, 해석 후보 모두 제시.
2. **단순함 우선** — 요청 외 추가 X, 200줄→50줄 가능하면 다시 써.
3. **수술적 변경** — 요청 무관 코드/주석/포맷 손대지 마.
4. **목표 주도** — 검증 가능한 성공 기준 정의 후 루프.

> Karpathy 4원칙 (forrestchang/andrej-karpathy-skills)

## 워크플로우

| 단계 | 산출물 | ADR 발행 시점 |
|------|--------|--------------|
| 1. Grilling | `docs/context.md` | 도메인 핵심 결정 시 |
| 2. Office Hours | `docs/office_hours.md` | 제품 방향 결정 시 |
| 3. Light Spec | `specs/<feature>.md` | Open Question 결정 시 |
| 4. Plan | `plans/<feature>.md` | 아키텍처·포트·어댑터 결정 시 |
| 5. Plan Review | — | — |
| 6. Sub-agent build | — | — |
| 7. Cross-model review (Codex) | `codex_review.md` | MAJOR 해소 결정 시 |
| 8. Architecture improve | `architecture_review.md` | 구조 리팩토링 결정 시 |

**단계 건너뛰지 마. 현재 단계 모르면 사용자에게 물어.**

## 절대 룰

- `docs/context.md` 없이 도메인 entity·용어 추정 금지.
- 외부 PRD를 도메인 권위로 삼지 마. context.md만 권위 있음.
- 스킬을 우회해서 직접 구현하지 마.
- 주요 도메인·아키텍처 결정은 `docs/adr/`에 기록. 새 결정 시 새 ADR 발행 (`NNNN-title.md`).
- Architecture improve 진입 전 ADR 목록 확인 — 기존 결정 재리티게이션 금지.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo; domain glossary at `docs/context.md`, ADRs at `docs/adr/`. See `docs/agents/domain.md`.
