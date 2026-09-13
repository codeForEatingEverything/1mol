# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project brief

`1mol` is a decentralized single-page yield protocol. **The authoritative spec is
`.gitignore/Ref.md`** — note that `.gitignore` is a *directory* here, not a file (it
holds `Ref.md`, the requirements, and `history.md`, the prior session log). Because git
cannot read ignore rules from a directory, ignore rules live in per-package
`.gitignore` files and root-only excludes live in `.git/info/exclude`.

Hard requirements from the spec, easy to break by accident:

- **Single page, no cover screen.** Stake and Earn swap in place on one route.
- **Reuse over reinvention.** vUSD and EarnVault must stay on OpenZeppelin's audited
  ERC-4626 rather than hand-rolled share math.
- **Footer links:** GitHub `codeForEatingEverything/1mol`, Telegram `@Scout0221`
  (capital S only — it has been wrong before).
- **Background artwork** (`frontend/public/background.png`) is the user's original
  high-resolution asset; do not downscale or replace it. Logo is `frontend/public/logo.png`.
- **Very fine-grained git history.** One commit per small change or module, never a
  batched commit. Genuine commits only — no padding.
- **CI must be green** (`.github/workflows/test.yml`).

## Commands

```bash
# Contracts (run from contracts/)
npm run compile                                   # hardhat compile + typechain
npm test                                          # full Hardhat suite
npx hardhat test --grep "should accrue yield"      # single test by name
npx hardhat node                                  # local chain on :8545
npx hardhat run scripts/deploy.ts --network localhost   # writes deployments.json
npx hardhat run scripts/e2e-flow.ts --network localhost # live end-to-end money flow

# Backend (run from backend/)
npx tsc --noEmit                                  # typecheck (CI gates on this)
npm test                                          # jest
npx jest -t "returns protocol stats"              # single test by name
npm run dev                                       # ts-node on :3001 (RPC_URL overridable)

# Frontend (run from frontend/)
npm run build                                     # what CI verifies
npm run dev
```

Root `package.json` aggregates `npm test` / `npm run build` across workspaces.

### Verifying the full flow end to end

The three suites pass without a chain, so they do **not** prove the stack is wired.
To actually verify:

```bash
cd contracts && npx hardhat node &                       # 1. chain
npx hardhat run scripts/deploy.ts --network localhost     # 2. deploy + deployments.json
npx hardhat run scripts/e2e-flow.ts --network localhost   # 3. deposit, accrue yield, restake
cd ../backend && npm run dev &                            # 4. service
curl localhost:3001/api/stats                             # 5. must match step 3's numbers
```

## Architecture

Two nested ERC-4626 layers. This nesting is the core idea and the source of most bugs:

```
USDC/USDT ──> StableVault ─┐
                           ├──> vUSD (ERC-4626, asset = USDC, share = vUSD)   [Layer 1]
WETH/WBTC ──> MajorVault ──┘              │
                                          └──> EarnVault (ERC-4626, asset = vUSD,
                                                share = s1MOL) + streaming 1MOL  [Layer 2]
```

- **`vUSD.sol`** — Layer 1. Extends OZ `ERC4626` directly. Yield is not rebased onto
  balances; `accrueYield()` transfers underlying *into* the vault, lifting
  `totalAssets()` so each share redeems for more. Share count never changes.
- **`StableVault.sol` / `MajorVault.sol`** — thin gateways, not vaults. They normalise
  decimals (and, for majors, apply an owner-set USD price) and then call
  `vUSD.deposit(...)` with the **user** as receiver, so shares land directly with the
  depositor. `MajorVault` needs underlying liquidity of its own to mint against.
- **`EarnVault.sol`** — Layer 2, `ERC4626` whose *asset is vUSD*. Depositors keep
  Layer 1 share-price appreciation and additionally accrue 1MOL through a
  Synthetix-style `rewardPerToken` accumulator. Reward settlement is hooked into
  `_update` so share transfers — not just deposit/withdraw — settle correctly.
- **`MolToken.sol`** — 1MOL, minted on demand by EarnVault via a minter allowlist.

### Decimals: the recurring trap

OZ ERC-4626 derives **share decimals from the underlying asset** (`_decimalsOffset()`
is 0 here). With USDC as the underlying, **vUSD and s1MOL are 6-decimal, not 18.**
Formatting them as 18 silently understates every balance by 1e12. 1MOL rewards *are*
18-decimal. `backend/src/viemClient.ts` reads both vault and asset decimals from chain
per vault (cached) rather than assuming — keep it that way.

OZ v5 also adds a virtual share/asset offset as an inflation-attack guard, so
`convertToAssets` rounds down in the vault's favour by up to 1 wei. Assert with
`closeTo`, not `equal`.

### Backend

`backend/src/viemClient.ts` is the only chain-facing module: a viem `publicClient` plus
minimal inline ABIs. Contract addresses come from `contracts/deployments.json`, written
by the deploy script and re-read per request.

**It must never fabricate data.** An earlier version called functions that did not exist
on the vaults (`totalDepositedUSD`, `totalStaked`, `sharesOf`), swallowed every revert,
and served hardcoded "sample" TVL that looked real. The contract now is: when the
deployment file or chain is missing, return `chainConnected: false` with a `reason` and
null figures. `backend/test/api.test.ts` asserts both branches, so a regression to fake
numbers fails the suite.

Protocol TVL is Layer 1 underlying only — Layer 2 holds vUSD shares, so summing the two
double counts.

### Frontend

Next.js App Router, single route. `src/app/providers.tsx` wraps wagmi → react-query →
RainbowKit; `src/app/page.tsx` holds the `stake | earn` tab state. Chains are hardhat,
Sepolia, mainnet (`src/config/wagmi.ts`).

## Build gotchas already fixed — don't regress them

- **`evmVersion: "cancun"`** in `hardhat.config.ts` is required: OZ v5 emits the `mcopy`
  opcode, and solc 0.8.24 defaults to `paris`, failing with `DeclarationError`.
- **`jest.config.js` resolves ts-jest via `require.resolve`** — npm workspaces hoist it to
  the repo root, which jest's own resolver does not walk up to.
- **`backend/tsconfig.json` includes the `DOM` lib** — viem's `ox` dependency ships TS
  sources referencing WebAuthn globals that `skipLibCheck` does not cover.
- **`@x402/evm` and `@x402/svm` are direct frontend deps** — wagmi's `baseAccount`
  connector (reached through RainbowKit's `getDefaultConfig`) imports them as unlisted
  optional peers, and webpack fails the production build without them.
