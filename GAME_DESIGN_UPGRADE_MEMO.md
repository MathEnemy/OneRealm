# GAME_DESIGN_UPGRADE_MEMO.md
### OneRealm · v2.1 · 2026-03-26

> Mục tiêu của memo này: biến audit + research thành hướng nâng cấp gameplay có thể ra quyết định.
> File này không thay thế `ADR.md`, `BLUEPRINT.md`, `CONTRACTS.md`.
> Nó đóng vai trò lớp chiến lược: nên thêm gì, theo thứ tự nào, và vì sao.

---

## 1. Executive Summary

OneRealm hiện có nền tảng kỹ thuật khá tốt cho một on-chain game loop nhỏ:
- Gasless flow đã rõ ràng
- Session authority đã được khóa lại
- Loot commit dùng native randomness
- Ownership model trên OneChain tương đối đúng hướng

Nhưng gameplay hiện tại vẫn quá ngắn:

```
Quest -> Roll loot -> Mint Equipment -> Equip -> Total Power tăng
```

Loop này có 3 vấn đề hệ thống:
- `Depth thấp`: người chơi ít phải đưa ra quyết định chiến thuật
- `Inflation cao`: reward đi thẳng thành gear, thiếu sink
- `Identity mờ`: hero chưa có build, class, profession, hay playstyle rõ rệt

Kết luận chiến lược:
- Không nên chọn cực đoan `Loot-style composability first`
- Không nên nhảy thẳng sang `DeFi/tokenomics first`
- Nên đi theo thứ tự:

```
Gameplay depth + item sinks + progression pacing
-> crafting economy + async loops
-> composability layer
-> financialization (nếu còn cần)
```

---

## 2. Current State Diagnosis

### 2.1 Loop hiện tại

Loop runtime hiện tại:
- Frontend tạo session
- Game Server submit Tx1 `mission::generate_loot`
- Game Server build Tx2 `mission::settle_and_distribute`
- Player nhận Equipment trực tiếp
- Equipment tăng `hero::total_power`

Điểm mạnh:
- Dễ hiểu
- Demo nhanh
- Rất hợp cho hackathon

Điểm yếu:
- Reward quá “thẳng”
- Không có trade-off meaningful
- Không có lý do mạnh để giữ item cũ
- Không có lý do mạnh để quay lại ngoài spam quest

### 2.2 Trauma / Bottlenecks

#### A. Reward inflation

Hiện tại quest thắng là mint gear trực tiếp.
Kết quả:
- đồ rác tích tụ nhanh
- inventory sớm thành bãi rác
- người chơi chỉ quan tâm `power lớn hơn`

#### B. Deterministic combat seed quá yếu

Battle outcome hiện dựa vào:

```
hero_power + (timestamp_ms % 20) > boss_power
```

Vấn đề:
- không phải nguồn randomness tốt
- fairness narrative yếu hơn loot randomness
- combat depth thực tế gần như chỉ là “stat check”

#### C. Thiếu decision layers

Người chơi chưa phải chọn giữa:
- farm nguyên liệu hay farm tiến độ
- build glass cannon hay tank
- salvage hay giữ item
- craft item ngay hay tích materials
- dùng stamina vào mission ngắn hay expedition dài

#### D. Hero chưa có identity

Hero hiện gần như interchangeable:
- level cố định
- base power cố định
- item chỉ cộng số

Điều này làm giảm attachment và retention.

---

## 3. What From The Research Should Be Kept

### 3.1 Loot: thứ đáng học

Đáng học từ Loot:
- asset layer mở cho derivative
- metadata/lore đủ giàu để cộng đồng xây thêm
- composability như một chiến lược ecosystem

Không nên bê nguyên xi:
- item “quá primitive” nếu gameplay lõi còn mỏng
- community-first khi core game chưa giữ chân được người chơi

Áp dụng cho OneRealm:
- giữ `Equipment` là typed object
- thêm stable metadata/tags/set/affix để game khác có thể đọc
- mở composability ở biên tài sản, không phá gameplay core

### 3.2 Pirate Nation: thứ đáng học

Đáng học:
- async tasks / bounties
- resource loops
- crafting buildings
- frictionless web UX
- economy có sink và cadence quay lại

Áp dụng cho OneRealm:
- Quest Board
- Expedition/Bounty kéo dài theo thời gian
- Forge/Workshop/Arcane Lab
- stamina/energy có hồi theo thời gian

