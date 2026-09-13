'use client';

import React, { useState } from 'react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { StakeView } from '../components/StakeView';
import { EarnView } from '../components/EarnView';
import { Sparkles, Layers, Zap } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'stake' | 'earn'>('stake');

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* User's Original Background Image */}
      <div className="bg-canvas-container" />

      {/* Top Navbar */}
      <Navbar />

      {/* Main Container */}
      <main className="relative z-10 flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Navigation Pill Tab Switcher: Stake vs Earn */}
          <div className="flex justify-center">
            <div className="inline-flex rounded-2xl border border-molCream-300/20 bg-molDark/80 p-1.5 shadow-2xl backdrop-blur-xl">
              <button
                onClick={() => setActiveTab('stake')}
                className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold transition-all duration-200 ${
                  activeTab === 'stake' ? 'tab-active' : 'tab-inactive'
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>Stake</span>
                <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold">
                  vUSD
                </span>
              </button>

              <button
                onClick={() => setActiveTab('earn')}
                className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold transition-all duration-200 ${
                  activeTab === 'earn' ? 'tab-active' : 'tab-inactive'
                }`}
              >
                <Zap className="h-4 w-4 text-amber-500" />
                <span>Earn</span>
              </button>
            </div>
          </div>

          {/* Tab Content Display */}
          <div className="transition-all duration-300">
            {activeTab === 'stake' ? <StakeView /> : <EarnView />}
          </div>
        </div>
      </main>

      {/* Bottom Footer */}
      <Footer />
    </div>
  );
}
