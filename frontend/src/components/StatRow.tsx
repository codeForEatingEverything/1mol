'use client';

import React from 'react';

/** A labelled figure. The page's main repeating unit, so it lives in one place. */
export const StatRow: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'default' | 'positive' | 'muted';
}> = ({ label, value, hint, tone = 'default' }) => (
  <div className="flex items-baseline justify-between gap-4 py-2">
    <span className="stat-label">{label}</span>
    <span
      className="tnum text-sm font-semibold"
      style={{
        color:
          tone === 'positive'
            ? 'var(--positive)'
            : tone === 'muted'
            ? 'var(--text-muted)'
            : 'var(--text)',
      }}
      title={hint}
    >
      {value}
    </span>
  </div>
);
