# Codex Adversarial Review — Stage 8 (b4ee938)

Target: working tree diff
Verdict: needs-attention

No-ship: C1 and M5/C3 are still broken in ways that can expose admin mutation and create live Spots after a failed approve race. I could not write docs/codex_review_stage8.md because this session is read-only, so the review is returned here as JSON.

Findings:
- [critical] Forged dev curator tokens still authorize every admin route (src/interface/api/routes/_shared.ts:25-29)
  C1 is not actually fixed for production. `requireCuratorRole` accepts any bearer token starting with `dev-curator-` before checking `CURATOR_SECRET`, with no `NODE_ENV === 'development'` guard. Every admin curation route calls this helper, so an external caller can forge `Authorization: Bearer dev-curator-anything` and discover, enrich, approve, or reject catalog entries. The new tests assert this prefix is accepted, but do not constrain it to dev mode.
  Recommendation: Only accept `dev-curator-*` when `NODE_ENV === 'development'` or remove prefix auth from shared route auth entirely. In production, require a non-empty secret or real admin auth/role verification, and add tests proving dev tokens are rejected outside development.
- [high] Failed approve race commits the Spot before returning 409 (src/application/curation/ApproveCandidateUseCase.ts:86-95)
  M5/C3 still has a data-corruption path. `ApproveCandidateUseCase` runs `saveReturningId()` and `updateStatusConditional()` inside `txManager.run`, but it returns `[id, ok]` normally even when `ok` is false. The transaction manager commits on normal return; only after the commit does line 94 throw `InvalidStatusError`. Under approve-vs-reject or double-approve races, the API can report conflict while leaving a newly inserted or reactivated Spot committed for a candidate that was not approved.
  Recommendation: Make the conditional status update failure throw inside the transaction callback so the Spot upsert rolls back, or perform a guarded status transition first and only save the Spot after winning the transition. Add an integration-style test with a real `PostgresTransactionManager` proving `saveReturningId` is rolled back when `updateStatusConditional` fails.

Next steps:
- Gate or remove `dev-curator-*` auth before shipping admin routes.
- Move the approve race failure inside the transaction and verify rollback with a real transaction test.
- After fixes, rerun the C1/M5/C3 focused tests plus `npm run typecheck` and the relevant curation test suite.
