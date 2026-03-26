# BLUEPRINT.md — Behavior Specification
### OneRealm · v2.0

> **Mục đích file này:** Mô tả hệ thống *hoạt động như thế nào* — không phải *trông như thế nào*.
> Schemas đã có trong CONTRACTS.md — file này chỉ **reference**, không redefine.
>
> Agent đọc file này: hiểu đủ để implement mà không cần hỏi thêm bất kỳ câu nào.
> Source: VHEATM Audit Cycle #1 & #2.

---

## Mục lục

1. [System Overview](#1-system-overview)
2. [Component Registry](#2-component-registry)
3. [Data Flow](#3-data-flow)
4. [State Machine](#4-state-machine)
5. [Component Specifications](#5-component-specifications)
6. [Integration Points](#6-integration-points)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Scaffolding & Build Order](#8-scaffolding--build-order)

---

## 1. SYSTEM OVERVIEW

OneRealm là một *on-chain guild economy runtime* — game infrastructure cho phép plug thêm game modes sau hackathon. Được thiết kế với **2 tracks song song**: Hackathon MVP (4-5 ngày) và Target Architecture (3-6 tháng post-hack).

**File này chỉ spec MVP track** trừ khi có ghi chú `[TARGET]`.

```
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 3 — ECONOMY LAYER [TARGET]                                │
│  OneDEX · OneRWA · OnePredict · Gas Treasury                    │
├──────────────────────────────────────────────────────────────────┤
│  LAYER 2 — OWNERSHIP LAYER [MVP + TARGET]                        │
│  Hero Object · Nested Equipment (DOF) · Escrow · Locked<T>      │
├──────────────────────────────────────────────────────────────────┤
│  LAYER 1 — GAME LOOP LAYER [MVP: solo / TARGET: co-op guild]    │
│  Quest Session · Loot (Randomness) · Battle · Reward Distribute  │
└──────────────────────────────────────────────────────────────────┘
         ↑ Nền tảng: PTB + Sponsored Tx + Mysticeti + Sui Move
```

**MVP System Context (C4 Level 1):**

```
[Player]  ──Google OAuth──►  [Frontend React]  ──zkLogin──►  [Sui Address]
[Player]  ──Quest action──►  [Frontend React]  ──GaslessData─► [Game Server]
                                                               ──Sponsor sig─►
                                                [Game Server]  ──Tx1 + Tx2──► [OneChain]
[Player]  ◄──UI update────   [Frontend React]  ◄──Events────   [OneChain RPC]
```

**Luồng chính một câu:** Player đăng nhập bằng Google → chơi quest không cần gas → loot được commit on-chain bằng native randomness → settlement atomic trong 1 PTB → item về ví.

**Những gì hệ thống KHÔNG làm trong MVP:**
- OneDEX / OneRWA / OnePredict — xem ADR-009
- Guild co-op (multi-player) — Target only
- Hero leveling / rarity system — Target only
- Gem attachment (nested DOF) — Target only

---

## 2. COMPONENT REGISTRY

> Mỗi component có một nhiệm vụ duy nhất. Không overlap.

| Component | File/Module | Nhiệm vụ | Input | Output | Stateful? |
|---|---|---|---|---|---|
| **hero.move** | `contracts/sources/hero.move` | Quản lý Hero object và Equipment DOF | `Ref<Hero>`, `Ref<Equipment>` | `Ref<Hero>` mutated | CÓ (DOF state) |
| **equipment.move** | `contracts/sources/equipment.move` | Tạo và manage Equipment objects | params (type, power, rarity) | `Ref<Equipment>` | KHÔNG |
| **loot.move** | `contracts/sources/loot.move` | Tx1: Generate loot dùng Sui `Random` | `&Random`, `Ref<MissionSession>` | `Ref<MissionSession>` mutated | KHÔNG |
| **mission.move** | `contracts/sources/mission.move` | Session state machine + Tx2 settlement | `Ref<MissionSession>`, `hero_power`, `&Clock` | `vector<Equipment>` | CÓ (status transitions) |
| **Game Server** | `game-server/` | Sponsor relayer, Tx2 builder, AI hint mock | HTTP requests | HTTP responses + tx bytes | CÓ (rate limit counter) |
| **Frontend** | `frontend/` | zkLogin auth, 4 screens, gasless tx wrapper | User interactions | Sui transactions + UI state | CÓ (session storage) |

> **"Stateful"** = component giữ state giữa các invocations.
> Game Server rate limit counter: in-memory `Map<address, count>` cho MVP.

---

## 3. DATA FLOW

---

### Happy Path — Full Quest Session (2-Transaction Pattern)

```
[1] Player click "Start Quest" trên Frontend
      │ triggers: build Tx1
      ▼
[2] Game Server: tạo MissionSession
      │ input:  player address, hero_id, mission_type
      │ output: Ref<MissionSession> (owned by game_server_address)
      │ side effect: MissionSession on-chain với status=PENDING
      ▼
[3] Frontend: build + submit Tx1 (gasless)
      │ operation: entry loot::generate_loot(Random, MissionSession)
      │ → POST /api/sponsor → sponsor signature
      │ → suiClient.executeTransactionBlock([zkSig, sponsorSig])
      │ output: txHash_1, loot committed on-chain
      │ TERMINAL — không chain thêm gì
      ▼
[4] Frontend: hiển thị "Discovering loot..." progress bar
      │ đợi Tx1 confirmation
      ▼
[5] Frontend: POST /api/battle { sessionId, heroId, playerAddress }
      │ Game Server builds Tx2 PTB:
      │   [5.1] hero::total_power(heroId) → heroPower
      │   [5.2] mission::settle(sessionId, heroPower, clock="0x6") → rewards
      │   [5.3] mission::distribute(rewards, playerAddress)
      │ output: base64 txBytes
      ▼
[6] Frontend: sponsor + execute Tx2 (gasless)
      │ → POST /api/sponsor { txBytes }
      │ → suiClient.executeTransactionBlock([zkSig, sponsorSig])
      │ output: txHash_2, Equipment objects về ví player
      ▼
[7] Frontend: hiển thị Result screen
      │ Win: equipment preview, "View on Sui Explorer" link (WOW #3)
      │ Lose: "Hero not strong enough" + hint
      │ → navigate to Inventory screen
```

---

### Error Path — Tx1 Random Rejection

```
[3] Frontend: submit Tx1 với generate_loot
      │ Nếu loot.move là `public` thay vì `entry`:
      │   → Sui protocol reject tại validation stage
      │   → error: "PTBs that have commands after Random MoveCall"
      ▼
[3a] Frontend: catch tx error
      │ KHÔNG retry — đây là code bug, không phải network issue
      └─ Hiển thị error + alert team (ADR-002 violation)

// Prevention: generate_loot phải luôn là `entry` fun
```

---

### Error Path — Battle Fail (hero power insufficient)

```
[5.2] mission::settle: hero_power + seed <= boss_power
      │ action: session.status = STATUS_FAILED
      │ return: vector::empty()
      ▼
[5.3] mission::distribute: rewards là empty vector
      │ action: vector::destroy_empty(rewards)
      │ side effect: không có Equipment nào được transfer
      ▼
[6] Frontend: nhận tx success (tx không fail — settle succeeds, chỉ rewards là empty)
      │ detect: inventory không có item mới
      └─ hiển thị "Quest Failed" screen + AI hint "upgrade equipment first"
```

---

### Error Path — Sponsor Rate Limit

```
[3 or 6] Frontend: POST /api/sponsor
      │ response: HTTP 429 { error: "Rate limited" }
      ▼
[3a or 6a] Frontend: hiển thị "Daily quest limit reached (10/day)"
      └─ disable "Start Quest" button, show reset time (midnight)
```

---

### Edge Case — Hero has no equipment

```
[5.1] hero::total_power(heroId)
      │ SLOT_WEAPON: dof::exists_ == false → skip
      │ SLOT_ARMOR:  dof::exists_ == false → skip
      │ return: HERO_DEFAULT_BASE_POWER (= 10)
      ▼
[5.2] mission::settle: 10 + seed(0-19) = 10-29
      │ FOREST:  boss=20 → win nếu seed >= 10 (~50% chance)
      │ DUNGEON: boss=35 → luôn thua
      └─ Expected behavior — AI hint should suggest equip before dungeon
```

---

### Edge Case — burn Hero với equipment đang equipped

```
[hero::burn] caller triggers burn
      │ check SLOT_WEAPON: dof::exists_ == true
      │   → dof::remove → transfer Equipment về sender
      │ check SLOT_ARMOR: dof::exists_ == true
      │   → dof::remove → transfer Equipment về sender
      │ object::delete(hero.id)
      └─ Không có orphaned assets (ADR-005 compliant)
```

---

## 4. STATE MACHINE

> Source of truth cho MissionSession status transitions.
> Không implement transition nào không có trong diagram này.

```
STATES:
  PENDING    (0) — session vừa tạo, chờ Tx1 loot commit
  LOOT_DONE  (1) — Tx1 complete, loot_tiers/loot_types đã populated
  COMPLETE   (2) — Tx2 settle thành công, rewards distributed
  FAILED     (3) — Tx2 settle: hero power insufficient

TRANSITIONS:
  PENDING ──[loot::generate_loot]──► LOOT_DONE
             guard: session.status == PENDING
             action: push loot_tiers, push loot_types

  LOOT_DONE ──[mission::settle win]──► COMPLETE
               guard: session.status == LOOT_DONE && hero_power + seed > boss_power
               action: generate Equipment objects, set status=COMPLETE

  LOOT_DONE ──[mission::settle lose]──► FAILED
               guard: session.status == LOOT_DONE && hero_power + seed <= boss_power
               action: return empty rewards, set status=FAILED

INVARIANTS:
  - Không thể transition từ COMPLETE hoặc FAILED sang bất kỳ state nào
  - LOOT_DONE chỉ có thể đến từ PENDING
  - loot_tiers và loot_types luôn có cùng length
  - Chỉ Game Server address có thể pass MissionSession vào transactions
```

---

## 5. COMPONENT SPECIFICATIONS

---

### hero.move

**File:** `contracts/sources/hero.move`
**Dependencies:** `equipment.move` (borrow power getter), `sui::dynamic_object_field`, `sui::object`, `sui::transfer`, `sui::tx_context`
**Được gọi bởi:** Game Server (PTB builder), Frontend (entry functions)

#### Hàm: `mint()`

```
SIGNATURE:
  mint(name: vector<u8>, ctx: &mut TxContext) → Hero

PSEUDOCODE:
  1. Tạo Hero struct:
       Hero {
         id:         object::new(ctx),
         name:       name,
         level:      HERO_DEFAULT_LEVEL,
         base_power: HERO_DEFAULT_BASE_POWER,
         owner:      tx_context::sender(ctx),
       }
  2. return Hero

COMPLEXITY: O(1)
```

**Test cases:**
```
✅ Happy path: mint(b"Alice") → Hero với level=1, base_power=10
✅ Edge case:  name rỗng → vẫn tạo (validation ở frontend)
```

---

#### Hàm: `equip()`

```
SIGNATURE:
  equip(hero: &mut Hero, slot: vector<u8>, eq: Equipment)

PSEUDOCODE:
  1. Check slot chưa có equipment:
       nếu dof::exists_(&hero.id, slot) → abort(ESlotOccupied = 0)
  2. Attach equipment:
       dof::add(&mut hero.id, slot, eq)
  3. return (void)
```

**Test cases:**
```
✅ Happy path: equip weapon → dof exists
✅ Error:      equip weapon khi đã có weapon → abort(0)
✅ Edge case:  equip cả 2 slots → total_power tính đúng cả 2
```

---

#### Hàm: `unequip()`

```
SIGNATURE:
  unequip(hero: &mut Hero, slot: vector<u8>) → Equipment

PSEUDOCODE:
  1. Check slot có equipment:
       nếu !dof::exists_(&hero.id, slot) → abort(ESlotEmpty = 1)
  2. Remove và return equipment:
       dof::remove(&mut hero.id, slot)
```

---

#### Hàm: `total_power()`

```
SIGNATURE:
  total_power(hero: &Hero) → u64

PSEUDOCODE:
  1. power = hero.base_power
  2. Check SLOT_WEAPON:
       nếu dof::exists_(&hero.id, SLOT_WEAPON):
         weapon = dof::borrow<Equipment>(&hero.id, SLOT_WEAPON)
         power = power + equipment::power(weapon)
  3. Check SLOT_ARMOR:
       nếu dof::exists_(&hero.id, SLOT_ARMOR):
         armor = dof::borrow<Equipment>(&hero.id, SLOT_ARMOR)
         power = power + equipment::power(armor)
  4. return power

COMPLEXITY: O(1) — chỉ 2 slots cố định
```

---

#### Hàm: `burn()`

```
SIGNATURE:
  burn(hero: Hero, ctx: &mut TxContext)

PSEUDOCODE:
  1. sender = tx_context::sender(ctx)
  2. Unequip SLOT_WEAPON nếu tồn tại:
       nếu dof::exists_(&hero.id, SLOT_WEAPON):
         weapon = dof::remove<Equipment>(&mut hero.id, SLOT_WEAPON)
         transfer::public_transfer(weapon, sender)
  3. Unequip SLOT_ARMOR nếu tồn tại:
       nếu dof::exists_(&hero.id, SLOT_ARMOR):
         armor = dof::remove<Equipment>(&mut hero.id, SLOT_ARMOR)
         transfer::public_transfer(armor, sender)
  4. Destructure và delete:
       let Hero { id, .. } = hero
       object::delete(id)

CRITICAL: Bước 2+3 là BẮT BUỘC trước bước 4 — xem ADR-005
```

---

### equipment.move

**File:** `contracts/sources/equipment.move`
**Dependencies:** `sui::object`, `sui::dynamic_object_field` (Target only — cho gem)
**Được gọi bởi:** `mission.move` (trong settle), `hero.move` (borrow power getter)

#### Hàm: `create()`

```
SIGNATURE:
  create(
    eq_type: u8,
    name:    vector<u8>,
    power:   u64,
    rarity:  u8,
    ctx:     &mut TxContext
  ) → Equipment

PSEUDOCODE:
  1. return Equipment {
       id:      object::new(ctx),
       eq_type: eq_type,
       name:    name,
       power:   power,
       rarity:  rarity,
     }
```

#### Getters: `power()`, `eq_type()`, `rarity()`, `name()`

```
power(eq: &Equipment) → u64  { eq.power }
eq_type(eq: &Equipment) → u8 { eq.eq_type }
rarity(eq: &Equipment) → u8  { eq.rarity }
name(eq: &Equipment) → vector<u8> { eq.name }
```

---

### loot.move

**File:** `contracts/sources/loot.move`
**Dependencies:** `sui::random`, `mission.move` (add_loot)
**Được gọi bởi:** Frontend (submit Tx1 trực tiếp — KHÔNG qua PTB)

#### Hàm: `generate_loot()` — ⚠️ entry, Tx1 TERMINAL

```
SIGNATURE:
  entry fun generate_loot(
    r:       &Random,
    session: &mut MissionSession,
    ctx:     &mut TxContext
  )

PSEUDOCODE:
  1. Khởi tạo random generator:
       gen = sui::random::new_generator(r, ctx)

  2. Determine loot count (1-3):
       loot_count = generate_u8_in_range(&mut gen, 1, 3)

  3. For i in 0..loot_count:
       a. Roll loot tier:
            roll = generate_u8_in_range(&mut gen, 0, 99)
            tier = if roll < 60 → 0 (COMMON)
                   elif roll < 90 → 1 (RARE)
                   else → 2 (LEGENDARY)

       b. Roll loot type:
            loot_type = generate_u8_in_range(&mut gen, 0, 1)

       c. Commit:
            mission::add_loot(session, tier, loot_type)

  // FUNCTION ENDS HERE — KHÔNG THÊM LỆNH NÀO NỮA (ADR-002)
```

**CRITICAL:** Function này là `entry`, không phải `public`. Caller (Frontend) submit Tx1 riêng biệt. Sau khi confirm Tx1, mới build Tx2.

---

### mission.move

**File:** `contracts/sources/mission.move`
**Dependencies:** `sui::object`, `sui::clock`, `equipment.move`, `sui::transfer`
**Được gọi bởi:** Game Server (create_session), `loot.move` (add_loot), Game Server PTB builder (settle + distribute)

#### Hàm: `create_session()`

```
SIGNATURE:
  create_session(
    player:       address,
    hero_id:      ID,
    mission_type: u8,
    ctx:          &mut TxContext
  ) → MissionSession

PSEUDOCODE:
  1. return MissionSession {
       id:           object::new(ctx),
       player:       player,
       hero_id:      hero_id,
       mission_type: mission_type,
       status:       STATUS_PENDING,
       loot_tiers:   vector::empty(),
       loot_types:   vector::empty(),
     }
  // Caller (Game Server) gọi transfer::transfer(session, game_server_address)
  // KHÔNG dùng transfer::share_object — xem ADR-004
```

---

#### Hàm: `add_loot()` — package-internal

```
SIGNATURE:
  public(package) fun add_loot(
    session:   &mut MissionSession,
    tier:      u8,
    loot_type: u8
  )

PSEUDOCODE:
  1. Validate status:
       nếu session.status != STATUS_PENDING → abort(EInvalidStatus = 0)
  2. Push loot data:
       vector::push_back(&mut session.loot_tiers, tier)
       vector::push_back(&mut session.loot_types, loot_type)
  3. Update status:
       session.status = STATUS_LOOT_DONE
```

---

#### Hàm: `settle()` — gọi từ Tx2 PTB

```
SIGNATURE:
  settle(
    session:    &mut MissionSession,
    hero_power: u64,
    clock:      &Clock,
    ctx:        &mut TxContext
  ) → vector<Equipment>

PSEUDOCODE:
  1. Validate status:
       nếu session.status != STATUS_LOOT_DONE → abort(ESettleBeforeLoot = 1)

  2. Deterministic battle resolution (ADR-010):
       boss_power = get_boss_power(session.mission_type)
       seed = clock::timestamp_ms(clock) % BATTLE_SEED_MOD
       win = (hero_power + seed) > boss_power

  3. Nếu !win:
       session.status = STATUS_FAILED
       return vector::empty()

  4. Generate Equipment objects:
       rewards = vector::empty<Equipment>()
       len = vector::length(&session.loot_tiers)
       for i in 0..len:
         tier      = session.loot_tiers[i]
         loot_type = session.loot_types[i]
         power     = get_power_for_tier(tier)
         name      = get_name_for_type(loot_type, tier)
         eq        = equipment::create(loot_type, name, power, tier, ctx)
         vector::push_back(&mut rewards, eq)

  5. session.status = STATUS_COMPLETE
  6. return rewards

Helper — get_boss_power(mission_type):
  MISSION_FOREST  → BOSS_FOREST_POWER (20)
  MISSION_DUNGEON → BOSS_DUNGEON_POWER (35)

Helper — get_power_for_tier(tier):
  0 → LOOT_POWER_COMMON    (10)
  1 → LOOT_POWER_RARE      (22)
  2 → LOOT_POWER_LEGENDARY (40)

Helper — get_name_for_type(loot_type, tier):
  loot_type=0, tier=0 → b"Iron Sword"
  loot_type=0, tier=1 → b"Rare Sword"
  loot_type=0, tier=2 → b"Legendary Sword"
  loot_type=1, tier=0 → b"Iron Armor"
  loot_type=1, tier=1 → b"Rare Armor"
  loot_type=1, tier=2 → b"Legendary Armor"
```

---

#### Hàm: `distribute()` — gọi từ Tx2 PTB

```
SIGNATURE:
  distribute(
    rewards: vector<Equipment>,
    player:  address,
    ctx:     &mut TxContext
  )

PSEUDOCODE:
  1. len = vector::length(&rewards)
  2. for i in 0..len:
       eq = vector::pop_back(&mut rewards)
       transfer::public_transfer(eq, player)
  3. vector::destroy_empty(rewards)
```

---

### Game Server (Node.js)

**File:** `game-server/` (~200 lines total)
**Dependencies:** `@mysten/sui`, express, dotenv, cors
**Được gọi bởi:** Frontend (HTTP)

#### POST /api/sponsor

```
PSEUDOCODE:
  1. Extract { txBytes, senderAddress } từ request body
  2. Verify zkLogin session:
       nếu !isValidSession(req, senderAddress) → return 401
  3. Check rate limit:
       nếu rateLimitMap.get(senderAddress) >= SPONSOR_RATE_LIMIT_PER_DAY → return 429
  4. Build sponsored transaction:
       tx = Transaction.from(fromBase64(txBytes))
       { bytes, signature } = await suiClient.signTransaction({
         transaction: tx,
         signer: sponsorKeypair,
       })
  5. Increment rate limit counter:
       rateLimitMap.set(senderAddress, current + 1)
  6. return { sponsoredTxBytes: bytes, sponsorSig: signature }
```

---

#### POST /api/battle

```
PSEUDOCODE:
  1. Extract { sessionId, heroId, playerAddress } từ request body
  2. Build Tx2 PTB:
       tx = new Transaction()
       [heroPower] = tx.moveCall({
         target: `${PKG}::hero::total_power`,
         arguments: [tx.object(heroId)]
       })
       [rewards] = tx.moveCall({
         target: `${PKG}::mission::settle`,
         arguments: [tx.object(sessionId), heroPower, tx.object("0x6")]
       })
       tx.moveCall({
         target: `${PKG}::mission::distribute`,
         arguments: [rewards, tx.pure.address(playerAddress)]
       })
  3. Set tx metadata:
       tx.setSender(playerAddress)
       tx.setGasOwner(SPONSOR_ADDRESS)
  4. Build:
       txBytes = await tx.build({ client: suiClient })
  5. return { txBytes: Buffer.from(txBytes).toString("base64") }
```

---

#### POST /api/ai-hint

```
PSEUDOCODE:
  1. Extract { heroPower, equippedSlots } từ request body
  2. readiness = Math.min(100, Math.round((heroPower / 50) * 100))
  3. Determine hint text:
       nếu readiness >= 70:
         hint = `Hero ready (${readiness}%). Recommend Forest Quest for rare loot drop.`
         recommended_quest = "forest"
       ngược lại:
         missing = equippedSlots < 2 ? "weapon + armor" : "armor"
         hint = `Equip ${missing} first. Power ${heroPower}/50 needed.`
         recommended_quest = "training"
  4. return { hint, readiness, recommended_quest }
```

---

### Frontend (React)

**File:** `frontend/`
**Dependencies:** `@mysten/sui`, `@mysten/sui/zklogin`

#### zkLogin: `startLogin()`

```
PSEUDOCODE:
  1. keypair = new Ed25519Keypair()
  2. { epoch } = await suiClient.getLatestSuiSystemState()
  3. randomness = generateRandomness()
  4. maxEpoch = Number(epoch) + 2
  5. nonce = generateNonce(keypair.getPublicKey(), maxEpoch, randomness)
  6. Persist vào sessionStorage:
       "zkEphemKey" = keypair.export().privateKey
       "zkRandomness" = randomness
       "zkMaxEpoch" = maxEpoch
  7. Init salt nếu chưa có:
       nếu !localStorage.getItem("zkSalt"):
         localStorage.setItem("zkSalt", generateRandomness())
  8. Build Google OAuth URL với nonce embedded
  9. window.location.href = loginUrl (redirect)
```

---

#### zkLogin: `completeLogin(jwt)`

```
PSEUDOCODE:
  1. Load từ storage:
       salt = localStorage.getItem("zkSalt")
       randomness = sessionStorage.getItem("zkRandomness")
       maxEpoch = sessionStorage.getItem("zkMaxEpoch")
       keypair = Ed25519Keypair.fromSecretKey(sessionStorage.getItem("zkEphemKey"))
  2. POST prover-dev.mystenlabs.com/v1:
       body: { jwt, extendedEphemeralPublicKey, maxEpoch, jwtRandomness: randomness, salt, keyClaimName: "sub" }
       ⚠️ latency 2-5s — show loading spinner
  3. address = jwtToAddress(jwt, salt)
  4. Persist:
       sessionStorage.setItem("zkProof", JSON.stringify(proof))
       sessionStorage.setItem("zkAddress", address)
  5. return { address, keypair }
```

---

#### Gasless tx: `executeGasless(txBytes, zkAddress)`

```
PSEUDOCODE:
  1. POST /api/sponsor { txBytes, senderAddress: zkAddress }
     → { sponsoredTxBytes, sponsorSig }
  2. keypair = Ed25519Keypair.fromSecretKey(sessionStorage.getItem("zkEphemKey"))
     { signature: userSig } = await keypair.signTransaction(fromBase64(sponsoredTxBytes))
  3. zkProof = JSON.parse(sessionStorage.getItem("zkProof"))
     zkSig = getZkLoginSignature({
       inputs: zkProof,
       maxEpoch: Number(sessionStorage.getItem("zkMaxEpoch")),
       userSignature: userSig,
     })
  4. return suiClient.executeTransactionBlock({
       transactionBlock: sponsoredTxBytes,
       signature: [zkSig, sponsorSig],
       options: { showEffects: true },
     })
```

---

## 6. INTEGRATION POINTS

---

### Mysten Hosted ZK Prover

**Dùng ở component:** `Frontend / auth/zklogin.ts` — hàm `completeLogin()`
**Protocol:** HTTPS POST
**Auth:** None (public endpoint)

```
// Retry strategy
MAX_RETRIES = 2
TIMEOUT     = 30s per attempt (prover latency 2-5s bình thường)

// Không có circuit breaker (MVP) — nếu fail 3 lần → hiển thị lỗi cho user
```

**Fallback khi unavailable:** "ZK proof generation failed. Please try again." + retry button.
Không có fallback auth method trong MVP.

---

### Sui RPC (devnet)

**Dùng ở component:** `Game Server / sui-client.ts`, `Frontend / transactions/`
**Protocol:** HTTPS (JSON-RPC)
**Auth:** None (public endpoint)

```
ENDPOINT   = "https://fullnode.devnet.sui.io"
MAX_RETRIES = 3
BACKOFF     = exponential, base 500ms, cap 5s
TIMEOUT     = 10s per attempt

// Clock Object (đặc biệt trên Sui)
CLOCK_OBJECT_ID = "0x6"   // luôn available, không cần query
```

**Fallback khi unavailable:** "Network unavailable. Check your connection." User phải retry thủ công.

---

## 7. NON-FUNCTIONAL REQUIREMENTS

### Performance (MVP targets)

```
zkLogin flow (startLogin → address):
  Total E2E  ≤ 10s (bao gồm Google OAuth redirect + ZK proof 2-5s)
  ZK Prover  ≤ 5s  (P90 — Mysten hosted)

Quest flow (click Start → result reveal):
  Tx1 confirm     ≤ 3s  (Mysticeti finality)
  Tx2 confirm     ≤ 3s  (Mysticeti finality)
  Total E2E       ≤ 30s (bao gồm gameplay animation 10s)

Game Server API:
  /api/sponsor    ≤ 1s  (chain signing only)
  /api/battle     ≤ 1s  (PTB build only)
  /api/ai-hint    ≤ 100ms (sync computation)
```

### Security

```
Authentication : zkLogin (ZK proof của Google OAuth — Mysten Labs audited)
Authorization  : Owned objects — chỉ Game Server address modify MissionSession
Data at rest   : localStorage salt (MVP trade-off — production: server-side salt)
Data in transit: TLS (HTTPS cho tất cả API calls)
Sensitive fields KHÔNG được log: SPONSOR_PRIVATE_KEY, zkProof, jwt, zkSalt
```

### Reliability (MVP)

```
Availability target : best-effort (hackathon — không có SLA)
Sponsor wallet      : phải có SUI trước demo, check balance trước mỗi demo rehearsal
Backup              : demo video recording (in case live demo fail)
```

### Scalability (MVP → Target)

```
Current target : demo (~10 concurrent users)
Design ceiling : không cần re-architect cho ≤ 100 users (devnet)
Scale trigger  : > 100 users → Phase 2 (Shinami Gas Station + mainnet)
```

---

## 8. SCAFFOLDING & BUILD ORDER

> Thứ tự tạo files và implement. Dependencies kỹ thuật là THỰC TẾ — không đảo thứ tự.

```
PHASE 0 — Move Foundation (Ngày 1: 09:00 - 20:00)
  [0.1] equipment.move     — vì: hero.move cần Equipment type
  [0.2] hero.move          — vì: mission.move cần Hero type (và DOF pattern)
  [0.3] mission.move       — vì: loot.move cần add_loot từ mission
  [0.4] loot.move          — vì: depends on mission.move public(package) add_loot
  [0.5] sui move test      — tất cả unit tests pass trước khi publish
  [0.6] sui client publish — copy Package ID vào .env, share với team
  Gate: Package ID live trên devnet, tất cả tests pass

PHASE 1 — Server & Auth (Ngày 2: 09:00 - 20:00, parallel streams)
  [1.1] game-server/sui-client.ts   — depends on: [0.6] (Package ID cần)
  [1.2] game-server/sponsor.ts      — depends on: [1.1]
  [1.3] game-server/battle.ts       — depends on: [1.1], [0.6]
  [1.4] game-server/ai-hint.ts      — depends on: none (pure logic)
  [1.5] game-server/index.ts        — depends on: [1.2], [1.3], [1.4]
  [1.6] frontend/auth/zklogin.ts    — depends on: none (parallel với 1.1-1.5)
  [1.7] frontend/transactions/gasless.ts — depends on: [1.2], [1.6]
  Gate: Gasless mint hero hoạt động end-to-end, Google login ra Sui address đúng

PHASE 2 — Frontend Screens (Ngày 3: 09:00 - 20:00)
  [2.1] frontend/pages/index.tsx (Login)    — depends on: [1.6]
  [2.2] frontend/pages/hero.tsx (Hero)      — depends on: [1.7], [2.1]
  [2.3] frontend/pages/quest.tsx (Quest)    — depends on: [1.3], [1.7], [2.2]
  [2.4] frontend/pages/inventory.tsx (Inv)  — depends on: [2.3]
  Gate: Full flow từ Login → Hero → Quest → Inventory working

PHASE 3 — Polish & Demo Prep (Ngày 4-5)
  [3.1] Bug fixes từ full flow testing
  [3.2] Deploy frontend → Vercel
  [3.3] Deploy game server → Railway
  [3.4] Pitch deck + demo script
  [3.5] Demo rehearsal (min 3 lần)
  Gate: Demo video backup recorded, live demo < 5 phút
```

**File scaffold đầy đủ:**

```
onerealm/
│
├── contracts/
│   ├── Move.toml                    ← created in [0.1]
│   └── sources/
│       ├── equipment.move           ← created in [0.1]
│       ├── hero.move                ← created in [0.2]
│       ├── mission.move             ← created in [0.3]
│       └── loot.move                ← created in [0.4]
│
├── game-server/
│   ├── package.json                 ← created in [1.1]
│   ├── .env                         ← created in [1.1] (không commit)
│   ├── sui-client.ts                ← created in [1.1]
│   ├── sponsor.ts                   ← created in [1.2]
│   ├── battle.ts                    ← created in [1.3]
│   ├── ai-hint.ts                   ← created in [1.4]
│   └── index.ts                     ← created in [1.5]
│
└── frontend/
    ├── package.json                 ← created in [1.6]
    ├── .env.local                   ← created in [1.6] (không commit)
    ├── auth/
    │   └── zklogin.ts               ← created in [1.6]
    ├── transactions/
    │   └── gasless.ts               ← created in [1.7]
    └── pages/
        ├── index.tsx                ← created in [2.1]
        ├── hero.tsx                 ← created in [2.2]
        ├── quest.tsx                ← created in [2.3]
        └── inventory.tsx            ← created in [2.4]
```

**Environment variables required (xem CONTRACTS.md Section 6):**

```
contracts/.env          → ONEREALM_PACKAGE_ID, GAME_SERVER_ADDRESS
game-server/.env        → SPONSOR_PRIVATE_KEY, SPONSOR_ADDRESS, ONEREALM_PACKAGE_ID, SUI_RPC_URL
frontend/.env.local     → NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_ONEREALM_PACKAGE_ID,
                          NEXT_PUBLIC_GAME_SERVER_URL, NEXT_PUBLIC_SUI_NETWORK
```
