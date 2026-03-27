# OneRealm Remediation Spec

## Goals

- Eliminate the mismatch between gameplay limits and infrastructure abuse limits.
- Harden sponsored transaction handling without breaking current gameplay endpoints.
- Make auth and expedition resume survive normal server restarts.
- Reduce frontend regression risk by stabilizing error contracts, selectors, and page architecture.
- Deliver changes in small waves with rollback points instead of a rewrite.

## Delivery Status

- `Completed`: Wave 1 - quota semantics and error contract.
- `Completed`: Wave 2 - durable auth sessions.
- `Next`: Wave 3 - sponsored action hardening.

## Priorities

### P0

- Separate `quest_start` quota from sponsor and server-side processing budgets.
- Make rate-limit persistence day-aware and restart-safe.
- Return structured rate-limit metadata from the server and consume it correctly in the frontend.
- Stop coupling user-facing copy to the old "10/day" assumption outside the quest-start path.
- Preserve current route contracts while adding backward-compatible error metadata.

### P1

- Replace in-memory auth sessions with signed stateless session tokens.
- Migrate gasless production flows away from client-built PTBs toward typed server-built actions.
- Harden legacy `/api/sponsor` verification until all production callers are migrated.
- Add stable `data-testid` / `data-e2e` selector contracts for critical E2E flows.

### P2

- Lazy-load Sui and zkLogin runtime modules to reduce the shared frontend bundle.
- Split oversized page modules into feature-level state and view components.
- Standardize page-level async and error states on shared primitives.

## Wave Plan

### Wave 1 - Quota Semantics and Error Contract

- Introduce bucketed rate limits: `quest_start`, `sponsor_action`, `server_action`.
- Persist counters with `dayKey` and `resetsAt` semantics so stale snapshots are ignored after date rollover.
- Keep `HTTP 429` and `error: "Rate limited"` stable, but add `details.bucket`, `details.limit`, `details.remaining`, `details.resetsAt`.
- Update frontend error handling so quest, mint, equip, craft, salvage, and settle show messages based on the actual bucket.
- Add focused server tests for bucket isolation and stale snapshot handling.

Rollback:

- Revert `game-server/src/rate-limit.ts`, `game-server/src/index.ts`, and frontend error mapping changes together.
- Existing route payloads remain backward-compatible because success contracts do not change.

### Wave 2 - Durable Auth Sessions

- Replace `sessionStore` with signed tokens carrying `address`, `sub`, `exp`, `judgeMode`, and `version`.
- Keep the current frontend storage keys so route and storage semantics stay intact.
- Make `requireAuth` accept both legacy in-memory tokens and signed tokens during migration.
- Add restart-resume integration coverage for expedition refresh and judge mode.

Rollback:

- Keep dual-token acceptance until signed tokens are proven stable in staging/demo.

### Wave 3 - Sponsored Action Hardening

- Add typed server endpoints for mint, equip, unequip, salvage, and craft.
- Build PTBs server-side for production flows and keep `/api/sponsor` as a legacy compatibility path.
- Tighten `/api/sponsor` to validate per-target argument structure, object ownership, enum bounds, duplicate object IDs, and gas bounds.
- Add negative tests for intentionally failing sponsored transactions.

Rollback:

- Leave legacy callers on `/api/sponsor` while typed endpoints roll out one flow at a time.

### Wave 4 - E2E Contract Stabilization

- Add durable test hooks for login, hero creation, quest launch, expedition wait, settlement, and crafting.
- Refactor Playwright to page-object helpers and state selectors instead of visible copy.
- Preserve current copy freedom for UX work while keeping behavior coverage intact.

Rollback:

- Keep legacy text assertions until the selector-based suite is green in CI.

### Wave 5 - Frontend Runtime and Architecture Cleanup

- Lazy-load zkLogin and Sui runtime dependencies.
- Split `quest.tsx` and `inventory.tsx` into feature modules and state helpers.
- Standardize loading, error, empty, success, and recovery surfaces on shared UI primitives.

Rollback:

