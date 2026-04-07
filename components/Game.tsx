'use client';

import React, { useEffect, useRef, useState } from 'react';
import { generateCommentary } from '@/lib/gemini';
import { ParallaxBackground } from '@/lib/ParallaxBackground';
import { motion, AnimatePresence } from 'motion/react';
import {
  GRAVITY,
  INITIAL_SPEED,
  JUMP_VELOCITY,
  MAX_SPEED,
  PATTERNS,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  mulberry32,
  selectNextChunk,
  type Pattern,
} from '@/lib/procgen';

// Game constants
const GROUND_HEIGHT = 40;
const PLAYER_X = 50;

// ─── Chaos event constants (Section 16 of GDD-BaseRunner-PsychOut.md) ──────
const CHAOS_COOLDOWN_MIN_SCORE = 750;
const CHAOS_COOLDOWN_MAX_SCORE = 900;
const CHAOS_WARNING_MS = 3000;        // T-3s → T-0s
const CHAOS_EDGE_PULSE_FROM_MS = 2000; // T-1s — start of red edge pulse
const GRID_SURGE_DURATION_MS = 4000;
const OBSTACLE_BURST_GAP_PX = 80;     // tight spacing inside the burst
const OBSTACLE_BURST_RECOVERY_PX = 280; // breathing room after burst before normal procgen resumes
const CHAOS_BAR_REFILL_FLASH_MS = 500;

interface GameProps {
  onGameOver: (score: number) => void;
  isPaused: boolean;
}

