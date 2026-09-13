'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Sparkles, TrendingUp, Flame, Gift, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';

export const EarnView: React.FC = () => {
  const { isConnected } = useAccount();

  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Position state
  const [availableVusd, setAvailableVusd] = useState(1250.0);
  const [stakedVusd, setStakedVusd] = useState(2500.0);
  const [earnedMol, setEarnedMol] = useState(18.42);

  // Real-time ticking rewards simulation
  useEffect(() => {
    if (stakedVusd <= 0) return;
    const interval = setInterval(() => {
      setEarnedMol((prev) => prev + 0.002);
    }, 1000);
    return () => clearInterval(interval);
  }, [stakedVusd]);

  const handleStake = () => {
    const amt = parseFloat(stakeAmount);
    if (!amt || amt <= 0 || amt > availableVusd) return;
    setIsSubmitting(true);
    setSuccessMsg(null);

    setTimeout(() => {
      setIsSubmitting(false);
      setStakedVusd((prev) => prev + amt);
      setAvailableVusd((prev) => Math.max(0, prev - amt));
      setSuccessMsg(`Successfully staked ${amt.toLocaleString()} vUSD into Layer 2 Boosted Vault!`);
      setStakeAmount('');
    }, 1200);
  };

  const handleUnstake = () => {
    const amt = parseFloat(unstakeAmount);
    if (!amt || amt <= 0 || amt > stakedVusd) return;
    setIsSubmitting(true);
    setSuccessMsg(null);

    setTimeout(() => {
      setIsSubmitting(false);
      setStakedVusd((prev) => Math.max(0, prev - amt));
      setAvailableVusd((prev) => prev + amt);
      setSuccessMsg(`Successfully unstaked ${amt.toLocaleString()} vUSD back to your wallet!`);
      setUnstakeAmount('');
    }, 1200);
  };

  const handleClaim = () => {
    if (earnedMol <= 0) return;
    setIsSubmitting(true);
    const claimed = earnedMol;

    setTimeout(() => {
      setIsSubmitting(false);
      setEarnedMol(0);
      setSuccessMsg(`Claimed ${claimed.toFixed(4)} 1MOL boosted rewards to your wallet!`);
    }, 1000);
  };

  return (
    <div className="space-y-8">
      {/* Top Banner: Layer 2 Concept */}
      <div className="glass-panel relative overflow-hidden rounded-2xl p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-molCream-100">
                Layer 2: Secondary Boosted Yield Strategy
              </h2>
              <span className="flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                <Flame className="h-3 w-3 text-amber-400" />
                24.5% Boosted APY
              </span>
            </div>
            <p className="max-w-2xl text-xs text-gray-300">
              Take the <strong>vUSD</strong> yield receipts you minted in Layer 1 Stake and deposit them into the Layer 2 Strategy. By locking liquidity, you earn an amplified baseline APY plus continuous <strong>1MOL</strong> governance & reward emissions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-molCream-300/15 bg-black/40 px-5 py-3 text-center">
              <span className="text-[11px] text-gray-400">Total Layer 2 TVL</span>
              <div className="font-mono text-xl font-black text-molCream-200">$3,240,500</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Earn Container */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Staking & Unstaking Form */}
        <div className="glass-panel rounded-2xl p-6 lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between border-b border-molCream-300/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-700/20 border border-amber-500/40 text-amber-300">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-molCream-100">Deposit vUSD to Earn Boost</h3>
                <p className="text-xs text-gray-400">Layer 1 vUSD &rarr; Layer 2 Multiplier</p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-gray-400">Boosted APY</div>
              <div className="font-mono text-2xl font-black text-amber-400">24.5%</div>
            </div>
          </div>

          {successMsg && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-300 border border-emerald-500/20">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Stake Form */}
          <div className="space-y-4 rounded-xl border border-molCream-300/15 bg-black/30 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-molCream-200">Stake vUSD for Boost</span>
              <span className="text-gray-400">
                Available vUSD:{' '}
                <strong className="font-mono text-molCream-100">
                  {isConnected ? availableVusd.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-molCream-300/20 bg-black/50 p-2.5">
              <input
                type="number"
                placeholder="0.0"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                className="w-full bg-transparent font-mono text-lg font-bold text-white outline-none placeholder-gray-600"
              />
              <button
                onClick={() => setStakeAmount(availableVusd.toString())}
                className="rounded bg-molCream-500/20 px-2 py-1 text-[10px] font-bold text-molCream-300 hover:bg-molCream-500/30"
              >
                MAX
              </button>
            </div>

            <button
              onClick={handleStake}
              disabled={isSubmitting || !stakeAmount || parseFloat(stakeAmount) <= 0}
              className={`w-full rounded-xl py-2.5 text-xs font-bold transition-all ${
                isSubmitting || !stakeAmount || parseFloat(stakeAmount) <= 0
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-molCream-300 to-molCream-500 text-molBrown-900 shadow-goldGlow hover:opacity-95'
              }`}
            >
              {isSubmitting ? 'Staking...' : 'Stake vUSD & Activate 24.5% APY'}
            </button>
          </div>

          {/* Unstake Form */}
          <div className="space-y-4 rounded-xl border border-molCream-300/15 bg-black/30 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-gray-300">Unstake vUSD</span>
              <span className="text-gray-400">
                Staked vUSD:{' '}
                <strong className="font-mono text-molCream-100">
                  {isConnected ? stakedVusd.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 p-2.5">
              <input
                type="number"
                placeholder="0.0"
                value={unstakeAmount}
                onChange={(e) => setUnstakeAmount(e.target.value)}
                className="w-full bg-transparent font-mono text-lg font-bold text-white outline-none placeholder-gray-600"
              />
              <button
                onClick={() => setUnstakeAmount(stakedVusd.toString())}
                className="rounded bg-white/10 px-2 py-1 text-[10px] font-bold text-gray-300 hover:bg-white/20"
              >
                MAX
              </button>
            </div>

            <button
              onClick={handleUnstake}
              disabled={isSubmitting || !unstakeAmount || parseFloat(unstakeAmount) <= 0}
              className={`w-full rounded-xl py-2.5 text-xs font-bold transition-all border ${
                isSubmitting || !unstakeAmount || parseFloat(unstakeAmount) <= 0
                  ? 'border-white/5 bg-gray-800 text-gray-500 cursor-not-allowed'
                  : 'border-white/20 bg-white/5 text-gray-200 hover:bg-white/10'
              }`}
            >
              {isSubmitting ? 'Unstaking...' : 'Unstake vUSD (Return to Layer 1)'}
            </button>
          </div>
        </div>

        {/* Right Col: Rewards & Live Yield Accrual */}
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-6 space-y-6">
            <div className="flex items-center gap-2 border-b border-molCream-300/10 pb-3">
              <Gift className="h-5 w-5 text-molCream-400" />
              <h3 className="font-bold text-molCream-100">Your Earned Rewards</h3>
            </div>

            <div className="rounded-xl border border-molCream-400/20 bg-molBrown-900/40 p-4 text-center">
              <span className="text-[11px] text-gray-400">Claimable 1MOL Rewards</span>
              <div className="mt-1 font-mono text-3xl font-black text-amber-300 tracking-tight">
                {isConnected ? earnedMol.toFixed(4) : '0.0000'}
              </div>
              <div className="mt-1 text-[11px] text-emerald-400 flex items-center justify-center gap-1">
                <Sparkles className="h-3 w-3" />
                Live streaming rewards
              </div>
            </div>

            <div className="space-y-2 text-xs text-gray-300">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-gray-400">Currently Staked:</span>
                <span className="font-mono font-semibold text-molCream-200">
                  {isConnected ? `${stakedVusd.toLocaleString()} vUSD` : '0.00 vUSD'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-gray-400">Lockup Period:</span>
                <span className="font-semibold text-emerald-400">No Lockup (Instant)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-400">Reward Rate:</span>
                <span className="font-mono text-molCream-200">~0.0038 1MOL / sec</span>
              </div>
            </div>

            <button
              onClick={handleClaim}
              disabled={isSubmitting || earnedMol <= 0 || !isConnected}
              className={`w-full rounded-xl py-3 text-xs font-bold transition-all shadow-md ${
                isSubmitting || earnedMol <= 0 || !isConnected
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
              }`}
            >
              {isSubmitting ? 'Claiming...' : 'Claim 1MOL Rewards'}
            </button>
          </div>

          <div className="glass-panel-subtle rounded-2xl p-5 text-xs text-gray-400 space-y-2">
            <div className="font-semibold text-molCream-300 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4" />
              How 1mol Layer 2 Works
            </div>
            <p className="leading-relaxed">
              When staking vUSD into Earn, your underlying capital remains secure in the Layer 1 Vaults while participation in 1inch Aqua liquidity boosts protocol efficiency and unlocks secondary emission incentives.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
