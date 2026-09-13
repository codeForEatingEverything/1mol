# 1mol

**A liquidity layer for [1inch Aqua](https://github.com/1inch/aqua).** Deposit an asset, receive
`vUSD`, and hold a transferable ERC-4626 position in market making that would otherwise leave you
with no receipt at all.

[![CI](https://github.com/codeForEatingEverything/1mol/actions/workflows/test.yml/badge.svg)](https://github.com/codeForEatingEverything/1mol/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

---

## What problem this solves

Aqua is a liquidity registry, not a vault. It records
`balances[maker][app][strategyHash][token]` as an **allowance**, so the maker's tokens never leave
their own account. That design removes two costs that traditional AMM liquidity providers pay —
there is no way for a searcher to inject just-in-time liquidity and dilute an existing maker's
fees, and quoting is gated to the resolvers a maker admits rather than open to any arbitrageur.

Those properties are valuable. Reaching them as an individual is not practical:

| | Providing to Aqua directly | Through 1mol |
| --- | --- | --- |
| Receipt for the position | none — the position is not tokenised | `vUSD`, a transferable ERC-4626 share |
| Staying in range | a shipped strategy is **immutable**; each adjustment is a dock-and-ship paid alone | one rebalance covers every depositor |
| Composability | capital is committed with nothing to pledge elsewhere | `vUSD` can be restaked, and later pledged |
| Multi-pool delegation | return rises sub-linearly, ruin probability rises faster | allocation caps bound each strategy's draw |
| Reward for risk taken | flat, whatever exposure is accepted | priced by tier, tenure and restaking |

The last row is the one that matters most. Delegating a single balance across several strategies is
what makes Aqua capital-efficient, and it is also what makes a lone provider's position fragile: a
flat pro-rata reward schedule pays the same whether the depositor accepted one strategy or five. So
most decline, and the liquidity the protocol depends on stays thin. 1mol prices that exposure
explicitly.

## Architecture

```
                  ┌─────────────── Layer 1: staking ────────────────┐
  USDC / USDT ──▶ │ StableVault ─┐                                  │
                  │              ├──▶ vUSD  (ERC-4626, share-       │
  WETH / WBTC ──▶ │ MajorVault ──┘          appreciating)           │
                  └────────────────────────┬─────────────────────────┘
                                           │
                       ┌───────────────────┴────────────────────┐
                       ▼                                        ▼
            ┌──────────────────────┐              ┌─────────────────────────┐
            │ AquaStrategyManager  │              │ Layer 2: Earn           │
            │ one aggregated maker │              │ vUSD ──▶ stvUSD         │
            │ allowlist + caps     │              │ raises loyalty curve    │
            └──────────┬───────────┘              └────────────┬────────────┘
                       │ ship / dock                           │
                       ▼                                       ▼
            ┌──────────────────────┐              ┌─────────────────────────┐
            │ 1inch Aqua registry  │              │ LoyaltyEngine           │
            │ 0x1111113ccf…6a90a   │              │ risk x tenure x restake │
            └──────────────────────┘              └─────────────────────────┘
```

### Two tokens, both share-appreciating

`vUSD` and `stvUSD` follow the `wstETH` model: **the holder's balance never changes**, and each
share redeems for progressively more of the underlying. Nothing rebases and nothing is claimed, so
both tokens behave predictably as collateral elsewhere.

| Token | Vault | Underlying | Minted by |
| --- | --- | --- | --- |
| `vUSD` | Layer 1 | the deposited asset | staking into `StableVault` / `MajorVault` |
| `stvUSD` | Layer 2 | `vUSD` | staking `vUSD` into the Earn campaign |

### Contracts

| Contract | Responsibility |
| --- | --- |
| [`vUSD.sol`](contracts/contracts/vUSD.sol) | Layer 1 ERC-4626 vault; routes realised profit and absorbs losses |
| [`StableVault.sol`](contracts/contracts/StableVault.sol) | USDC/USDT gateway, normalises decimals |
| [`MajorVault.sol`](contracts/contracts/MajorVault.sol) | WETH/WBTC gateway, converts at the configured price |
| [`EarnVault.sol`](contracts/contracts/EarnVault.sol) | Layer 2 ERC-4626 over `vUSD`, mints `stvUSD` |
| [`AquaStrategyManager.sol`](contracts/contracts/strategies/AquaStrategyManager.sol) | Ships and docks strategies as one maker, under allowlist and caps |
| [`LoyaltyEngine.sol`](contracts/contracts/LoyaltyEngine.sol) | Prices opted-in risk: tier × tenure × restaking |
| [`SafetyReserve.sol`](contracts/contracts/SafetyReserve.sol) | First-loss capital funded from realised profit |
| [`IAqua.sol`](contracts/contracts/interfaces/IAqua.sol) | Aqua registry interface (declaration only) |

## Risk controls

Enforced in code, not described in a roadmap:

- **Allowlist.** A strategy app cannot receive capital until the owner admits it.
- **Per-strategy caps.** Each strategy carries a cap in basis points of managed assets; an
  allocation above it reverts.
- **Global cap.** Total deployment is bounded (default 90%), so a redemption buffer stays liquid
  regardless of per-strategy caps.
- **Emergency dock.** `emergencyDockAll` pulls every live strategy back in one call, callable by
  owner or vault so a keeper need not wait on governance.
- **First-loss capital.** 10% of realised profit is retained in `SafetyReserve` and 5% goes to
  treasury; the remaining 85% compounds into the share price. `absorbLoss` draws on the reserve
  first and **reports any uncovered remainder** rather than concealing it — the protocol bounds the
  drawdown it can fund and says so when it cannot.

## Loyalty

Reward share is computed from risk accepted, not deposit size:

```
loyalty power = principal × Σ(tier weight) × tenure × restake
```

| Component | Values |
| --- | --- |
| Tier weight | Stable `1.0x` · Major `1.8x` · Long-tail `3.5x` |
| Tenure | `1.2x` past 30 days · `1.5x` past 90 days; resets when opted-in risk rises |
| Restake | `1.4x` while the position is held as `stvUSD` |

Two equal deposits therefore do not split rewards evenly: one accepting every tier takes a
materially larger share than one taking the base pool alone. Tenure resetting on a risk increase
prevents a long-tenure multiplier being accrued cheaply and then redirected into high-risk
strategies.

## Getting started

```bash
git clone https://github.com/codeForEatingEverything/1mol
cd 1mol
```

### Contracts

```bash
cd contracts
npm install
npm run compile                                   # hardhat compile + typechain
npm test                                          # full suite, no network needed
npx hardhat test --grep "loyalty"                 # a single group
```

### Against the real Aqua registry

Aqua is deployed to 17 mainnets and **has no testnet**, so its suite runs on a mainnet fork:

```bash
AQUA_FORK=1 npx hardhat test test/Aqua.fork.test.ts
```

This exercises the deployed registry at `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` — not a mock.
Set `MAINNET_RPC_URL` to use your own endpoint, and `FORK_BLOCK` to pin a block for cache reuse.

### Local end-to-end

```bash
cd contracts
npx hardhat node &                                        # local chain
npx hardhat run scripts/deploy.ts --network localhost     # writes deployments.json + frontend/.env.local
npx hardhat run scripts/ui-paths.ts --network localhost   # replays every frontend call path
RECIPIENT=0xYourAddress npx hardhat run scripts/faucet.ts --network localhost

cd ../backend && npm install && npm run dev               # indexer on :3001
cd ../frontend && npm install && npm run dev              # UI on :3000
```

`deploy.ts` writes `frontend/.env.local`, so the UI needs no manual address wiring.

## Testing

| Suite | Coverage |
| --- | --- |
| `Vaults.test.ts` | ERC-4626 mechanics, both gateways, Layer 2 staking |
| `LoyaltyEngine.test.ts` | risk-weighted emission, tenure steps and resets, restake compounding |
| `SafetyReserve.test.ts` | profit split, loss absorption, uncovered reporting |
| `AquaStrategyManager.test.ts` | allowlist, caps, emergency dock, non-custodial approval |
| `Aqua.fork.test.ts` | the **real** Aqua registry on a mainnet fork |
| `backend/test/api.test.ts` | API contract, including honest degradation with no chain |

The API suite asserts that endpoints report `chainConnected: false` with a reason when no
deployment is reachable, so a regression to placeholder figures fails the build rather than
shipping quietly.

## Repository layout

```
contracts/   Hardhat — Solidity sources, deploy and verification scripts, tests
backend/     Express + viem — reads vault state, no write paths
frontend/    Next.js App Router — wagmi + viem + RainbowKit, single page
```

## Roadmap

- Route major-asset deposits through 1inch Swap so conversion happens at market price rather than a
  configured one
- Live SwapVM strategy apps behind `AquaStrategyManager`
- Aave and Morpho allocations for the Earn layer
- Isolated `vUSD` lending market so the receipt can be pledged
- RWA and cross-venue strategies

## Status

Hackathon MVP. Unaudited; the mainnet Aqua integration is exercised on a fork and has not been
deployed. `SafetyReserve.withdrawToTreasury` is intentionally unguarded by a timelock at this stage
and would need one before production.

## Links

- Demo — https://1mol.xyz/demo
- Telegram — [@Scout0221](https://t.me/Scout0221)

## License

MIT — see [LICENSE](./LICENSE). 1inch Aqua is separately licensed under
`LicenseRef-Degensoft-Aqua-Source-1.1`; this repository declares its interface and calls its
deployed contracts, and vendors none of its source.
