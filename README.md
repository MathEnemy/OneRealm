# OneRealm

OneRealm is a GameFi fantasy economy built for OneHack on top of OneChain's Move-compatible runtime.

Players:
- log in with Google
- mint heroes gaslessly
- run `Raid`, `Harvest`, and `Training` contracts
- salvage or craft equipment from materials
- send heroes on asynchronous expeditions that can be resumed after refresh

## Why It Fits OneHack

OneRealm targets the `GameFi` track with a playable MVP, not a pitch deck demo.

Core fit:
- built on a Move-compatible chain runtime
- uses owned objects, dynamic fields, PTBs, and sponsored transactions
- ships a real gameplay loop with progression, crafting, and economy sinks
- includes a judge-facing app page at `/about`

## OneChain Alignment

Current repo alignment:
- `OneChain Move infrastructure`: on-chain game logic in Move modules
- `Sponsored transactions`: gasless onboarding and quest flow
- `OnePredict-ready AI Mentor`: in-app build/readiness recommendations
- `OnePlay-ready GameFi UX`: low-friction quest and crafting loop
- `ONEbox + OneChain docs`: builder resources linked directly in the app and env docs

Current chain defaults are configured for OneChain Testnet:
- RPC: `https://rpc-testnet.onelabs.cc:443`
- Docs: `https://docs.onelabs.cc/DevelopmentDocument`
- Toolkit: `https://onebox.onelabs.cc/chat`

## Repo Layout

- `contracts/`: Move modules and tests
- `game-server/`: auth, sponsorship, session, battle, AI mentor
- `frontend/`: Next.js app, login flow, hero, quest, inventory, judge-facing about page

## Quick Start

### 1. Contracts

Use the OneChain-compatible Move CLI toolchain to publish the package, then copy:
- `ONEREALM_PACKAGE_ID`
- `GAME_AUTHORITY_OBJECT_ID`
- `SPONSOR_ADDRESS`

### 2. Backend

Copy [game-server/.env.example](/home/ybao/B.1/OneRealm/game-server/.env.example) to `game-server/.env`.

```bash
cd game-server
npm install
npm run dev
```

### 3. Frontend

Copy [frontend/.env.local.example](/home/ybao/B.1/OneRealm/frontend/.env.local.example) to `frontend/.env.local`.

```bash
cd frontend
npm install
npm run dev
```

## Judge Flow

Recommended 3-minute demo:
1. Open `/about`
2. Login with Google
3. Mint hero
4. Run a quest
5. Craft or salvage
6. Start expedition
7. Refresh and return to prove recovery UX

Detailed script: [DEMO_SCRIPT.md](/home/ybao/B.1/OneRealm/DEMO_SCRIPT.md)

## Verification

Frontend:
- `npm run build`
- `npm run test:e2e`

Backend:
- `npm test`

Contracts:
- `one move test` or compatible Move CLI

## Submission Pack

- Submission brief: [ONEHACK_SUBMISSION.md](/home/ybao/B.1/OneRealm/ONEHACK_SUBMISSION.md)
- Demo script: [DEMO_SCRIPT.md](/home/ybao/B.1/OneRealm/DEMO_SCRIPT.md)
- System spec: [BLUEPRINT.md](/home/ybao/B.1/OneRealm/BLUEPRINT.md)
- Contracts/API spec: [CONTRACTS.md](/home/ybao/B.1/OneRealm/CONTRACTS.md)
