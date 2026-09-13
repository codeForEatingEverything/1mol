import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { LoyaltyEngine } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

const W = 10n ** 18n;

describe("LoyaltyEngine", function () {
  let engine: LoyaltyEngine;
  let owner: SignerWithAddress;
  let vault: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  // Tier bitmask: stable = bit 0, major = bit 1, long-tail = bit 2.
  const STABLE = 1;
  const MAJOR = 2;
  const LONG_TAIL = 4;

  beforeEach(async function () {
    [owner, vault, alice, bob] = await ethers.getSigners();
    engine = await (await ethers.getContractFactory("LoyaltyEngine")).deploy();
    await engine.setVault(vault.address);
  });

  describe("risk pricing", function () {
    it("pays a higher curve for more pools delegated to", async function () {
      const principal = ethers.parseUnits("1000", 6);

      // Alice takes the base pool only; Bob adds major on top.
      await engine.connect(vault).updatePosition(alice.address, principal, STABLE, false);
      await engine.connect(vault).updatePosition(bob.address, principal, STABLE | MAJOR, false);

      const aliceMul = await engine.totalMultiplier(alice.address);
      const bobMul = await engine.totalMultiplier(bob.address);

      expect(aliceMul).to.equal(W); // 1.0x
      expect(bobMul).to.equal(W + W * 18n / 10n); // 1.0 + 1.8
      expect(bobMul).to.be.gt(aliceMul);
    });

    it("splits emission by risk accepted, not by deposit size", async function () {
      const principal = ethers.parseUnits("1000", 6);

      await engine.connect(vault).updatePosition(alice.address, principal, STABLE, false);
      await engine.connect(vault).updatePosition(bob.address, principal, STABLE | MAJOR | LONG_TAIL, false);

      const aliceShare = await engine.emissionShareBps(alice.address);
      const bobShare = await engine.emissionShareBps(bob.address);

      // Equal principal, so flat pro-rata would be 5000/5000.
      expect(aliceShare).to.be.lt(2000n);
      expect(bobShare).to.be.gt(8000n);
      expect(aliceShare + bobShare).to.be.closeTo(10_000n, 2n);
    });

    it("rejects a position with no tier selected", async function () {
      await expect(
        engine.connect(vault).updatePosition(alice.address, ethers.parseUnits("100", 6), 0, false)
      ).to.be.revertedWithCustomError(engine, "NoTierSelected");
    });

    it("only lets the vault write positions", async function () {
      await expect(
        engine.connect(alice).updatePosition(alice.address, 1n, STABLE, false)
      ).to.be.revertedWithCustomError(engine, "NotVault");
    });
  });

  describe("tenure", function () {
    it("starts at 1.0x and steps up at 30 and 90 days", async function () {
      const principal = ethers.parseUnits("1000", 6);
      await engine.connect(vault).updatePosition(alice.address, principal, STABLE, false);

      expect(await engine.tenureMultiplier(alice.address)).to.equal(W);

      await time.increase(30 * 86400);
      expect(await engine.tenureMultiplier(alice.address)).to.equal(W * 12n / 10n);

      await time.increase(60 * 86400);
      expect(await engine.tenureMultiplier(alice.address)).to.equal(W * 15n / 10n);
    });

    it("resets tenure when the depositor raises their risk", async function () {
      const principal = ethers.parseUnits("1000", 6);
      await engine.connect(vault).updatePosition(alice.address, principal, STABLE, false);
      await time.increase(90 * 86400);
      expect(await engine.tenureMultiplier(alice.address)).to.equal(W * 15n / 10n);

      // Opting into a riskier tier restarts the clock, so a long-tenure
      // multiplier cannot be banked cheaply and then flipped to high risk.
      await engine.connect(vault).updatePosition(alice.address, principal, STABLE | LONG_TAIL, false);
      expect(await engine.tenureMultiplier(alice.address)).to.equal(W);
    });

    it("keeps tenure when the selection is unchanged", async function () {
      const principal = ethers.parseUnits("1000", 6);
      await engine.connect(vault).updatePosition(alice.address, principal, STABLE, false);
      await time.increase(31 * 86400);

      await engine.connect(vault).updatePosition(alice.address, principal * 2n, STABLE, false);
      expect(await engine.tenureMultiplier(alice.address)).to.equal(W * 12n / 10n);
    });
  });

  describe("restaking into Earn", function () {
    it("raises the curve above the same position held idle", async function () {
      const principal = ethers.parseUnits("1000", 6);

      await engine.connect(vault).updatePosition(alice.address, principal, STABLE, false);
      await engine.connect(vault).updatePosition(bob.address, principal, STABLE, true);

      const idle = await engine.totalMultiplier(alice.address);
      const restaked = await engine.totalMultiplier(bob.address);

      expect(restaked).to.equal((idle * 14n) / 10n);
      expect(restaked).to.be.gt(idle);
    });

    it("compounds with tenure and risk", async function () {
      const principal = ethers.parseUnits("1000", 6);
      await engine.connect(vault).updatePosition(alice.address, principal, STABLE | MAJOR, true);
      await time.increase(90 * 86400);

      // risk (1.0 + 1.8) x tenure 1.5 x restake 1.4 = 5.88
      expect(await engine.totalMultiplier(alice.address)).to.equal(W * 588n / 100n);
    });
  });

  describe("exit", function () {
    it("zeroes loyalty power on full withdrawal", async function () {
      const principal = ethers.parseUnits("1000", 6);
      await engine.connect(vault).updatePosition(alice.address, principal, STABLE | MAJOR, true);
      expect(await engine.loyaltyPowerOf(alice.address)).to.be.gt(0);

      await engine.connect(vault).updatePosition(alice.address, 0, STABLE, false);

      expect(await engine.loyaltyPowerOf(alice.address)).to.equal(0);
      expect(await engine.totalLoyaltyPower()).to.equal(0);
      expect(await engine.emissionShareBps(alice.address)).to.equal(0);
    });
  });
});
