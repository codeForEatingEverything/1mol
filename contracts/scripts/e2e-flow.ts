import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * End-to-end smoke run against a live node, mirroring what a user does in the UI:
 *   Layer 1: USDC -> StableVault -> vUSD shares
 *   Yield:   protocol accrues USDC into vUSD, lifting the share price
 *   Layer 2: vUSD -> EarnVault -> s1MOL shares + streaming 1MOL rewards
 *
 * Run against `hardhat node` after `deploy.ts`, then query the backend to
 * confirm it reports the same numbers the chain holds.
 */
async function main() {
  const d = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "deployments.json"), "utf8")
  );
  const [deployer, user] = await ethers.getSigners();

  const usdc = await ethers.getContractAt("MockERC20", d.tokens.USDC);
  const vUsd = await ethers.getContractAt("vUSD", d.vUSD);
  const stableVault = await ethers.getContractAt("StableVault", d.StableVault);
  const earnVault = await ethers.getContractAt("EarnVault", d.EarnVault);

  console.log("user:", user.address);

  // --- Layer 1: deposit 1,000 USDC through the StableVault gateway ---
  const deposit = ethers.parseUnits("1000", 6);
  await (await usdc.mint(user.address, deposit)).wait();
  await (await usdc.connect(user).approve(d.StableVault, deposit)).wait();
  await (await stableVault.connect(user).deposit(d.tokens.USDC, deposit)).wait();

  const shares = await vUsd.balanceOf(user.address);
  console.log("L1 vUSD shares:", ethers.formatUnits(shares, 6));

  // --- Yield: protocol routes 100 USDC of strategy yield into the vault ---
  const yieldAmount = ethers.parseUnits("100", 6);
  await (await usdc.mint(deployer.address, yieldAmount)).wait();
  await (await usdc.approve(d.vUSD, yieldAmount)).wait();
  await (await vUsd.accrueYield(yieldAmount)).wait();

  console.log(
    "share price after yield:",
    ethers.formatUnits(await vUsd.convertToAssets(ethers.parseUnits("1", 6)), 6)
  );

  // --- Layer 2: restake half the vUSD for boosted 1MOL rewards ---
  const stake = shares / 2n;
  await (await vUsd.connect(user).approve(d.EarnVault, stake)).wait();
  await (await earnVault.connect(user).deposit(stake, user.address)).wait();
  console.log("L2 s1MOL shares:", ethers.formatUnits(await earnVault.balanceOf(user.address), 6));

  // Advance one day so streaming rewards become visible.
  await ethers.provider.send("evm_increaseTime", [86400]);
  await ethers.provider.send("evm_mine", []);
  console.log(
    "pending 1MOL after 1 day:",
    ethers.formatUnits(await earnVault.earned(user.address), 18)
  );

  console.log("\nE2E_USER=" + user.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
