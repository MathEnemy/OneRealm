# CONTRACTS.md — Schema Registry
### OneRealm · v2.0

> **Nguyên tắc vàng:** Mọi type, schema, enum, constant được define **MỘT LẦN DUY NHẤT** tại đây.
> BLUEPRINT.md và code **reference** — không redefine, không copy, không paraphrase.
>
> Khi thấy conflict giữa file này và bất kỳ file nào khác → file này thắng.
> Source: VHEATM Audit Cycle #1 & #2.

---

## Mục lục

1. [Primitive Types & Constants](#1-primitive-types--constants)
2. [Enums](#2-enums)
3. [Core Schemas](#3-core-schemas)
4. [Input / Output Contracts](#4-input--output-contracts)
5. [Error Registry](#5-error-registry)
6. [External Contracts](#6-external-contracts)
7. [Naming Conventions](#7-naming-conventions)
8. [Schema Changelog](#8-schema-changelog)

---

## Current Implementation Snapshot

> Snapshot này phản ánh code hiện tại trong repo. Nếu phần cũ bên dưới còn sót enum, combat formula, hay signature cũ thì snapshot này thắng.

### Hero

```text
Hero :: {
  id             :: UID
  name           :: vector<u8>
  level          :: u64
  base_power     :: u64
  archetype      :: u8   // 0=Warrior, 1=Ranger, 2=Arcanist
  profession     :: u8   // 0=Mining, 1=Foraging, 2=Smithing, 3=Relic Hunting
  profession_xp  :: u64
  owner          :: address
}
```

### MissionSession

```text
MissionSession :: {
  id             :: UID
  player         :: address
  hero_id        :: ID
  mission_type   :: u8   // 0=Raid, 1=Harvest, 2=Training
  contract_type  :: u8   // 0=Standard, 1=Bounty, 2=Expedition
  ready_at_ms    :: u64  // chỉ >0 khi contract_type=Expedition
  stance         :: u8   // 0=Balanced, 1=Aggressive, 2=Guarded
  status         :: u8   // 0=PENDING, 1=LOOT_DONE, 2=COMPLETE, 3=FAILED
  loot_tiers     :: vector<u8>
  loot_types     :: vector<u8>
  loot_affixes   :: vector<u8>
}
```

### Live Move Entry Points

```text
hero::mint_to_sender(name, archetype, profession, ctx)
hero::unequip_to_sender(hero, slot, ctx)
equipment::salvage_to_sender(eq, ctx)
blacksmith::craft_to_sender(recipe, &mut hero, mat_a, mat_b, mat_c, ctx)
mission::generate_loot(authority, random, &mut session, ctx)
mission::settle_and_distribute(authority, &mut session, &mut hero, &clock, ctx)
```

### Live HTTP Contracts

```text
POST /api/session/create
  input  :: { heroId, missionType, contractType, stance }
  output :: { sessionId, createTxDigest, readyAtMs }

POST /api/session/loot
  input  :: { sessionId }
  output :: { tx1Digest }

POST /api/battle
  input  :: { sessionId }
  output :: { txBytes }
```

### Progression Rules

```text
Profession rank:
  Novice = xp 0..2
  Adept  = xp 3..6
  Master = xp >= 7

XP gain on quest win:
  Standard   +1
  Bounty     +2
  Expedition +3

Base recipes: no rank requirement
Profession recipes: require matching profession + Adept
Master recipes: require matching profession + Master
```

---

## 1. PRIMITIVE TYPES & CONSTANTS

> Các hằng số dùng xuyên suốt Move contracts và Game Server.
> Agent KHÔNG hard-code giá trị của các constants này ở bất kỳ nơi nào khác.

```
// === Hero slots (dùng làm DOF keys) ===
SLOT_WEAPON :: vector<u8> = b"weapon"
  // Key của Dynamic Object Field cho slot vũ khí trên Hero

SLOT_ARMOR :: vector<u8> = b"armor"
  // Key của Dynamic Object Field cho slot giáp trên Hero

// === Equipment types ===
TYPE_WEAPON :: u8 = 0
  // Identifier cho equipment loại weapon

TYPE_ARMOR :: u8 = 1
  // Identifier cho equipment loại armor

TYPE_GEM :: u8 = 2
  // Identifier cho gem (Target only — không dùng cho MVP)

// === Mission types ===
MISSION_RAID :: u8 = 0
  // High-risk combat lane

MISSION_HARVEST :: u8 = 1
  // Material-heavy farming lane

MISSION_TRAINING :: u8 = 2
  // Low-risk progression lane

// === Contract types ===
CONTRACT_STANDARD :: u8 = 0
CONTRACT_BOUNTY :: u8 = 1
CONTRACT_EXPEDITION :: u8 = 2

// === Boss power thresholds ===
BOSS_RAID_POWER :: u64 = 35
BOSS_HARVEST_POWER :: u64 = 18
BOSS_TRAINING_POWER :: u64 = 8

// === Loot drop rates (roll range 0-99) ===
LOOT_COMMON_MAX_ROLL  :: u8 = 59    // roll 0-59  → common  (60%)
LOOT_RARE_MAX_ROLL    :: u8 = 89    // roll 60-89 → rare    (30%)
LOOT_LEGENDARY_MIN    :: u8 = 90    // roll 90-99 → legendary (10%)

// === Loot power ranges per tier ===
LOOT_POWER_COMMON     :: u64 = 10   // power fixed cho common loot
LOOT_POWER_RARE       :: u64 = 22   // power fixed cho rare loot
LOOT_POWER_LEGENDARY  :: u64 = 40   // power fixed cho legendary loot

// === Stances ===
STANCE_BALANCED :: u8 = 0
STANCE_AGGRESSIVE :: u8 = 1
STANCE_GUARDED :: u8 = 2

// === Hero defaults ===
HERO_DEFAULT_LEVEL      :: u64 = 1
HERO_DEFAULT_BASE_POWER :: u64 = 10

// === Game Server limits ===
SPONSOR_RATE_LIMIT_PER_DAY :: u32 = 10
  // Max sponsored transactions per address per day (ADR-008)
```

> **Type notation dùng trong file này (Move-flavored):**
> ```
> FieldName :: Type                       — required field
> FieldName :: Type?                      — optional field (nullable)
> FieldName :: vector<Type>               — dynamic array
> FieldName :: Ref<SchemaName>            — reference đến schema khác
> FieldName :: Balance<NativeGas>         — native gas token balance type
> ```

---

## 2. ENUMS

> Mọi enum được define tại đây. Không tạo inline enum trong schema.

---

### LootTier

```
LootTier :: u8
  | 0  // COMMON     — 60% drop rate, power = LOOT_POWER_COMMON
  | 1  // RARE       — 30% drop rate, power = LOOT_POWER_RARE
  | 2  // LEGENDARY  — 10% drop rate, power = LOOT_POWER_LEGENDARY
```

**Dùng ở:** `MissionSession.loot_tiers`, `Equipment.rarity`
**Không dùng cho:** Hero rarity (Target feature — chưa define trong MVP)

---

### LootType

```
LootType :: u8
  | 0  // WEAPON_MATERIAL — sẽ tạo ra Equipment có eq_type = TYPE_WEAPON
  | 1  // ARMOR_MATERIAL  — sẽ tạo ra Equipment có eq_type = TYPE_ARMOR
```

**Dùng ở:** `MissionSession.loot_types`
**Không nhầm với:** `EquipmentType` — LootType là material drop, EquipmentType là item đã craft

---

### EquipmentType

```
EquipmentType :: u8
  | 0  // WEAPON  — equip vào SLOT_WEAPON
  | 1  // ARMOR   — equip vào SLOT_ARMOR
  | 2  // GEM     — attach vào Equipment khác (Target only)
```

**Dùng ở:** `Equipment.eq_type`
**Mapping:** LootType 0 → EquipmentType 0, LootType 1 → EquipmentType 1

---

### MissionType

```
MissionType :: u8
  | 0  // RAID
  | 1  // HARVEST
  | 2  // TRAINING
```

**Dùng ở:** `MissionSession.mission_type`

---

### MissionStatus

```
MissionStatus :: u8
  | 0  // PENDING    — session vừa được tạo, chờ loot commit
  | 1  // LOOT_DONE  — Tx1 đã complete, loot_tiers/loot_types đã populated
  | 2  // COMPLETE   — Tx2 settle thành công, equipment đã distribute
  | 3  // FAILED     — Tx2 battle resolve fail (hero power insufficient)
```

**Dùng ở:** `MissionSession.status`
**State machine:** xem BLUEPRINT.md Section 4

---

## 3. CORE SCHEMAS

> Schemas được sắp xếp từ primitive → composite.
> Schema phụ thuộc schema khác → schema kia được define trước.

---

### Equipment

> Move object on-chain đại diện cho một item equipment của player.
> Có thể tồn tại độc lập (has `key + store`) hoặc lưu dưới dạng DOF trong Hero.

```
Equipment :: {
  id         :: UID                  // on-chain object ID — unique trên chain
  eq_type    :: EquipmentType        // xác định slot nào trên Hero nhận item này
  name       :: vector<u8>           // display name (ví dụ: b"Iron Sword")
  power      :: u64                  // stat bonus khi equipped vào Hero
  rarity     :: LootTier             // visual tier + power tier
}
```

**Constraints:**
```
INVARIANT: eq_type ∈ {0, 1, 2}
INVARIANT: power > 0
INVARIANT: rarity ∈ {0, 1, 2}
RANGE:     name.length ∈ [1, 64] bytes
```

**Không nhầm với:** `LootType` — Equipment là object đã tồn tại, LootType là kết quả roll chưa craft

**Equipment names chuẩn (theo tier):**
```
LootType=0 (weapon): tier=0 → b"Iron Sword" | tier=1 → b"Rare Sword"  | tier=2 → b"Legendary Sword"
LootType=1 (armor) : tier=0 → b"Iron Armor" | tier=1 → b"Rare Armor"  | tier=2 → b"Legendary Armor"
```

---

### Hero

> Move object on-chain đại diện cho nhân vật của player.
> Equipment gắn vào Hero thông qua Dynamic Object Fields (DOF) — không phải struct field.

```
Hero :: {
  id          :: UID          // on-chain object ID — DOF container
  name        :: vector<u8>   // player-chosen hero name
  level       :: u64          // combat level (MVP: luôn = HERO_DEFAULT_LEVEL)
  base_power  :: u64          // power cơ bản, không tính equipment
  owner       :: address      // địa chỉ ví on-chain của player (off-chain identity binding)
}
```

**DOF slots (không phải struct fields — không xuất hiện trong Hero struct):**
```
hero.id[SLOT_WEAPON] :: Equipment?   // optional — slot có thể empty
hero.id[SLOT_ARMOR]  :: Equipment?   // optional — slot có thể empty
```

**Constraints:**
```
INVARIANT: base_power = HERO_DEFAULT_BASE_POWER khi mới mint (MVP)
INVARIANT: level = HERO_DEFAULT_LEVEL khi mới mint (MVP)
INVARIANT: owner không thay đổi sau mint (MVP — không có transfer feature)
RANGE:     name.length ∈ [1, 32] bytes
```

**Không nhầm với:** `Guild.members` — Hero là object owned, không phải address entry

---

### MissionSession

> Move object on-chain lưu trạng thái một quest session.
> Owned object của Game Server address — KHÔNG phải shared object (ADR-004).
> Serves as communication channel giữa Tx1 (loot commit) và Tx2 (settlement).

```
MissionSession :: {
  id            :: UID             // on-chain object ID
  player        :: address         // địa chỉ player tham gia session
  hero_id       :: ID              // ID của Hero object (để verify trong Tx2)
  mission_type  :: MissionType     // Raid / Harvest / Training
  status        :: MissionStatus   // state machine status
  loot_tiers    :: vector<u8>      // populated bởi mission::generate_loot trong Tx1
  loot_types    :: vector<u8>      // populated bởi mission::generate_loot trong Tx1
}
```

**Constraints:**
```
INVARIANT: loot_tiers.length == loot_types.length (luôn push cùng lúc)
INVARIANT: loot_tiers.length ∈ [1, 3] sau khi Tx1 complete
INVARIANT: chỉ Game Server address có thể mutate object này (owned object)
INVARIANT: status transitions chỉ được phép theo state machine trong BLUEPRINT.md Section 4
```

---

### GameAuthority

> Move object on-chain đóng vai trò capability cho server-authoritative actions.
> Được tạo trong package `init` và transfer về publisher/operator address.

```
GameAuthority :: {
  id :: UID
}
```

**Constraints:**
```
INVARIANT: object này phải là owned object
INVARIANT: chỉ holder của object này mới gọi được các server-authoritative entry points
```

---

### LootResult

> Move object on-chain — wrapper output của Tx2 settlement.
> Chứa Equipment đã craft và reference đến MissionSession nguồn gốc.
> **MVP Note:** Trong implementation hiện tại, Equipment được distribute trực tiếp
> mà không wrap trong LootResult. Schema này dành cho Target architecture.

```
LootResult :: {
  id           :: UID          // on-chain object ID
  equipment    :: Equipment    // Equipment object đã craft từ loot
  mission_id   :: ID           // ID của MissionSession tương ứng
}
```

---

### GuildTarget

> Target only — Phase 2. Không implement trong MVP.

```
GuildTarget :: {
  id           :: UID
  name         :: vector<u8>
  owner        :: address
  members      :: vector<address>   // max 20 members
  guild_level  :: u64
  treasury     :: Balance<NativeGas>
}
```

---

## 4. INPUT / OUTPUT CONTRACTS

> I/O contract của từng entry point / API boundary trong hệ thống.
> Đây là "giao kèo" — không thay đổi mà không có ADR entry.

---

### [Move] hero::mint

> Tạo Hero mới và return về caller (không transfer). Dùng bởi game server trong PTB.

```
INPUT  :: (name: vector<u8>, ctx: &mut TxContext)

OUTPUT :: Hero

SIDE EFFECTS: none (caller tự transfer về player address)

PRE-CONDITIONS:
  - name.length ∈ [1, 32]
  - ctx hợp lệ

POST-CONDITIONS:
  - Hero mới được tạo với level=HERO_DEFAULT_LEVEL, base_power=HERO_DEFAULT_BASE_POWER
  - Hero.owner = tx_context::sender(ctx)

IDEMPOTENT: KHÔNG — mỗi call tạo Hero object mới với UID khác
```

---

### [Move] hero::mint_to_sender (entry)

> Mint Hero và transfer ngay về sender. Dành cho sponsored tx từ Game Server.

```
INPUT  :: (name: vector<u8>, ctx: &mut TxContext)

OUTPUT :: (none — Hero transferred to sender)

SIDE EFFECTS:
  - Tạo Hero object mới trên chain
  - Transfer Hero về tx_context::sender(ctx)

PRE-CONDITIONS:
  - Không có (ai cũng mint được — gas được sponsor)

POST-CONDITIONS:
  - Player nhận Hero object trong ví

IDEMPOTENT: KHÔNG
```

---

### [Move] hero::equip

> Gắn Equipment vào Hero tại slot chỉ định.

```
INPUT  :: (hero: &mut Hero, slot: vector<u8>, eq: Equipment)

OUTPUT :: (none)

SIDE EFFECTS:
  - dof::add(&mut hero.id, slot, eq)
  - Equipment không còn là standalone object — được lưu trong Hero DOF

PRE-CONDITIONS:
  - slot ∈ {SLOT_WEAPON, SLOT_ARMOR}
  - slot chưa có equipment (dof::exists_ == false) — nếu có → abort ESlotOccupied

POST-CONDITIONS:
  - dof::exists_(&hero.id, slot) == true

IDEMPOTENT: KHÔNG
```

---

### [Move] hero::unequip

> Tháo Equipment khỏi Hero, return Equipment object về caller.

```
INPUT  :: (hero: &mut Hero, slot: vector<u8>) → Equipment

OUTPUT :: Equipment

SIDE EFFECTS:
  - dof::remove(&mut hero.id, slot)

PRE-CONDITIONS:
  - slot ∈ {SLOT_WEAPON, SLOT_ARMOR}
  - slot phải có equipment (dof::exists_ == true) — nếu không → abort ESlotEmpty

POST-CONDITIONS:
  - dof::exists_(&hero.id, slot) == false

IDEMPOTENT: KHÔNG
```

---

### [Move] hero::unequip_to_sender (entry)

> Wrapper an toàn cho UI gasless flow. Tháo Equipment khỏi Hero và transfer ngay về sender.

```
INPUT  :: (hero: &mut Hero, slot: vector<u8>, ctx: &TxContext)

OUTPUT :: (none)

SIDE EFFECTS:
  - dof::remove(&mut hero.id, slot)
  - Transfer Equipment về tx_context::sender(ctx)

PRE-CONDITIONS:
  - slot ∈ {SLOT_WEAPON, SLOT_ARMOR}
  - slot phải có equipment (dof::exists_ == true) — nếu không → abort ESlotEmpty

POST-CONDITIONS:
  - dof::exists_(&hero.id, slot) == false
  - sender nhận lại Equipment object trong ví

IDEMPOTENT: KHÔNG
```

---

### [Move] hero::burn

> Destroy Hero. Phải unequip tất cả slots trước khi delete (ADR-005).

```
INPUT  :: (hero: Hero, ctx: &mut TxContext)

OUTPUT :: (none)

SIDE EFFECTS:
  - Unequip SLOT_WEAPON nếu tồn tại → transfer về sender
  - Unequip SLOT_ARMOR nếu tồn tại → transfer về sender
  - Delete Hero UID

PRE-CONDITIONS:
  - caller là owner

POST-CONDITIONS:
  - Hero object không còn tồn tại on-chain
  - Tất cả equipment đã equipped được transfer về sender (không có orphaned assets)

IDEMPOTENT: KHÔNG
```

---

### [Move] mission::generate_loot (entry — Tx1 TERMINAL)

> Generate loot ngẫu nhiên bằng native chain randomness và commit vào MissionSession.
> ⚠️ CRITICAL: Entry function — không phải public. Tx1 TERMINAL (ADR-002).
> Trong implementation hiện tại, function này được Game Server submit vì `MissionSession` là owned object của server và call yêu cầu `&GameAuthority`.

```
INPUT  :: (authority: &GameAuthority, r: &Random, session: &mut MissionSession, ctx: &mut TxContext)

OUTPUT :: (none — kết quả được ghi vào session.loot_tiers và session.loot_types)

SIDE EFFECTS:
  - Populate session.loot_tiers với 1-3 LootTier values
  - Populate session.loot_types với 1-3 LootType values
  - Set session.status = MissionStatus::LOOT_DONE

PRE-CONDITIONS:
  - authority hợp lệ
  - session.status == MissionStatus::PENDING — nếu không → abort ELootAlreadyDone

POST-CONDITIONS:
  - session.loot_tiers.length ∈ [1, 3]
  - session.loot_tiers.length == session.loot_types.length
  - session.status == MissionStatus::LOOT_DONE

IDEMPOTENT: KHÔNG
```

**Loot generation algorithm:**
```
loot_count = random_u8_in_range(1, 3)
for i in 0..loot_count:
  roll = random_u8_in_range(0, 99)
  tier = if roll < 60 → 0 (COMMON)
         elif roll < 90 → 1 (RARE)
         else → 2 (LEGENDARY)
  loot_type = random_u8_in_range(0, 1)
  session.add_loot(tier, loot_type)
```

---

### [Move] mission::settle (Tx2 — trong PTB)

> Resolve battle và generate Equipment objects từ committed loot.
> Deterministic — không dùng Random (ADR-010).

```
INPUT  :: (
  session: &mut MissionSession,
  hero_power: u64,   // từ hero::total_power() trong cùng PTB
  clock: &Clock,
  ctx: &mut TxContext
) → vector<Equipment>

OUTPUT :: vector<Equipment>   // rỗng nếu battle fail

SIDE EFFECTS:
  - Nếu win: set session.status = MissionStatus::COMPLETE
  - Nếu lose: set session.status = MissionStatus::FAILED

PRE-CONDITIONS:
  - session.status == MissionStatus::LOOT_DONE — nếu không → abort

POST-CONDITIONS:
  - session.status ∈ {MissionStatus::COMPLETE, MissionStatus::FAILED}
  - Nếu COMPLETE: output.length == session.loot_tiers.length

IDEMPOTENT: KHÔNG
```

**Battle resolution algorithm (ADR-010):**
```
boss_power   = get_boss_power(session.mission_type, session.contract_type)
stance_bonus = get_stance_bonus(session.mission_type, session.stance)
if session.contract_type == CONTRACT_EXPEDITION:
  assert clock::timestamp_ms(clock) >= session.ready_at_ms
win = (hero_power + stance_bonus) > boss_power
```

---

### [Move] mission::distribute (Tx2 — trong PTB)

> Transfer tất cả Equipment trong rewards vector về player address.

```
INPUT  :: (rewards: vector<Equipment>, player: address, ctx: &mut TxContext)

OUTPUT :: (none)

SIDE EFFECTS:
  - Transfer từng Equipment trong rewards về player address
  - Destroy rewards vector sau khi distribute xong

PRE-CONDITIONS:
  - rewards không có Equipment nào là orphaned (đã unequipped)

POST-CONDITIONS:
  - Player nhận tất cả Equipment objects trong ví
  - rewards vector bị consume (destroyed)

IDEMPOTENT: KHÔNG
```

---

### [Move] mission::settle_and_distribute

> Public wrapper duy nhất cho flow runtime hiện tại.
> Function này tự bind session với hero/player và tự tính `hero::total_power(hero)` on-chain.

```
INPUT  :: (
  authority: &GameAuthority,
  session:   &mut MissionSession,
  hero:      &Hero,
  clock:     &Clock,
  ctx:       &mut TxContext
)

OUTPUT :: (none)

SIDE EFFECTS:
  - Verify tx_context::sender(ctx) == session.player
  - Verify object::id(hero) == session.hero_id
  - Internally call mission::settle(...)
  - Transfer rewards về sender qua mission::distribute(...)

PRE-CONDITIONS:
  - authority hợp lệ
  - session.status == MissionStatus::LOOT_DONE
  - hero phải đúng hero đã bind vào session
  - sender phải đúng player đã bind vào session

POST-CONDITIONS:
  - session.status ∈ {MissionStatus::COMPLETE, MissionStatus::FAILED}
  - Nếu win, sender nhận Equipment rewards trong ví

IDEMPOTENT: KHÔNG
```

---

### [Server] POST /api/sponsor

> Sponsor endpoint — thêm game server signature vào transaction, cho phép gasless.

```
INPUT  :: {
  txBytes: string   // base64-encoded transaction bytes
}

OUTPUT :: {
  sponsoredTxBytes: string   // base64-encoded sponsored transaction bytes
  sponsorSig:       string   // game server signature
}
       | { error: "Unauthorized" }  // khi session không hợp lệ (HTTP 401)
       | { error: "Rate limited" }  // khi > SPONSOR_RATE_LIMIT_PER_DAY (HTTP 429)

SIDE EFFECTS:
  - Increment rate limit counter cho authenticated address

PRE-CONDITIONS:
  - request có Authorization: Bearer <sessionToken> hợp lệ
  - authenticated address chưa vượt SPONSOR_RATE_LIMIT_PER_DAY hôm nay
  - tx.sender == authenticated address
  - tx.gasOwner == SPONSOR_ADDRESS
  - tx chứa đúng 1 MoveCall và target thuộc sponsor allowlist

POST-CONDITIONS:
  - Returned bytes có đủ 2 signatures để execute on-chain

IDEMPOTENT: KHÔNG (counter increment)
```

---

### [Server] POST /api/auth/complete

> Hoàn tất server-side auth session sau khi frontend đã có Google ID token + on-chain address từ zk proof auth.

```
INPUT  :: {
  idToken:   string
  address:   string
  userSalt:  string
}

OUTPUT :: {
  address:       string
  expiresAt:     number
  sessionToken:  string
}

SIDE EFFECTS:
  - Verify Google ID token
  - Recompute jwtToAddress(idToken, userSalt)
  - Tạo auth session in-memory
```

---

### [Server] POST /api/session/create

> Tạo MissionSession owned bởi sponsor/game server address.

```
INPUT  :: {
  heroId:       string
  missionType:  MissionType
}

OUTPUT :: {
  sessionId:        string
  createTxDigest:   string
}
```

---

### [Server] POST /api/session/loot

> Server self-submit Tx1 để commit loot vào session.

```
INPUT  :: {
  sessionId: string
}

OUTPUT :: {
  tx1Digest: string
}
```

---

### [Server] POST /api/battle

> Build Tx2 settlement PTB. Game Server là entity duy nhất build Tx2 (ADR-006).

```
INPUT  :: {
  sessionId: string   // object ID của MissionSession
}

OUTPUT :: {
  txBytes: string   // base64-encoded Tx2 settlement PTB bytes
}

SIDE EFFECTS: none (chỉ build tx, không submit)

PRE-CONDITIONS:
  - sessionId tương ứng MissionSession có status == LOOT_DONE
  - request có Authorization: Bearer <sessionToken> hợp lệ
  - session.player phải match authenticated address
  - heroId được derive từ session.hero_id trên chain

POST-CONDITIONS:
  - Returned txBytes là valid PTB chứa `mission::settle_and_distribute`

IDEMPOTENT: CÓ (cùng input → cùng txBytes structure, chỉ khác signature)
```

**Tx2 PTB structure:**
```
[1] mission::settle_and_distribute(GAME_AUTHORITY_OBJECT_ID, sessionId, heroId_from_session, "0x6")
setSender(authenticatedAddress)
setGasOwner(SPONSOR_ADDRESS)
```

---

### [Server] POST /api/ai-hint

> AI Mentor mock — rule-based, không cần LLM call (ADR-011).

```
INPUT  :: {
  heroPower:     number   // hero::total_power() value
  equippedSlots: number   // số slots đang có equipment (0, 1, hoặc 2)
}

OUTPUT :: {
  hint:               string   // human-readable hint text
  readiness:          number   // 0-100, percentage
  recommended_quest:  string   // "raid" | "harvest" | "training"
}

SIDE EFFECTS: none

PRE-CONDITIONS:
  - heroPower >= 0
  - equippedSlots ∈ {0, 1, 2}

POST-CONDITIONS:
  - readiness = min(100, round((heroPower / 50) * 100))
  - recommended_quest = "raid" nếu readiness >= 70
  - recommended_quest = "harvest" nếu readiness >= 40 và < 70
  - recommended_quest = "training" nếu readiness < 40

IDEMPOTENT: CÓ
```

---

## 5. ERROR REGISTRY

> Mọi error code được define tại đây. Agent dùng đúng code này — không tự define.

| Code | HTTP | Trigger Condition | Context cần thiết |
|---|---|---|---|
| `ESlotOccupied` (0) | — | `hero::equip` khi slot đã có equipment | `hero_id`, `slot` |
| `ESlotEmpty` (1) | — | `hero::unequip` khi slot không có equipment | `hero_id`, `slot` |
| `EInvalidSlot` (2) | — | `hero::equip` / `hero::unequip` khi slot không hợp lệ | `hero_id`, `slot` |
| `ETypeMismatch` (3) | — | `hero::equip` khi item không khớp slot | `hero_id`, `slot`, `eq_id` |
| `EInvalidStatus` (0) | — | `mission::add_loot` khi `status != PENDING` | `session_id`, `current_status` |
| `ESettleBeforeLoot` (1) | — | `mission::settle` khi `status != LOOT_DONE` | `session_id`, `current_status` |
| `ELootAlreadyDone` (3) | — | `mission::generate_loot` khi session không còn `PENDING` | `session_id`, `current_status` |
| `EHeroMismatch` (4) | — | `mission::settle_and_distribute` khi hero không match session.hero_id | `session_id`, `hero_id` |
| `EPlayerMismatch` (5) | — | `mission::settle_and_distribute` khi sender không match session.player | `session_id`, `player` |
| `EGemOnly` (0) | — | `equipment::attach_gem` khi item không phải gem (eq_type != 2) | `eq_id`, `eq_type` |
| `Unauthorized` | 401 | protected APIs với bearer invalid/expired hoặc tx policy mismatch | `address`, `tx_sender?` |
| `RateLimited` | 429 | sponsor/session endpoints vượt SPONSOR_RATE_LIMIT_PER_DAY | `address`, `count_today` |

> **Move error format:** `abort(ErrorCode)` — không có message trong MVP.
> **Server error format:**
> ```
> { error: string, details?: any }
> ```

---

## 6. EXTERNAL CONTRACTS

> Interface với external services. Ghi lại những gì hệ thống expect từ bên ngoài.

---

### Hosted ZK Prover (`prover-dev.mystenlabs.com`)

```
// Hệ thống gọi với:
REQUEST :: POST https://prover-dev.mystenlabs.com/v1
  Content-Type: application/json
  Body: {
    jwt:                         string   // Google ID token từ OAuth callback
    extendedEphemeralPublicKey:  string   // base64 ephemeral public key
    maxEpoch:                    number   // current epoch + 2
    jwtRandomness:               string   // randomness generated client-side
    salt:                        string   // user salt (localStorage cho MVP)
    keyClaimName:                string   // "sub"
  }

// Expect response:
RESPONSE :: {
  proofPoints:      object   // ZK proof data để build on-chain login signature
  issBase64Details: object
  headerBase64:     string
}

FAILURES ::
  | TIMEOUT (> 30s)    → retry tối đa 2 lần, sau đó show error cho user
  | HTTP 5xx           → show "ZK prover unavailable, try again"
  | LATENCY (2-5s)     → bình thường, show loading spinner "Generating ZK proof..."
```

**Scope:** devnet/testnet only (free tier). Production → OneID production prover.

---

### OneChain RPC (`rpc-testnet.onelabs.cc`)

```
// Hệ thống dùng để:
OPERATIONS ::
  | getLatestSystemState()        → { epoch: string } (dùng cho login nonce)
  | executeTransactionBlock(...)  → tx result với effects
  | getObject(objectId)           → object data

// Clock Object:
CLOCK_OBJECT_ID :: string = "0x6"
  // system clock object — luôn available, không cần query

FAILURES ::
  | TIMEOUT → retry với exponential backoff (base 500ms, cap 5s, max 3 retries)
  | UNAVAILABLE → show "Network unavailable" to user
```

---

## 7. NAMING CONVENTIONS

> Quy ước đặt tên trong codebase. Agent tuân theo khi generate code.

| Context | Convention | Ví dụ |
|---|---|---|
| Move module names | `snake_case` | `onerealm::hero`, `onerealm::mission` |
| Move struct names | `PascalCase` | `Hero`, `Equipment`, `MissionSession` |
| Move function names | `snake_case` | `mint_to_sender`, `generate_loot`, `settle_and_distribute` |
| Move constants | `SCREAMING_SNAKE` | `SLOT_WEAPON`, `BOSS_RAID_POWER` |
| Move error codes | `PascalCase` | `ESlotOccupied`, `ESlotEmpty` |
| TypeScript variables | `camelCase` | `heroPower`, `sponsoredTxBytes` |
| TypeScript types/interfaces | `PascalCase` | `HeroObject`, `SessionState` |
| API endpoints | `kebab-case` | `/api/ai-hint`, `/api/sponsor` |
| Environment variables | `SCREAMING_SNAKE` | `SPONSOR_PRIVATE_KEY`, `ONEREALM_PACKAGE_ID` |

**Domain-specific rules:**

```
RULE — "entry vs public" trong Move:
  entry fun  → Tx1 terminal function (có Random input) — KHÔNG gọi từ PTB
  public fun → Có thể gọi từ PTB — settlement functions

  ✅ entry fun mission::generate_loot(&GameAuthority, &Random, ...) — Tx1 terminal
  ❌ public fun generate_loot(r: &Random, ...)                      — protocol từ chối
  ✅ public fun settle_and_distribute(...)                          — Tx2 wrapper trong PTB
```

```
RULE — DOF vs struct field cho equipment:
  Equipment trên Hero phải dùng dof::add/remove/borrow
  KHÔNG lưu Equipment là struct field trong Hero

  ✅ dof::add(&mut hero.id, SLOT_WEAPON, equipment)
  ❌ hero.weapon = Some(equipment)
```

```
RULE — address vs identity type:
  On-chain: luôn dùng `address` cho player/owner
  Off-chain: OneID OAuth ID ↔ address mapping xử lý trong Game Server DB/session

  ✅ owner: address
  ❌ owner: OneID::UserID
```

---

## 8. SCHEMA CHANGELOG

> Append-only. Mọi thay đổi schema phải có entry ở đây.

| Version | Date | Schema | Thay đổi | Breaking? | ADR Ref |
|---|---|---|---|---|---|
| v1.0 | 2026-03-26 | — | Init schema registry từ TechSpec v1.0 | — | — |
| v2.0 | 2026-03-26 | `Hero` | Thay `ID` → `UID` cho field `id` | CÓ | ADR-001 |
| v2.0 | 2026-03-26 | `Hero` | Remove `signer` param → thêm `owner: address` field | CÓ | ADR-001, ADR-003 |
| v2.0 | 2026-03-26 | `MissionSession` | Thêm `status: MissionStatus` field | CÓ | ADR-004 |
| v2.0 | 2026-03-26 | `MissionSession` | Ownership model: owned (game server) thay vì shared | CÓ | ADR-004 |
| v2.1 | 2026-03-26 | `GameAuthority` | Thêm authority object cho server-authoritative actions | CÓ | ADR-004, ADR-006 |
| v2.1 | 2026-03-26 | Server APIs | Thêm `/api/auth/complete`, `/api/session/create`, `/api/session/loot`; harden `/api/sponsor` | CÓ | ADR-006, ADR-008 |
| v2.1 | 2026-03-26 | Move API | Thêm `hero::unequip_to_sender`, `mission::settle_and_distribute`; Tx1 dùng `mission::generate_loot` | CÓ | ADR-002, ADR-006 |
| 📝 | | | Thêm khi có thay đổi tiếp theo | | |
