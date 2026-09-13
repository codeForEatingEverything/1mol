'use client';

import React from 'react';

/**
 * Amount entry with the balance and a max action. Deliberately plain: the
 * figure being typed is the most important thing on the panel.
 */
export const AmountField: React.FC<{
  label: string;
  symbol: string;
  value: string;
  onChange: (v: string) => void;
  balance: string;
  onMax?: () => void;
  disabled?: boolean;
}> = ({ label, symbol, value, onChange, balance, onMax, disabled }) => (
  <div className="panel-inset p-4">
    <div className="mb-2 flex items-center justify-between">
      <span className="stat-label">{label}</span>
      <span className="stat-label tnum">
        Balance {balance} {symbol}
      </span>
    </div>
    <div className="flex items-center gap-3">
      <input
        type="number"
        inputMode="decimal"
        placeholder="0.0"
        className="amount-input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
        {symbol}
      </span>
      {onMax && (
        <button
          type="button"
          onClick={onMax}
          disabled={disabled}
          className="btn-secondary px-2.5 py-1 text-[11px]"
        >
          MAX
        </button>
      )}
    </div>
  </div>
);
