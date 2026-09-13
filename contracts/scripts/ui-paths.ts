import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Exercises every contract call the frontend makes, in the same order and with
 * the same approvals, so a green run means the UI's wiring is real rather than
 * type-correct. Run against `hardhat node` after `deploy.ts`.
 */
async function main() {
  const d = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "deployments.json"), "utf8")
  );
  const [, user] = await ethers.getSigners();

  const usdc = await ethers.getContractAt("MockERC20", d.tokens.USDC);
  const weth = await ethers.getContractAt("MockERC20", d.tokens.WETH);
  const vUsd = await ethers.getContractAt("vUSD", d.vUSD);
  const stableVault = await ethers.getContractAt("StableVault", d.StableVault);
  const majorVault = await ethers.getContractAt("MajorVault", d.MajorVault);
  const earnVault = await ethers.getContractAt("EarnVault", d.EarnVault);
  const mol = await ethers.getContractAt("MolToken", d.MolToken);

  const vDec = Number(await vUsd.decimals());
  const sDec = Number(await earnVault.decimals());
  const ok = (label: string, value: unknown) => console.log(`  ok  ${label}:`, value);

  console.log("acting as:", user.address, `(vUSD decimals=${vDec}, s1MOL decimals=${sDec})`);

  // Fund the test wallet the way a faucet would.
  await (await usdc.mint(user.address, ethers.parseUnits("5000", 6))).wait();
  await (await weth.mint(user.address, ethers.parseUnits("5", 18))).wait();

  // ---- Stake view: stablecoin deposit (approve -> StableVault.deposit) ----
  console.log("\n[1] Stake / Stablecoin Vault deposit");
  const usdcIn = ethers.parseUnits("1000", 6);
  await (await usdc.connect(user).approve(d.StableVault, usdcIn)).wait();
  await (await stableVault.connect(user).deposit(d.tokens.USDC, usdcIn)).wait();
  ok("vUSD minted", ethers.formatUnits(await vUsd.balanceOf(user.address), vDec));

  // ---- Stake view: major asset deposit (approve -> MajorVault.deposit) ----
  console.log("\n[2] Stake / Major Asset Vault deposit (1 WETH @ oracle price)");
  const wethIn = ethers.parseUnits("1", 18);
  await (await weth.connect(user).approve(d.MajorVault, wethIn)).wait();
  await (await majorVault.connect(user).deposit(d.tokens.WETH, wethIn)).wait();
  ok("vUSD after WETH deposit", ethers.formatUnits(await vUsd.balanceOf(user.address), vDec));

  // ---- Earn view: stake vUSD (approve -> EarnVault.deposit) ----
  console.log("\n[3] Earn / stake vUSD into the Layer 2 strategy");
  const stakeAmount = (await vUsd.balanceOf(user.address)) / 2n;
  await (await vUsd.connect(user).approve(d.EarnVault, stakeAmount)).wait();
  await (await earnVault.connect(user).deposit(stakeAmount, user.address)).wait();
  ok("s1MOL shares", ethers.formatUnits(await earnVault.balanceOf(user.address), sDec));
  ok(
    "position value in vUSD",
    ethers.formatUnits(await earnVault.convertToAssets(await earnVault.balanceOf(user.address)), vDec)
  );

  // ---- Earn view: claim streaming rewards (getReward) ----
  console.log("\n[4] Earn / claim 1MOL after 1 day");
  await ethers.provider.send("evm_increaseTime", [86400]);
  await ethers.provider.send("evm_mine", []);
  ok("pending 1MOL", ethers.formatUnits(await earnVault.earned(user.address), 18));
  await (await earnVault.connect(user).getReward()).wait();
  ok("1MOL in wallet", ethers.formatUnits(await mol.balanceOf(user.address), 18));

  // ---- Earn view: unstake (EarnVault.redeem, no allowance needed) ----
  console.log("\n[5] Earn / unstake s1MOL back to vUSD");
  const shares = await earnVault.balanceOf(user.address);
  await (await earnVault.connect(user).redeem(shares, user.address, user.address)).wait();
  ok("s1MOL remaining", ethers.formatUnits(await earnVault.balanceOf(user.address), sDec));

  // ---- Stake view: stablecoin withdraw (vUSD.redeem direct, no allowance) ----
  console.log("\n[6] Stake / redeem vUSD for the underlying stablecoin");
  const usdcBefore = await usdc.balanceOf(user.address);
  const redeemShares = ethers.parseUnits("500", vDec);
  await (await vUsd.connect(user).redeem(redeemShares, user.address, user.address)).wait();
  ok(
    "USDC received",
    ethers.formatUnits((await usdc.balanceOf(user.address)) - usdcBefore, 6)
  );

  // ---- Stake view: major withdraw (approve vUSD -> MajorVault.withdraw) ----
  console.log("\n[7] Stake / redeem vUSD for WETH via MajorVault");
  const wethBefore = await weth.balanceOf(user.address);
  const majorShares = ethers.parseUnits("3000", vDec);
  await (await vUsd.connect(user).approve(d.MajorVault, majorShares)).wait();
  await (await majorVault.connect(user).withdraw(d.tokens.WETH, majorShares)).wait();
  ok(
    "WETH received",
    ethers.formatUnits((await weth.balanceOf(user.address)) - wethBefore, 18)
  );

  console.log("\nALL_UI_PATHS_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
