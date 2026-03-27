# ADR.md — Architecture Decision Records
### OneRealm · v2.0

> **Mục đích file này:** Ghi lại *tại sao* hệ thống được thiết kế như vậy.
> Không phải *cái gì* (CONTRACTS.md) hay *như thế nào* (BLUEPRINT.md) — mà là *tại sao*.
>
> Source: VHEATM Audit Cycle #1 (ADR-001 đến ADR-006) + Cycle #2 (ADR-007 đến ADR-011).
> **Notation:** 🔴 MANDATORY · 🟠 REQUIRED · 🟡 RECOMMENDED

---

## Mục lục

- [Cách đọc file này](#cách-đọc-file-này)
- [ADR-001](#adr-001----onechain-move-syntax--không-dùng-aptos-move) 🔴
- [ADR-002](#adr-002----2-transaction-session-pattern) 🔴
- [ADR-003](#adr-003----address-on-chain--không-dùng-oneiduser-type) 🔴
- [ADR-004](#adr-004----missionsession-là-owned-object) 🟠
- [ADR-005](#adr-005----unequip-all-guard-trước-khi-destroy-hero) 🟠
- [ADR-006](#adr-006----game-server-làm-session-coordinator--tx2-builder) 🟠
- [ADR-007](#adr-007----zklogin-dùng-mysten-hosted-prover) 🔴
- [ADR-008](#adr-008----self-managed-sponsor-wallet) 🔴
- [ADR-009](#adr-009----feature-budget-4-move-modules--4-screens) 🔴
- [ADR-010](#adr-010----deterministic-battle-resolution) 🟠
- [ADR-011](#adr-011----mock-ai-mentor-cho-mvp) 🟡
- [ADR-012](#adr-012----reward-model-shift-sang-materials--crafting) 🟠
- [ADR-013](#adr-013----mission-families--contract-types) 🟠
- [ADR-014](#adr-014----hero-archetype--profession-progression) 🟠
- [ADR-015](#adr-015----blacksmith-tech-tree-theo-profession-rank) 🟠
- [Weight Decay Tracker](#weight-decay-tracker)
- [Superseded Decisions từ v1.0](#superseded-decisions-từ-v10)
- [Index](#index)

---

## Cách đọc file này

| Status | Ý nghĩa |
|---|---|
| ✅ `ACCEPTED` | Đã chốt, đang implement |
| 🟡 `PROPOSED` | Đang cân nhắc, chưa chốt |
| ❌ `REJECTED` | Đã cân nhắc, không chọn |
| 🔄 `SUPERSEDED by ADR-xxx` | Đã thay thế bởi ADR khác |

**Weight Decay:** Mỗi ADR có weight (0.0 → 1.0) decay theo λ mỗi VHEATM cycle.
Khi weight < 0.5 → re-evaluate. Reset về 1.0 khi re-apply.

---

## ADR-001 — OneChain Move Syntax — Không dùng Aptos Move

**Status:** ✅ ACCEPTED
**Level:** 🔴 MANDATORY
**Date:** 2026-03-26
**Source:** VHEATM Cycle #1, Simulation E-02
**Tags:** `move` `syntax` `compilation`

### Context

Tech Spec v1.0 dùng Aptos Move syntax: `signer` parameter, `object::ID` (không phải `UID`), `object::DynamicFields<T>` như struct field. Tất cả những syntax này compile fail 100% trên OneChain Move runtime — hai ngôn ngữ tuy cùng tên "Move" nhưng có type system và runtime khác nhau.

**Constraints:**
- Project build trên OneChain (Move-compatible object runtime) — phải dùng OneChain Move, không phải Aptos Move
- Mọi Move code phải pass `one move build` trước khi có thể test hoặc deploy

### Options Considered

#### Option A: Rewrite toàn bộ sang OneChain Move syntax ← **CHOSEN**

| Pros | Cons |
|---|---|
| Compile và run được | Cần rewrite hoàn toàn v1.0 code |
| Consistent với OneChain docs và Move-compatible examples | - |
| `UID`, `TxContext`, `dof::add` — đúng API | - |

#### Option B: Giữ Aptos syntax, dùng Aptos chain thay vì OneChain-compatible runtime

| Pros | Cons |
|---|---|
| Không cần rewrite | OneChain là Move object-chain compatible — không thể dùng Aptos chain |
| - | Phá vỡ toàn bộ integration với chain SDK, zk proof auth, sponsored PTB flow |

**Loại vì:** OneChain runtime tương thích object-centric Move — bắt buộc dùng cú pháp tương thích runtime đó.

### Decision

> **Chọn Option A vì:** OneChain chạy object-centric Move runtime. Aptos Move và runtime này khác nhau đủ để không thể cross-compile. Không có lựa chọn nào khác.

### Consequences

**Tích cực:**
- Code compile và deploy được
- Có thể reference OneChain docs và các examples Move-compatible cùng mô hình object

**Tiêu cực / Trade-offs:**
- Phải rewrite toàn bộ v1.0 Move code — sẽ revisit nếu có breaking changes trong runtime tương thích

**Key syntax changes áp dụng:**

```
Aptos                          → OneChain Move
──────────────────────────────────────────
signer                         → &mut TxContext
object::ID                     → object runtime UID
object::DynamicFields<T>       → dynamic_object_field as dof
struct Hero has key { ... }    → public struct Hero has key { ... }
```

**Xem thêm:** BLUEPRINT.md Section 5 (hero.move, equipment.move specs), CONTRACTS.md Section 3 (schemas)

---

## ADR-002 — 2-Transaction Session Pattern

**Status:** ✅ ACCEPTED
**Level:** 🔴 MANDATORY
**Date:** 2026-03-26
**Source:** VHEATM Cycle #1, Simulation E-01
**Tags:** `randomness` `PTB` `transaction-pattern`

### Context

Architecture v1.0 spec "1 PTB = full session": generate loot + battle resolve + reward distribute trong một transaction. Không thể implement vì chain protocol có security constraint về `Random` input.

**Constraints:**
- Chain protocol reject PTB có bất kỳ lệnh non-transfer nào sau `MoveCall` dùng `Random` làm input
- Đây là intentional protocol design để prevent front-running attacks
- Loot generation phải dùng native `Random` để unmanipulable

### Options Considered

#### Option A: 2-phase — Tx1 (loot commit) + Tx2 (settlement PTB) ← **CHOSEN**

| Pros | Cons |
|---|---|
| Protocol chấp nhận | Cần 2 round-trips thay vì 1 |
| Loot committed on-chain trước settlement — minh bạch hơn | Frontend phải wait Tx1 confirm rồi mới build Tx2 |
| Settlement (Tx2) vẫn là 1 atomic PTB | Game Server cần thêm logic build Tx2 |

#### Option B: Single PTB với randomness

**Loại vì:** protocol từ chối ở validation stage — không thể ship.

#### Option C: Off-chain randomness (Game Server seeded)

| Pros | Cons |
|---|---|
| Đơn giản, 1 transaction | Centralised — Game Server có thể cheat |
| - | Không dùng native chain randomness — mất điểm kỹ thuật với judges |

**Loại vì:** Undermines "unmanipulable loot" narrative — core selling point của game.

### Decision

> **Chọn Option A vì:** Là lựa chọn duy nhất thỏa mãn cả protocol constraint lẫn on-chain randomness requirement. Pattern còn mang lại UX benefit: player thấy loot committed trước khi settle — transparent hơn.

### Consequences

**Tích cực:**
- Loot unmanipulable (native chain randomness)
- Settlement atomic (1 PTB với 4 ops)
- Pitch narrative: "commit bằng native randomness → settle atomic" — technically impressive

**Tiêu cực / Trade-offs:**
- 2 transaction confirmations thay vì 1 — ~6s total thay vì ~3s — chấp nhận được
- Frontend phức tạp hơn (phải poll/wait Tx1 rồi mới trigger Tx2)

**CRITICAL Implementation Note:**
`generate_loot` PHẢI là `entry fun` (không phải `public fun`).
`entry fun` không thể gọi từ PTB. Trong implementation hiện tại, Tx1 được **Game Server** submit qua endpoint `/api/session/loot` vì `MissionSession` là owned object của server và function này còn yêu cầu `&GameAuthority`.
Sau khi Tx1 confirm → Frontend gọi `/api/battle` để lấy Tx2 bytes.

**Xem thêm:** BLUEPRINT.md Section 3 (Happy Path data flow), Section 5 (`mission::generate_loot` spec)

---

## ADR-003 — `address` on-chain — Không dùng `OneID::UserID` type

**Status:** ✅ ACCEPTED
**Level:** 🔴 MANDATORY
**Date:** 2026-03-26
**Source:** VHEATM Cycle #1, Simulation E-02
**Tags:** `identity` `move` `oneid`

### Context

Tech Spec v1.0 dùng `OneID::UserID` như Move type trong struct definitions và function signatures. Type này không tồn tại trong OneChain Move framework — compile error.

**Constraints:**
- Move contracts cần identifier cho player/owner
- OneID là SDK/OAuth layer — không phải Move module
- Move chỉ có primitives + system types của runtime

### Options Considered

#### Option A: Dùng `address` on-chain, OneID binding off-chain ← **CHOSEN**

| Pros | Cons |
|---|---|
| Native runtime type — compile và chạy được | OneID ↔ address mapping phải manage off-chain |
| Zero dependency vào OneID module | - |
| zk proof login naturally produces on-chain `address` | - |

#### Option B: Tạo `OneID` wrapper module trong Move

**Loại vì:** Over-engineering — OneID binding không cần on-chain. Off-chain DB/session đủ cho MVP.

### Decision

> **Chọn Option A vì:** `address` là primitive type của runtime. zk proof login tự nhiên produce on-chain `address`. Không có lý do kỹ thuật nào để wrap thêm layer on-chain.

### Consequences

**Tích cực:**
- Code compile
- Login integration seamless (flow trả về `address`)

**Implementation Notes:**
- Move code: chỉ dùng `address` cho owner/player fields
- Off-chain: Game Server lưu mapping `{ google_sub → onchain_address }` trong session
- Frontend: sau `completeLogin()` → có `address` → dùng cho mọi Move interactions

**Xem thêm:** CONTRACTS.md `Hero.owner`, `MissionSession.player`

---

## ADR-004 — MissionSession là Owned Object — Không phải Shared Object

**Status:** ✅ ACCEPTED
**Level:** 🟠 REQUIRED
**Date:** 2026-03-26
**Source:** VHEATM Cycle #1, Simulation E-03
**Tags:** `object-model` `performance` `consensus`

### Context

Khi nhiều guild quest chạy đồng thời, cần quyết định ownership model cho `MissionSession`. Shared objects yêu cầu Mysticeti consensus cho mọi mutation.

**Constraints:**
- MVP: solo player → 1 session tại một thời điểm (không phải bottleneck)
- Target: co-op guild → N sessions đồng thời → performance matters
- Chỉ Game Server cần đọc/write MissionSession (orchestrator duy nhất)

### Options Considered

#### Option A: Owned object của Game Server address ← **CHOSEN**

| Pros | Cons |
|---|---|
| Zero consensus overhead — sub-second latency | Chỉ Game Server address có thể mutate |
| Parallel sessions mà không block nhau | Frontend không thể query session trực tiếp (phải qua Game Server) |
| Consistent với best practices cho session state trên object runtime | - |

#### Option B: Shared object (`transfer::share_object`)

| Pros | Cons |
|---|---|
| Bất kỳ address nào cũng có thể mutate | Mysticeti consensus required mỗi mutation |
| - | Bottleneck khi nhiều sessions chạy đồng thời |
| - | Phá vỡ "parallel execution" narrative trong pitch |

**Loại vì:** Consensus bottleneck + phá narrative.

### Decision

> **Chọn Option A vì:** Chỉ Game Server cần mutate MissionSession. Owned object = zero consensus = parallel execution. Đây là best practice cho session/game state trên runtime object-centric.

### Consequences

**Tích cực:**
- Sub-second latency cho mọi session mutations
- Unlimited parallel sessions không block nhau

**Trade-offs:**
- Frontend không mutate session trực tiếp; mọi session transitions đi qua Game Server API (`/api/session/create`, `/api/session/loot`, `/api/battle`) — chấp nhận được vì Game Server là orchestrator anyway

**Implementation Note:**
```
// ĐÚNG
transfer::transfer(session, game_server_address)

// SAI — gây bottleneck
transfer::share_object(session)
```

**Xem thêm:** BLUEPRINT.md Section 5 (`mission::create_session` pseudocode)

---

## ADR-005 — Unequip-All Guard trước khi Destroy Hero

**Status:** ✅ ACCEPTED
**Level:** 🟠 REQUIRED
**Date:** 2026-03-26
**Source:** VHEATM Cycle #1, Simulation E-04
**Tags:** `object-lifecycle` `dynamic-fields` `asset-safety`

### Context

Khi player muốn burn/upgrade Hero, phải delete UID. `object::delete()` không tự động xóa Dynamic Object Fields — chúng trở thành orphaned objects: tồn tại mãi mãi trên chain nhưng không có owner, không accessible, không refundable.

**Constraints:**
- Runtime này: `object::delete(uid)` chỉ delete UID, không touch DOF
- Equipment là real assets có value — không thể mất vĩnh viễn

### Options Considered

#### Option A: Unequip all slots trước khi delete ← **CHOSEN**

| Pros | Cons |
|---|---|
| Player không mất assets | Phải check từng slot trước khi delete |
| Clean on-chain state | Code phức tạp hơn một chút |

#### Option B: Direct `object::delete()` mà không unequip

**Loại vì:** Gây orphaned assets — không thể recover. Unacceptable loss cho player.

### Decision

> **Chọn Option A vì:** Player assets phải được bảo vệ. Một vài dòng code thêm hoàn toàn worth it.

### Consequences

**Tích cực:**
- Không có orphaned assets
- Player nhận lại equipment khi burn hero

**Implementation Note (critical pattern):**
```move
// PHẢI theo đúng thứ tự này:
// 1. Unequip từng slot có equipment
// 2. Transfer equipment về sender
// 3. Sau đó mới delete UID

if (dof::exists_(&hero.id, SLOT_WEAPON)) {
    let w = dof::remove(&mut hero.id, SLOT_WEAPON);
    transfer::public_transfer(w, sender);
};
// [repeat cho SLOT_ARMOR]
let Hero { id, .. } = hero;
object::delete(id);  // Safe — không còn DOF
```

**Xem thêm:** BLUEPRINT.md Section 5 (`hero::burn` pseudocode)

---

## ADR-006 — Game Server làm Session Coordinator + Tx2 Builder

**Status:** ✅ ACCEPTED
**Level:** 🟠 REQUIRED
**Date:** 2026-03-26
**Source:** VHEATM Cycle #1, H-06 implication; object-game reference pattern
**Tags:** `architecture` `game-server` `ptb`

### Context

Architecture v1.0 không định nghĩa entity nào build và submit Tx2 settlement PTB sau khi Tx1 (loot) complete. Gap này khiến toàn bộ 2-Transaction flow không thể implement — không rõ ai orchestrate.

**Constraints:**
- Frontend không nên tự build Tx2 (security: player có thể tamper với PTB args)
- Cần một trusted entity build và sign Tx2 settlement
- Pattern phải buildable trong 4-6 giờ cho hackathon

### Options Considered

#### Option A: Game Server build Tx2, return bytes cho Frontend ← **CHOSEN**

| Pros | Cons |
|---|---|
| Trusted builder — Game Server kiểm soát battle logic | Game Server là single point of failure |
| Frontend chỉ co-sign + submit (không thể tamper args) | Cần maintain server 24/7 (Render/Railway free tier OK cho MVP) |
| Reference pattern từ object-chain game implementations dùng đúng pattern này | - |

#### Option B: Frontend tự build Tx2

| Pros | Cons |
|---|---|
| Không cần Game Server | Player có thể tamper heroId, sessionId args |
| - | Security vulnerability |

**Loại vì:** Security — player không được phép tự build settlement logic.

#### Option C: Smart contract tự trigger Tx2 (on-chain automation)

**Loại vì:** runtime không có on-chain scheduler (cron). Không khả thi trong MVP timeframe.

### Decision

> **Chọn Option A vì:** Là pattern chuẩn cho game có server-side authority trên object-chain. Buildable ~30 lines trong hackathon timeframe.

### Consequences

**Tích cực:**
- Clear security model: Game Server là oracle signer cho battle result
- Frontend role: UX + co-sign + submit (không có game logic)

**Flow (chi tiết):**
```
Player → Frontend → POST /api/session/create { heroId, missionType }
                          ↓
                     Game Server:
                     1. Create MissionSession owned by sponsor/server address
                     2. POST /api/session/loot { sessionId } → self-submit Tx1
                          ↓
                     Frontend:
                     3. POST /api/battle { sessionId }
                          ↓
                     Game Server:
                     4. Read session.player + session.hero_id từ chain
                     5. Build Tx2 settlement PTB bằng 1 call `mission::settle_and_distribute`
                     6. Return { txBytes (base64) }
                          ↓
                     Frontend:
                     7. POST /api/sponsor { txBytes } với bearer auth → sponsorSig
                     8. User zkSign → executeTransactionBlock([zkSig, sponsorSig])
```

**Xem thêm:** BLUEPRINT.md Section 5 (`/api/battle` pseudocode), CONTRACTS.md Section 4 (`POST /api/battle` contract)

---

## ADR-007 — zk Proof Login dùng Hosted Prover — Không self-host Docker

**Status:** ✅ ACCEPTED
**Level:** 🔴 MANDATORY (MVP only)
**Date:** 2026-03-26
**Source:** VHEATM Cycle #2, Simulation E-05
**Tags:** `auth` `zklogin` `devops`

### Context

Google + zk proof login yêu cầu ZK proving service để generate proof từ Google JWT. Có hai options: self-host Docker container hoặc dùng hosted prover.

**Constraints:**
- Hackathon timeline: 4-5 ngày — không có thời gian cho Docker DevOps
- Hosted prover: free cho devnet/testnet
- Security trade-off: hosted prover = trust provider uptime (acceptable cho hackathon demo)

### Options Considered

#### Option A: Hosted Prover (`prover-dev.mystenlabs.com`) ← **CHOSEN**

| Pros | Cons |
|---|---|
| Free cho devnet/testnet | Phụ thuộc vào prover provider uptime |
| Zero setup — 1 URL | Salt ở localStorage → security trade-off |
| 2-5s latency bình thường | Production cần migrate sang OneID production prover |

#### Option B: Self-hosted Docker ZK Prover

| Pros | Cons |
|---|---|
| Full control | ~2 ngày setup + configure |
| Production-grade | Ngoài scope hackathon hoàn toàn |

**Loại vì:** 2 ngày setup là không feasible trong 4-5 ngày hackathon.

### Decision

> **Chọn Option A vì:** Free, zero setup, sufficient cho hackathon demo. Salt ở localStorage là security trade-off được chấp nhận cho MVP (production: server-side salt với OneID).

### Consequences

**Tích cực:**
- Google + zk proof login hoạt động trong < 1 giờ implement (WOW #1 deliverable)

**Trade-offs:**
- localStorage salt: nếu user clear localStorage → mất on-chain address liên kết với Google account — sẽ revisit Phase 2 với server-side salt

**Applies:** MVP only. Target: OneID production auth system.

**Xem thêm:** BLUEPRINT.md Section 5 (`startLogin`, `completeLogin` pseudocode), CONTRACTS.md Section 6 (External Contracts: ZK Prover)

---

## ADR-008 — Self-managed Sponsor Wallet — Không cần 3rd party cho MVP

**Status:** ✅ ACCEPTED
**Level:** 🔴 MANDATORY (MVP only)
**Date:** 2026-03-26
**Source:** VHEATM Cycle #2, Simulation E-06
**Tags:** `gasless` `sponsorship` `devops`

### Context

Gasless transaction (WOW #2) cần sponsored transaction relayer. Cần minimal viable pattern không phụ thuộc 3rd party API trong hackathon timeframe.

**Constraints:**
- Pattern phải buildable trong 4-6 giờ
- Không cần external API keys (risk: setup delay hoặc billing)
- Rate limiting để bảo vệ sponsor wallet

### Options Considered

#### Option A: Self-managed Express endpoint + faucet-funded keypair ← **CHOSEN**

| Pros | Cons |
|---|---|
| ~30 lines code, buildable trong 4-6 giờ | Wallet có thể hết SUI nếu quá nhiều requests |
| Zero external dependency | In-memory rate limit reset khi server restart |
| Full control | Production không scale |

#### Option B: Shinami Gas Station

| Pros | Cons |
|---|---|
| Production SLA | Cần API key setup + billing |
| Reliable | Setup overhead trong hackathon |

**Loại vì:** Setup overhead không worth it cho hackathon. Shinami là Target option.

#### Option C: User tự hold SUI cho gas

**Loại vì:** Phá vỡ "ZERO gas popup" narrative — WOW #2 không còn WOW.

### Decision

> **Chọn Option A vì:** Minimal viable, zero dependency, delivers WOW #2. Rate limit 10 tx/user/day đủ để bảo vệ wallet trong demo context.

### Consequences

**Tích cực:**
- WOW #2 achievable trong ngày 2

**Rủi ro:**
- Sponsor wallet hết native gas token → mitigate bằng: check balance trước demo, có faucet hoặc funded backup sẵn sàng

**Applies:** MVP only. Target: Shinami Gas Station production SLA.

**Security hardening đã áp dụng trong implementation hiện tại:**
- `/api/sponsor`, `/api/session/*`, `/api/battle` đều yêu cầu bearer auth phát từ `/api/auth/complete`
- Sponsor endpoint verify lại `sender` từ transaction bytes, bắt buộc `gasOwner == SPONSOR_ADDRESS`, và chỉ allowlist một tập MoveCall nhỏ
- CORS không còn mở toàn phần; dùng allowlist origin qua env `ALLOWED_ORIGINS`

**Xem thêm:** BLUEPRINT.md Section 5 (`/api/sponsor` pseudocode), CONTRACTS.md `SPONSOR_RATE_LIMIT_PER_DAY`

---

## ADR-009 — Feature Budget: 4 Move Modules + 4 Frontend Screens — Không hơn

**Status:** ✅ ACCEPTED
**Level:** 🔴 MANDATORY (MVP only)
**Date:** 2026-03-26
**Source:** VHEATM Cycle #2, Simulation E-08
**Tags:** `scope` `mvp` `prioritization`

### Context

MVP scope v1.0 gồm 7+ Move modules, OneDEX integration, OneRWA tokenization, OnePredict AI, guild system — quá lớn cho 4-5 ngày. Nếu build tất cả → tất cả đều shallow và buggy → không impress judges.

**Constraints:**
- 4-5 ngày hackathon với team 4 người
- Judges thích 3 features polished hơn 7 features broken
- Economy features (OneDEX, OneRWA, OnePredict) có Impact/Effort ROI thấp trong MVP

### Options Considered

#### Option A: Feature budget — 4 modules + 3 endpoints + 4 screens ← **CHOSEN**

| Pros | Cons |
|---|---|
| Deliverable trong 4-5 ngày | Economy features bị cắt khỏi demo |
| Mỗi feature polished | - |
| 3 WOW moments clear và achievable | - |

#### Option B: Build tất cả 7+ features như v1.0 spec

| Pros | Cons |
|---|---|
| Pitch deck đầy hơn | Không feature nào hoàn chỉnh |
| - | Risk: demo fail vì code chưa ổn |

**Loại vì:** Depth > Breadth. Judges technical — họ sẽ notice bugs.

### Decision

> **Chọn Option A vì:** Impact/Effort analysis — OneDEX=0.75, OneRWA=0.75, OnePredict=0.50 ROI score quá thấp cho hackathon timeline. Polish 3 WOW moments > nhiều features broken.

### Consequences

**Tích cực:**
- 3 WOW moments deliverable và polished
- Team không bị overwhelmed

**Economy features bị cắt (mention trong pitch như "Phase 2 — already designed"):**
- OneDEX integration
- OneRWA tokenization
- OnePredict AI Mentor (real) → mock version (ADR-011)
- Guild co-op system

**Applies:** MVP only. Target: Phase 2-3 roadmap.

---

## ADR-010 — Deterministic Battle Resolution — Không dùng `Random` trong Tx2

**Status:** ✅ ACCEPTED
**Level:** 🟠 REQUIRED
**Date:** 2026-03-26
**Source:** VHEATM Cycle #2, Simulation E-07
**Tags:** `battle` `randomness` `ptb`

### Context

Tx2 settlement PTB không thể dùng `Random` input (ADR-002). Battle resolution cần algorithm đủ thú vị (không predictable) nhưng pure deterministic để có thể là `public fun` và chạy trong PTB.

**Constraints:**
- Không dùng `Random` trong Tx2 (ADR-002 prohibits)
- Không dùng off-chain data từ Game Server (trust assumption)
- Variance phải không predictable từ user, không manipulable

### Options Considered

#### Option A: Hero stats + clock timestamp + session object ID ← **CHOSEN**

| Pros | Cons |
|---|---|
| Pure on-chain — không trust assumption | Clock timestamp có thể bị observe (nhưng không manipulable trước tx) |
| `public fun` — chạy trong PTB | Variance nhỏ (±10 power range) |
| Seed từ `timestamp % 20` — đủ unpredictable | - |

#### Option B: Off-chain battle compute (Game Server)

| Pros | Cons |
|---|---|
| Unlimited complexity | Game Server có thể cheat |
| - | Requires oracle trust |

**Loại vì:** Trust assumption không acceptable cho on-chain game.

#### Option C: `Random` trong Tx2

**Loại vì:** ADR-002 — protocol từ chối.

### Decision

> **Chọn Option A vì:** Pure on-chain, no trust assumption, runs in PTB. Variance đủ để không trivially predictable. Target có thể upgrade lên verifiable oracle khi guild co-op pattern mature.

### Battle formula:
```
boss_power   = get_boss_power(mission_type, contract_type)
stance_bonus = get_stance_bonus(mission_type, stance)
win = (hero_power + stance_bonus) > boss_power
```

### Consequences

**Tích cực:**
- Transparent + verifiable on-chain
- No oracle dependency

**Trade-offs:**
- Depth combat hiện phụ thuộc nhiều vào build + stance + contract selection hơn là reactive choices giữa trận.

**Xem thêm:** BLUEPRINT.md current snapshot, CONTRACTS.md current snapshot

---

## ADR-011 — Mock AI Mentor cho MVP — Rule-based, không cần LLM call

**Status:** ✅ ACCEPTED
**Level:** 🟡 RECOMMENDED (MVP only)
**Date:** 2026-03-26
**Source:** VHEATM Cycle #2, Simulation E-08
**Tags:** `ai-mentor` `mvp` `onepredict`

### Context

OnePredict AI API không available cho hackathon testing. Real LLM call = latency + API key setup + cost — không worth it cho MVP.

**Constraints:**
- AI Mentor cần return hint trong < 100ms (UX requirement)
- OnePredict API không có sẵn để test trên devnet
- Pitch narrative: "AI Mentor powered by OnePredict" → Phase 2

### Options Considered

#### Option A: Rule-based hints từ hero stats (mock) ← **CHOSEN**

| Pros | Cons |
|---|---|
| Instant response (sync computation) | Hints ít dynamic hơn LLM |
| Zero external dependency | - |
| Impact=3, Effort=2 — good ROI | - |

#### Option B: Real LLM API call (OpenAI/Claude)

| Pros | Cons |
|---|---|
| Better hints | Latency 1-3s |
| - | API key setup + billing |
| - | Không phải OnePredict — khác narrative |

**Loại vì:** Latency + setup overhead không worth it. Impact/Effort kém hơn mock.

### Decision

> **Chọn Option A vì:** Delivers "AI Mentor" UX tốt đủ cho demo. Pitch: "powered by OnePredict — Phase 2 connects to full model." Judges hiểu — họ không expect production AI trong hackathon.

### Hint logic:
```
readiness = min(100, round((heroPower / 50) * 100))
nếu readiness >= 70 → recommend Raid
nếu readiness >= 40 → recommend Harvest
nếu readiness < 40  → recommend Training hoặc equip trước
```

### Consequences

**Tích cực:**
- AI Mentor feature deliverable trong < 30 phút
- Pitch narrative "OnePredict integration — Phase 2" credible

**Applies:** MVP only. Target: OnePredict API với real AI analysis.

---

## ADR-012 — Reward Model Shift sang Materials + Crafting

**Status:** ✅ ACCEPTED
**Level:** 🟠 REQUIRED
**Date:** 2026-03-26

Quest thắng không còn mặc định mint gear trực tiếp. Loop hiện tại ưu tiên `materials -> salvage -> craft`, chỉ giữ direct gear ở một phần reward table để bảo toàn cảm giác high-roll.

**Decision:** economy của OneRealm phải có sinks và player decisions, không chỉ inflation của equipment rác.

---

## ADR-013 — Mission Families + Contract Types

**Status:** ✅ ACCEPTED
**Level:** 🟠 REQUIRED
**Date:** 2026-03-26

`MissionType` hiện là `Raid / Harvest / Training`, và `ContractType` hiện là `Standard / Bounty / Expedition`.

**Decision:**
- Mission family quyết định reward mix và build affinity.
- Contract type quyết định difficulty, payout curve, và với `Expedition` còn quyết định delayed resolution qua `Clock`.

---

## ADR-014 — Hero Archetype + Profession Progression

**Status:** ✅ ACCEPTED
**Level:** 🟠 REQUIRED
**Date:** 2026-03-26

Hero cần có identity nhiều trục:
- `archetype` cho combat affinity
- `profession` cho economy specialization
- `profession_xp` cho long-term progression

**Decision:** progression dài hạn sẽ bám vào profession rank trước, không bám vào token hay DeFi layer.

---

## ADR-015 — Blacksmith Tech Tree theo Profession Rank

**Status:** ✅ ACCEPTED
**Level:** 🟠 REQUIRED
**Date:** 2026-03-26

Blacksmith recipes không còn là flat list.

**Decision:**
- base recipes: ai cũng craft được
- profession recipes: cần đúng nghề + rank `Adept`
- master recipes: cần đúng nghề + rank `Master`

Điều này tạo ra `why keep playing` rõ ràng cho profession loop: thắng quest để lên rank, rồi unlock craft tier mới.

---

## Weight Decay Tracker

*Tất cả ADRs từ Cycle #1 + #2 — weight = 1.0 tại thời điểm accept*

| ADR | Level | Weight | λ | Next Cycle (Cycle #3) | Applies |
|---|---|---|---|---|---|
| ADR-001 | 🔴 | 1.00 | 0.15 | → 0.85 | MVP + Target |
| ADR-002 | 🔴 | 1.00 | 0.15 | → 0.85 | MVP + Target |
| ADR-003 | 🔴 | 1.00 | 0.15 | → 0.85 | MVP + Target |
| ADR-004 | 🟠 | 1.00 | 0.20 | → 0.80 | Target (MVP simplified) |
| ADR-005 | 🟠 | 1.00 | 0.20 | → 0.80 | MVP + Target |
| ADR-006 | 🟠 | 1.00 | 0.20 | → 0.80 | MVP + Target |
| ADR-007 | 🔴 | 1.00 | 0.25 | → 0.75 | MVP only |
| ADR-008 | 🔴 | 1.00 | 0.25 | → 0.75 | MVP only |
| ADR-009 | 🔴 | 1.00 | 0.25 | → 0.75 | MVP only |
| ADR-010 | 🟠 | 1.00 | 0.20 | → 0.80 | MVP + Target |
| ADR-011 | 🟡 | 1.00 | 0.25 | → 0.75 | MVP only |
| ADR-012 | 🟠 | 1.00 | 0.20 | → 0.80 | MVP + Target |
| ADR-013 | 🟠 | 1.00 | 0.20 | → 0.80 | MVP + Target |
| ADR-014 | 🟠 | 1.00 | 0.20 | → 0.80 | MVP + Target |
| ADR-015 | 🟠 | 1.00 | 0.20 | → 0.80 | MVP + Target |

---

## Superseded Decisions từ v1.0

| Quyết định cũ (v1.0) | Superseded by | Lý do |
|---|---|---|
| "1 PTB = full session" | ADR-002 | protocol reject PTB với Random + chain |
| `object::DynamicFields<T>` như struct field | ADR-001 | Không tồn tại trong OneChain Move |
| `signer` parameter trong Move functions | ADR-001 | Aptos pattern — runtime này dùng `TxContext` |
| `OneID::UserID` type trong Move | ADR-003 | Không compile — dùng `address` |
| `transfer::share_object(session)` | ADR-004 | Consensus bottleneck |
| Build OneDEX + OneRWA + OnePredict trong MVP | ADR-009 | ROI quá thấp cho 4-5 ngày |

---

## Index

| ADR | Title | Level | Status | Tags |
|---|---|---|---|---|
| ADR-001 | OneChain Move Syntax | 🔴 | ✅ | `move` `syntax` |
| ADR-002 | 2-Transaction Session Pattern | 🔴 | ✅ | `randomness` `PTB` |
| ADR-003 | `address` on-chain | 🔴 | ✅ | `identity` `oneid` |
| ADR-004 | MissionSession Owned Object | 🟠 | ✅ | `object-model` `performance` |
| ADR-005 | Unequip-All Guard | 🟠 | ✅ | `lifecycle` `DOF` |
| ADR-006 | Game Server = Coordinator + Tx2 Builder | 🟠 | ✅ | `architecture` `PTB` |
| ADR-007 | Hosted Prover for zk Proof Login | 🔴 | ✅ | `auth` `MVP` |
| ADR-008 | Self-managed Sponsor Wallet | 🔴 | ✅ | `gasless` `MVP` |
| ADR-009 | Feature Budget 4+4+3 | 🔴 | ✅ | `scope` `MVP` |
| ADR-010 | Deterministic Battle | 🟠 | ✅ | `battle` `randomness` |
| ADR-011 | Mock AI Mentor | 🟡 | ✅ | `ai` `MVP` |
| ADR-012 | Materials + Crafting Reward Model | 🟠 | ✅ | `economy` `crafting` |
| ADR-013 | Mission Families + Contract Types | 🟠 | ✅ | `gameplay` `contracts` |
| ADR-014 | Archetype + Profession Progression | 🟠 | ✅ | `identity` `progression` |
| ADR-015 | Blacksmith Tech Tree | 🟠 | ✅ | `crafting` `unlock` |
