import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Reuses an address already recorded in deployments.json for this network, so a
 * run interrupted by gas can be resumed without paying to redeploy what exists.
 */
function existing(prior: Record<string, any>, key: string): string | undefined {
  const value = key.startsWith("tokens.") ? prior.tokens?.[key.slice(7)] : prior[key];
  return typeof value === "string" && value.startsWith("0x") ? value : undefined;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying 1mol ERC-4626 Protocol with account:", deployer.address);

  const network = await ethers.provider.getNetwork();
  const priorPath = path.resolve(__dirname, "..", `deployments.${network.chainId}.json`);
  const prior: Record<string, any> = fs.existsSync(priorPath)
    ? JSON.parse(fs.readFileSync(priorPath, "utf8"))
    : {};

  /** Deploys only if this key is not already recorded for the network. */
  async function reuseOrDeploy(
    key: string,
    deployFn: () => Promise<{ getAddress(): Promise<string> }>
  ): Promise<string> {
    const known = existing(prior, key);
    if (known) {
      console.log(`${key} reused at ${known}`);
      return known;
    }
    const contract = await deployFn();
    const address = await contract.getAddress();
    console.log(`${key} deployed to ${address}`);
    // Record immediately so a later failure does not lose this address.
    const merged = { ...prior };
    if (key.startsWith("tokens.")) {
      merged.tokens = { ...(merged.tokens ?? {}), [key.slice(7)]: address };
    } else {
      merged[key] = address;
    }
    Object.assign(prior, merged);
    fs.writeFileSync(priorPath, JSON.stringify(prior, null, 2));
    return address;
  }

  // 1. Deploy Mock Tokens
  const MockERC20 = await ethers.getContractFactory("MockERC20");

  const usdcAddress = await reuseOrDeploy("tokens.USDC", async () => {
    const c = await MockERC20.deploy("USD Coin", "USDC", 6);
    await c.waitForDeployment();
    return c;
  });
  const usdc = await ethers.getContractAt("MockERC20", usdcAddress);

  const usdtAddress = await reuseOrDeploy("tokens.USDT", async () => {
    const c = await MockERC20.deploy("Tether USD", "USDT", 6);
    await c.waitForDeployment();
    return c;
  });

  const wethAddress = await reuseOrDeploy("tokens.WETH", async () => {
    const c = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
    await c.waitForDeployment();
    return c;
  });

  const wbtcAddress = await reuseOrDeploy("tokens.WBTC", async () => {
    const c = await MockERC20.deploy("Wrapped BTC", "WBTC", 8);
    await c.waitForDeployment();
    return c;
  });

  console.log("Mock Assets deployed:", {
    USDC: usdcAddress,
    USDT: usdtAddress,
    WETH: wethAddress,
    WBTC: wbtcAddress,
  });

  // 2. Deploy vUSD as standard ERC-4626 Vault
  const VUSD = await ethers.getContractFactory("vUSD");
  const vUsdAddress = await reuseOrDeploy("vUSD", async () => {
    const c = await VUSD.deploy(usdcAddress);
    await c.waitForDeployment();
    return c;
  });
  const vUsd = await ethers.getContractAt("vUSD", vUsdAddress);

  // 4. Deploy StableVault Gateway
  const StableVault = await ethers.getContractFactory("StableVault");
  const isNewStableVault = !existing(prior, "StableVault");
  const stableVaultAddress = await reuseOrDeploy("StableVault", async () => {
    const c = await StableVault.deploy(vUsdAddress);
    await c.waitForDeployment();
    return c;
  });
  const stableVault = await ethers.getContractAt("StableVault", stableVaultAddress);
  if (isNewStableVault) {
    await (await stableVault.addSupportedToken(usdtAddress)).wait();
  }

  // 5. Deploy MajorVault Gateway
  const MajorVault = await ethers.getContractFactory("MajorVault");
  const isNewMajorVault = !existing(prior, "MajorVault");
  const majorVaultAddress = await reuseOrDeploy("MajorVault", async () => {
    const c = await MajorVault.deploy(vUsdAddress);
    await c.waitForDeployment();
    return c;
  });
  const majorVault = await ethers.getContractAt("MajorVault", majorVaultAddress);

  if (isNewMajorVault) {
    await (await majorVault.configureAsset(wethAddress, ethers.parseUnits("3000", 18))).wait();
    await (await majorVault.configureAsset(wbtcAddress, ethers.parseUnits("60000", 18))).wait();
  }

  // MajorVault mints vUSD by depositing the USD underlying on the user's behalf,
  // so it must hold USDC liquidity of its own or every ETH/BTC deposit reverts.
  if (isNewMajorVault) {
    await (await usdc.mint(majorVaultAddress, ethers.parseUnits("100000", 6))).wait();
    console.log("MajorVault seeded with 100,000 USDC of minting liquidity");
  }

  // 6a. Safety reserve: first-loss capital funded from realised profit.
  const SafetyReserve = await ethers.getContractFactory("SafetyReserve");
  const isNewReserve = !existing(prior, "SafetyReserve");
  const safetyReserveAddress = await reuseOrDeploy("SafetyReserve", async () => {
    const c = await SafetyReserve.deploy(usdcAddress);
    await c.waitForDeployment();
    return c;
  });
  if (isNewReserve) {
    const reserve = await ethers.getContractAt("SafetyReserve", safetyReserveAddress);
    await (await reserve.setVault(vUsdAddress)).wait();
    await (await vUsd.setSafetyReserve(safetyReserveAddress)).wait();
  }

  // 6b. Loyalty engine: prices the risk a depositor opts into.
  const LoyaltyEngine = await ethers.getContractFactory("LoyaltyEngine");
  const isNewLoyalty = !existing(prior, "LoyaltyEngine");
  const loyaltyEngineAddress = await reuseOrDeploy("LoyaltyEngine", async () => {
    const c = await LoyaltyEngine.deploy();
    await c.waitForDeployment();
    return c;
  });
  const loyaltyEngine = await ethers.getContractAt("LoyaltyEngine", loyaltyEngineAddress);

  // 6. Deploy EarnVault (Nested ERC-4626 on vUSD + Rewards)
  const EarnVault = await ethers.getContractFactory("EarnVault");
  const earnVaultAddress = await reuseOrDeploy("EarnVault", async () => {
    const c = await EarnVault.deploy(vUsdAddress);
    await c.waitForDeployment();
    return c;
  });

  // The Earn vault is what reports restaking to the loyalty engine.
  if (isNewLoyalty) {
    await (await loyaltyEngine.setVault(earnVaultAddress)).wait();
  }

  // 7. Aqua strategy manager. Aqua is deployed to the same address on every
  // supported mainnet; on a local chain there is no registry, so this is wired
  // for shape and left without allowlisted strategies.
  const AQUA_REGISTRY = "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a";
  const AquaStrategyManager = await ethers.getContractFactory("AquaStrategyManager");
  const aquaManagerAddress = await reuseOrDeploy("AquaStrategyManager", async () => {
    const c = await AquaStrategyManager.deploy(AQUA_REGISTRY, vUsdAddress);
    await c.waitForDeployment();
    return c;
  });

  // Save deployments
  const deploymentInfo = {
    network: "hardhat_local",
    vUSD: vUsdAddress,
    SafetyReserve: safetyReserveAddress,
    LoyaltyEngine: loyaltyEngineAddress,
    AquaStrategyManager: aquaManagerAddress,
    AquaRegistry: AQUA_REGISTRY,
    StableVault: stableVaultAddress,
    MajorVault: majorVaultAddress,
    EarnVault: earnVaultAddress,
    tokens: {
      USDC: usdcAddress,
      USDT: usdtAddress,
      WETH: wethAddress,
      WBTC: wbtcAddress,
    },
  };

  const contractsDir = path.resolve(__dirname, "..");
  fs.writeFileSync(
    path.join(contractsDir, "deployments.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("Deployment config written to contracts/deployments.json");

  // Hand the same addresses to the frontend so the UI needs no manual wiring.
  const frontendEnv = [
    `NEXT_PUBLIC_VUSD_ADDRESS=${vUsdAddress}`,
    `NEXT_PUBLIC_STABLE_VAULT_ADDRESS=${stableVaultAddress}`,
    `NEXT_PUBLIC_MAJOR_VAULT_ADDRESS=${majorVaultAddress}`,
    `NEXT_PUBLIC_EARN_VAULT_ADDRESS=${earnVaultAddress}`,
    `NEXT_PUBLIC_SAFETY_RESERVE_ADDRESS=${safetyReserveAddress}`,
    `NEXT_PUBLIC_LOYALTY_ENGINE_ADDRESS=${loyaltyEngineAddress}`,
    `NEXT_PUBLIC_AQUA_MANAGER_ADDRESS=${aquaManagerAddress}`,
    `NEXT_PUBLIC_USDC_ADDRESS=${usdcAddress}`,
    `NEXT_PUBLIC_USDT_ADDRESS=${usdtAddress}`,
    `NEXT_PUBLIC_WETH_ADDRESS=${wethAddress}`,
    `NEXT_PUBLIC_WBTC_ADDRESS=${wbtcAddress}`,
    "",
  ].join("\n");

  const frontendEnvPath = path.resolve(contractsDir, "..", "frontend", ".env.local");
  fs.writeFileSync(frontendEnvPath, frontendEnv);
  console.log("Frontend env written to frontend/.env.local");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
