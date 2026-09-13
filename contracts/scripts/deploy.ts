import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying 1mol ERC-4626 Protocol with account:", deployer.address);

  // 1. Deploy Mock Tokens
  const MockERC20 = await ethers.getContractFactory("MockERC20");

  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();

  const usdt = await MockERC20.deploy("Tether USD", "USDT", 6);
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();

  const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
  await weth.waitForDeployment();
  const wethAddress = await weth.getAddress();

  const wbtc = await MockERC20.deploy("Wrapped BTC", "WBTC", 8);
  await wbtc.waitForDeployment();
  const wbtcAddress = await wbtc.getAddress();

  console.log("Mock Assets deployed:", {
    USDC: usdcAddress,
    USDT: usdtAddress,
    WETH: wethAddress,
    WBTC: wbtcAddress,
  });

  // 2. Deploy vUSD as standard ERC-4626 Vault
  const VUSD = await ethers.getContractFactory("vUSD");
  const vUsd = await VUSD.deploy(usdcAddress);
  await vUsd.waitForDeployment();
  const vUsdAddress = await vUsd.getAddress();
  console.log("vUSD (ERC-4626 Vault) deployed to:", vUsdAddress);

  // 4. Deploy StableVault Gateway
  const StableVault = await ethers.getContractFactory("StableVault");
  const stableVault = await StableVault.deploy(vUsdAddress);
  await stableVault.waitForDeployment();
  const stableVaultAddress = await stableVault.getAddress();
  console.log("StableVault deployed to:", stableVaultAddress);

  await (await stableVault.addSupportedToken(usdtAddress)).wait();

  // 5. Deploy MajorVault Gateway
  const MajorVault = await ethers.getContractFactory("MajorVault");
  const majorVault = await MajorVault.deploy(vUsdAddress);
  await majorVault.waitForDeployment();
  const majorVaultAddress = await majorVault.getAddress();
  console.log("MajorVault deployed to:", majorVaultAddress);

  await (await majorVault.configureAsset(wethAddress, ethers.parseUnits("3000", 18))).wait();
  await (await majorVault.configureAsset(wbtcAddress, ethers.parseUnits("60000", 18))).wait();

  // MajorVault mints vUSD by depositing the USD underlying on the user's behalf,
  // so it must hold USDC liquidity of its own or every ETH/BTC deposit reverts.
  await (await usdc.mint(majorVaultAddress, ethers.parseUnits("10000000", 6))).wait();
  console.log("MajorVault seeded with 10,000,000 USDC of minting liquidity");

  // 6a. Safety reserve: first-loss capital funded from realised profit.
  const SafetyReserve = await ethers.getContractFactory("SafetyReserve");
  const safetyReserve = await SafetyReserve.deploy(usdcAddress);
  await safetyReserve.waitForDeployment();
  const safetyReserveAddress = await safetyReserve.getAddress();
  await (await safetyReserve.setVault(vUsdAddress)).wait();
  await (await vUsd.setSafetyReserve(safetyReserveAddress)).wait();
  console.log("SafetyReserve deployed to:", safetyReserveAddress);

  // 6b. Loyalty engine: prices the risk a depositor opts into.
  const LoyaltyEngine = await ethers.getContractFactory("LoyaltyEngine");
  const loyaltyEngine = await LoyaltyEngine.deploy();
  await loyaltyEngine.waitForDeployment();
  const loyaltyEngineAddress = await loyaltyEngine.getAddress();
  console.log("LoyaltyEngine deployed to:", loyaltyEngineAddress);

  // 6. Deploy EarnVault (Nested ERC-4626 on vUSD + Rewards)
  const EarnVault = await ethers.getContractFactory("EarnVault");
  const earnVault = await EarnVault.deploy(vUsdAddress);
  await earnVault.waitForDeployment();
  const earnVaultAddress = await earnVault.getAddress();
  console.log("EarnVault deployed to:", earnVaultAddress);

  // The Earn vault is what reports restaking to the loyalty engine.
  await (await loyaltyEngine.setVault(earnVaultAddress)).wait();

  // 7. Aqua strategy manager. Aqua is deployed to the same address on every
  // supported mainnet; on a local chain there is no registry, so this is wired
  // for shape and left without allowlisted strategies.
  const AQUA_REGISTRY = "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a";
  const AquaStrategyManager = await ethers.getContractFactory("AquaStrategyManager");
  const aquaManager = await AquaStrategyManager.deploy(AQUA_REGISTRY, vUsdAddress);
  await aquaManager.waitForDeployment();
  const aquaManagerAddress = await aquaManager.getAddress();
  console.log("AquaStrategyManager deployed to:", aquaManagerAddress);

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

