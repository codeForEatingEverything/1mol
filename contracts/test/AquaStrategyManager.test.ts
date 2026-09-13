import { expect } from "chai";
import { ethers } from "hardhat";
import { AquaStrategyManager, MockAqua, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AquaStrategyManager risk controls", function () {
  let owner: SignerWithAddress;
  let vault: SignerWithAddress;
  let outsider: SignerWithAddress;

  let aqua: MockAqua;
  let manager: AquaStrategyManager;
  let usdc: MockERC20;

  // Stand-in strategy app addresses.
  const APP_A = "0x1111111111111111111111111111111111111101";
  const APP_B = "0x1111111111111111111111111111111111111102";

  const usd = (n: string) => ethers.parseUnits(n, 6);
  const MANAGED = usd("1000000"); // 1m under management

  function strategyBytes(label: string) {
    return ethers.AbiCoder.defaultAbiCoder().encode(["string"], [label]);
  }

  beforeEach(async function () {
    [owner, vault, outsider] = await ethers.getSigners();

    usdc = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);
    aqua = await (await ethers.getContractFactory("MockAqua")).deploy();
    manager = await (await ethers.getContractFactory("AquaStrategyManager")).deploy(
      await aqua.getAddress(),
      vault.address
    );

    // Fund the manager as if the vault had allocated capital to it.
    await usdc.mint(await manager.getAddress(), MANAGED);
  });

  describe("allowlist", function () {
    it("refuses to ship a strategy that was never allowed", async function () {
      await expect(
        manager
          .connect(vault)
          .shipStrategy(APP_A, strategyBytes("a"), [await usdc.getAddress()], [usd("1000")], await usdc.getAddress(), MANAGED)
      ).to.be.revertedWithCustomError(manager, "StrategyNotAllowed");
    });

    it("ships once the owner allows the app", async function () {
      await manager.allowStrategy(APP_A, 2_000); // up to 20%

      await expect(
        manager
          .connect(vault)
          .shipStrategy(APP_A, strategyBytes("a"), [await usdc.getAddress()], [usd("100000")], await usdc.getAddress(), MANAGED)
      ).to.emit(manager, "Shipped");

      expect(await manager.activeStrategyCount()).to.equal(1);
    });

    it("only lets the vault allocate", async function () {
      await manager.allowStrategy(APP_A, 2_000);
      await expect(
        manager
          .connect(outsider)
          .shipStrategy(APP_A, strategyBytes("a"), [await usdc.getAddress()], [usd("1000")], await usdc.getAddress(), MANAGED)
      ).to.be.revertedWithCustomError(manager, "NotVault");
    });
  });

  describe("allocation caps", function () {
    it("rejects an allocation above the per-strategy cap", async function () {
      await manager.allowStrategy(APP_A, 1_000); // 10% => 100k

      await expect(
        manager
          .connect(vault)
          .shipStrategy(APP_A, strategyBytes("a"), [await usdc.getAddress()], [usd("150000")], await usdc.getAddress(), MANAGED)
      ).to.be.revertedWithCustomError(manager, "AllocationAboveCap");
    });

    it("allows an allocation exactly at the cap", async function () {
      await manager.allowStrategy(APP_A, 1_000);
      await expect(
        manager
          .connect(vault)
          .shipStrategy(APP_A, strategyBytes("a"), [await usdc.getAddress()], [usd("100000")], await usdc.getAddress(), MANAGED)
      ).to.emit(manager, "Shipped");
    });

    it("keeps a redemption buffer via the global cap", async function () {
      // 100% per-strategy, but the global cap still reserves 10%.
      await manager.allowStrategy(APP_A, 10_000);
      expect(await manager.globalCapBps()).to.equal(9_000);

      await expect(
        manager
          .connect(vault)
          .shipStrategy(APP_A, strategyBytes("a"), [await usdc.getAddress()], [usd("950000")], await usdc.getAddress(), MANAGED)
      ).to.be.revertedWithCustomError(manager, "AllocationAboveCap");

      await expect(
        manager
          .connect(vault)
          .shipStrategy(APP_A, strategyBytes("a"), [await usdc.getAddress()], [usd("900000")], await usdc.getAddress(), MANAGED)
      ).to.emit(manager, "Shipped");
    });

    it("rejects a nonsensical cap", async function () {
      await expect(manager.allowStrategy(APP_A, 0)).to.be.revertedWithCustomError(manager, "InvalidCap");
      await expect(manager.allowStrategy(APP_A, 10_001)).to.be.revertedWithCustomError(manager, "InvalidCap");
    });
  });

  describe("docking", function () {
    it("returns the strategy balance and clears the hash", async function () {
      await manager.allowStrategy(APP_A, 2_000);
      await manager
        .connect(vault)
        .shipStrategy(APP_A, strategyBytes("a"), [await usdc.getAddress()], [usd("100000")], await usdc.getAddress(), MANAGED);

      expect(await manager.strategyBalance(APP_A, await usdc.getAddress())).to.equal(usd("100000"));

      await manager.connect(vault).dockStrategy(APP_A, [await usdc.getAddress()]);

      expect(await manager.activeStrategyCount()).to.equal(0);
      expect(await manager.strategyBalance(APP_A, await usdc.getAddress())).to.equal(0);
    });

    it("reverts when nothing is shipped", async function () {
      await manager.allowStrategy(APP_A, 2_000);
      await expect(
        manager.connect(vault).dockStrategy(APP_A, [await usdc.getAddress()])
      ).to.be.revertedWithCustomError(manager, "NothingShipped");
    });

    it("emergency-docks every live strategy in one call", async function () {
      await manager.allowStrategy(APP_A, 2_000);
      await manager.allowStrategy(APP_B, 2_000);

      await manager
        .connect(vault)
        .shipStrategy(APP_A, strategyBytes("a"), [await usdc.getAddress()], [usd("100000")], await usdc.getAddress(), MANAGED);
      await manager
        .connect(vault)
        .shipStrategy(APP_B, strategyBytes("b"), [await usdc.getAddress()], [usd("100000")], await usdc.getAddress(), MANAGED);

      expect(await manager.activeStrategyCount()).to.equal(2);

      // The owner can pull liquidity back without waiting on vault governance.
      await expect(manager.emergencyDockAll([await usdc.getAddress()]))
        .to.emit(manager, "EmergencyDocked")
        .withArgs(2);

      expect(await manager.activeStrategyCount()).to.equal(0);
    });

    it("refuses emergency dock from an unrelated account", async function () {
      await expect(
        manager.connect(outsider).emergencyDockAll([await usdc.getAddress()])
      ).to.be.revertedWith("Not authorised");
    });
  });

  describe("custody", function () {
    it("approves Aqua without transferring the tokens away", async function () {
      await manager.allowStrategy(APP_A, 2_000);
      const before = await usdc.balanceOf(await manager.getAddress());

      await manager
        .connect(vault)
        .shipStrategy(APP_A, strategyBytes("a"), [await usdc.getAddress()], [usd("100000")], await usdc.getAddress(), MANAGED);

      // Aqua records an allowance; capital stays with the maker.
      expect(await usdc.balanceOf(await manager.getAddress())).to.equal(before);
      expect(await usdc.allowance(await manager.getAddress(), await aqua.getAddress())).to.equal(usd("100000"));
    });
  });
});
