// Procedural obstacle generation for the endless runner.
//
// Replaces random per-frame obstacle spawning with a hand-authored pattern
// library, deterministic seeded RNG, and tier-aware difficulty selection.
// See NOR-261 for the design rationale.

// Player physics constants — must stay in sync with components/Game.tsx
export const PLAYER_WIDTH = 40;
export const PLAYER_HEIGHT = 40;
export const GRAVITY = 0.8;
export const JUMP_VELOCITY = -15;
export const INITIAL_SPEED = 5;
export const MAX_SPEED = INITIAL_SPEED * 3; // 15 = 3.0× cap from spec

// Apex of a single jump, in pixels above ground (positive number).
// y(t) = JUMP_VELOCITY*t + 0.5*GRAVITY*t² (down-positive convention)
// peak at dy=0 ⇒ t = |JUMP_VELOCITY| / GRAVITY
// peak height = JUMP_VELOCITY² / (2*GRAVITY)
export const JUMP_APEX = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);

export type Obstacle = {
  /** Local x offset within the chunk, ground-aligned. */
  xOffset: number;
  width: number;
  height: number;
};

export type Pattern = {
  id: string;
  /** Total slice width in px. Determines where the next chunk anchors. */
  width: number;
  obstacles: Obstacle[];
  /** 1 (easy) – 5 (hard). Pattern only spawns at speed tiers ≥ this value. */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Minimum px of empty space after this chunk before the next one. */
  minGapAfter: number;
};

export type SpeedTier = 1 | 2 | 3 | 4 | 5;

// ─────────────────────────────────────────────────────────────────────────────
// Mulberry32 — small, fast, deterministic RNG. Same seed → same sequence.
// ─────────────────────────────────────────────────────────────────────────────
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Physics: can the player clear this obstacle at this speed?
// ─────────────────────────────────────────────────────────────────────────────
//
// During a jump, the player's bottom edge follows
//   y(t) = JUMP_VELOCITY*t + 0.5*GRAVITY*t²   (origin at ground, down positive)
// The player's bottom is above an obstacle of height h while y(t) < -h, i.e.
//   0.5*GRAVITY*t² + JUMP_VELOCITY*t + h < 0
// The roots give the time interval the player is high enough; multiplying by
// speed gives the horizontal distance the player travels while above height h.
// To clear an obstacle of width w, that distance must cover the obstacle plus
// the player's own width (the player must be entirely past the obstacle).
export function isClearable(obstacle: { width: number; height: number }, speed: number): boolean {
  if (obstacle.height >= JUMP_APEX) return false;

  // Discriminant of 0.5*GRAVITY*t² + JUMP_VELOCITY*t + h = 0
  // = JUMP_VELOCITY² - 2*GRAVITY*h
  const discriminant = JUMP_VELOCITY * JUMP_VELOCITY - 2 * GRAVITY * obstacle.height;
  if (discriminant <= 0) return false;

  // Time spent above height h, in frames.
  const dtFrames = Math.sqrt(discriminant) / (0.5 * GRAVITY);
  const horizontalClearance = dtFrames * speed;

  return horizontalClearance >= obstacle.width + PLAYER_WIDTH;
}

