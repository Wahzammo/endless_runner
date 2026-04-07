import { describe, expect, it } from 'vitest';
import {
  INITIAL_SPEED,
  JUMP_APEX,
  MAX_SPEED,
  PATTERNS,
  getSpeedTier,
  isClearable,
  mulberry32,
  selectNextChunk,
} from './procgen';

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let differences = 0;
    for (let i = 0; i < 20; i++) {
      if (a() !== b()) differences++;
    }
    expect(differences).toBeGreaterThan(15);
  });

  it('returns values in [0, 1)', () => {
    const r = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('isClearable', () => {
  it('returns false for obstacles taller than the jump apex', () => {
    expect(isClearable({ width: 30, height: JUMP_APEX + 1 }, INITIAL_SPEED)).toBe(false);
    expect(isClearable({ width: 30, height: 200 }, MAX_SPEED)).toBe(false);
  });

  it('returns true for trivial obstacles at base speed', () => {
    expect(isClearable({ width: 20, height: 20 }, INITIAL_SPEED)).toBe(true);
  });

  it('returns true for the same obstacle at higher speeds (more horizontal clearance)', () => {
    const obs = { width: 60, height: 50 };
    expect(isClearable(obs, INITIAL_SPEED)).toBe(true);
    expect(isClearable(obs, MAX_SPEED)).toBe(true);
  });

  it('rejects obstacles too wide for the jump time at low speed', () => {
    // Right against the apex, dt is tiny so width has to be tiny too.
    expect(isClearable({ width: 200, height: JUMP_APEX - 1 }, INITIAL_SPEED)).toBe(false);
  });
});

describe('getSpeedTier', () => {
  it('maps base speed to tier 1', () => {
    expect(getSpeedTier(INITIAL_SPEED)).toBe(1);
  });

  it('maps the cap speed to tier 5', () => {
    expect(getSpeedTier(MAX_SPEED)).toBe(5);
  });

  it('returns increasing tiers as speed grows', () => {
    const tiers = [5, 7, 10, 12, 14].map(getSpeedTier);
    expect(tiers).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('PATTERNS — impossibility contract', () => {
  it('has at least one breath chunk and one combat chunk', () => {
    expect(PATTERNS.some((p) => p.obstacles.length === 0)).toBe(true);
    expect(PATTERNS.some((p) => p.obstacles.length > 0)).toBe(true);
  });

  it('has unique pattern ids', () => {
    const ids = PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every obstacle inside its pattern bounds', () => {
    for (const p of PATTERNS) {
      for (const o of p.obstacles) {
        expect(o.xOffset).toBeGreaterThanOrEqual(0);
        expect(o.xOffset + o.width).toBeLessThanOrEqual(p.width);
      }
    }
  });

  it('every combat pattern is clearable at the base speed of its difficulty tier', () => {
    // The slowest speed a difficulty-N pattern can appear at is when getSpeedTier
    // first returns N. Find that boundary numerically and validate clearability.
    const boundarySpeedForTier: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: INITIAL_SPEED,
      2: INITIAL_SPEED * 1.25,
      3: INITIAL_SPEED * 1.75,
      4: INITIAL_SPEED * 2.25,
      5: INITIAL_SPEED * 2.75,
    };

    for (const p of PATTERNS) {
      if (p.obstacles.length === 0) continue;
      const minSpeed = boundarySpeedForTier[p.difficulty];
      for (const o of p.obstacles) {
        expect(
          isClearable(o, minSpeed),
          `pattern ${p.id} obstacle ${JSON.stringify(o)} not clearable at speed ${minSpeed}`,
        ).toBe(true);
      }
    }
  });
});

describe('selectNextChunk', () => {
  it('never returns the same chunk twice in a row', () => {
    const rng = mulberry32(1);
    let prev: string | null = null;
    for (let i = 0; i < 200; i++) {
      const chunk = selectNextChunk(rng, prev, INITIAL_SPEED);
      expect(chunk.id).not.toBe(prev);
      prev = chunk.id;
    }
  });

  it('only returns easy patterns or breath chunks at tier 1', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const chunk = selectNextChunk(rng, null, INITIAL_SPEED);
      // breath chunks have no obstacles; combat chunks at tier 1 must be diff ≤ 1
      if (chunk.obstacles.length > 0) {
        expect(chunk.difficulty).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never returns a chunk whose difficulty exceeds the current tier', () => {
    const rng = mulberry32(99);
    const speeds = [INITIAL_SPEED, 7, 9, 11, 13];
    for (const speed of speeds) {
      const tier = getSpeedTier(speed);
      for (let i = 0; i < 100; i++) {
        const chunk = selectNextChunk(rng, null, speed);
        if (chunk.obstacles.length > 0) {
          expect(chunk.difficulty).toBeLessThanOrEqual(tier);
        }
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const r1 = mulberry32(2024);
    const r2 = mulberry32(2024);
    let prev1: string | null = null;
    let prev2: string | null = null;
    for (let i = 0; i < 50; i++) {
      const c1 = selectNextChunk(r1, prev1, INITIAL_SPEED);
      const c2 = selectNextChunk(r2, prev2, INITIAL_SPEED);
      expect(c1.id).toBe(c2.id);
      prev1 = c1.id;
      prev2 = c2.id;
    }
  });
});
