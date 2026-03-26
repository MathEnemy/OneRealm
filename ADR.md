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
- [ADR-001](#adr-001----sui-move-syntax--không-dùng-aptos-move) 🔴
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

## ADR-001 — Sui Move Syntax — Không dùng Aptos Move

**Status:** ✅ ACCEPTED
**Level:** 🔴 MANDATORY
**Date:** 2026-03-26
**Source:** VHEATM Cycle #1, Simulation E-02
**Tags:** `move` `syntax` `compilation`

### Context

Tech Spec v1.0 dùng Aptos Move syntax: `signer` parameter, `object::ID` (không phải `UID`), `object::DynamicFields<T>` như struct field. Tất cả những syntax này compile fail 100% trên Sui Move VM — hai ngôn ngữ tuy cùng tên "Move" nhưng có type system và runtime khác nhau.

**Constraints:**
- Project build trên OneChain (Sui-based) — phải dùng Sui Move, không phải Aptos Move
- Mọi Move code phải pass `sui move build` trước khi có thể test hoặc deploy

### Options Considered

#### Option A: Rewrite toàn bộ sang Sui Move syntax ← **CHOSEN**

| Pros | Cons |
|---|---|
| Compile và run được | Cần rewrite hoàn toàn v1.0 code |
| Consistent với Sui official docs và examples | - |
| `UID`, `TxContext`, `dof::add` — đúng API | - |

#### Option B: Giữ Aptos syntax, dùng Aptos chain thay vì Sui-based

| Pros | Cons |
|---|---|
| Không cần rewrite | OneChain là Sui-based — không thể dùng Aptos chain |
| - | Phá vỡ toàn bộ integration với Sui SDK, zkLogin, Mysticeti |

**Loại vì:** OneChain là Sui-based — bắt buộc dùng Sui Move.

### Decision

> **Chọn Option A vì:** OneChain chạy Sui VM. Aptos Move và Sui Move có syntax khác nhau đủ để không thể cross-compile. Không có lựa chọn nào khác.

### Consequences

**Tích cực:**
- Code compile và deploy được
- Có thể reference Sui official docs, examples, và Blackjack-Sui reference implementation

**Tiêu cực / Trade-offs:**
- Phải rewrite toàn bộ v1.0 Move code — sẽ revisit nếu có breaking changes trong Sui Move

**Key syntax changes áp dụng:**

```
Aptos                          → Sui Move
──────────────────────────────────────────
signer                         → &mut TxContext
object::ID                     → sui::object::UID
object::DynamicFields<T>       → sui::dynamic_object_field as dof
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

Architecture v1.0 spec "1 PTB = full session": generate loot + battle resolve + reward distribute trong một transaction. Không thể implement vì Sui protocol có security constraint về `Random` input.

**Constraints:**
- Sui protocol reject PTB có bất kỳ lệnh non-transfer nào sau `MoveCall` dùng `Random` làm input
- Đây là intentional Sui design để prevent front-running attacks
- Loot generation phải dùng `sui::random::Random` để unmanipulable

### Options Considered

#### Option A: 2-phase — Tx1 (loot commit) + Tx2 (settlement PTB) ← **CHOSEN**

| Pros | Cons |
|---|---|
| Sui protocol chấp nhận | Cần 2 round-trips thay vì 1 |
| Loot committed on-chain trước settlement — minh bạch hơn | Frontend phải wait Tx1 confirm rồi mới build Tx2 |
| Settlement (Tx2) vẫn là 1 atomic PTB | Game Server cần thêm logic build Tx2 |

#### Option B: Single PTB với randomness

**Loại vì:** Sui protocol từ chối ở validation stage — không thể ship.

#### Option C: Off-chain randomness (Game Server seeded)

| Pros | Cons |
|---|---|
| Đơn giản, 1 transaction | Centralised — Game Server có thể cheat |
| - | Không dùng Sui native randomness — mất điểm kỹ thuật với judges |

**Loại vì:** Undermines "unmanipulable loot" narrative — core selling point của game.

### Decision

> **Chọn Option A vì:** Là lựa chọn duy nhất thỏa mãn cả Sui protocol constraint lẫn on-chain randomness requirement. Pattern còn mang lại UX benefit: player thấy loot committed trước khi settle — transparent hơn.

### Consequences

**Tích cực:**
- Loot unmanipulable (Sui native randomness)
- Settlement atomic (1 PTB với 4 ops)
- Pitch narrative: "commit bằng native randomness → settle atomic" — technically impressive

**Tiêu cực / Trade-offs:**
- 2 transaction confirmations thay vì 1 — ~6s total thay vì ~3s — chấp nhận được
- Frontend phức tạp hơn (phải poll/wait Tx1 rồi mới trigger Tx2)

**CRITICAL Implementation Note:**
`generate_loot` PHẢI là `entry fun` (không phải `public fun`).
`entry fun` không thể gọi từ PTB — Frontend phải submit Tx1 riêng biệt.
Sau khi Tx1 confirm → lấy sessionId từ events → build Tx2.

**Xem thêm:** BLUEPRINT.md Section 3 (Happy Path data flow), Section 5 (loot.move spec)

---

## ADR-003 — `address` on-chain — Không dùng `OneID::UserID` type

**Status:** ✅ ACCEPTED
**Level:** 🔴 MANDATORY
**Date:** 2026-03-26
**Source:** VHEATM Cycle #1, Simulation E-02
**Tags:** `identity` `move` `oneid`

### Context

Tech Spec v1.0 dùng `OneID::UserID` như Move type trong struct definitions và function signatures. Type này không tồn tại trong Sui Move framework — compile error.

**Constraints:**
- Move contracts cần identifier cho player/owner
- OneID là SDK/OAuth layer — không phải Move module
- Move chỉ có primitives + Sui system types

### Options Considered

#### Option A: Dùng `address` on-chain, OneID binding off-chain ← **CHOSEN**

| Pros | Cons |
|---|---|
| Native Sui type — compile và chạy được | OneID ↔ address mapping phải manage off-chain |
| Zero dependency vào OneID module | - |
| zkLogin naturally produces Sui `address` | - |

#### Option B: Tạo `OneID` wrapper module trong Move

**Loại vì:** Over-engineering — OneID binding không cần on-chain. Off-chain DB/session đủ cho MVP.

### Decision

> **Chọn Option A vì:** `address` là Sui primitive type. zkLogin tự nhiên produce Sui `address`. Không có lý do kỹ thuật nào để wrap thêm layer on-chain.

### Consequences

**Tích cực:**
- Code compile
- zkLogin integration seamless (zkLogin trả về `address`)

**Implementation Notes:**
- Move code: chỉ dùng `address` cho owner/player fields
- Off-chain: Game Server lưu mapping `{ google_sub → sui_address }` trong session
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
| Consistent với Sui best practices cho session state | - |

#### Option B: Shared object (`transfer::share_object`)

| Pros | Cons |
|---|---|
| Bất kỳ address nào cũng có thể mutate | Mysticeti consensus required mỗi mutation |
| - | Bottleneck khi nhiều sessions chạy đồng thời |
| - | Phá vỡ "parallel execution" narrative trong pitch |

**Loại vì:** Consensus bottleneck + phá narrative.

### Decision

> **Chọn Option A vì:** Chỉ Game Server cần mutate MissionSession. Owned object = zero consensus = parallel execution. Đây là Sui best practice cho session/game state.

### Consequences

**Tích cực:**
- Sub-second latency cho mọi session mutations
- Unlimited parallel sessions không block nhau

**Trade-offs:**
- Frontend phải query session status qua Game Server API, không trực tiếp từ RPC — chấp nhận được vì Game Server là orchestrator anyway

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

Khi player muốn burn/upgrade Hero, phải delete UID. Sui `object::delete()` không tự động xóa Dynamic Object Fields — chúng trở thành orphaned objects: tồn tại mãi mãi trên chain nhưng không có owner, không accessible, không refundable.

**Constraints:**
- Sui runtime: `object::delete(uid)` chỉ delete UID, không touch DOF
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
**Source:** VHEATM Cycle #1, H-06 implication; Blackjack-Sui reference
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
| Reference: MystenLabs Blackjack-Sui dùng đúng pattern này | - |

#### Option B: Frontend tự build Tx2

| Pros | Cons |
|---|---|
| Không cần Game Server | Player có thể tamper heroId, sessionId args |
| - | Security vulnerability |

**Loại vì:** Security — player không được phép tự build settlement logic.

#### Option C: Smart contract tự trigger Tx2 (on-chain automation)

**Loại vì:** Sui không có on-chain scheduler (cron). Không khả thi trong MVP timeframe.

### Decision

> **Chọn Option A vì:** Là pattern chuẩn cho game có server-side authority. Blackjack-Sui reference implementation dùng đúng pattern này. Buildable ~30 lines trong hackathon timeframe.

### Consequences

**Tích cực:**
- Clear security model: Game Server là oracle signer cho battle result
- Frontend role: UX + co-sign + submit (không có game logic)

**Flow (chi tiết):**
```
Player → Frontend → POST /api/battle { heroId, sessionId }
                          ↓
                     Game Server:
                     1. Query hero stats + loot từ chain
                     2. Build Tx2 settlement PTB (3 MoveCall ops)
                     3. Return { txBytes (base64) }
                          ↓
                     Frontend:
                     4. POST /api/sponsor { txBytes } → sponsorSig
                     5. User zkSign → executeTransactionBlock([zkSig, sponsorSig])
```

**Xem thêm:** BLUEPRINT.md Section 5 (`/api/battle` pseudocode), CONTRACTS.md Section 4 (`POST /api/battle` contract)

---

## ADR-007 — zkLogin dùng Mysten Hosted Prover — Không self-host Docker

**Status:** ✅ ACCEPTED
**Level:** 🔴 MANDATORY (MVP only)
**Date:** 2026-03-26
**Source:** VHEATM Cycle #2, Simulation E-05
**Tags:** `auth` `zklogin` `devops`

### Context

zkLogin yêu cầu ZK proving service để generate proof từ Google JWT. Có hai options: self-host Docker container hoặc dùng Mysten hosted prover.

**Constraints:**
- Hackathon timeline: 4-5 ngày — không có thời gian cho Docker DevOps
- Mysten hosted prover: free cho devnet/testnet
- Security trade-off: hosted prover = trust Mysten Labs (acceptable cho hackathon demo)

### Options Considered

#### Option A: Mysten Hosted Prover (`prover-dev.mystenlabs.com`) ← **CHOSEN**

| Pros | Cons |
|---|---|
| Free cho devnet/testnet | Phụ thuộc vào Mysten Labs uptime |
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
- zkLogin hoạt động trong < 1 giờ implement (WOW #1 deliverable)

**Trade-offs:**
- localStorage salt: nếu user clear localStorage → mất Sui address liên kết với Google account — sẽ revisit Phase 2 với server-side salt

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
- Sponsor wallet hết SUI → mitigate bằng: check balance trước demo, có `sui client faucet` sẵn sàng

**Applies:** MVP only. Target: Shinami Gas Station production SLA.

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

## ADR-010 — Deterministic Battle Resolution — Không dùng `sui::random` trong Tx2

**Status:** ✅ ACCEPTED
**Level:** 🟠 REQUIRED
**Date:** 2026-03-26
**Source:** VHEATM Cycle #2, Simulation E-07
**Tags:** `battle` `randomness` `ptb`

### Context

Tx2 settlement PTB không thể dùng `Random` input (ADR-002). Battle resolution cần algorithm đủ thú vị (không predictable) nhưng pure deterministic để có thể là `public fun` và chạy trong PTB.

**Constraints:**
- Không dùng `sui::random` trong Tx2 (ADR-002 prohibits)
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

#### Option C: `sui::random` trong Tx2

**Loại vì:** ADR-002 — Sui protocol từ chối.

### Decision

> **Chọn Option A vì:** Pure on-chain, no trust assumption, runs in PTB. Variance đủ để không trivially predictable. Target có thể upgrade lên verifiable oracle khi guild co-op pattern mature.

### Battle formula:
```
seed = clock::timestamp_ms(clock) % BATTLE_SEED_MOD  // 0-19
win  = (hero_power + seed) > boss_power
```

### Consequences

**Tích cực:**
- Transparent + verifiable on-chain
- No oracle dependency

**Trade-offs:**
- Deterministic nếu timestamp biết trước: chấp nhận cho MVP. Target upgrade: VRF oracle.

**Xem thêm:** BLUEPRINT.md Section 5 (`mission::settle` pseudocode), CONTRACTS.md `BATTLE_SEED_MOD`

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
nếu readiness >= 70 → "ready for Forest Quest"
nếu readiness < 70  → suggest equip missing slots
```

### Consequences

**Tích cực:**
- AI Mentor feature deliverable trong < 30 phút
- Pitch narrative "OnePredict integration — Phase 2" credible

**Applies:** MVP only. Target: OnePredict API với real AI analysis.

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

---

## Superseded Decisions từ v1.0

| Quyết định cũ (v1.0) | Superseded by | Lý do |
|---|---|---|
| "1 PTB = full session" | ADR-002 | Sui protocol reject PTB với Random + chain |
| `object::DynamicFields<T>` như struct field | ADR-001 | Không tồn tại trong Sui Move |
| `signer` parameter trong Move functions | ADR-001 | Aptos pattern — Sui dùng `TxContext` |
| `OneID::UserID` type trong Move | ADR-003 | Không compile — dùng `address` |
| `transfer::share_object(session)` | ADR-004 | Consensus bottleneck |
| Build OneDEX + OneRWA + OnePredict trong MVP | ADR-009 | ROI quá thấp cho 4-5 ngày |

---

## Index

| ADR | Title | Level | Status | Tags |
|---|---|---|---|---|
| ADR-001 | Sui Move Syntax | 🔴 | ✅ | `move` `syntax` |
| ADR-002 | 2-Transaction Session Pattern | 🔴 | ✅ | `randomness` `PTB` |
| ADR-003 | `address` on-chain | 🔴 | ✅ | `identity` `oneid` |
| ADR-004 | MissionSession Owned Object | 🟠 | ✅ | `object-model` `performance` |
| ADR-005 | Unequip-All Guard | 🟠 | ✅ | `lifecycle` `DOF` |
| ADR-006 | Game Server = Coordinator + Tx2 Builder | 🟠 | ✅ | `architecture` `PTB` |
| ADR-007 | zkLogin Hosted Prover | 🔴 | ✅ | `auth` `MVP` |
| ADR-008 | Self-managed Sponsor Wallet | 🔴 | ✅ | `gasless` `MVP` |
| ADR-009 | Feature Budget 4+4+3 | 🔴 | ✅ | `scope` `MVP` |
| ADR-010 | Deterministic Battle | 🟠 | ✅ | `battle` `randomness` |
| ADR-011 | Mock AI Mentor | 🟡 | ✅ | `ai` `MVP` |
