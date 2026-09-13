import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  vUSD,
  StableVault,
  MajorVault,
  EarnVault,
  MolToken,
  MockERC20,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("1mol Protocol - ERC-4626 Yield & Vault Test Suite", function () {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let vUsd: vUSD;
  let molToken: MolToken;
  let stableVault: StableVault;
  let majorVault: MajorVault;
  let earnVault: EarnVault;

  let usdc: MockERC20;
  let usdt: MockERC20;
  let weth: MockERC20;
  let wbtc: MockERC20;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    // 1. Deploy Base Mock Stablecoin (USDC, 6 decimals)
    const MockFactory = await ethers.getContractFactory("MockERC20");
    usdc = await MockFactory.deploy("USD Coin", "USDC", 6);
    usdt = await MockFactory.deploy("Tether USD", "USDT", 6);
    weth = await MockFactory.deploy("Wrapped Ether", "WETH", 18);
    wbtc = await MockFactory.deploy("Wrapped BTC", "WBTC", 8);

    // 2. Deploy vUSD as official OpenZeppelin ERC-4626 Vault
    const VUSDFactory = await ethers.getContractFactory("vUSD");
    vUsd = await VUSDFactory.deploy(await usdc.getAddress());

    // 3. Deploy MolToken (1MOL reward token)
    const MolFactory = await ethers.getContractFactory("MolToken");
    molToken = await MolFactory.deploy();

    // 4. Deploy StableVault (gateway for USDC/USDT)
    const StableVaultFactory = await ethers.getContractFactory("StableVault");
    stableVault = await StableVaultFactory.deploy(await vUsd.getAddress());
    await stableVault.addSupportedToken(await usdt.getAddress());

    // 5. Deploy MajorVault (pricing gateway for ETH/BTC)
    const MajorVaultFactory = await ethers.getContractFactory("MajorVault");
    majorVault = await MajorVaultFactory.deploy(await vUsd.getAddress());
    await majorVault.configureAsset(await weth.getAddress(), ethers.parseUnits("3000", 18));
    await majorVault.configureAsset(await wbtc.getAddress(), ethers.parseUnits("60000", 18));

    // 6. Deploy EarnVault (nested ERC-4626 on vUSD + 1MOL reward distributor)
    const EarnVaultFactory = await ethers.getContractFactory("EarnVault");
    earnVault = await EarnVaultFactory.deploy(await vUsd.getAddress(), await molToken.getAddress());
    await molToken.setMinter(await earnVault.getAddress(), true);

    // Fund EarnVault with 10,000 1MOL rewards over 30 days
    await earnVault.notifyRewardAmount(ethers.parseUnits("10000", 18));

    // Mint test assets to Alice and Bob
    await usdc.mint(alice.address, ethers.parseUnits("10000", 6));
    await usdt.mint(alice.address, ethers.parseUnits("10000", 6));
    await weth.mint(bob.address, ethers.parseUnits("10", 18));
    await wbtc.mint(bob.address, ethers.parseUnits("2", 8));
  });

  describe("ERC-4626 vUSD Mechanics", function () {
    it("should allow depositing underlying USDC and minting vUSD shares", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await usdc.connect(alice).approve(await vUsd.getAddress(), depositAmount);

      await vUsd.connect(alice).deposit(depositAmount, alice.address);

      expect(await vUsd.balanceOf(alice.address)).to.be.gt(0);
      expect(await vUsd.totalAssets()).to.equal(depositAmount);
    });

    it("should accrue yield and increase share price for depositors", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await usdc.connect(alice).approve(await vUsd.getAddress(), depositAmount);
      await vUsd.connect(alice).deposit(depositAmount, alice.address);

      const sharesBefore = await vUsd.balanceOf(alice.address);
      const assetsBefore = await vUsd.convertToAssets(sharesBefore);
      expect(assetsBefore).to.equal(depositAmount);

      // Protocol generates 100 USDC yield and deposits into vUSD vault
      const yieldAmount = ethers.parseUnits("100", 6);
      await usdc.mint(owner.address, yieldAmount);
      await usdc.connect(owner).approve(await vUsd.getAddress(), yieldAmount);
      await vUsd.connect(owner).accrueYield(yieldAmount);

      // Total assets in the vault increases
      expect(await vUsd.totalAssets()).to.equal(depositAmount + yieldAmount);

      // Alice's share count remains the same, but her assets redeemable increased by 10%.
      // OZ v5 ERC-4626 adds a virtual share/asset offset (inflation-attack guard), so the
      // conversion rounds down in the vault's favour by at most 1 wei of the underlying.
      const assetsAfter = await vUsd.convertToAssets(sharesBefore);
      expect(assetsAfter).to.be.closeTo(depositAmount + yieldAmount, 1n);
      expect(assetsAfter).to.be.gt(assetsBefore);
    });

    it("should allow redeeming vUSD shares for original assets + yield", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await usdc.connect(alice).approve(await vUsd.getAddress(), depositAmount);
      await vUsd.connect(alice).deposit(depositAmount, alice.address);

      // Redeem half of Alice's shares
      const sharesToRedeem = (await vUsd.balanceOf(alice.address)) / 2n;
      await vUsd.connect(alice).redeem(sharesToRedeem, alice.address, alice.address);

      expect(await usdc.balanceOf(alice.address)).to.equal(ethers.parseUnits("9500", 6));
    });
  });

  describe("Layer 1 - StableVault & MajorVault Gateways", function () {
    it("should deposit via StableVault and receive vUSD shares", async function () {
      const amount = ethers.parseUnits("500", 6);
      await usdc.connect(alice).approve(await stableVault.getAddress(), amount);
      await stableVault.connect(alice).deposit(await usdc.getAddress(), amount);

      expect(await vUsd.balanceOf(alice.address)).to.be.gt(0);
    });

    it("should deposit Major Asset (ETH) via MajorVault at oracle price", async function () {
      // Bob deposits 1 WETH ($3000)
      const wethDeposit = ethers.parseUnits("1", 18);
      await weth.connect(bob).approve(await majorVault.getAddress(), wethDeposit);

      // Fund MajorVault with equivalent USDC liquidity so it can mint vUSD
      await usdc.mint(await majorVault.getAddress(), ethers.parseUnits("3000", 6));

      await majorVault.connect(bob).deposit(await weth.getAddress(), wethDeposit);

      expect(await vUsd.balanceOf(bob.address)).to.be.gt(0);
    });
  });

  describe("Layer 2 - EarnVault (Nested ERC-4626 + Streaming Rewards)", function () {
    beforeEach(async function () {
      // Alice deposits 1000 USDC -> gets vUSD shares
      await usdc.connect(alice).approve(await vUsd.getAddress(), ethers.parseUnits("1000", 6));
      await vUsd.connect(alice).deposit(ethers.parseUnits("1000", 6), alice.address);
    });

    it("should allow depositing vUSD into EarnVault (ERC-4626)", async function () {
      const aliceVusd = await vUsd.balanceOf(alice.address);
      await vUsd.connect(alice).approve(await earnVault.getAddress(), aliceVusd);

      // Alice deposits vUSD into EarnVault, receiving s1MOL shares
      await earnVault.connect(alice).deposit(aliceVusd, alice.address);

      expect(await earnVault.balanceOf(alice.address)).to.be.gt(0);
      expect(await earnVault.totalAssets()).to.equal(aliceVusd);
    });

    it("should accrue 1MOL streaming rewards over time", async function () {
      const aliceVusd = await vUsd.balanceOf(alice.address);
      await vUsd.connect(alice).approve(await earnVault.getAddress(), aliceVusd);
      await earnVault.connect(alice).deposit(aliceVusd, alice.address);

      // Fast forward 1 day
      await time.increase(86400);

      const pendingReward = await earnVault.earned(alice.address);
      expect(pendingReward).to.be.gt(0);

      // Claim reward
      await earnVault.connect(alice).getReward();
      expect(await molToken.balanceOf(alice.address)).to.be.closeTo(
        pendingReward,
        ethers.parseUnits("1", 18)
      );
    });

    it("should allow exit (redeeming s1MOL back to vUSD and claiming rewards)", async function () {
      const aliceVusd = await vUsd.balanceOf(alice.address);
      await vUsd.connect(alice).approve(await earnVault.getAddress(), aliceVusd);
      await earnVault.connect(alice).deposit(aliceVusd, alice.address);

      await time.increase(3600); // 1 hour

      await earnVault.connect(alice).exit();

      // Alice receives back her vUSD principal
      expect(await earnVault.balanceOf(alice.address)).to.equal(0);
      expect(await vUsd.balanceOf(alice.address)).to.equal(aliceVusd);
      expect(await molToken.balanceOf(alice.address)).to.be.gt(0);
    });
  });
});
