import { expect } from "chai";
import { ethers, network } from "hardhat";
import { IAqua } from "../typechain-types";

/**
 * Exercises the REAL 1inch Aqua registry, not a mock.
 *
 * Aqua is deployed to mainnets only, so this suite runs against a mainnet fork
 * and is skipped unless AQUA_FORK=1 is set:
 *   AQUA_FORK=1 npx hardhat test test/Aqua.fork.test.ts
 */
const AQUA_ADDRESS = "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a";
const SWAPVM_ROUTER = "0x111111338c5091e8440b67b168bae16a668ac0de";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const forking = process.env.AQUA_FORK === "1";

(forking ? describe : describe.skip)("1inch Aqua registry (mainnet fork)", function () {
  this.timeout(180_000);

  let aqua: IAqua;

  before(async function () {
    aqua = (await ethers.getContractAt("IAqua", AQUA_ADDRESS)) as unknown as IAqua;
  });

  it("is deployed at the canonical address on the fork", async function () {
    const code = await ethers.provider.getCode(AQUA_ADDRESS);
    expect(code).to.not.equal("0x");
    // A real registry, not a stub.
    expect(code.length).to.be.greaterThan(1000);
  });

  it("has the SwapVM router deployed alongside it", async function () {
    const code = await ethers.provider.getCode(SWAPVM_ROUTER);
    expect(code).to.not.equal("0x");
  });

  it("answers rawBalances for an unshipped strategy with zero", async function () {
    const [signer] = await ethers.getSigners();
    const unknownStrategy = ethers.keccak256(ethers.toUtf8Bytes("1mol:not-shipped"));

    const [balance, tokensCount] = await aqua.rawBalances(
      signer.address,
      SWAPVM_ROUTER,
      unknownStrategy,
      USDC
    );

    expect(balance).to.equal(0n);
    expect(tokensCount).to.equal(0n);
  });

  it("reverts safeBalances when the token pair is not in an active strategy", async function () {
    const [signer] = await ethers.getSigners();
    const unknownStrategy = ethers.keccak256(ethers.toUtf8Bytes("1mol:not-shipped"));

    // Aqua guards reads against strategies that were never shipped, which is the
    // behaviour the vault's accounting relies on.
    await expect(
      aqua.safeBalances(signer.address, SWAPVM_ROUTER, unknownStrategy, USDC, WETH)
    ).to.be.reverted;
  });

  it("matches the interface this repo declares (selectors resolve on chain)", async function () {
    // A wrong signature would revert with a decoding error rather than return data.
    const [signer] = await ethers.getSigners();
    const hash = ethers.keccak256(ethers.toUtf8Bytes("1mol:selector-probe"));
    await expect(aqua.rawBalances(signer.address, SWAPVM_ROUTER, hash, WETH)).to.not.be.reverted;
  });
});
