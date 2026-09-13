import { expect } from "chai";
import { ethers } from "hardhat";
import { MockERC20, SafetyReserve, vUSD } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("SafetyReserve and the profit split", function () {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let treasury: SignerWithAddress;

  let usdc: MockERC20;
  let vUsd: vUSD;
  let reserve: SafetyReserve;

  const usd = (n: string) => ethers.parseUnits(n, 6);

  beforeEach(async function () {
    [owner, alice, treasury] = await ethers.getSigners();

    usdc = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);
    vUsd = await (await ethers.getContractFactory("vUSD")).deploy(await usdc.getAddress());
    reserve = await (await ethers.getContractFactory("SafetyReserve")).deploy(await usdc.getAddress());

    await reserve.setVault(await vUsd.getAddress());
    await vUsd.setSafetyReserve(await reserve.getAddress());
    await vUsd.setTreasury(treasury.address);

    // Alice holds the whole vault so share-price effects are unambiguous.
    await usdc.mint(alice.address, usd("10000"));
    await usdc.connect(alice).approve(await vUsd.getAddress(), usd("1000"));
    await vUsd.connect(alice).deposit(usd("1000"), alice.address);
  });

  it("splits realised profit 85/10/5", async function () {
    await usdc.mint(owner.address, usd("100"));
    await usdc.approve(await vUsd.getAddress(), usd("100"));

    await expect(vUsd.accrueYield(usd("100")))
      .to.emit(vUsd, "ProfitDistributed")
      .withArgs(usd("85"), usd("10"), usd("5"));

    // 85 compounds, so the vault holds 1000 + 85.
    expect(await vUsd.totalAssets()).to.equal(usd("1085"));
    expect(await reserve.available()).to.equal(usd("10"));
    expect(await usdc.balanceOf(treasury.address)).to.equal(usd("5"));
  });

  it("lifts the share price by only the compounded share", async function () {
    const shares = await vUsd.balanceOf(alice.address);

    await usdc.mint(owner.address, usd("100"));
    await usdc.approve(await vUsd.getAddress(), usd("100"));
    await vUsd.accrueYield(usd("100"));

    // OZ v5 rounds down by up to 1 wei via its virtual-offset guard.
    expect(await vUsd.convertToAssets(shares)).to.be.closeTo(usd("1085"), 1n);
  });

  it("covers a loss out of the reserve before the share price", async function () {
    await usdc.mint(owner.address, usd("100"));
    await usdc.approve(await vUsd.getAddress(), usd("100"));
    await vUsd.accrueYield(usd("100")); // reserve now holds 10

    await expect(vUsd.absorbLoss(usd("6")))
      .to.emit(vUsd, "LossAbsorbed")
      .withArgs(usd("6"), usd("6"), 0);

    expect(await reserve.available()).to.equal(usd("4"));
    expect(await reserve.totalCovered()).to.equal(usd("6"));
  });

  it("reports the uncovered remainder rather than hiding it", async function () {
    await usdc.mint(owner.address, usd("100"));
    await usdc.approve(await vUsd.getAddress(), usd("100"));
    await vUsd.accrueYield(usd("100")); // reserve holds 10

    // A 25 loss exceeds the reserve: 10 covered, 15 must hit the share price.
    await expect(vUsd.absorbLoss(usd("25")))
      .to.emit(vUsd, "LossAbsorbed")
      .withArgs(usd("25"), usd("10"), usd("15"));

    expect(await reserve.available()).to.equal(0);
  });

  it("reports coverage depth relative to vault assets", async function () {
    await usdc.mint(owner.address, usd("100"));
    await usdc.approve(await vUsd.getAddress(), usd("100"));
    await vUsd.accrueYield(usd("100"));

    // 10 of coverage against 1085 of assets is ~92 bps.
    expect(await reserve.coverageRatioBps(await vUsd.totalAssets())).to.equal(92n);
  });

  it("only lets the vault draw on the reserve", async function () {
    await expect(reserve.connect(alice).coverLoss(usd("1"))).to.be.revertedWithCustomError(
      reserve,
      "NotVault"
    );
  });

  it("rejects a split that leaves nothing to compound", async function () {
    await expect(vUsd.setSplit(6_000, 4_000)).to.be.revertedWith("Split >= 100%");
    await vUsd.setSplit(2_000, 1_000); // 70% still compounds
    expect(await vUsd.reserveBps()).to.equal(2_000);
  });

  it("compounds the full amount when both legs are switched off", async function () {
    const bare = await (await ethers.getContractFactory("vUSD")).deploy(await usdc.getAddress());
    await bare.setSplit(0, 0);

    await usdc.mint(owner.address, usd("50"));
    await usdc.approve(await bare.getAddress(), usd("50"));
    await bare.accrueYield(usd("50"));

    // Nothing is routed out, so every unit lifts the share price.
    expect(await bare.totalAssets()).to.equal(usd("50"));
  });

  it("compounds everything but treasury when no reserve is set", async function () {
    const bare = await (await ethers.getContractFactory("vUSD")).deploy(await usdc.getAddress());
    await bare.setTreasury(treasury.address);
    // safetyReserve is left unset, so its 10% leg is skipped rather than lost.

    await usdc.mint(owner.address, usd("100"));
    await usdc.approve(await bare.getAddress(), usd("100"));
    await bare.accrueYield(usd("100"));

    expect(await bare.totalAssets()).to.equal(usd("95"));
    expect(await usdc.balanceOf(treasury.address)).to.equal(usd("5"));
  });

  it("reports the whole loss as uncovered when no reserve is set", async function () {
    const bare = await (await ethers.getContractFactory("vUSD")).deploy(await usdc.getAddress());
    await expect(bare.absorbLoss(usd("10")))
      .to.emit(bare, "LossAbsorbed")
      .withArgs(usd("10"), 0, usd("10"));
  });
});