### 3.3 DeFi Kingdoms: thứ đáng học

Đáng học:
- profession loops
- stamina as pacing
- hero specialization
- training quests
- nhiều loại progression song song

Không nên bê sớm:
- token-first mentality
- financial layer chi phối gameplay

Áp dụng cho OneRealm:
- profession missions
- training grounds
- class affinity / mission affinity
- item materials + crafting recipes

### 3.4 OneChain-native lessons

Nên tận dụng:
- owned object model cho session/game state
- native randomness cho reward-critical flows
- composable assets/Kiosk compatibility
- dynamic fields cho equipment/attachments

Không nên làm:
- dùng `Clock` như nguồn randomness gameplay cốt lõi
- nhồi mọi loop nhỏ lên chain nếu không tăng trust value thực sự

---

## 4. Strategic Direction

### Core decision

OneRealm nên định vị là:

> `On-chain action-RPG economy runtime with server-authoritative sessions and composable assets`

Chứ không phải:
- “một Loot clone”
- “một DeFi farm game có skin fantasy”

### Product thesis

Người chơi ở lại lâu hơn nếu game có:
- loot anticipation
- build identity
- meaningful sink
- short-term choices
- medium-term crafting goals
- long-term collection/completion goals

Vì vậy roadmap nên ưu tiên:
1. kéo dài và chia tầng loop hiện tại
2. tạo nhiều loại reward/value hơn chỉ `power`
3. chỉ mở ecosystem/composability sau khi game lõi đã đáng chơi

---

## 5. Recommended Design Upgrades

## 5.1 MVP+1: 2-4 tuần

Mục tiêu:
- tăng depth mà không phá kiến trúc hiện tại
- giảm inflation
- tạo retention cadence

### A. Split reward: Materials > Direct Gear

Đề xuất:
- Mission không còn chủ yếu rơi gear hoàn chỉnh
- Reward table mới:
  - `common`: materials
  - `rare`: recipe fragments / blueprints
  - `boss / jackpot`: direct chest hoặc relic

Ví dụ:
- Iron Ore
- Armor Scrap
- Arcane Core
- Sword Blueprint Fragment
- Dungeon Sigil

Lợi ích:
- kéo dài loop
- tạo mục tiêu tích lũy
- giảm đồ rác
- mở đường cho crafting economy

### B. Add Salvage

Đề xuất:
- Cho phép đập đồ thành:
  - scrap
  - essence
  - chance trả lại rare fragment

Lợi ích:
- sink cho đồ rác
- giảm inflation
- tạo decision layer: giữ / equip / bán / salvage

### C. Add Item Affixes

Đề xuất:
- ngoài `power`, item có 1-2 affix nhẹ:
  - `Swift`: bonus cho missions ngắn
  - `Guarded`: bonus khi đánh dungeon
  - `Lucky`: tăng chance rơi blueprint
  - `Efficient`: giảm energy cost

Lợi ích:
- phá monoculture `bigger power always wins`
- tạo build diversity

### D. Replace weak battle seed

Đề xuất:
- bỏ `timestamp_ms % 20`
- 2 options hợp lý:
  1. dùng native randomness thêm một phase commit cho battle
  2. giảm randomness, tăng yếu tố mission affinity / item affix / stance choice

Khuyến nghị:
- ngắn hạn: giữ battle deterministic nhưng thêm `pre-battle stance` + affinity modifiers
- trung hạn: nghiên cứu randomness phù hợp hơn cho combat resolution

### E. Add Energy / Stamina

Đề xuất:
- hero có `energy`
- mission tiêu tốn energy
- energy hồi theo thời gian

Nhưng phải đi kèm:
- mission cost khác nhau
- expedition dài / ngắn
- decision rõ ràng giữa dùng năng lượng vào đâu

Nếu chỉ thêm energy để chặn spam:
- retention tăng nhẹ
- depth tăng rất ít

### F. Add Quest Types

Đề xuất ít nhất 3 loại:
- `Raid`: risk cao, blueprint chance cao
- `Harvest`: ít combat, nhiều materials
- `Training`: không rơi gear xịn, nhưng tăng mastery/proficiency

Lợi ích:
- player không còn chỉ bấm 1 quest duy nhất

---

## 5.2 Mid-term: 1-3 tháng

