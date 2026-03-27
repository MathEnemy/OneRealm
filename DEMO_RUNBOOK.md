# Demo Runbook

## Local URLs

- Frontend: `http://localhost:3003`
- Backend: `http://localhost:3011`
- Health: `http://localhost:3011/health`

## Live Config

- Chain: `OneChain Testnet`
- Judge mode: `enabled`
- Expedition timer in judge mode: `~30 seconds`
- Published package: `0x9348d3e1e8fb08948bf9d31c1ee4bd7fc93526e4f0150866a14c240ed515ce26`

## Before Demo

1. Check backend health.
2. Open frontend once and confirm `Enter Judge Mode` is visible.
3. Keep one browser tab on `Hero`, one on `Inventory`, one on `Quest` if needed.
4. Keep this fallback data ready:
   - Sponsor/demo address: `0x98dc92e59a4988b86a987b9b336004beb3f314b2a7fe243f31b45a1344879ad8`
   - Package ID: `0x9348d3e1e8fb08948bf9d31c1ee4bd7fc93526e4f0150866a14c240ed515ce26`
   - GameAuthority: `0x7eabb0ae0760c658c93b9c904defbe9ea5c627efe6b47f10ba935127758e0a4a`

## Recommended Demo Flow

1. Open `/about`.
2. Open `/` and click `Enter Judge Mode`.
3. Mint one hero.
4. Open that hero's inventory.
5. Click `Claim Bundle`.
6. Craft `Raider Blade`.
7. Equip the crafted weapon.
8. Open quest screen.
9. Start a judge-mode `Expedition`.
10. Wait roughly 30 seconds.
11. Resolve expedition and show rewards landed on-chain.

## 90-Second Pitch Order

1. `0-10s` Open `/about` and state the problem: most on-chain games still lose users at wallet setup and gas.
2. `10-20s` Open `/` and click `Enter Judge Mode` to show instant onboarding path for judges.
3. `20-35s` Mint a hero and call out archetype plus profession as the build identity layer.
4. `35-50s` Open inventory, click `Claim Bundle`, then craft one recipe to show materials are useful and not dead drops.
5. `50-60s` Equip the crafted item and call out that assets are still owned on-chain.
6. `60-75s` Start an `Expedition` from the quest screen and explain that judge mode only compresses timer friction.
7. `75-90s` Resolve the expedition, show rewards, then close on gasless UX + Move-owned economy + testnet deployment.

## What To Say

- Judge mode is only for pitch pacing.
- Real game loop still uses on-chain authority, gasless tx, and owned objects.
- Normal flow uses Google login and longer expedition timers.
- Demo mode compresses only the waiting and starter grind, not the core mechanics.

## If Something Flakes

- If frontend port changes, use the local URL printed by `next dev`.
- If OneChain RPC is flaky, retry once and keep the health endpoint visible.
- If browser state gets messy, refresh and re-enter judge mode.
- If expedition response looks stale, wait 2-3 seconds and refresh the quest page.