// ─────────────────────────────────────────────────────────────────────────────
// Speed → tier mapping. Tier 1 = base speed, Tier 5 = 3.0× cap.
// ─────────────────────────────────────────────────────────────────────────────
export function getSpeedTier(speed: number): SpeedTier {
  const ratio = speed / INITIAL_SPEED;
  if (ratio < 1.25) return 1;
  if (ratio < 1.75) return 2;
  if (ratio < 2.25) return 3;
  if (ratio < 2.75) return 4;
  return 5;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern library — 15 hand-authored chunks. Heights stay well below JUMP_APEX
// (~140px) so every pattern is clearable at base speed. Wider obstacles get
// gated to higher tiers because the player needs more horizontal clearance.
// ─────────────────────────────────────────────────────────────────────────────
export const PATTERNS: readonly Pattern[] = [
  // Breath chunks — empty corridors. Selected via the 15% breath slot.
  { id: 'breath_short', width: 200, obstacles: [], difficulty: 1, minGapAfter: 0 },
  { id: 'breath_long', width: 350, obstacles: [], difficulty: 1, minGapAfter: 0 },

  // Easy — diff 1-2
  {
    id: 'single_low',
    width: 80,
    obstacles: [{ xOffset: 25, width: 30, height: 35 }],
    difficulty: 1,
    minGapAfter: 180,
  },
  {
    id: 'single_med',
    width: 90,
    obstacles: [{ xOffset: 25, width: 35, height: 55 }],
    difficulty: 2,
    minGapAfter: 200,
  },
  {
    id: 'wide_short',
    width: 130,
    obstacles: [{ xOffset: 25, width: 70, height: 30 }],
    difficulty: 2,
    minGapAfter: 200,
  },
  {
    id: 'pair_far',
    width: 280,
    obstacles: [
      { xOffset: 20, width: 30, height: 35 },
      { xOffset: 200, width: 30, height: 35 },
    ],
    difficulty: 2,
    minGapAfter: 200,
  },

  // Medium — diff 3
  {
    id: 'tall_thin',
    width: 90,
    obstacles: [{ xOffset: 30, width: 25, height: 80 }],
    difficulty: 3,
    minGapAfter: 220,
  },
  {
    id: 'staircase_up',
    width: 220,
    obstacles: [
      { xOffset: 20, width: 30, height: 40 },
      { xOffset: 150, width: 30, height: 70 },
    ],
    difficulty: 3,
    minGapAfter: 240,
  },
  {
    id: 'pair_near',
    width: 200,
    obstacles: [
      { xOffset: 20, width: 30, height: 45 },
      { xOffset: 130, width: 30, height: 45 },
    ],
    difficulty: 3,
    minGapAfter: 220,
  },

  // Hard — diff 4-5
  {
    id: 'triple',
    width: 360,
    obstacles: [
      { xOffset: 20, width: 25, height: 40 },
      { xOffset: 160, width: 25, height: 50 },
      { xOffset: 300, width: 25, height: 40 },
    ],
    difficulty: 4,
    minGapAfter: 260,
  },
  {
    id: 'tall_double',
    width: 240,
    obstacles: [
      { xOffset: 20, width: 25, height: 75 },
      { xOffset: 170, width: 25, height: 75 },
    ],
    difficulty: 4,
    minGapAfter: 260,
  },
  {
    id: 'wall',
    width: 110,
    obstacles: [{ xOffset: 25, width: 50, height: 95 }],
    difficulty: 4,
    minGapAfter: 280,
  },
  {
    id: 'gauntlet',
    width: 480,
    obstacles: [
      { xOffset: 20, width: 25, height: 50 },
      { xOffset: 150, width: 25, height: 80 },
      { xOffset: 290, width: 25, height: 50 },
      { xOffset: 430, width: 25, height: 80 },
    ],
    difficulty: 5,
    minGapAfter: 300,
  },
  {
    id: 'split_jump',
    width: 200,
    obstacles: [
      { xOffset: 20, width: 25, height: 90 },
      { xOffset: 140, width: 25, height: 90 },
    ],
    difficulty: 5,
    minGapAfter: 320,
  },
  {
    id: 'fortress',
    width: 140,
    obstacles: [{ xOffset: 25, width: 80, height: 100 }],
    difficulty: 5,
    minGapAfter: 320,
  },
];

const BREATH_PATTERNS = PATTERNS.filter((p) => p.obstacles.length === 0);
const COMBAT_PATTERNS = PATTERNS.filter((p) => p.obstacles.length > 0);

// ─────────────────────────────────────────────────────────────────────────────
// Bucket selection — splits patterns into easy / medium / hard buckets and
// applies the tier-weighted distributions from the spec. The breath bucket is
// a flat 15% slot at every tier.
// ─────────────────────────────────────────────────────────────────────────────
type Bucket = 'breath' | 'easy' | 'medium' | 'hard';

const BREATH_CHANCE = 0.15;

const TIER_DISTRIBUTIONS: Record<SpeedTier, { easy: number; medium: number; hard: number }> = {
  1: { easy: 0.8, medium: 0.2, hard: 0.0 },
  2: { easy: 0.5, medium: 0.4, hard: 0.1 },
  3: { easy: 0.3, medium: 0.5, hard: 0.2 },
  4: { easy: 0.2, medium: 0.4, hard: 0.4 },
  5: { easy: 0.1, medium: 0.3, hard: 0.6 },
};

function selectBucket(rng: () => number, tier: SpeedTier): Bucket {
  if (rng() < BREATH_CHANCE) return 'breath';
  const dist = TIER_DISTRIBUTIONS[tier];
  const r = rng();
  if (r < dist.easy) return 'easy';
  if (r < dist.easy + dist.medium) return 'medium';
  return 'hard';
}

function difficultyFilterForBucket(bucket: Exclude<Bucket, 'breath'>): (d: number) => boolean {
  if (bucket === 'easy') return (d) => d === 1 || d === 2;
  if (bucket === 'medium') return (d) => d === 3;
  return (d) => d === 4 || d === 5;
}

function pickWeighted(rng: () => number, candidates: readonly Pattern[]): Pattern {
  // Equal-weight pick within a bucket. Could be extended later if some
  // patterns deserve more screen time than others.
  return candidates[Math.floor(rng() * candidates.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// selectNextChunk — main entry point. Filters by bucket, prevents repeats,
// enforces tier ceiling and physics clearability, and falls back gracefully.
// ─────────────────────────────────────────────────────────────────────────────
export function selectNextChunk(
  rng: () => number,
  prevChunkId: string | null,
  speed: number,
): Pattern {
  const tier = getSpeedTier(speed);
  const bucket = selectBucket(rng, tier);

  if (bucket === 'breath') {
    const candidates = BREATH_PATTERNS.filter((p) => p.id !== prevChunkId);
    return pickWeighted(rng, candidates.length > 0 ? candidates : BREATH_PATTERNS);
  }

  const difficultyFilter = difficultyFilterForBucket(bucket);
  const candidates = COMBAT_PATTERNS.filter(
    (p) =>
      p.id !== prevChunkId &&
      difficultyFilter(p.difficulty) &&
      p.difficulty <= tier &&
      p.obstacles.every((o) => isClearable(o, speed)),
  );

  if (candidates.length > 0) {
    return pickWeighted(rng, candidates);
  }

  // Fallback: any clearable easy pattern that isn't a repeat. Guarantees the
  // generator never gets stuck even if pool filtering is too aggressive.
  const fallback = COMBAT_PATTERNS.filter(
    (p) =>
      p.id !== prevChunkId &&
      p.difficulty === 1 &&
      p.obstacles.every((o) => isClearable(o, speed)),
  );
  if (fallback.length > 0) return pickWeighted(rng, fallback);

  // Last resort: a breath chunk so the run keeps moving.
  return BREATH_PATTERNS[0];
}