Mục tiêu:
- tạo economy loop có giao dịch
- làm hero khác nhau thật sự
- tăng retention bằng asynchronous play

### A. Blacksmith / Workshop Contracts

Đề xuất:
- `blacksmith.move` hoặc `forge.move`
- craft recipe:
  - materials
  - blueprint
  - optional catalyst

Result:
- crafted gear có quality band / affix roll / set tag

### B. Hero Archetypes

Đề xuất:
- Warrior
- Ranger
- Arcanist

Mỗi archetype có:
- mission affinity khác nhau
- weight khác nhau cho affix
- skill tree nhỏ hoặc passive traits

Lợi ích:
- tăng identity
- tăng replayability

### C. Professions

Đề xuất:
- Mining
- Foraging
- Smithing
- Relic Hunting

Profession cho:
- nguyên liệu riêng
- training riêng
- unlock recipe riêng

Lợi ích:
- layer progression ngoài combat
- thị trường bắt đầu có specialization

### D. Expeditions / Bounties

Đề xuất:
- quests dài 2h / 6h / 12h
- lock energy + hero slot trong thời gian đó
- reward table tốt hơn quest thường

Lợi ích:
- retention
- lịch quay lại
- planning layer

### E. Sets and Collections

Đề xuất:
- Iron Set
- Ranger Set
- Dungeonbreaker Set

Set bonus không cần quá phức tạp:
- +drop chance
- +energy efficiency
- +dungeon bonus

Lợi ích:
- người chơi có mục tiêu sưu tầm
- item “không mạnh nhất” vẫn còn giá trị

---

## 5.3 Long-term: 3-6 tháng

Mục tiêu:
- mở ecosystem
- tạo community derivatives
- giữ asset value qua nhiều modes

### A. Composability Layer

Đề xuất:
- stable item metadata schema
- public getters cho:
  - tier
  - slot
  - affix tags
  - set tags
  - provenance
- Kiosk-friendly item handling

Các game khác có thể dùng item của OneRealm để:
- mở dungeon
- unlock questline
- grant buff
- act as collection proof

### B. Realm Keys / World Objects

Đề xuất:
- không chỉ weapon/armor
- thêm object dạng:
  - Realm Key
  - Relic
  - Banner
  - Sigil

Đây là lớp tài sản phù hợp với composability hơn vũ khí thuần stat.

### C. Seasonal Content

Đề xuất:
- season-limited bosses
- rotating recipes
- temporary affix pools
- leaderboard rewards

Lợi ích:
- content cadence
- item history / prestige

### D. Guild Layer

Đề xuất:
- guild workshop
- guild bounty board
- pooled crafting objectives
- cooperative raid unlock conditions

Guild là nơi OneRealm có thể khác biệt mạnh hơn game farm đơn thuần.

---

## 6. What Should Not Be Prioritized Yet

### A. Equipment staking for yield

Không nên ưu tiên vì:
- biến item thành máy in token
- kéo player focus từ gameplay sang APR
- dễ phá economy trước khi gameplay ổn

### B. Token-first economy

Không nên làm sớm:
- fungible token
- LP mining
- farm loop cho item

Trước tiên phải chứng minh:
- item sink hoạt động
- crafting loop hấp dẫn
- retention cadence ổn

### C. Over-open composability

Không nên mở quá sớm kiểu:
- item chỉ là text bag
- không có gameplay rule nào nội tại

Điều OneRealm cần là:
- composable nhưng vẫn có game identity

---

## 7. Concrete Product Vision

### Vision statement đề xuất

> OneRealm là một on-chain fantasy gear economy nơi người chơi săn materials, chế tạo relics, xây build riêng cho hero, và dần mở khóa các realm systems có thể được tái sử dụng bởi nhiều game mode và nhiều studio khác nhau.

### Core player fantasy

Người chơi phải cảm thấy:
- “mình đang xây một build”
- “mình đang săn một recipe hiếm”
- “mình có lý do quay lại sau vài giờ”
- “mình có thể salvage / craft / trade thay vì chỉ bỏ đồ rác”
- “item này có ý nghĩa ngoài đúng con số power”

---

## 8. Proposed Upgraded Core Loop

### Loop đề xuất ngắn hạn

