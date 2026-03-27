# Demo Script

Target duration: `<= 3 minutes`

## Setup

Before demo:
- sponsor wallet funded
- frontend deployed and reachable
- backend deployed and reachable
- package already published on the chosen network
- one hero account available as fallback if live mint has issues

## Live Walkthrough

### 1. Open `/about`

Narration:
- OneRealm is a GameFi fantasy economy on a Move-compatible runtime.
- The project focuses on gasless onboarding, on-chain ownership, and a playable crafting loop.

### 2. Enter Judge Mode

Narration:
- judges can enter the loop instantly without waiting on OAuth
- judge mode only compresses pacing; it does not bypass on-chain ownership or sponsored execution
- the normal path still supports Google-based onboarding for real users

### 3. Mint Hero

Narration:
- choose archetype and profession
- hero identity changes mission affinity and progression path

### 4. Quest

Narration:
- choose mission family and contract type
- server commits loot, then battle settles atomically
- all gas is sponsored

### 5. Inventory / Crafting

Narration:
- rewards are not just random gear inflation
- materials can be salvaged and crafted into profession-specific equipment

### 6. Expedition

Narration:
- asynchronous contracts increase retention cadence
- judge mode compresses expedition waits to about 30 seconds for live demo pacing
- progress survives refresh, so the UX is stable for real users

### 7. Close

Narration:
- OneRealm is already a playable MVP
- next layer is deeper ecosystem integration and live GameFi distribution

## Backup Path

If login or mint becomes flaky during live demo:
- start from a seeded account
- go directly to hero list
- show quest -> craft -> expedition recovery

## 90-Second Version

1. `/about`
2. `Enter Judge Mode`
3. Mint hero
4. `Claim Bundle`
5. Craft `Raider Blade`
6. Equip weapon
7. Start `Expedition`
8. Resolve after ~30 seconds