- Ship one page module split at a time, starting with quest, then inventory.

## File-by-File Implementation Map

### P0 / Wave 1

- `game-server/src/rate-limit.ts`
  - Replace the flat counter map with a bucketed, day-aware store.
  - Add persisted snapshot metadata and backward-compatible rate-limit error details.
- `game-server/src/index.ts`
  - Charge the correct bucket per route.
  - Preserve structured `429` responses instead of letting known errors fall into the generic `500` handler.
- `game-server/src/rate-limit.test.ts`
  - Cover bucket isolation, same-day reload, stale snapshot reset, and error metadata.
- `frontend/lib/api-errors.ts`
  - Add shared parsing for API error bodies and shared rate-limit message mapping.
- `frontend/transactions/gasless.ts`
  - Preserve typed `GaslessError` but attach parsed rate-limit details.
- `frontend/pages/quest.tsx`
  - Parse create/loot endpoint failures instead of collapsing them into generic messages.
  - Surface bucket-aware limit messages for start, tx1, and tx2 stages.
- `frontend/pages/hero.tsx`
  - Replace the old quest-specific quota copy on mint failures with shared bucket-aware messages.
- `frontend/pages/inventory.tsx`
  - Replace the generic "Daily action limit" copy with shared bucket-aware messages.

### P1 / Wave 2

- `game-server/src/auth.ts`
  - Add signed token issue/verify helpers and dual-read migration path.
- `frontend/auth/zklogin.ts`
  - Keep storage keys but consume new auth session payload metadata if added.
- `frontend/pages/auth/callback.tsx`
  - Surface durable-session recovery errors cleanly.
- `frontend/pages/quest.tsx`
  - Improve expired-session recovery for restored expeditions.

### P1 / Wave 3

- `game-server/src/tx-policy.ts`
  - Tighten legacy relay validation until all callers are migrated.
- `game-server/src/sponsor.ts`
  - Reclassify relay usage as a compatibility path.
- `game-server/src/session.ts`
  - Reuse server-built transaction patterns for other actions.
- `game-server/src/battle.ts`
  - Keep as the reference model for server-built PTBs.
- `frontend/pages/hero.tsx`
  - Migrate mint to a typed backend action.
- `frontend/pages/inventory.tsx`
  - Migrate equip, unequip, salvage, and craft to typed backend actions.
- `frontend/lib/e2e.ts`
  - Keep demo-mode compatibility while production flows move off client-built PTBs.
- `game-server/src/tx-policy.test.ts`
  - Add negative coverage for malformed but allowlisted calls.

### P1 / Wave 4

- `frontend/tests/e2e/app.spec.ts`
  - Replace brittle text selectors with stable hooks and page-object helpers.
- `frontend/pages/index.tsx`
  - Add durable selector hooks for login actions.
- `frontend/pages/hero.tsx`
  - Add durable selector hooks for hero creation and navigation.
- `frontend/pages/quest.tsx`
  - Add durable selector hooks for mission flow stages and expedition recovery.
- `frontend/pages/inventory.tsx`
  - Add durable selector hooks for crafting and salvage flows.

### P2 / Wave 5

- `frontend/auth/zklogin.ts`
  - Lazy-load Sui and zkLogin runtime only when login actually runs.
- `frontend/transactions/gasless.ts`
  - Lazy-load Sui execution runtime only when a transaction is executed.
- `frontend/pages/quest.tsx`
  - Split state machine, wait-state panel, result panel, and choice panels into composable modules.
- `frontend/pages/inventory.tsx`
  - Split loadout, arsenal, materials, and crafting sections into feature modules.
- `frontend/pages/hero.tsx`
  - Extract AI hint and mint orchestration into smaller hooks/components.

## Exit Criteria

- Daily quest messaging matches real quota semantics.
- Sponsor and server-action abuse are budgeted independently from gameplay progression.
- Refreshing during expedition remains safe across normal server restarts.
- E2E survives benign copy and layout refactors.
- Frontend build stays green while page modules become smaller over successive waves.
