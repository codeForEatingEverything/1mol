import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet, metaMaskWallet, rainbowWallet } from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { hardhat, mainnet, sepolia } from 'wagmi/chains';

/**
 * Injected wallets only, on purpose.
 *
 * RainbowKit's getDefaultConfig pulls in WalletConnect, which requires a
 * project id registered for the serving origin. A placeholder id makes every
 * WalletConnect request return 403 ("Origin not found on Allowlist") and takes
 * the connect modal down with it, so the page looks connected-but-dead. An
 * injected-only connector list needs no third-party registration and works for
 * MetaMask and any other browser wallet.
 */
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Installed',
      wallets: [metaMaskWallet, rainbowWallet, injectedWallet],
    },
  ],
  { appName: '1mol', projectId: 'injected-only' }
);

export const config = createConfig({
  connectors,
  // Sepolia first so the app defaults to the public testnet the demo runs on.
  chains: [sepolia, hardhat, mainnet],
  transports: {
    [sepolia.id]: http('https://ethereum-sepolia-rpc.publicnode.com'),
    [hardhat.id]: http('http://127.0.0.1:8545'),
    [mainnet.id]: http(),
  },
  ssr: true,
});