main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying 1mol ERC-4626 Protocol with account:", deployer.address);

  // 1. Deploy Mock Tokens
  const MockERC20 = await ethers.getContractFactory("MockERC20");

  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();

  const usdt = await MockERC20.deploy("Tether USD", "USDT", 6);
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();

  const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
  await weth.waitForDeployment();
  const wethAddress = await weth.getAddress();

  const wbtc = await MockERC20.deploy("Wrapped BTC", "WBTC", 8);
  await wbtc.waitForDeployment();
  const wbtcAddress = await wbtc.getAddress();

  console.log("Mock Assets deployed:", {
    USDC: usdcAddress,
    USDT: usdtAddress,
    WETH: wethAddress,
    WBTC: wbtcAddress,
  });

  // 2. Deploy vUSD as standard ERC-4626 Vault
  const VUSD = await ethers.getContractFactory("vUSD");
  const vUsd = await VUSD.deploy(usdcAddress);
  await vUsd.waitForDeployment();
  const vUsdAddress = await vUsd.getAddress();
  console.log("vUSD (ERC-4626 Vault) deployed to:", vUsdAddress);

  // 4. Deploy StableVault Gateway
  const StableVault = await ethers.getContractFactory("StableVault");
  const stableVault = await StableVault.deploy(vUsdAddress);
  await stableVault.waitForDeployment();
  const stableVaultAddress = await stableVault.getAddress();
  console.log("StableVault deployed to:", stableVaultAddress);

  await (await stableVault.addSupportedToken(usdtAddress)).wait();

  // 5. Deploy MajorVault Gateway
  const MajorVault = await ethers.getContractFactory("MajorVault");
  const majorVault = await MajorVault.deploy(vUsdAddress);
  await majorVault.waitForDeployment();
  const majorVaultAddress = await majorVault.getAddress();
  console.log("MajorVault deployed to:", majorVaultAddress);

  await (await majorVault.configureAsset(wethAddress, ethers.parseUnits("3000", 18))).wait();
  await (await majorVault.configureAsset(wbtcAddress, ethers.parseUnits("60000", 18))).wait();

  // MajorVault mints vUSD by depositing the USD underlying on the user's behalf,
  // so it must hold USDC liquidity of its own or every ETH/BTC deposit reverts.
  await (await usdc.mint(majorVaultAddress, ethers.parseUnits("10000000", 6))).wait();
  console.log("MajorVault seeded with 10,000,000 USDC of minting liquidity");

  // 6a. Safety reserve: first-loss capital funded from realised profit.
  const SafetyReserve = await ethers.getContractFactory("SafetyReserve");
  const safetyReserve = await SafetyReserve.deploy(usdcAddress);
  await safetyReserve.waitForDeployment();
  const safetyReserveAddress = await safetyReserve.getAddress();
  await (await safetyReserve.setVault(vUsdAddress)).wait();
  await (await vUsd.setSafetyReserve(safetyReserveAddress)).wait();
  console.log("SafetyReserve deployed to:", safetyReserveAddress);

  // 6b. Loyalty engine: prices the risk a depositor opts into.
  const LoyaltyEngine = await ethers.getContractFactory("LoyaltyEngine");
  const loyaltyEngine = await LoyaltyEngine.deploy();
  await loyaltyEngine.waitForDeployment();
  const loyaltyEngineAddress = await loyaltyEngine.getAddress();
  console.log("LoyaltyEngine deployed to:", loyaltyEngineAddress);

  // 6. Deploy EarnVault (Nested ERC-4626 on vUSD + Rewards)
  const EarnVault = await ethers.getContractFactory("EarnVault");
  const earnVault = await EarnVault.deploy(vUsdAddress);
  await earnVault.waitForDeployment();
  const earnVaultAddress = await earnVault.getAddress();
  console.log("EarnVault deployed to:", earnVaultAddress);

  // The Earn vault is what reports restaking to the loyalty engine.
  await (await loyaltyEngine.setVault(earnVaultAddress)).wait();

  // 7. Aqua strategy manager. Aqua is deployed to the same address on every
  // supported mainnet; on a local chain there is no registry, so this is wired
  // for shape and left without allowlisted strategies.
  const AQUA_REGISTRY = "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a";
  const AquaStrategyManager = await ethers.getContractFactory("AquaStrategyManager");
  const aquaManager = await AquaStrategyManager.deploy(AQUA_REGISTRY, vUsdAddress);
  await aquaManager.waitForDeployment();
  const aquaManagerAddress = await aquaManager.getAddress();
  console.log("AquaStrategyManager deployed to:", aquaManagerAddress);

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

async function MolFactoryDeploy(factory: any) {
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  return contract;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
