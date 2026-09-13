import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Mints test assets to an address so a real wallet can exercise the UI.
 * Usage: RECIPIENT=0xYourMetaMaskAddress npx hardhat run scripts/faucet.ts --network localhost
 * Defaults to the first Hardhat signer when RECIPIENT is unset.
 */
async function main() {
  const d = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "deployments.json"), "utf8")
  );
  const [signer] = await ethers.getSigners();
  const to = process.env.RECIPIENT ?? signer.address;

  const grants: [string, string, number][] = [
    [d.tokens.USDC, "10000", 6],
    [d.tokens.USDT, "10000", 6],
    [d.tokens.WETH, "10", 18],
    [d.tokens.WBTC, "1", 8],
  ];

  for (const [token, amount, decimals] of grants) {
    const erc20 = await ethers.getContractAt("MockERC20", token);
    await (await erc20.mint(to, ethers.parseUnits(amount, decimals))).wait();
    console.log(`minted ${amount} ${await erc20.symbol()} -> ${to}`);
  }

  // Gas for a wallet that is not one of the prefunded Hardhat accounts.
  if (process.env.RECIPIENT) {
    await (await signer.sendTransaction({ to, value: ethers.parseEther("10") })).wait();
    console.log(`sent 10 ETH for gas -> ${to}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
