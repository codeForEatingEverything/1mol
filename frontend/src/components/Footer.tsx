'use client';

import React from 'react';
import { Github, PlayCircle, Send } from 'lucide-react';

const links = [
  { href: 'https://1mol.xyz/demo', label: 'Demo', Icon: PlayCircle },
  { href: 'https://t.me/Scout0221', label: '@Scout0221', Icon: Send },
  { href: 'https://github.com/codeForEatingEverything/1mol', label: 'GitHub', Icon: Github },
];

export const Footer: React.FC = () => (
  <footer
    className="relative z-20 mt-auto"
    style={{ borderTop: '1px solid var(--border)', background: 'rgba(23, 17, 12, 0.82)' }}
  >
    <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-5 py-5 sm:flex-row">
      <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
        1mol &middot; built on 1inch Aqua
      </span>

      <nav className="flex items-center gap-5">
        {links.map(({ href, label, Icon }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </a>
        ))}
      </nav>
    </div>
  </footer>
);
