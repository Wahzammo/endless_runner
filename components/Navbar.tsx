'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

export const Navbar = () => {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const cbConnector = connectors.find(c => c.id === 'coinbaseWallet') ?? connectors[0];

  return (
    <nav className="flex justify-between items-center p-6 bg-black/50 backdrop-blur-md border-b border-white/10">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-cyan-500 rounded-lg flex items-center justify-center font-arcade text-black text-2xl shadow-[0_0_15px_#06b6d4]">
          B
        </div>
        <h1 className="font-arcade text-lg tracking-tighter neon-text hidden sm:block">
          BASE RUNNER
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {!isConnected ? (
          <button
            onClick={() => connect({ connector: cbConnector })}
            className="bg-cyan-500 hover:bg-cyan-400 text-black font-arcade text-[10px] py-2 px-4 rounded-none transition-all"
          >
            Connect Wallet
          </button>
        ) : (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(prev => !prev)}
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-arcade text-[10px] py-2 px-4 rounded-none transition-all flex items-center gap-2"
            >
              <div className="h-6 w-6 rounded-full bg-cyan-700 border border-black/20" />
              <span>{truncateAddress(address!)}</span>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-black border border-white/10 shadow-lg z-50">
                <div className="px-4 pt-3 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-cyan-700 border border-black/20" />
                    <p className="font-arcade text-[10px] text-white/60 select-all">
                      {truncateAddress(address!)}
                    </p>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(address!)}
                    className="font-arcade text-[8px] text-cyan-500 hover:text-cyan-400 mt-2 transition-colors"
                  >
                    COPY ADDRESS
                  </button>
                </div>
                <div className="border-t border-white/10">
                  <button
                    onClick={() => {
                      disconnect();
                      setDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 font-arcade text-[10px] text-red-400 hover:bg-white/5 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};
