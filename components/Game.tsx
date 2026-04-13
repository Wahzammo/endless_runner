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
import { PowerUpSystem, type PowerUpId } from '@/lib/PowerUpSystem';
import { gameSession } from '@/lib/GameSession';
import {
  CONSUMABLE_ITEMS_ADDRESS,
  POWERUP_TO_TOKEN_ID,
  TOKEN_ID_TO_POWERUP,
} from '@/lib/contract';

// Game constants
const GROUND_HEIGHT = 40;
// Player X position is ~30% of canvas width (computed dynamically on resize)
const PLAYER_X_FRACTION = 0.3;

// ─── Player HP / hurt window ────────────────────────────────────────────────
const STARTING_LIVES = 3;
// Post-hit invulnerability window — additional collisions during this window
// are no-ops, and the player rect alpha-flickers as a visual stand-in for
// the hurt animation. Tie this to the actual hurt sprite's frame count when
// SpriteAnimator lands (NOR-259).
const HURT_IFRAME_MS = 800;

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
  /** Connected wallet address — enables on-chain inventory reads + mints. */
  playerAddress?: `0x${string}`;
}

export const Game: React.FC<GameProps> = ({ onGameOver, isPaused, playerAddress }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [commentary, setCommentary] = useState<string | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  // Chaos warning banner — null when no warning is active.
  const [chaosWarning, setChaosWarning] = useState<string | null>(null);
  const lastCommentaryTime = useRef(0);

  // Mirror the isPaused prop into a ref so the main effect's game loop can
  // read it without remounting. Without this the effect redeps on isPaused
  // and a pause toggle tears down and re-creates the entire game state.
  const pausedRef = useRef(isPaused);
  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  // Game state refs to avoid closure issues in loop
  const gameState = useRef({
    player: { y: 0, dy: 0, jumping: false, width: PLAYER_WIDTH, height: PLAYER_HEIGHT },
    // Obstacles carry a `destroyed` flag so fireballs can mark them for
    // removal without breaking the existing AABB collision pass.
    obstacles: [] as { x: number, width: number, height: number, destroyed: boolean }[],
    speed: INITIAL_SPEED,
    distance: 0,
    gameOver: false,
    frameCount: 0,
    // HP system — post-hit i-frames live on the same ref so the loop can
    // check both in one branch.
    lives: STARTING_LIVES,
    iFramesUntil: 0, // performance.now() timestamp; 0 = no i-frames active
  });

  // React state mirror of lives so the hearts HUD re-renders cleanly.
  const [lives, setLives] = useState(STARTING_LIVES);

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

  // Power-up system instance — owns all card UI, fireball physics, active
  // effect timers, and per-tick speed multiplier. Reset on every effect mount.
  const powerUpSystemRef = useRef<PowerUpSystem | null>(null);

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
    let playerX = 50; // recalculated on resize
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      playerX = Math.floor(canvas.width * PLAYER_X_FRACTION);
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
      lives: STARTING_LIVES,
      iFramesUntil: 0,
    };
    setLives(STARTING_LIVES);
    lastCommentaryTime.current = 0;

    // ─── Power-up system ────────────────────────────────────────────────
    const powerUpSystem = new PowerUpSystem();
    powerUpSystemRef.current = powerUpSystem;

    // Load wallet inventory counts if the contract is deployed and
    // player is connected. Falls back to granting 1 of each when the
    // contract isn't configured (local dev / testnet without deploy).
    if (playerAddress && CONSUMABLE_ITEMS_ADDRESS) {
      gameSession
        .getInventoryCounts(playerAddress)
        .then((counts) => {
          const inventory = new Map<PowerUpId, number>();
          for (const [tokenId, count] of counts) {
            const id = TOKEN_ID_TO_POWERUP[tokenId as keyof typeof TOKEN_ID_TO_POWERUP];
            if (id) inventory.set(id, count);
          }
          powerUpSystem.setInventory(inventory);
        })
        .catch(() => {
          // Contract not deployed or read failed — fall back to 1 of each
          const fallback = new Map<PowerUpId, number>([
            ['health', 1], ['invincible', 1], ['timeslow', 1], ['fireball', 1],
          ]);
          powerUpSystem.setInventory(fallback);
        });
    } else {
      const fallback = new Map<PowerUpId, number>([
        ['health', 1], ['invincible', 1], ['timeslow', 1], ['fireball', 1],
      ]);
      powerUpSystem.setInventory(fallback);
    }

    // Activate a consumable from the action bar — burn + apply effect.
    const useConsumable = (slot: number) => {
      if (gameState.current.gameOver) return;
      if (powerUpSystem.isPaused) return; // can't use during card selection

      const id = powerUpSystem.getSlotId(slot);
      if (!id) return;

      const stateForApply = {
        lives: gameState.current.lives,
        canvasW: canvas.width,
        playerY: gameState.current.player.y,
      };

      const used = powerUpSystem.useFromInventory(id, stateForApply);
      if (!used) return; // inventory empty

      // Sync lives back to React state
      if (stateForApply.lives !== gameState.current.lives) {
        gameState.current.lives = stateForApply.lives;
        setLives(stateForApply.lives);
      }

      // TODO NOR-207: Burn the NFT via session key (no wallet popup).
      // The session key flow in GameSession.ts needs ERC-7715 + ERC-4337
      // bundler integration with Coinbase Smart Wallet. Until then, the
      // game effect applies locally but no on-chain burn happens.
      // The item is still deducted from the local inventory for this run.
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        jump();
      }
      // Action bar: keys 1-4 activate consumables
      if (e.code === 'Digit1') useConsumable(1);
      if (e.code === 'Digit2') useConsumable(2);
      if (e.code === 'Digit3') useConsumable(3);
      if (e.code === 'Digit4') useConsumable(4);
    };
    window.addEventListener('keydown', handleKeyDown);

    // Translate a pointer event into canvas coordinates. Because resizeCanvas
    // sets canvas.width = canvas.offsetWidth, internal canvas pixels match
    // DOM pixels 1:1 — no scale factor needed.
    const pointerToCanvas = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    // Click handler — route to the power-up card overlay if it's showing,
    // otherwise treat the click as a jump.
    const handleCanvasClick = (e: MouseEvent) => {
      const { x, y } = pointerToCanvas(e.clientX, e.clientY);
      if (powerUpSystemRef.current?.isPaused) {
        powerUpSystemRef.current.handleClick(x, y);
        return;
      }
      jump();
    };
    canvas.addEventListener('click', handleCanvasClick);

    const handleTouch = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (touch && powerUpSystemRef.current?.isPaused) {
        const { x, y } = pointerToCanvas(touch.clientX, touch.clientY);
        powerUpSystemRef.current.handleClick(x, y);
        return;
      }
      jump();
    };
    canvas.addEventListener('touchstart', handleTouch, { passive: false });

    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(canvas);

    let animationFrameId: number;
    let lastTime = 0;
    let lastMilestone = 0;
    // Tracks whether the previous frame was paused, so the resume frame can
    // trigger the chaos cooldown reset required by GDD Section 16 without
    // needing a React-layer pause listener.
    let wasPausedLastFrame = false;

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
          destroyed: false,
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

    // Real invincibility check, now that PowerUpSystem is wired.
    const isInvincible = () => powerUpSystem.isInvincible;

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
          destroyed: false,
        });
        burstX += o.xOffset + o.width + OBSTACLE_BURST_GAP_PX;
      }

      // Push the procgen spawn cursor past the burst (plus recovery breathing
      // room) so the next normal chunk doesn't land inside the burst tail.
      const burstEndX = burstX + OBSTACLE_BURST_RECOVERY_PX;
      if (burstEndX > nextChunkX) nextChunkX = burstEndX;
    };

    const loop = (timestamp: number) => {
      // Game over — end the loop entirely. No more frames scheduled.
      if (gameState.current.gameOver) return;

      // Paused — either via the Escape key (pausedRef) or via the power-up
      // milestone card overlay (powerUpSystem.isPaused). Keep the loop alive
      // but freeze all game state updates. Keep lastTime current so when the
      // player resumes, deltaTime is a single-frame step rather than the
      // entire pause duration (otherwise the parallax background jumps
      // violently on resume).
      if (pausedRef.current || powerUpSystem.isPaused) {
        lastTime = timestamp;
        // Pin chaos warning + event timestamps to the current frame so the
        // chaos timeline effectively restarts on resume. Without this, a
        // long milestone pause taken during a warning would cause the loop
        // to see elapsed > 3000ms on the resume frame and skip straight to
        // firing the event with no edge pulse — bypassing the player's
        // intended decision window.
        if (chaosState.current.phase === 'warning') {
          chaosState.current.warningStartedAt = timestamp;
        } else if (chaosState.current.phase === 'event') {
          chaosState.current.eventStartedAt = timestamp;
        }
        // Only Escape pause resets chaos cooldown on resume per GDD Section
        // 16. The power-up card overlay is short and doesn't need a reset.
        if (pausedRef.current) wasPausedLastFrame = true;
        // Still draw the overlay so the player can see/click the cards.
        if (powerUpSystem.isPaused) {
          powerUpSystem.drawOverlay(ctx, canvas.width, canvas.height);
        }
        animationFrameId = requestAnimationFrame(loop);
        return;
      }

      // First frame after resume — reset the chaos cooldown per Section 16
      // of the GDD ("Reset the cooldown timer when game resumes from pause").
      if (wasPausedLastFrame) {
        enterCooldown(timestamp);
        wasPausedLastFrame = false;
      }

      const deltaTime = timestamp - lastTime;
      lastTime = timestamp;

      // Tick power-up system: expires timed effects, advances fireballs,
      // returns the speed multiplier (1.0 normal, 0.5 if timeslow active).
      const speedMultiplier = powerUpSystem.update(deltaTime);

      const ground = groundY();

      // Effective speed = base speed × power-up multiplier. Used for all
      // world advancement (distance, obstacle scrolling, spawn cursor).
      // gameState.current.speed remains the base speed and is the only
      // value the natural ramp + GRID SURGE write to.
      const effectiveSpeed = gameState.current.speed * speedMultiplier;

      // Update
      gameState.current.frameCount++;
      gameState.current.distance += effectiveSpeed / 10;
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

      // Milestone power-up offer — call after distance update so the score
      // we pass matches what's about to render. If a milestone fires, the
      // overlay pauses the game on the next frame.
      if (powerUpSystem.checkScoreTrigger(Math.floor(gameState.current.distance))) {
        powerUpSystem.showOffer(canvas.width, canvas.height, onChoice);
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
      // Note: selectNextChunk uses gameState.speed (base, not effective) so
      // tier weighting follows the player's current natural progression
      // rather than briefly easing during a timeslow.
      nextChunkX -= effectiveSpeed;
      if (nextChunkX <= canvas.width) {
        spawnChunk(selectNextChunk(rng, prevChunkId, gameState.current.speed));
      }

      // Fireball-vs-obstacle collision pass — runs before player collision
      // so a fireball can destroy an obstacle the same frame the player
      // would have hit it. Wraps each obstacle as PowerUpSystem expects.
      for (const obs of gameState.current.obstacles) {
        if (obs.destroyed) continue;
        const wrapper = {
          x: obs.x,
          y: ground - obs.height,
          w: obs.width,
          h: obs.height,
          isCrate: true,
          destroyed: false,
        };
        powerUpSystem.checkFireballCrateCollision(wrapper);
        if (wrapper.destroyed) obs.destroyed = true;
      }

      gameState.current.obstacles.forEach((obs) => {
        obs.x -= effectiveSpeed;

        // Skip already-destroyed obstacles (collision and rendering handled
        // by the destroyed flag — they'll be filtered out below).
        if (obs.destroyed) return;

        // AABB Collision: player rect vs obstacle rect
        const p = gameState.current.player;
        const obsTop = ground - obs.height;

        if (
          playerX < obs.x + obs.width &&
          playerX + p.width > obs.x &&
          p.y < obsTop + obs.height &&
          p.y + p.height > obsTop
        ) {
          // Phase shift — invincibility lets the player pass through.
          if (powerUpSystem.isInvincible) return;

          // Hurt animation window — additional collisions inside this
          // window are no-ops so wide / multi-obstacle hits only cost
          // one life. The hurt sprite (NOR-259) will eventually drive
          // this duration; for now we use a fixed HURT_IFRAME_MS.
          if (timestamp < gameState.current.iFramesUntil) return;

          gameState.current.lives -= 1;
          gameState.current.iFramesUntil = timestamp + HURT_IFRAME_MS;
          setLives(gameState.current.lives);

          if (gameState.current.lives <= 0) {
            gameState.current.gameOver = true;
            setIsGameOver(true);
            onGameOver(Math.floor(gameState.current.distance));
            triggerCommentary('death');
          }
        }
      });

      // Filter out off-screen and fireball-destroyed obstacles in one pass.
      gameState.current.obstacles = gameState.current.obstacles.filter(
        (obs) => !obs.destroyed && obs.x + obs.width > 0,
      );

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
      // Visual states (TODO NOR-260: replace this with the layered aura
      // from GDD Section 16 once invincibility lands its real visual):
      //   - invincible → ~8Hz alpha flicker, cyan tint
      //   - i-frames active → faster flicker (hurt animation stand-in)
      const invincibleNow = powerUpSystem.isInvincible;
      const inIFrames = timestamp < gameState.current.iFramesUntil;
      let playerAlpha = 1;
      if (invincibleNow) {
        playerAlpha = 0.55 + 0.45 * Math.sin(timestamp * 0.05); // ~8 Hz
      } else if (inIFrames) {
        playerAlpha = 0.3 + 0.6 * Math.abs(Math.sin(timestamp * 0.04)); // hurt flash
      }
      ctx.globalAlpha = playerAlpha;
      ctx.fillStyle = invincibleNow ? '#80ffff' : '#00ffcc';
      ctx.shadowBlur = invincibleNow ? 25 : 15;
      ctx.shadowColor = invincibleNow ? '#80ffff' : '#00ffcc';
      ctx.fillRect(playerX, gameState.current.player.y, PLAYER_WIDTH, PLAYER_HEIGHT);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      // Obstacles
      ctx.fillStyle = '#ff0055';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff0055';
      gameState.current.obstacles.forEach(obs => {
        if (obs.destroyed) return;
        ctx.fillRect(obs.x, ground - obs.height, obs.width, obs.height);
      });
      ctx.shadowBlur = 0;

      // Power-up render layer — fireballs first (so they sit above obstacles
      // but below the chaos overlays), then HUD timers in the top-right.
      powerUpSystem.drawFireballs(ctx);
      powerUpSystem.drawHUD(ctx, canvas.width);
      powerUpSystem.drawActionBar(ctx, canvas.width, canvas.height);

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
      setTimeout(() => setCommentary(null), 5500);
    };

    // Power-up card selection callback — CLAIM ONLY, no immediate effect.
    // The selected item is minted to the player's wallet and added to the
    // local inventory. The player activates it later via the action bar
    // (keys 1-4), which burns the NFT and applies the effect.
    const onChoice = (id: PowerUpId) => {
      // Add to local inventory immediately (optimistic)
      powerUpSystem.addToInventory(id);

      // Mint the item to the player's wallet in the background.
      if (playerAddress && CONSUMABLE_ITEMS_ADDRESS) {
        fetch('/api/mint-powerup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerAddress,
            tokenId: POWERUP_TO_TOKEN_ID[id],
          }),
        }).catch(() => {
          // Mint failed — item still in local inventory for this run
        });
      }
    };

    requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('click', handleCanvasClick);
      canvas.removeEventListener('touchstart', handleTouch);
      observer.disconnect();
      cancelAnimationFrame(animationFrameId);
    };
    // Note: isPaused is intentionally NOT in this dep array. It's mirrored
    // into pausedRef above so the loop can read it without forcing the
    // entire effect to remount (which would reset gameState).
  }, [onGameOver]);

  return (
    <div className="relative w-full max-w-6xl mx-auto aspect-video bg-black border-4 border-cyan-500 overflow-hidden cursor-pointer">
      {/* Canvas owns its own click + touch listeners (set up inside the
          effect) so it can route taps to the power-up card overlay when
          one is showing instead of always firing jump. */}
      <canvas ref={canvasRef} className="w-full h-full" />

      <div className="absolute top-4 left-4 flex flex-col gap-2 items-start">
        <div className="font-arcade text-cyan-400 text-xl neon-text bg-black/60 border border-cyan-500/60 rounded px-3 py-1">
          SCORE: {score}
        </div>
        {/* Hearts HUD — one filled heart per remaining life. Empty outline
            slots for missing lives so the player can read damage at a glance. */}
        <div className="flex gap-1.5 px-1" aria-label={`${lives} lives remaining`}>
          {Array.from({ length: STARTING_LIVES }).map((_, i) => (
            <span
              key={i}
              className={
                i < lives
                  ? 'text-pink-500 text-lg drop-shadow-[0_0_6px_rgba(236,72,153,0.9)]'
                  : 'text-pink-500/25 text-lg'
              }
            >
              ♥
            </span>
          ))}
        </div>
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
            className="absolute top-1/4 left-10 max-w-xs bg-black/75 backdrop-blur-sm text-cyan-300 border border-cyan-400 p-4 rounded-2xl rounded-tl-none font-arcade text-[10px] leading-relaxed shadow-[0_0_20px_rgba(34,211,238,0.5)]"
          >
            <div className="absolute -top-2 -left-2 w-4 h-4 bg-black border-t border-l border-cyan-400 rotate-45" />
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
