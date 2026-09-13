import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      // OpenZeppelin v5 uses the `mcopy` opcode (EIP-5656), which requires Cancun.
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      // Aqua is deployed to mainnets only - there is no testnet. Forking lets
      // the suite exercise the real contract at its real address instead of a
      // mock. Opt in with AQUA_FORK=1 so the default suite stays offline.
      ...(process.env.AQUA_FORK === "1"
        ? {
            forking: {
              url: process.env.MAINNET_RPC_URL || "https://ethereum-rpc.publicnode.com",
              ...(process.env.FORK_BLOCK ? { blockNumber: Number(process.env.FORK_BLOCK) } : {}),
            },
          }
        : {}),
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
