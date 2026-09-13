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

  // 3. Deploy 1MOL Reward Token
  const MolToken = await ethers.getContractFactory("MolToken");
  const molToken = await MolFactoryDeploy(MolToken);
  const molTokenAddress = await molToken.getAddress();
  console.log("MolToken deployed to:", molTokenAddress);

  // 4. Deploy StableVault Gateway
  const StableVault = await ethers.getContractFactory("StableVault");
  const stableVault = await StableVault.deploy(vUsdAddress);
  await stableVault.waitForDeployment();
  const stableVaultAddress = await stableVault.getAddress();
  console.log("StableVault deployed to:", stableVaultAddress);

  await stableVault.addSupportedToken(usdtAddress);

  // 5. Deploy MajorVault Gateway
  const MajorVault = await ethers.getContractFactory("MajorVault");
  const majorVault = await MajorVault.deploy(vUsdAddress);
  await majorVault.waitForDeployment();
  const majorVaultAddress = await majorVault.getAddress();
  console.log("MajorVault deployed to:", majorVaultAddress);

  await majorVault.configureAsset(wethAddress, ethers.parseUnits("3000", 18));
  await majorVault.configureAsset(wbtcAddress, ethers.parseUnits("60000", 18));

  // 6. Deploy EarnVault (Nested ERC-4626 on vUSD + Rewards)
  const EarnVault = await ethers.getContractFactory("EarnVault");
  const earnVault = await EarnVault.deploy(vUsdAddress, molTokenAddress);
  await earnVault.waitForDeployment();
  const earnVaultAddress = await earnVault.getAddress();
  console.log("EarnVault deployed to:", earnVaultAddress);

  await molToken.setMinter(earnVaultAddress, true);
  await earnVault.notifyRewardAmount(ethers.parseUnits("100000", 18));

  // Save deployments
  const deploymentInfo = {
    network: "hardhat_local",
    vUSD: vUsdAddress,
    MolToken: molTokenAddress,
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
