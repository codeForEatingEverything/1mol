'use client';

import React from 'react';
import Image from 'next/image';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Sparkles } from 'lucide-react';

export const Navbar: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-molCream-300/10 bg-molDark/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="1mol"
            width={40}
            height={40}
            priority
            className="h-10 w-10 rounded-xl object-contain"
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-extrabold tracking-tight text-molCream-100">1mol</span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-molCream-500/20 px-2 py-0.5 text-[10px] font-semibold text-molCream-300">
                <Sparkles className="h-2.5 w-2.5" />
                Yield Layer
              </span>
            </div>
            <span className="text-[11px] text-gray-400">Decentralized 1inch-Powered Vaults</span>
          </div>
        </div>

        {/* Connect Wallet Button */}
        <div className="flex items-center gap-3">
          <ConnectButton
            chainStatus="icon"
            showBalance={false}
            accountStatus={{
              smallScreen: 'avatar',
              largeScreen: 'full',
            }}
          />
        </div>
      </div>
    </header>
  );
};
