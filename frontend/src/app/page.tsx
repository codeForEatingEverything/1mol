'use client';

import React, { useState } from 'react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { StakeView } from '../components/StakeView';
import { EarnView } from '../components/EarnView';

export default function Home() {
  const [tab, setTab] = useState<'stake' | 'earn'>('stake');

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="bg-canvas-container" />
      <Navbar />

      <main className="relative z-10 flex-1 px-5 py-10">
        <div className="mx-auto max-w-5xl">
          {/* Positioning stated once, plainly, then out of the way. */}
          <div className="mb-8 max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: 'var(--text)' }}>
              The DeFi layer for 1inch Aqua
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Aqua keeps liquidity in your own account, which leaves a lone provider paying gas
              to re-ship an immutable strategy and holding no receipt for the position. 1mol
              stakes on behalf of everyone as one maker, issues vUSD for the position, and prices
              the risk you choose to take on.
            </p>
          </div>

          <div className="mb-6 inline-flex rounded-[10px] p-1" style={{ background: 'var(--surface-2)' }}>
            {(['stake', 'earn'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-5 py-2 text-sm transition-colors ${
                  tab === t ? 'tab-active' : 'tab-inactive'
                }`}
              >
                {t === 'stake' ? 'Stake' : 'Earn'}
              </button>
            ))}
          </div>

          {tab === 'stake' ? <StakeView /> : <EarnView />}
        </div>
      </main>

      <Footer />
    </div>
  );
}
