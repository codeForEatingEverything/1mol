import { Router, Request, Response } from 'express';
import { getVaultsOverview, getUserOverview, deployments } from '../viemClient';
import { Address, isAddress } from 'viem';

const router = Router();

router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: '1mol-backend',
    timestamp: new Date().toISOString(),
  });
});

router.get('/deployments', (req: Request, res: Response) => {
  res.json(deployments);
});

router.get('/vaults', async (req: Request, res: Response) => {
  const overview = await getVaultsOverview();
  res.json(overview);
});

router.get('/user/:address', async (req: Request, res: Response) => {
  const address = req.params.address as string;
  if (!isAddress(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' });
  }

  const userOverview = await getUserOverview(address as Address);
  res.json(userOverview);
});

router.get('/stats', async (req: Request, res: Response) => {
  const vaults = await getVaultsOverview();

  if (!vaults.chainConnected) {
    return res.json({
      chainConnected: false,
      reason: vaults.reason,
      totalTvlUSD: null,
      activeVaults: 3,
      vUsdSharePrice: null,
    });
  }

  // Layer 2 TVL is a subset of Layer 1 (it holds vUSD shares), so protocol TVL
  // is the Layer 1 underlying only - adding them would double count.
  const totalTvl = parseFloat(vaults.vUsd?.totalAssets ?? '0');

  res.json({
    chainConnected: true,
    totalTvlUSD: totalTvl.toFixed(2),
    layer2TvlUSD: vaults.earn?.boostedVault?.tvlUSD ?? '0',
    activeVaults: 3,
    supportedAssetsCount: 4,
    vUsdSharePrice: vaults.vUsd?.sharePrice ?? null,
  });
});

export default router;
