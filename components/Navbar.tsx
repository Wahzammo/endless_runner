'use client';

import React from 'react';
import { ConnectWallet, Wallet, WalletDropdown, WalletDropdownDisconnect } from '@coinbase/onchainkit/wallet';
import { Address, Name, Identity, Avatar } from '@coinbase/onchainkit/identity';

export const Navbar = () => {
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
        <Wallet>
          <ConnectWallet className="bg-cyan-500 hover:bg-cyan-400 text-black font-arcade text-[10px] py-2 px-4 rounded-none transition-all">
            <Avatar className="h-6 w-6" />
            <Name className="text-black" />
          </ConnectWallet>
          <WalletDropdown>
            <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
              <Avatar />
              <Name />
              <Address />
            </Identity>
            <WalletDropdownDisconnect />
          </WalletDropdown>
        </Wallet>
      </div>
    </nav>
  );
};
