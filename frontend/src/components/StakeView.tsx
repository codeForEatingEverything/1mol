'use client';

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { ArrowDownUp, CheckCircle2, Coins, Flame, Info, Lock, ShieldCheck, Sparkles, Wallet } from 'lucide-react';

export const StakeView: React.FC = () => {
  const { isConnected, address } = useAccount();

  // Stable Vault state
  const [stableToken, setStableToken] = useState<'USDC' | 'USDT'>('USDC');
  const [stableAmount, setStableAmount] = useState<string>('');
  const [stableTab, setStableTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [isStableSubmitting, setIsStableSubmitting] = useState(false);
  const [stableSuccessMsg, setStableSuccessMsg] = useState<string | null>(null);

  // Major Vault state
  const [majorToken, setMajorToken] = useState<'ETH' | 'BTC'>('ETH');
  const [majorAmount, setMajorAmount] = useState<string>('');
  const [majorTab, setMajorTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [isMajorSubmitting, setIsMajorSubmitting] = useState(false);
  const [majorSuccessMsg, setMajorSuccessMsg] = useState<string | null>(null);

  // Simulated balances
  const [mockBalances, setMockBalances] = useState({
    USDC: '5,000.00',
    USDT: '5,000.00',
    ETH: '4.50',
    BTC: '0.85',
    vUSD: '1,250.00',
  });

  const handleStableAction = () => {
    if (!stableAmount || parseFloat(stableAmount) <= 0) return;
    setIsStableSubmitting(true);
    setStableSuccessMsg(null);

    setTimeout(() => {
      setIsStableSubmitting(false);
      const amt = parseFloat(stableAmount);
      if (stableTab === 'deposit') {
        setStableSuccessMsg(`Successfully deposited ${amt} ${stableToken} and minted ${amt.toFixed(2)} vUSD!`);
        setMockBalances((prev) => ({
          ...prev,
          vUSD: (parseFloat(prev.vUSD.replace(/,/g, '')) + amt).toLocaleString(undefined, { minimumFractionDigits: 2 }),
        }));
      } else {
        setStableSuccessMsg(`Successfully redeemed ${amt} vUSD for ${amt.toFixed(2)} ${stableToken}!`);
        setMockBalances((prev) => ({
          ...prev,
          vUSD: Math.max(0, parseFloat(prev.vUSD.replace(/,/g, '')) - amt).toLocaleString(undefined, { minimumFractionDigits: 2 }),
        }));
      }
      setStableAmount('');
    }, 1200);
  };

  const handleMajorAction = () => {
    if (!majorAmount || parseFloat(majorAmount) <= 0) return;
    setIsMajorSubmitting(true);
    setMajorSuccessMsg(null);

    setTimeout(() => {
      setIsMajorSubmitting(false);
      const amt = parseFloat(majorAmount);
      const price = majorToken === 'ETH' ? 3000 : 60000;
      const vUsdValue = amt * price;

      if (majorTab === 'deposit') {
        setMajorSuccessMsg(`Deposited ${amt} ${majorToken} ($${price.toLocaleString()}/unit). Minted ${vUsdValue.toLocaleString()} vUSD!`);
        setMockBalances((prev) => ({
          ...prev,
          vUSD: (parseFloat(prev.vUSD.replace(/,/g, '')) + vUsdValue).toLocaleString(undefined, { minimumFractionDigits: 2 }),
        }));
      } else {
        const tokenReturn = amt / price;
        setMajorSuccessMsg(`Redeemed ${amt} vUSD for ${tokenReturn.toFixed(4)} ${majorToken}!`);
        setMockBalances((prev) => ({
          ...prev,
          vUSD: Math.max(0, parseFloat(prev.vUSD.replace(/,/g, '')) - amt).toLocaleString(undefined, { minimumFractionDigits: 2 }),
        }));
      }
      setMajorAmount('');
    }, 1200);
  };

  return (
    <div className="space-y-8">
      {/* Top Banner: vUSD Summary */}
      <div className="glass-panel relative overflow-hidden rounded-2xl p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-molCream-100">
                Layer 1: Single-Asset Yield Staking
              </h2>
              <span className="rounded-md bg-molCream-400/20 px-2 py-0.5 text-xs font-semibold text-molCream-300">
                Auto-Rebasing
              </span>
            </div>
            <p className="max-w-xl text-xs text-gray-300">
              Deposit collateral assets to mint <strong>vUSD</strong>. Similar to Lido&apos;s stETH, vUSD is an interest-bearing USD stable asset that accrues yield directly into your wallet.
            </p>
          </div>

          {/* User vUSD Balance card */}
          <div className="flex items-center gap-4 rounded-xl border border-molCream-400/20 bg-molBrown-900/60 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-molCream-400 to-amber-600 shadow-inner">
              <Coins className="h-6 w-6 text-molBrown-900" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-gray-400">Your Current vUSD Balance</div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-black text-molCream-100">
                  {isConnected ? mockBalances.vUSD : '0.00'}
                </span>
                <span className="text-xs font-bold text-molCream-400">vUSD</span>
              </div>
              <div className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                <Sparkles className="h-2.5 w-2.5" />
                Accruing ~8.8% blended APY in real-time
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Two Vaults: Stablecoin Vault & Major Asset Vault */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 1. Stablecoin Vault */}
        <div className="glass-panel rounded-2xl p-6 transition-all hover:border-molCream-400/30">
          <div className="flex items-center justify-between border-b border-molCream-300/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold">
                $
              </div>
              <div>
                <h3 className="text-lg font-bold text-molCream-100">Stablecoin Vault</h3>
                <p className="text-xs text-gray-400">USDC, USDT &middot; 1:1 Minting</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">Current APY</div>
              <div className="font-mono text-xl font-black text-emerald-400">8.4%</div>
            </div>
          </div>

          <div className="my-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-black/30 p-2.5 border border-white/5">
              <span className="text-gray-400">Vault TVL:</span>
              <div className="mt-1 font-mono font-semibold text-molCream-200">$2,540,890</div>
            </div>
            <div className="rounded-lg bg-black/30 p-2.5 border border-white/5">
              <span className="text-gray-400">Yield Source:</span>
              <div className="mt-1 font-semibold text-molCream-200">1inch Aqua Shared Liquidity</div>
            </div>
          </div>

          {/* Action Tabs: Deposit vs Withdraw */}
          <div className="flex rounded-lg bg-black/40 p-1 mb-4">
            <button
              onClick={() => setStableTab('deposit')}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                stableTab === 'deposit' ? 'tab-active' : 'tab-inactive'
              }`}
            >
              Deposit (Mint vUSD)
            </button>
            <button
              onClick={() => setStableTab('withdraw')}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                stableTab === 'withdraw' ? 'tab-active' : 'tab-inactive'
              }`}
            >
              Withdraw (Redeem)
            </button>
          </div>

          {/* Token Selector & Input */}
          <div className="space-y-3">
            {stableTab === 'deposit' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Select asset:</span>
                {(['USDC', 'USDT'] as const).map((tok) => (
                  <button
                    key={tok}
                    onClick={() => setStableToken(tok)}
                    className={`rounded-md px-3 py-1 text-xs font-medium border transition-all ${
                      stableToken === tok
                        ? 'border-molCream-400 bg-molCream-500/20 text-molCream-100'
                        : 'border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    {tok}
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-molCream-300/15 bg-black/40 p-3.5">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                <span>{stableTab === 'deposit' ? `Deposit ${stableToken}` : 'Redeem vUSD'}</span>
                <span>
                  Balance:{' '}
                  {isConnected
                    ? stableTab === 'deposit'
                      ? mockBalances[stableToken]
                      : mockBalances.vUSD
                    : '0.00'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <input
                  type="number"
                  placeholder="0.0"
                  value={stableAmount}
                  onChange={(e) => setStableAmount(e.target.value)}
                  className="w-full bg-transparent font-mono text-xl font-bold text-white outline-none placeholder-gray-600"
                />
                <button
                  onClick={() =>
                    setStableAmount(
                      stableTab === 'deposit'
                        ? mockBalances[stableToken].replace(/,/g, '')
                        : mockBalances.vUSD.replace(/,/g, '')
                    )
                  }
                  className="rounded bg-molCream-500/20 px-2 py-1 text-[10px] font-bold text-molCream-300 hover:bg-molCream-500/30"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Expected Output */}
            <div className="flex items-center justify-between rounded-lg bg-molBrown-900/30 p-2.5 text-xs text-gray-300 border border-molCream-300/10">
              <span className="flex items-center gap-1">
                <ArrowDownUp className="h-3.5 w-3.5 text-molCream-400" />
                {stableTab === 'deposit' ? 'You will receive:' : 'You will receive:'}
              </span>
              <span className="font-mono font-bold text-molCream-200">
                {stableAmount ? parseFloat(stableAmount).toLocaleString() : '0.00'}{' '}
                {stableTab === 'deposit' ? 'vUSD' : stableToken}
              </span>
            </div>

            {stableSuccessMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-2.5 text-xs text-emerald-300 border border-emerald-500/20">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{stableSuccessMsg}</span>
              </div>
            )}

            <button
              onClick={handleStableAction}
              disabled={isStableSubmitting || !stableAmount}
              className={`w-full rounded-xl py-3 font-semibold text-sm transition-all ${
                isStableSubmitting || !stableAmount
                  ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-molCream-300 via-molCream-500 to-molBrown-500 text-molBrown-900 shadow-goldGlow hover:opacity-95'
              }`}
            >
              {isStableSubmitting
                ? 'Processing on Chain...'
                : stableTab === 'deposit'
                ? `Deposit ${stableToken} & Mint vUSD`
                : `Redeem vUSD for ${stableToken}`}
            </button>
          </div>
        </div>

        {/* 2. Major Asset Vault */}
        <div className="glass-panel rounded-2xl p-6 transition-all hover:border-molCream-400/30">
          <div className="flex items-center justify-between border-b border-molCream-300/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold">
                Ξ
              </div>
              <div>
                <h3 className="text-lg font-bold text-molCream-100">Major Asset Vault</h3>
                <p className="text-xs text-gray-400">ETH, BTC &middot; Priced in USD</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">Current APY</div>
              <div className="font-mono text-xl font-black text-amber-400">9.8%</div>
            </div>
          </div>

          <div className="my-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-black/30 p-2.5 border border-white/5">
              <span className="text-gray-400">Vault TVL:</span>
              <div className="mt-1 font-mono font-semibold text-molCream-200">$5,820,400</div>
            </div>
            <div className="rounded-lg bg-black/30 p-2.5 border border-white/5">
              <span className="text-gray-400">Oracle Rates:</span>
              <div className="mt-1 font-mono font-semibold text-molCream-200">
                ETH: $3,000 &middot; BTC: $60k
              </div>
            </div>
          </div>

          {/* Action Tabs: Deposit vs Withdraw */}
          <div className="flex rounded-lg bg-black/40 p-1 mb-4">
            <button
              onClick={() => setMajorTab('deposit')}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                majorTab === 'deposit' ? 'tab-active' : 'tab-inactive'
              }`}
            >
              Deposit (Mint vUSD)
            </button>
            <button
              onClick={() => setMajorTab('withdraw')}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                majorTab === 'withdraw' ? 'tab-active' : 'tab-inactive'
              }`}
            >
              Withdraw (Redeem)
            </button>
          </div>

          {/* Token Selector & Input */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Select asset:</span>
              {(['ETH', 'BTC'] as const).map((tok) => (
                <button
                  key={tok}
                  onClick={() => setMajorToken(tok)}
                  className={`rounded-md px-3 py-1 text-xs font-medium border transition-all ${
                    majorToken === tok
                      ? 'border-molCream-400 bg-molCream-500/20 text-molCream-100'
                      : 'border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  {tok}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-molCream-300/15 bg-black/40 p-3.5">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                <span>{majorTab === 'deposit' ? `Deposit ${majorToken}` : 'Redeem vUSD for asset'}</span>
                <span>
                  Balance:{' '}
                  {isConnected
                    ? majorTab === 'deposit'
                      ? mockBalances[majorToken]
                      : mockBalances.vUSD
                    : '0.00'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <input
                  type="number"
                  placeholder="0.0"
                  value={majorAmount}
                  onChange={(e) => setMajorAmount(e.target.value)}
                  className="w-full bg-transparent font-mono text-xl font-bold text-white outline-none placeholder-gray-600"
                />
                <button
                  onClick={() =>
                    setMajorAmount(
                      majorTab === 'deposit'
                        ? mockBalances[majorToken].replace(/,/g, '')
                        : mockBalances.vUSD.replace(/,/g, '')
                    )
                  }
                  className="rounded bg-molCream-500/20 px-2 py-1 text-[10px] font-bold text-molCream-300 hover:bg-molCream-500/30"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Expected Output */}
            <div className="flex items-center justify-between rounded-lg bg-molBrown-900/30 p-2.5 text-xs text-gray-300 border border-molCream-300/10">
              <span className="flex items-center gap-1">
                <ArrowDownUp className="h-3.5 w-3.5 text-molCream-400" />
                You will receive:
              </span>
              <span className="font-mono font-bold text-molCream-200">
                {majorAmount
                  ? majorTab === 'deposit'
                    ? (
                        parseFloat(majorAmount) *
                        (majorToken === 'ETH' ? 3000 : 60000)
                      ).toLocaleString() + ' vUSD'
                    : (
                        parseFloat(majorAmount) /
                        (majorToken === 'ETH' ? 3000 : 60000)
                      ).toFixed(4) + ` ${majorToken}`
                  : '0.00'}
              </span>
            </div>

            {majorSuccessMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-2.5 text-xs text-emerald-300 border border-emerald-500/20">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{majorSuccessMsg}</span>
              </div>
            )}

            <button
              onClick={handleMajorAction}
              disabled={isMajorSubmitting || !majorAmount}
              className={`w-full rounded-xl py-3 font-semibold text-sm transition-all ${
                isMajorSubmitting || !majorAmount
                  ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-molCream-300 via-molCream-500 to-molBrown-500 text-molBrown-900 shadow-goldGlow hover:opacity-95'
              }`}
            >
              {isMajorSubmitting
                ? 'Processing on Chain...'
                : majorTab === 'deposit'
                ? `Deposit ${majorToken} & Mint vUSD`
                : `Redeem vUSD for ${majorToken}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
