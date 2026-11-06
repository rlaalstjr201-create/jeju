# Codex Adversarial Review — Stage 8b (eb93523)

Target: working tree diff
Verdict: needs-attention

No-ship for the working tree as-is. S8B-1 and S8B-2 are fixed in HEAD, but the diff still contains unignored local agent permission config that should not ship.

Findings:
- [high] Unignored local Claude settings grant broad command execution if committed (.claude/settings.local.json:53)
  The working tree includes `.claude/settings.local.json`, and `.gitignore` does not ignore this filename pattern. The file allows broad commands including `Bash(git *)` and also permits Docker and install/commit commands elsewhere in the same allow list. Inference: if this untracked file is accidentally committed with the hotfix, future Claude Code sessions in the repo inherit a much wider trust boundary than the project code requires, including arbitrary git subcommands and local machine path exposure.
  Recommendation: Do not ship `.claude/settings.local.json` or the untracked `.claude/`/`.agents/` skill trees with this hotfix. Add `.claude/`, `.agents/`, `.codex-review-prompt.txt`, and local review artifacts to `.gitignore` or explicitly remove them from the release candidate.

Next steps:
- S8B-1 confirmed: `requireCuratorRole` only accepts `dev-curator-*` when `NODE_ENV === 'development'`, and tests cover production/test/undefined rejection.
- S8B-2 confirmed: `ApproveCandidateUseCase` now throws `InvalidStatusError` inside `txManager.run`, and repositories use `transactionContext`, so the Spot write participates in rollback.
- I could not create `docs/codex_review_stage8b.md` because this session is read-only.
