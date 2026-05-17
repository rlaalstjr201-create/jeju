# ADR 0005: TransactionManager Port with AsyncLocalStorage for Cross-Repository Atomicity

Status: Accepted (2026-05-17)

## Context

`ComposeDayPlanService` performs a gap-fill operation that saves two independent entities: the updated Shortlist (with auto-filled Spots) and the new DayPlan. The original implementation saved them in separate database transactions:

```typescript
await shortlistRepository.save(travellerId, updatedShortlist, autoFilledSpotIds);
// ... recompose ...
await dayPlanRepository.save(tripId, dayPlan, autoFilledSpotIds);
```

Codex cross-model review identified this as MAJOR 1 (data integrity risk): if `dayPlanRepository.save` fails after `shortlistRepository.save` succeeds, the Traveller's Shortlist permanently contains auto-filled Spots with no associated DayPlan. On retry, the Shortlist is now larger, potentially producing a different DayPlan.

Three design options were evaluated:
- ㄱ: Pass a shared `PoolClient` directly to repository methods as an optional parameter.
- ㄴ: Define a `TransactionManager` port in the application layer; use `AsyncLocalStorage` to propagate the active `PoolClient` to repositories transparently.
- ㄷ: Saga / compensating transaction (roll back Shortlist mutation on DayPlan failure).

## Decision

Option ㄴ: `TransactionManager` port in the application layer (D5 principle: domain stays transaction-agnostic).

**Implementation:**
- `src/application/ports/TransactionManager.ts`: `interface TransactionManager { run<T>(work: () => Promise<T>): Promise<T> }`
- `src/infrastructure/persistence/transactionContext.ts`: singleton `AsyncLocalStorage<PoolClient>` — stores the active client for the current async call tree.
- `src/infrastructure/persistence/PostgresTransactionManager.ts`: acquires one `PoolClient`, runs `BEGIN`, executes `work()` inside `transactionContext.run(client, work)`, then `COMMIT` or `ROLLBACK`.
- Both `PostgresShortlistRepository` and `PostgresDayPlanRepository` implement a `withClient()` helper that checks `transactionContext.getStore()` first. If a client is found (i.e., called inside a transaction), it uses that client. Otherwise it acquires its own.

`ComposeDayPlanService` wraps both saves atomically:
```typescript
await params.transactionManager.run(async () => {
  await params.shortlistRepository.save(travellerId, shortlist, autoFilledSpotIds);
  await params.dayPlanRepository.save(tripId, dayPlan, autoFilledSpotIds);
});
```

Domain layer (repositories, domain services) has no knowledge of transactions. The port interface is in the application layer. Infrastructure adapters implement it.

## Consequences

**Positive:**
- Domain code stays transaction-agnostic: repository port signatures do not change.
- Atomic failure: if either save throws, `ROLLBACK` fires and neither change is persisted.
- `TransactionManager` is easily mockable in unit tests: `{ run: vi.fn().mockImplementation(work => work()) }`.
- Port/adapter pattern is consistent with the rest of the architecture.

**Negative:**
- `AsyncLocalStorage` is Node.js-specific (`node:async_hooks`). Cannot be used in non-Node runtimes (Deno, browser).
- Debugging transaction boundaries is harder because the client flows through async context rather than explicit parameters.

**Risk:**
- If a repository method is called from outside a `transactionManager.run()` block, it acquires its own client and connection — no transaction. This is intentional (standalone operations remain valid) but requires discipline when adding new cross-repository operations.

## Alternatives Considered

**Option ㄱ — shared PoolClient as optional parameter:** Rejected.
- Pollutes every repository method signature with an infrastructure concern.
- Domain port interfaces would need to expose `PoolClient` or a generic `Connection` type — leaking infrastructure into the domain layer boundary.

**Option ㄷ — Saga / compensating transaction:** Rejected.
- Adds significant complexity (compensating logic, idempotency keys, retry tracking) without commensurate benefit at v1 scale (single-region, single-node Postgres).
- A compensating Shortlist delete is itself a write that can fail, requiring its own error handling.
- Appropriate for distributed systems; premature here.
