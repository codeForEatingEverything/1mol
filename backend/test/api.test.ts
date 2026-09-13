import request from 'supertest';
import app from '../src/app';

/**
 * These run without a chain in CI. Endpoints must degrade honestly:
 * `chainConnected: false` plus a reason, never fabricated TVL numbers.
 */
describe('1mol Backend API Endpoints', () => {
  it('GET /api/health returns service status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('1mol-backend');
  });

  it('GET /api/deployments returns the deployment address map', async () => {
    const res = await request(app).get('/api/deployments');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('GET /api/vaults reports connection state and never invents TVL', async () => {
    const res = await request(app).get('/api/vaults');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('chainConnected');

    if (res.body.chainConnected) {
      expect(res.body.stake).toHaveProperty('stableVault');
      expect(res.body.stake).toHaveProperty('majorVault');
      expect(res.body.earn).toHaveProperty('boostedVault');
      expect(res.body.vUsd).toHaveProperty('sharePrice');
    } else {
      expect(res.body.stake).toBeNull();
      expect(res.body.earn).toBeNull();
      expect(typeof res.body.reason).toBe('string');
    }
  });

  it('GET /api/stats returns protocol stats', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.activeVaults).toBe(3);
    expect(res.body).toHaveProperty('totalTvlUSD');
    expect(res.body).toHaveProperty('chainConnected');
  });

  it('GET /api/user/:address rejects a malformed address', async () => {
    const res = await request(app).get('/api/user/not-an-address');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid Ethereum address');
  });

  it('GET /api/user/:address returns positions for a valid address', async () => {
    const res = await request(app).get('/api/user/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    expect(res.status).toBe(200);
    expect(res.body.userAddress).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    expect(res.body).toHaveProperty('chainConnected');

    if (res.body.chainConnected) {
      expect(res.body).toHaveProperty('vUsdBalance');
      expect(res.body).toHaveProperty('earnStakedBalance');
      expect(res.body).toHaveProperty('pendingReward');
    }
  });
});
