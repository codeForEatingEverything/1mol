'use client';

import React from 'react';
import { ExternalLink, Github, PlayCircle, Send, ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="relative z-20 mt-auto border-t border-molCream-300/10 bg-molDark/90 py-6 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <ShieldCheck className="h-4 w-4 text-molCream-400" />
          <span>1mol Protocol &copy; {new Date().getFullYear()} &middot; Powered by 1inch shared liquidity principles</span>
        </div>

        <div className="flex items-center gap-5">
          {/* Telegram link */}
          <a
            href="https://1mol.xyz/demo"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-molCream-300/15 bg-molCream-500/10 px-3 py-1.5 text-xs font-medium text-molCream-200 transition-all hover:border-molCream-400 hover:bg-molCream-500/20 hover:text-white"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            Demo Video
          </a>

          <a
            href="https://t.me/Scout0221"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-molCream-300/15 bg-molCream-500/10 px-3 py-1.5 text-xs font-medium text-molCream-200 transition-all hover:border-molCream-400 hover:bg-molCream-500/20 hover:text-white"
          >
            <Send className="h-3.5 w-3.5 text-sky-400" />
            <span>Telegram: @SHcou0221</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>

          {/* GitHub link */}
          <a
            href="https://github.com/codeForEatingEverything/1mol"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-molCream-300/15 bg-molCream-500/10 px-3 py-1.5 text-xs font-medium text-molCream-200 transition-all hover:border-molCream-400 hover:bg-molCream-500/20 hover:text-white"
          >
            <Github className="h-3.5 w-3.5 text-molCream-300" />
            <span>GitHub: codeForEatingEverything/1mol</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
        </div>
      </div>
    </footer>
  );
};
