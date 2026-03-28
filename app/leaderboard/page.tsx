'use client';

import React from 'react';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useReadContract } from 'wagmi';
import { ONCHAIN_ARCADE_ABI, ONCHAIN_ARCADE_ADDRESS } from '@/lib/contract';

type ScoreEntry = {
  player: `0x${string}`;
  score: bigint;
  timestamp: bigint;
};

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function Leaderboard() {
  const { data: scores, isLoading, isError } = useReadContract({
    address: ONCHAIN_ARCADE_ADDRESS,
    abi: ONCHAIN_ARCADE_ABI,
    functionName: 'getTopScores',
    query: { enabled: !!ONCHAIN_ARCADE_ADDRESS },
  });

  return (
    <main className="min-h-screen bg-[#050505] text-white font-sans">
      <div className="crt-overlay" />
      <Navbar />

      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-12">
          <h2 className="font-arcade text-4xl md:text-5xl text-yellow-400 neon-text mb-4">
            TOP 50 RUNNERS
          </h2>
          <p className="font-arcade text-[10px] text-gray-500">
            ONLY THE BEST SURVIVE THE TRASH TALK
          </p>
        </div>

        <div className="bg-black border-4 border-cyan-900 p-4 shadow-[0_0_30px_rgba(6,182,212,0.1)]">
          <div className="grid grid-cols-12 font-arcade text-xs text-cyan-500 border-b-4 border-cyan-900 pb-4 mb-4">
            <div className="col-span-2">RANK</div>
            <div className="col-span-6">PLAYER</div>
            <div className="col-span-4 text-right">SCORE</div>
          </div>

          {!ONCHAIN_ARCADE_ADDRESS && (
            <p className="font-arcade text-[10px] text-gray-500 text-center py-8">
              CONTRACT NOT DEPLOYED YET.<br />SET NEXT_PUBLIC_CONTRACT_ADDRESS TO GO LIVE.
            </p>
          )}

          {ONCHAIN_ARCADE_ADDRESS && isLoading && (
            <div className="space-y-4 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid grid-cols-12 animate-pulse">
                  <div className="col-span-2 h-4 bg-cyan-900/30 rounded" />
                  <div className="col-span-6 h-4 bg-cyan-900/30 rounded mx-2" />
                  <div className="col-span-4 h-4 bg-cyan-900/30 rounded" />
                </div>
              ))}
            </div>
          )}

          {ONCHAIN_ARCADE_ADDRESS && isError && (
            <p className="font-arcade text-[10px] text-red-400 text-center py-8">
              FAILED TO LOAD SCORES. CHECK YOUR CONNECTION.
            </p>
          )}

          {ONCHAIN_ARCADE_ADDRESS && !isLoading && !isError && scores && scores.length === 0 && (
            <p className="font-arcade text-[10px] text-gray-500 text-center py-8">
              NO SCORES YET. BE THE FIRST TO EMBARRASS YOURSELF ONCHAIN.
            </p>
          )}

          {ONCHAIN_ARCADE_ADDRESS && !isLoading && !isError && scores && scores.length > 0 && (
            <div className="space-y-4">
              {(scores as ScoreEntry[]).map((entry, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`grid grid-cols-12 font-arcade text-sm py-2 ${i === 0 ? 'text-yellow-400' : 'text-white/80'}`}
                >
                  <div className="col-span-2">{i + 1}</div>
                  <div className="col-span-6 truncate">{truncateAddress(entry.player)}</div>
                  <div className="col-span-4 text-right">{Number(entry.score).toLocaleString()}</div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-12 text-center">
          <Link href="/" className="font-arcade px-8 py-4 text-xl border-4 border-cyan-500 text-cyan-500 hover:bg-cyan-500 hover:text-black transition-all">
            RETURN TO GAME
          </Link>
        </div>
      </div>
    </main>
  );
}
