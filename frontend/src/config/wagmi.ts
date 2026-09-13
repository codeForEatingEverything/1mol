import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { hardhat, mainnet, sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: '1mol Protocol',
  projectId: '04a630f697576a4b9d0485c8f6a39088', // Public demo WalletConnect Project ID
  chains: [hardhat, sepolia, mainnet],
  ssr: true,
});
