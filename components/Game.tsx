'use client';

import React, { useEffect, useRef, useState } from 'react';
import { generateCommentary } from '@/lib/gemini';
import { ParallaxBackground } from '@/lib/ParallaxBackground';
import { motion, AnimatePresence } from 'motion/react';

// Game constants
const GROUND_HEIGHT = 40;
const PLAYER_WIDTH = 40;
const PLAYER_HEIGHT = 40;
const PLAYER_X = 50;
const GRAVITY = 0.8;
const JUMP_VELOCITY = -15;
const INITIAL_SPEED = 5;

interface GameProps {
  onGameOver: (score: number) => void;
  isPaused: boolean;
}

export const Game: React.FC<GameProps> = ({ onGameOver, isPaused }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [commentary, setCommentary] = useState<string | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const lastCommentaryTime = useRef(0);

  // Game state refs to avoid closure issues in loop
  const gameState = useRef({
    player: { y: 0, dy: 0, jumping: false, width: PLAYER_WIDTH, height: PLAYER_HEIGHT },
    obstacles: [] as { x: number, width: number, height: number }[],
    speed: INITIAL_SPEED,
    distance: 0,
    gameOver: false,
    frameCount: 0,
  });

  const jump = () => {
    if (!gameState.current.player.jumping && !gameState.current.gameOver) {
      gameState.current.player.dy = JUMP_VELOCITY;
      gameState.current.player.jumping = true;
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Size canvas to container
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      bg.resize(canvas.width, canvas.height);
    };

    // Pick a random themed background set (1..8) and Day/Night variant per run.
    // Each set ships 5 depth layers; we use 1, 2, 4, 5 to keep the existing
    // 4-layer structure with an even back-to-front spread.
    const setId = 1 + Math.floor(Math.random() * 8);
    const variant = Math.random() < 0.5 ? 'Day' : 'Night';
    const base = `/bg/${setId}/${variant}`;

    const bg = new ParallaxBackground(canvas.width, canvas.height)
      .addLayer({ src: `${base}/1.png`, speedFactor: 0.05 })
      .addLayer({ src: `${base}/2.png`, speedFactor: 0.15 })
      .addLayer({ src: `${base}/4.png`, speedFactor: 0.40 })
      .addLayer({ src: `${base}/5.png`, speedFactor: 0.70 });

    resizeCanvas();

    const groundY = () => canvas.height - GROUND_HEIGHT;
    const playerStartY = () => groundY() - PLAYER_HEIGHT;

    // Reset all game state on every mount (handles TRY AGAIN remounts)
    gameState.current = {
      player: { y: playerStartY(), dy: 0, jumping: false, width: PLAYER_WIDTH, height: PLAYER_HEIGHT },
      obstacles: [],
      speed: INITIAL_SPEED,
      distance: 0,
      gameOver: false,
      frameCount: 0,
    };
    lastCommentaryTime.current = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const handleTouch = (e: TouchEvent) => {
      e.preventDefault();
      jump();
    };
    canvas.addEventListener('touchstart', handleTouch, { passive: false });

    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(canvas);

    let animationFrameId: number;
    let lastTime = 0;
    let lastMilestone = 0;

    const loop = (timestamp: number) => {
      if (isPaused || gameState.current.gameOver) return;

      const deltaTime = timestamp - lastTime;
      lastTime = timestamp;

      const ground = groundY();

      // Update
      gameState.current.frameCount++;
      gameState.current.distance += gameState.current.speed / 10;
      setScore(Math.floor(gameState.current.distance));

      // Gravity
      gameState.current.player.y += gameState.current.player.dy;
      gameState.current.player.dy += GRAVITY;

      if (gameState.current.player.y > ground - PLAYER_HEIGHT) {
        gameState.current.player.y = ground - PLAYER_HEIGHT;
        gameState.current.player.dy = 0;
        gameState.current.player.jumping = false;
      }

      // Speed ramp
      if (gameState.current.frameCount % 500 === 0) {
        gameState.current.speed += 0.5;
      }

      // Obstacles
      if (gameState.current.frameCount % Math.max(60, 120 - Math.floor(gameState.current.speed * 2)) === 0) {
        gameState.current.obstacles.push({
          x: canvas.width,
          width: 30 + Math.random() * 20,
          height: 30 + Math.random() * 40,
        });
      }

      gameState.current.obstacles.forEach((obs) => {
        obs.x -= gameState.current.speed;

        // AABB Collision: player rect vs obstacle rect
        const p = gameState.current.player;
        const obsTop = ground - obs.height;

        if (
          PLAYER_X < obs.x + obs.width &&
          PLAYER_X + p.width > obs.x &&
          p.y < obsTop + obs.height &&
          p.y + p.height > obsTop
        ) {
          gameState.current.gameOver = true;
          setIsGameOver(true);
          onGameOver(Math.floor(gameState.current.distance));
          triggerCommentary('death');
        }
      });

      gameState.current.obstacles = gameState.current.obstacles.filter(obs => obs.x + obs.width > 0);

      // AI Commentary Triggers
      const currentMilestone = Math.floor(gameState.current.distance / 500);
      if (currentMilestone > lastMilestone && gameState.current.distance > 100) {
        lastMilestone = currentMilestone;
        triggerCommentary('milestone');
      }

      // Draw
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background (Parallax layers)
      bg.update(deltaTime, gameState.current.speed);
      bg.draw(ctx);

      // Ground
      ctx.fillStyle = '#333';
      ctx.fillRect(0, ground, canvas.width, GROUND_HEIGHT);

      // Player
      ctx.fillStyle = '#00ffcc';
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#00ffcc';
      ctx.fillRect(PLAYER_X, gameState.current.player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      ctx.shadowBlur = 0;

      // Obstacles
      ctx.fillStyle = '#ff0055';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff0055';
      gameState.current.obstacles.forEach(obs => {
        ctx.fillRect(obs.x, ground - obs.height, obs.width, obs.height);
      });
      ctx.shadowBlur = 0;

      animationFrameId = requestAnimationFrame(loop);
    };

    const triggerCommentary = async (type: string) => {
      const now = Date.now();
      if (now - lastCommentaryTime.current < 5000 && type !== 'death') return;

      lastCommentaryTime.current = now;
      const text = await generateCommentary(type === 'death' ? 'player died' : 'player reached milestone', Math.floor(gameState.current.distance));
      setCommentary(text);
      setTimeout(() => setCommentary(null), 4000);
    };

    requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('touchstart', handleTouch);
      observer.disconnect();
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPaused, onGameOver]);

  return (
    <div className="relative w-full max-w-4xl mx-auto aspect-video bg-black border-4 border-cyan-500 overflow-hidden cursor-pointer" onClick={jump}>
      <canvas ref={canvasRef} className="w-full h-full" />

      <div className="absolute top-4 left-4 font-arcade text-cyan-400 text-xl neon-text">
        SCORE: {score}
      </div>

      <AnimatePresence>
        {commentary && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-1/4 right-10 max-w-xs bg-white text-black p-4 rounded-2xl rounded-tr-none font-arcade text-[10px] leading-relaxed shadow-[0_0_20px_rgba(255,255,255,0.5)]"
          >
            <div className="absolute -top-2 -right-2 w-4 h-4 bg-white rotate-45" />
            {commentary}
          </motion.div>
        )}
      </AnimatePresence>

      {isPaused && !isGameOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="font-arcade text-4xl text-white neon-text animate-pulse">PAUSED</div>
        </div>
      )}
    </div>
  );
};