```
Choose mission type
-> spend energy
-> resolve quest
-> receive materials / fragments / occasional chest
-> decide: craft / salvage / trade / equip
-> improve build affinity, not only total power
-> unlock harder missions and longer expeditions
```

### Loop đề xuất trung hạn

```
Quest + Profession + Expedition
-> gather specialized resources
-> forge items / relics / keys
-> build hero archetype
-> complete set / unlock realm node
-> access new content tier
```

---

## 9. Recommended Prioritized Backlog

## Tier 1 — Nên làm ngay

1. Replace direct gear-heavy drops bằng material-heavy reward tables
2. Add salvage loop
3. Add 3 mission families: raid / harvest / training
4. Add item affixes
5. Remove weak clock-based battle seed

## Tier 2 — Nên làm tiếp

1. Add blacksmith crafting
2. Add energy / stamina with regen
3. Add hero archetypes
4. Add expeditions / bounties
5. Add sets and collection bonuses

## Tier 3 — Sau khi loop đã chứng minh được retention

1. Kiosk / marketplace-friendly metadata
2. Realm keys / relics / cross-mode assets
3. Seasonal events
4. Guild systems
5. Composability program cho external studios

---

## 10. Suggested ADR Candidates

Nếu tiếp tục phát triển, nên mở cycle ADR mới cho các quyết định sau:

- `ADR-012` — Reward model chuyển từ direct gear sang materials + recipes
- `ADR-013` — Salvage and item sink policy
- `ADR-014` — Combat resolution hardening (replace weak clock seed)
- `ADR-015` — Hero archetypes and affinity system
- `ADR-016` — Energy/stamina pacing model
- `ADR-017` — Composability boundary for OneRealm assets
- `ADR-018` — Anti-financialization guardrails trước khi phát hành fungible token

---

## 11. Suggested Implementation Order

### Phase A — Gameplay depth first

- reward table v2
- salvage
- mission families
- affixes

### Phase B — Economy loop

- crafting contracts
- profession resources
- stamina
- expeditions

### Phase C — Ecosystem expansion

- item metadata standardization
- Kiosk compatibility
- realm keys / relics
- seasonal content

---

## 12. External References

Những nguồn tham khảo có giá trị trực tiếp cho hướng đi này:

- Loot project: https://www.lootproject.com/
- Loot resources: https://www.lootproject.com/resources
- Pirate Nation bounties: https://docs.piratenation.game/learn/the-game/bounties
- Pirate Nation crafting buildings: https://docs.piratenation.game/learn/the-game/resources-and-crafting/crafting-buildings
- Pirate Nation wallet-popup-free & gasless gameplay: https://docs.piratenation.game/learn/about-our-tech/wallet-popup-free-and-gas-less-gameplay
- Pirate Nation token design FAQ: https://docs.piratenation.game/learn/usdpirate-faqs/what-is-usdpirate
- DeFi Kingdoms quests: https://docs.defikingdoms.com/gameplay/quests
- DeFi Kingdoms hero stats: https://docs.defikingdoms.com/gameplay/heroes/stats
- DeFi Kingdoms training quests: https://docs.defikingdoms.com/gameplay/quests/training-quests
- DeFi Kingdoms Void Hunt: https://docs.defikingdoms.com/gameplay/void-hunt-mad-boar
- Native randomness reference: https://blog.sui.io/secure-native-randomness-testnet/
- Object-chain security best practices: https://blog.sui.io/security-best-practices/
- Cosmocadia composable NFT reference: https://blog.sui.io/cosmocadia-composable-nft/
- The Walking Dead Lands Kiosk reference: https://blog.sui.io/walking-dead-lands-kiosk/
- XOCIETY consumer gaming reference: https://blog.sui.io/xociety-early-access-epic-games/

---

## 13. Final Recommendation

Nếu chỉ được chọn một hướng cho 90 ngày tới:

> Chọn `crafting economy + sinks + asynchronous progression`, không chọn `DeFi yield`, và cũng chưa cần `Loot-style radical composability`.

OneRealm có cơ hội mạnh nhất khi trở thành:
- một game loop fantasy dễ vào
- có economy đủ sâu để trade/craft
- có asset layer đủ chuẩn để mở rộng composability sau đó

Đây là đường ít rủi ro nhất, hợp với kiến trúc hiện tại nhất, và có khả năng biến OneRealm từ hackathon demo thành game system có khả năng sống lâu hơn.