export const Game: React.FC<GameProps> = ({ onGameOver, isPaused }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [commentary, setCommentary] = useState<string | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  // Chaos warning banner — null when no warning is active.
  const [chaosWarning, setChaosWarning] = useState<string | null>(null);
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

  // Chaos event state — implements Section 16 of GDD-BaseRunner-PsychOut.md.
  // Re-initialised on every effect mount alongside gameState.
  const chaosState = useRef({
    phase: 'cooldown' as 'cooldown' | 'warning' | 'event',
    // Cooldown — score-based, randomised in [750, 900] each cycle.
    scoreAtCooldownStart: 0,
    cooldownDistance: 800,
    // Warning — time-based.
    warningStartedAt: 0,
    pendingEvent: null as 'grid-surge' | 'obstacle-burst' | null,
    // Active event — time-based.
    activeEvent: null as 'grid-surge' | 'obstacle-burst' | null,
    eventStartedAt: 0,
    speedBeforeSurge: 0,
    surgeUsedShield: false, // tracks invincibility use during surge
    // Cooldown bar refill flash — switches the bar to amber for half a
    // second after an event finishes, then reverts to red as it depletes.
    refillFlashUntil: 0,
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

    // Pick a random themed background set (1..8) per run. Night-only — the
    // Day variants fight the arcade neon aesthetic and tank SCORE contrast.
    // Each set ships 5 depth layers; we use 1, 2, 4, 5 to keep the existing
    // 4-layer structure with an even back-to-front spread.
    const setId = 1 + Math.floor(Math.random() * 8);
    const base = `/bg/${setId}/Night`;

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

    // ─── Procedural generation + chaos RNGs ────────────────────────────────
    // Seeded RNG so the same run is reproducible if we ever want to share
    // seeds. Right now we just take the wall clock — wallet-derived seeds
    // can come later.
    const seed = Date.now() & 0xffffffff;
    const rng = mulberry32(seed);
    // Separate RNG for the chaos system so chaos rolls don't perturb procgen's
    // chunk selection sequence (and vice versa). Both are deterministic per run.
    const chaosRng = mulberry32(seed ^ 0xc4a05c0d);

    // x in screen coordinates where the next chunk's leading edge will spawn.
    // Decrements with the world each frame; when it reaches the right edge of
    // the canvas we drop in the next chunk.
    let nextChunkX = canvas.width + 200;
    let prevChunkId: string | null = null;

    const spawnChunk = (chunk: Pattern) => {
      for (const o of chunk.obstacles) {
        gameState.current.obstacles.push({
          x: nextChunkX + o.xOffset,
          width: o.width,
          height: o.height,
        });
      }
      nextChunkX += chunk.width + chunk.minGapAfter;
      prevChunkId = chunk.id;
    };

    // ─── Chaos events (Section 16 of GDD-BaseRunner-PsychOut.md) ────────────
    // Initialise chaos state on every effect mount alongside gameState.
    chaosState.current = {
      phase: 'cooldown',
      scoreAtCooldownStart: 0,
      cooldownDistance:
        CHAOS_COOLDOWN_MIN_SCORE +
        Math.floor(chaosRng() * (CHAOS_COOLDOWN_MAX_SCORE - CHAOS_COOLDOWN_MIN_SCORE + 1)),
      warningStartedAt: 0,
      pendingEvent: null,
      activeEvent: null,
      eventStartedAt: 0,
      speedBeforeSurge: 0,
      surgeUsedShield: false,
      refillFlashUntil: 0,
    };

    // Single-obstacle, easy chunks used as the building blocks for an
    // OBSTACLE BURST. We pick from this list at burst time and place each
    // obstacle at a tighter spacing than normal procgen ever produces.
    const burstChunks = PATTERNS.filter(
      (p) => p.obstacles.length === 1 && p.difficulty <= 2,
    );

    // TODO(NOR-260): replace this stub with the real PowerUpSystem.isInvincible()
    // check once invincibility is wired into Game.tsx. Until then the player is
    // always considered "not shielded" so the post-surge survival commentary
    // always fires when the player makes it through.
    const isInvincible = () => false;

    const enterCooldown = (timestamp: number) => {
      chaosState.current.phase = 'cooldown';
      chaosState.current.scoreAtCooldownStart = gameState.current.distance;
      chaosState.current.cooldownDistance =
        CHAOS_COOLDOWN_MIN_SCORE +
        Math.floor(chaosRng() * (CHAOS_COOLDOWN_MAX_SCORE - CHAOS_COOLDOWN_MIN_SCORE + 1));
      chaosState.current.activeEvent = null;
      chaosState.current.pendingEvent = null;
      chaosState.current.refillFlashUntil = timestamp + CHAOS_BAR_REFILL_FLASH_MS;
    };

    const spawnChaosBurst = () => {
      // Anchor the burst far enough right that it doesn't collide with any
      // obstacle still in flight from normal procgen, AND past wherever the
      // next normal chunk is queued to spawn (nextChunkX) so we can't land
      // inside a future chunk either.
      let burstX = Math.max(canvas.width + 50, nextChunkX);
      for (const obs of gameState.current.obstacles) {
        if (obs.x + obs.width + 20 > burstX) burstX = obs.x + obs.width + 20;
      }

      for (let i = 0; i < 4; i++) {
        const pattern = burstChunks[Math.floor(chaosRng() * burstChunks.length)];
        const o = pattern.obstacles[0];
        gameState.current.obstacles.push({
          x: burstX + o.xOffset,
          width: o.width,
          height: o.height,
        });
        burstX += o.xOffset + o.width + OBSTACLE_BURST_GAP_PX;
      }

      // Push the procgen spawn cursor past the burst (plus recovery breathing
      // room) so the next normal chunk doesn't land inside the burst tail.
      const burstEndX = burstX + OBSTACLE_BURST_RECOVERY_PX;
      if (burstEndX > nextChunkX) nextChunkX = burstEndX;
    };

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

      // Speed ramp — capped at 3.0× base (matches procgen tier 5).
      // Note: a GRID SURGE clamps speed to MAX_SPEED for 4s, so ramps that
      // would have fired during the surge are skipped (no-ops at the cap).
      // That's intentional — surge does not count as natural progression.
      if (
        gameState.current.frameCount % 500 === 0 &&
        gameState.current.speed < MAX_SPEED
      ) {
        gameState.current.speed = Math.min(gameState.current.speed + 0.5, MAX_SPEED);
      }

      // ─── Chaos events tick ──────────────────────────────────────────────
      const chaos = chaosState.current;
      if (chaos.phase === 'cooldown') {
        const scoreSinceCooldown =
          gameState.current.distance - chaos.scoreAtCooldownStart;
        if (scoreSinceCooldown >= chaos.cooldownDistance) {
          // Roll which event fires (50/50 between the two Phase 1 events).
          const eventKind: 'grid-surge' | 'obstacle-burst' =
            chaosRng() < 0.5 ? 'grid-surge' : 'obstacle-burst';
          chaos.pendingEvent = eventKind;
          chaos.warningStartedAt = timestamp;
          chaos.phase = 'warning';
          // Banner copy + Gemini commentary fire at T-3s simultaneously.
          const bannerText =
            eventKind === 'grid-surge' ? 'GRID SURGE INCOMING' : 'OBSTACLE BURST INCOMING';
          setChaosWarning(bannerText);
          triggerCommentary(
            eventKind === 'grid-surge' ? 'grid surge incoming' : 'obstacle burst incoming',
          );
        }
      } else if (chaos.phase === 'warning') {
        const elapsed = timestamp - chaos.warningStartedAt;
        if (elapsed >= CHAOS_WARNING_MS) {
          // T-0s — fire the event.
          chaos.activeEvent = chaos.pendingEvent;
          chaos.pendingEvent = null;
          chaos.eventStartedAt = timestamp;
          chaos.phase = 'event';
          setChaosWarning(null);

          if (chaos.activeEvent === 'grid-surge') {
            chaos.speedBeforeSurge = gameState.current.speed;
            chaos.surgeUsedShield = isInvincible();
            gameState.current.speed = MAX_SPEED;
          } else if (chaos.activeEvent === 'obstacle-burst') {
            spawnChaosBurst();
            // OBSTACLE BURST is instant — return to cooldown immediately.
            enterCooldown(timestamp);
          }
        }
      } else if (chaos.phase === 'event' && chaos.activeEvent === 'grid-surge') {
        // Track shield use during the active surge.
        if (!chaos.surgeUsedShield && isInvincible()) {
          chaos.surgeUsedShield = true;
        }
        const elapsed = timestamp - chaos.eventStartedAt;
        if (elapsed >= GRID_SURGE_DURATION_MS) {
          gameState.current.speed = chaos.speedBeforeSurge;
          if (!chaos.surgeUsedShield && !gameState.current.gameOver) {
            triggerCommentary('survived grid surge');
          }
          enterCooldown(timestamp);
        }
      }

      // Procedural chunk spawning.
      // Slide the spawn cursor along with the world, then spawn whenever the
      // cursor reaches the right edge of the visible canvas.
      nextChunkX -= gameState.current.speed;
      if (nextChunkX <= canvas.width) {
        spawnChunk(selectNextChunk(rng, prevChunkId, gameState.current.speed));
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

      // ─── Chaos draw layer ───────────────────────────────────────────────
      // Red edge pulse during the last second of the warning sequence (T-1s).
      if (chaos.phase === 'warning') {
        const elapsed = timestamp - chaos.warningStartedAt;
        if (elapsed >= CHAOS_EDGE_PULSE_FROM_MS) {
          const t = (elapsed - CHAOS_EDGE_PULSE_FROM_MS) / 1000; // 0 → 1
          // Pulse twice in the last second using a sine wave.
          const alpha = 0.35 + 0.45 * Math.abs(Math.sin(t * Math.PI * 2));
          ctx.strokeStyle = `rgba(220, 38, 38, ${alpha})`;
          ctx.lineWidth = 6;
          ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
        }
      }

      // Chaos cooldown bar — bottom-right corner, no label.
      // Bar represents fraction of cooldown remaining: full right after an
      // event fires, empties as the next event approaches. Red while
      // depleting; flashes amber for 500ms after an event fires while it
      // visually "refills" back to full.
      {
        const barW = 80;
        const barH = 4;
        const barX = canvas.width - barW - 12;
        const barY = canvas.height - barH - 12;
        let fillRatio = 0;
        if (chaos.phase === 'cooldown') {
          const scoreSince =
            gameState.current.distance - chaos.scoreAtCooldownStart;
          fillRatio = Math.max(0, 1 - scoreSince / chaos.cooldownDistance);
        }
        // Background track
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(barX, barY, barW, barH);
        // Fill — amber during the post-event refill flash, red otherwise
        const inRefillFlash = timestamp < chaos.refillFlashUntil;
        ctx.fillStyle = inRefillFlash ? '#ffaa00' : '#8b0000';
        ctx.fillRect(barX, barY, barW * fillRatio, barH);
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    // Commentary triggers that bypass the 5-second rate limit. Death and the
    // chaos event lines from Section 16 of the GDD are rare + important — we
    // never want a recent milestone roast to swallow them.
    const COMMENTARY_BYPASS_RATE_LIMIT = new Set([
      'death',
      'grid surge incoming',
      'obstacle burst incoming',
      'survived grid surge',
      'used shield on warning',
    ]);

    const triggerCommentary = async (type: string) => {
      const now = Date.now();
      if (
        now - lastCommentaryTime.current < 5000 &&
        !COMMENTARY_BYPASS_RATE_LIMIT.has(type)
      ) {
        return;
      }

      lastCommentaryTime.current = now;
      // 'death' and 'milestone' are short codes that map to verbose strings.
      // Anything else (e.g. chaos event names like 'grid surge incoming') is
      // passed through verbatim — see Section 16 of the GDD.
      const eventString =
        type === 'death'
          ? 'player died'
          : type === 'milestone'
          ? 'player reached milestone'
          : type;
      const text = await generateCommentary(eventString, Math.floor(gameState.current.distance));
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

      <div className="absolute top-4 left-4 font-arcade text-cyan-400 text-xl neon-text bg-black/60 border border-cyan-500/60 rounded px-3 py-1">
        SCORE: {score}
      </div>

      {/* Chaos event warning banner — slides in from top of canvas at T-3s. */}
      <AnimatePresence>
        {chaosWarning && (
          <motion.div
            key="chaos-warning"
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 16, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="absolute top-0 left-1/2 -translate-x-1/2 px-6 py-2 bg-black/85 border-2 border-red-600 text-red-500 font-arcade text-sm tracking-widest shadow-[0_0_30px_rgba(220,38,38,0.55)]"
            style={{ textShadow: '0 0 8px rgba(220,38,38,0.9)' }}
          >
            ⚠ {chaosWarning}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {commentary && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-1/4 right-10 max-w-xs bg-black/75 backdrop-blur-sm text-cyan-300 border border-cyan-400 p-4 rounded-2xl rounded-tr-none font-arcade text-[10px] leading-relaxed shadow-[0_0_20px_rgba(34,211,238,0.5)]"
          >
            <div className="absolute -top-2 -right-2 w-4 h-4 bg-black border-t border-r border-cyan-400 rotate-45" />
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
