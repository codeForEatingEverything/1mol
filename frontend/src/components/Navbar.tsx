'use client';

import React from 'react';
import Image from 'next/image';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export const Navbar: React.FC = () => (
  <header
    className="sticky top-0 z-50 w-full"
    style={{ background: 'rgba(23, 17, 12, 0.82)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' }}
  >
    <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
      <div className="flex items-center gap-2.5">
        <Image src="/logo.png" alt="" width={32} height={32} priority className="h-8 w-8 object-contain" />
        <span className="text-lg font-bold tracking-tight" style={{ color: 'var(--text)' }}>
          1mol
        </span>
      </div>
      <ConnectButton chainStatus="icon" showBalance={false} accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }} />
    </div>
  </header>
);
