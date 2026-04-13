'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Game } from '@/components/Game';
import { GameErrorBoundary } from '@/components/GameErrorBoundary';
import { useAccount, useWriteContract } from 'wagmi';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import {
  ONCHAIN_ARCADE_ABI,
  ONCHAIN_ARCADE_ADDRESS,
  CONSUMABLE_ITEMS_ABI,
  CONSUMABLE_ITEMS_ADDRESS,
} from '@/lib/contract';

export default function Home() {
  const { isConnected, address } = useAccount();
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');
  const [finalScore, setFinalScore] = useState(0);
  const [gameKey, setGameKey] = useState(0);
  const [paused, setPaused] = useState(false);

  const { writeContract, isPending: isSubmitting, isSuccess: isSubmitted, isError: submitError } = useWriteContract();
  const { writeContract: writeBurn } = useWriteContract();

  const startGame = useCallback(() => {
    if (!isConnected) return;
    setGameKey(k => k + 1);
    setPaused(false);
    setGameState('playing');
  }, [isConnected]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && gameState === 'playing') {
        setPaused(p => !p);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [gameState]);

  const handleBurnPowerUp = useCallback((tokenId: number) => {
    if (!CONSUMABLE_ITEMS_ADDRESS) return;
    writeBurn({
      address: CONSUMABLE_ITEMS_ADDRESS,
      abi: CONSUMABLE_ITEMS_ABI,
      functionName: 'useAndBurn',
      args: [BigInt(tokenId)],
    });
  }, [writeBurn]);

  const handleGameOver = (score: number) => {
    setFinalScore(score);
    setGameState('gameover');
  };

  const handleSubmitScore = () => {
    if (!ONCHAIN_ARCADE_ADDRESS) {
      console.error('Contract address not configured — set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local');
      return;
    }
    writeContract({
      address: ONCHAIN_ARCADE_ADDRESS,
      abi: ONCHAIN_ARCADE_ABI,
      functionName: 'submitScore',
      args: [BigInt(finalScore)],
    });
  };

  return (
    <main className="min-h-screen bg-[#050505] text-white font-sans selection:bg-cyan-500/30">
      <div className="crt-overlay" />
      <Navbar />

      <div className="container mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[calc(100vh-80px)]">
        <AnimatePresence mode="wait">
          {gameState === 'start' && (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="text-center space-y-8"
            >
              <h2 className="font-arcade text-5xl md:text-7xl lg:text-8xl tracking-tighter leading-none neon-text">
                PSYCH-OUT<br />ARCADE
              </h2>
              <p className="font-arcade text-xs md:text-sm text-cyan-400/80 max-w-xl mx-auto leading-relaxed">
                THE ONLY ENDLESS RUNNER THAT HATES YOU. CONNECT WALLET TO PROVE YOU DON&apos;T SUCK.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <button
                  onClick={startGame}
                  disabled={!isConnected}
                  className={`font-arcade px-8 py-4 text-xl border-4 transition-all ${
                    isConnected
                      ? 'border-cyan-500 text-cyan-500 hover:bg-cyan-500 hover:text-black cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                      : 'border-gray-700 text-gray-700 cursor-not-allowed'
                  }`}
                >
                  {isConnected ? 'INSERT COIN (START)' : 'CONNECT WALLET TO PLAY'}
                </button>
                <Link href="/leaderboard" className="font-arcade px-8 py-4 text-xl border-4 border-white text-white hover:bg-white hover:text-black transition-all">
                  LEADERBOARD
                </Link>
              </div>
            </motion.div>
          )}

          {gameState === 'playing' && (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full"
            >
              <GameErrorBoundary onReset={startGame}>
                <Game key={gameKey} onGameOver={handleGameOver} isPaused={paused} playerAddress={address} onBurnPowerUp={handleBurnPowerUp} />
              </GameErrorBoundary>
            </motion.div>
          )}

          {gameState === 'gameover' && (
            <motion.div
              key="gameover"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-8 bg-black/80 p-12 border-4 border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.2)]"
            >
              <h2 className="font-arcade text-6xl text-red-500 neon-text">GAME OVER</h2>
              <div className="space-y-2">
                <p className="font-arcade text-xl">FINAL SCORE</p>
                <p className="font-arcade text-5xl text-cyan-400">{finalScore}</p>
              </div>

              <div className="flex flex-col gap-4">
                <button
                  onClick={startGame}
                  className="font-arcade px-8 py-4 text-xl border-4 border-cyan-500 text-cyan-500 hover:bg-cyan-500 hover:text-black transition-all"
                >
                  TRY AGAIN
                </button>
                <button
                  onClick={handleSubmitScore}
                  disabled={isSubmitting || isSubmitted || !ONCHAIN_ARCADE_ADDRESS}
                  className={`font-arcade px-8 py-4 text-xl border-4 transition-all ${
                    isSubmitted
                      ? 'border-green-500 text-green-500 cursor-default'
                      : submitError
                      ? 'border-red-400 text-red-400 cursor-pointer hover:bg-red-400 hover:text-black'
                      : isSubmitting
                      ? 'border-yellow-500/50 text-yellow-500/50 cursor-not-allowed'
                      : !ONCHAIN_ARCADE_ADDRESS
                      ? 'border-gray-700 text-gray-700 cursor-not-allowed'
                      : 'border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black cursor-pointer'
                  }`}
                >
                  {isSubmitted
                    ? 'SUBMITTED!'
                    : isSubmitting
                    ? 'SUBMITTING...'
                    : submitError
                    ? 'RETRY SUBMIT'
                    : 'SUBMIT TO BASE'}
                </button>
                <Link href="/" onClick={() => setGameState('start')} className="font-arcade text-xs text-gray-500 hover:text-white underline">
                  BACK TO MENU
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className="fixed bottom-4 left-4 font-arcade text-[8px] text-white/20">
        BUILT ON BASE // POWERED BY GEMINI
      </footer>
    </main>
  );
}
