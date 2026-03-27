# Demo Runbook

## Local URLs

- Frontend: `http://localhost:3003`
- Backend: `http://localhost:3011`
- Health: `http://localhost:3011/health`

## Preferred Recording Mode

Use production-style startup for recording, not `next dev`.

1. Backend:
   - `cd game-server`
   - `npm run build`
   - `PORT=3011 npm run start`
2. Frontend:
   - `cd frontend`
   - `rm -rf .next && npm run build`
   - `npm run start -- --port 3003`
3. Preflight:
   - from repo root run `./scripts/demo_go_no_go.sh`
4. If you check health manually with `curl`, include an allowed origin:
   - `curl -H "Origin: http://localhost:3003" http://127.0.0.1:3011/health`

This avoids hot-reload noise, `.next` race conditions, and random dev-server chunk misses while recording.

## Live Config

- Chain: `OneChain Testnet`
- Judge mode: `enabled`
- Expedition timer in judge mode: `~30 seconds`
- Published package: `0x9348d3e1e8fb08948bf9d31c1ee4bd7fc93526e4f0150866a14c240ed515ce26`

## Before Demo

1. Check backend health.
2. Run `./scripts/demo_go_no_go.sh` and require `GO` before recording.
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

1. `0-08s` Open `/about` and frame the pitch: wallet friction and gas still kill most on-chain game onboarding.
2. `08-16s` Open `/` and click `Enter Judge Mode` to show the compressed demo lane.
3. `16-28s` Mint one hero with a simple build identity. Recommended: balanced archetype plus blacksmith profession for the cleanest craft story.
4. `28-40s` Open inventory and click `Claim Bundle`.
5. `40-52s` Craft `Raider Blade`.
6. `52-60s` Equip the crafted weapon and point out that the item remains an owned on-chain object.
7. `60-72s` Open quest, choose `Training` + `Expedition` + `Balanced`, then launch the mission.
8. `72-90s` Wait for the ~30s expedition timer, settle, show the result panel, and close on gasless UX + async quest loop.

## Low-Risk Recording Script

Use this exact click path to minimize retries:

1. Start from a clean browser profile or an Incognito window with wallet extensions disabled.
2. Open `http://localhost:3003/about`.
3. Move to `http://localhost:3003/` and click `Enter Judge Mode`.
4. Mint exactly one hero.
5. On the hero page, click through to inventory.
6. In inventory, click `Claim Bundle`.
7. Craft `Raider Blade`.
8. Equip the new weapon.
9. Open quest.
10. Choose `Training`.
11. Choose `Expedition`.
12. Choose `Balanced`.
13. Start the quest and submit the departure step.
14. Let the timer finish naturally.
15. Click settle once and wait for the result panel before speaking over rewards.

## Recommended Spoken Track

- `About`: "OneRealm keeps the ownership and async game loop on-chain, but removes wallet and gas friction."
- `Judge mode`: "For the demo I compress waiting, not the mechanics."
- `Mint`: "A hero starts as a real on-chain object with build identity."
- `Inventory`: "Starter materials feed immediately into crafting instead of sitting dead in a wallet."
- `Quest`: "Missions are async, so progression feels like sending an expedition rather than spamming clicks."
- `Result`: "Settlement resolves the expedition and delivers the rewards back on-chain."

## What To Say

- Judge mode is only for pitch pacing.
- Real game loop still uses on-chain authority, gasless tx, and owned objects.
- Normal flow uses Google login and longer expedition timers.
- Demo mode compresses only the waiting and starter grind, not the core mechanics.

## If Something Flakes

- If frontend port changes, use the local URL printed by `next start`.
- If OneChain RPC is flaky, retry once after 3-5 seconds before resetting the flow.
- If browser state gets messy, refresh and re-enter judge mode.
- If extension errors appear in console, switch to a clean or Incognito browser profile.
- If expedition response looks stale, wait 2-3 seconds and refresh the quest page.
- If local config drifts, rerun `./scripts/demo_go_no_go.sh` before taking another recording.
