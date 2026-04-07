# Game Design Document
## Base Runner: Psych-Out Arcade
**Version:** 0.1 — Working Draft  
**Author:** Aaron Clifft / North Metro Tech  
**Date:** April 2026  
**Status:** Pre-production alignment doc

---

## 1. Concept Summary

**Elevator pitch:** A 80s cyberpunk endless runner on the Base blockchain. You run, you die, a sarcastic AI mocks you, your high score goes on-chain. Power-ups are NFTs in your wallet. The blockchain is part of the game, not bolted onto it.

**Genre:** Endless runner / Roguelite hybrid  
**Platform:** Web (browser) — mobile-friendly  
**Engine:** HTML5 Canvas via Next.js *(see Section 9 for decision)*  
**Blockchain:** Base (Coinbase L2)  
**Core loop:** Run → Die → AI commentary → Submit score onchain → Repeat

---

## 2. Player Experience Goals

1. **Instantly playable** — no install, no tutorial wall. Jump in, die in 10 seconds, laugh, try again.
2. **Web3 feels like a feature, not a toll** — no mid-run wallet popups. Session key signed once, everything else is invisible.
3. **Death is interesting** — Gemini's sarcastic commentary makes dying part of the fun, not punishment.
4. **Skill ceiling exists** — speed scaling + roguelite loadout creates room to improve.
5. **Ownership is real** — items in your wallet persist. Buy a fireball, die, it's still there next run.

---

## 3. Core Game Loop

```
MENU SCREEN
    └─> WALLET CONNECT (Coinbase Smart Wallet)
            └─> SESSION KEY GRANT (once — sets spend limit)
                    └─> LOADOUT SCREEN (pick consumables from wallet)
                            └─> GAMEPLAY
                                    ├─> SCORE MILESTONE → Roguelite pause → Pick upgrade
                                    ├─> LOOT DROP → Item minted to wallet (no interaction)
                                    └─> DEATH
                                            ├─> Gemini AI commentary fires
                                            ├─> Score submit prompt
                                            │       └─> Tx signed → OnchainArcade.sol
                                            └─> LEADERBOARD
                                                    └─> PLAY AGAIN → back to LOADOUT
```

---

## 4. Player Mechanics

### Movement
| Action | Input | Notes |
|--------|-------|-------|
| Jump | Space / Tap | Single jump |
| Double jump | Space / Tap (mid-air) | Consumes jump token if equipped |
| Duck | Down arrow / Swipe down | Slides under obstacles |
| Slide attack | Duck + item active | If fireball equipped, shoots forward |

### Physics
- Constant forward scroll (player position fixed, world moves)
- Jump arc: parabolic, no floaty hang time — punchy 80s arcade feel
- Gravity: snappy, lands hard
- Speed: starts at 1× baseline, increases 10% every 500 points up to 3× cap

### Health
- Base: 3 HP (shown as neon hearts HUD element)
- HP potions restore 1 HP (from wallet inventory)
- Invincibility powerup: 5 seconds, player flashes, obstacles pass through
- Death at 0 HP triggers game-over sequence

---

## 5. Obstacles & Hazards

### Phase 1 — Foundation obstacles
| Obstacle | Behaviour | Avoidance |
|----------|-----------|-----------|
| Ground crate | Static, low | Jump over |
| High barrier | Static, mid-height | Duck under |
| Floating platform gap | No floor for 3 tiles | Jump, don't fall |
| Speed spike | Temporary speed burst zone | Survive / power through |

### Phase 2 — Add once core is solid
| Obstacle | Behaviour | Notes |
|----------|-----------|-------|
| Drone enemy | Flies left at player height | Duck or shoot |
| Laser grid | Alternating on/off | Time the gap |
| Pit trap | Disguised as floor | Jump on reveal |

### Spawn Rules
- Obstacles generated procedurally via seeded pattern library
- Pattern difficulty weight increases with speed multiplier
- No impossible combinations at any speed tier (validated at design time)

---

## 6. Progression Systems

### Within-run progression (Roguelite layer)
At score milestones (500 / 1000 / 2000 / 3500 / 5000+), game **pauses** and presents 3 upgrade cards drawn from the player's wallet inventory.

**Power-up taxonomy — designed by intent, not complexity:**

| Item | When to use | What it does | Design role |
|------|------------|--------------|-------------|
| 🧪 Speed Potion | Game is too fast | Reduces speed multiplier by one notch | Reactive skill aid — "I'm drowning, let me breathe" |
| ❤️ Health Potion | 1 HP remaining | Restores 1 HP | Survival insurance — "not dead yet" |
| ⚡ Invincibility | Everything is hairy | 5 seconds of obstacle pass-through | Nuclear option — "buy time to recover composure" |
| 🔥 Fireball | Whenever, for fun | Destroys next obstacle, satisfying explosion | Chaos item — no survival value, pure enjoyment |

**Card offering is context-aware:**
The 3 cards shown are weighted by current game state — not random from inventory:
- Speed ≥ 2× baseline → Speed Potion weighted high
- HP = 1 → Health Potion weighted high
- HP = 1 AND speed ≥ 2.5× → Invincibility weighted high ("game is truly hairy")
- Fireball always available as a wildcard slot
- Cards for items not in wallet simply don't appear

**Card UI must be self-explanatory at a glance:**
No jargon, no stat numbers. Big icon + one-word name + one-line plain English:
- "SPEED POTION — Slow it down a notch"
- "HEALTH POTION — Get a heart back"
- "INVINCIBILITY — Nothing can touch you for 5 seconds"
- "FIREBALL — Blow something up"

Player chooses one. Game resumes. This is the **only** moment where wallet interactions fire mid-run.

### Cross-run progression (Metagame layer)
- Items purchased persist in wallet between runs
- Wallet = character sheet
- No XP grind — you get better at the game or you buy consumables

### Leaderboard
- Top 50 scores stored on-chain in `OnchainArcade.sol`
- Immutable, pseudonymous (wallet address)
- Ranked by score, shows timestamp
- Refreshes after each score submission

---

## 7. Web3 Integration Architecture

### Wallet & Session
| Moment | What happens | UX |
|--------|-------------|-----|
| First visit | Wallet connect prompt | Standard modal |
| Post-connect | Session key grant (ERC-7715) | One popup, sets spend limit |
| Mid-run | Nothing | Silent |
| Milestone upgrade | Item mint/burn via session key | Silent (within limit) |
| Loot drop | Server-side mint via `claimPowerUp()` | Silent, Gemini announces |
| Death | Score submission | One popup if over limit |

### Smart Contracts
| Contract | Standard | Purpose |
|----------|----------|---------|
| `OnchainArcade.sol` | Custom | Top-50 leaderboard, `submitScore()` |
| `PowerUpNFT.sol` / `ConsumableItems.sol` | ERC-1155 | Inventory items, `claimPowerUp()`, `useAndBurn()` |

### Transaction UX — Colour System
- 🟢 Green: Routine, within session limit — executes silently
- 🟡 Amber: Approaching session limit — small HUD nudge
- 🔴 Red: Exceeds limit — requires explicit sign

---

## 8. AI Commentary (Gemini)

**Tone:** Sarcastic sports commentator meets 80s arcade machine. Punches down on bad runs, dramatically oversells good ones.

### Trigger points
| Event | Example line style |
|-------|-------------------|
| Death < 100 pts | "Truly historic. A masterclass in failure." |
| Death 100–500 pts | "Not terrible. Still kind of terrible." |
| Death 500–1000 pts | "Respectable. I've seen worse. Not many, but some." |
| Death > 1000 pts | "Okay fine, that was actually good. Don't let it go to your head." |
| New high score | "Record broken. The crowd goes mild." |
| Loot drop | "The blockchain bestows unto you... something." |
| Roguelite choice | "Choose wisely. Or don't. I'll mock you either way." |

### Implementation
- `POST /api/commentary` — server route, passes score + event type to Gemini API
- Response streams to UI, overlaid on game over screen
- Non-blocking: game-over screen shows immediately, commentary populates as it arrives
- Fallback: hardcoded snarky lines if API fails

---

## 9. Platform & Engine Decision — HTML5 vs Unity WebGL

### Recommendation: **Stay with HTML5 Canvas**

This is a deliberate decision, not a default. Here's the reasoning:

#### Why HTML5 wins for this specific project

**Web3 integration is the product.** Coinbase Smart Wallet, OnchainKit, wagmi, and ERC-7715 session keys all live natively in the browser JavaScript context. In Unity WebGL, every wallet call requires `jslib` bridge files that call back into the DOM — you'd be fighting the engine to do the thing that makes this game special. The session key pattern in `GameSession.ts` works exactly as written in Next.js. In Unity, it would require reimplementing it in C# with JSLib callbacks.

**You're already most of the way there.** OnchainArcade.sol is deployed. E2E test is passing. The four library files are written and working. Switching to Unity now throws away all of that and restarts at zero in a new language and build system.

**Endless runner physics are simple.** You don't need PhysX or a full 3D engine. The collision model is: rectangle hits rectangle, player dies. HTML5 canvas handles this trivially.

**Deployment is a Vercel push.** Unity WebGL builds are 10–50MB, require a loading screen, and have CORS complications with external APIs. The HTML5 version is just JavaScript served from a CDN.

**Claude Code can own the whole stack.** TypeScript/Next.js is fully in scope. Unity C# is not. This matters for your workflow.

#### When you'd reconsider Unity
- You wanted 3D, complex physics, or a significantly larger game scope
- Web3 integration wasn't a core feature
- You had a dedicated game dev on the team

#### Verdict
HTML5 canvas is the right call. The limitation isn't the engine — it's the art pipeline. Sprite work in Aseprite → JSON export → `SpriteAnimator.ts` is the path. Getting the art right matters more than switching engines.

---

## 10. Art Direction

**Visual style:** 80s cyberpunk pixel art. Dark backgrounds, neon accents (cyan, magenta, acid green). CRT scanline overlay optional.

**Palette (approx):**
- Background: near-black `#0a0a0f`
- Neon primary: cyan `#00ffff`
- Neon secondary: hot pink `#ff00aa`
- Neon tertiary: acid green `#39ff14`
- UI chrome: dark grey `#1a1a2e`

**Character sprites (from itch.io pack):**
- `free-game-assets.itch.io/free-3-cyberpunk-sprites-pixel-art`
- **Protagonist: Cyborg** — 12 animations, 48px frame height
- Tags needed in Aseprite: `idle`, `run`, `jump`, `die`, `attack`
- The `attack` animation (arm extension) doubles as the fireball throw — no weapon sprite needed
- Export: combined sheet with JSON tags for `SpriteAnimator.ts`

**Fireball attack visual:**
- On activation, cyborg plays `attack` frame sequence
- Projectile spawned at arm-tip position, travels right across screen
- Destroys first obstacle it contacts, then vanishes
- Particle burst on impact (simple radial spray in orange/yellow)

**Backgrounds (parallax layers, from `/public/bg/`):**
- Layer 1 (slowest): distant city skyline
- Layer 2: mid-distance neon signage / architecture
- Layer 3: near-ground detail / floor
- Speed ratios: 0.2× / 0.5× / 1.0×

**UI:**
- Monospace / terminal font for score HUD
- Pixel-art borders on cards and overlays
- Power-up cards: Vampire Survivors-style pause overlay, dark vignette

---

## 11. Audio

**Approach:** Lightweight. Web Audio API or Howler.js. Mute toggle in HUD.

| Event | Sound |
|-------|-------|
| Jump | Short 8-bit blip |
| Death | Classic arcade descending tone |
| Score milestone | Ascending chime |
| Score submitted | Blockchain "confirmed" ding |
| Loot drop | Rare item fanfare (short) |
| Background | Looping synthwave track, 80s feel |

Source: Free 8-bit SFX packs (itch.io). Music: royalty-free synthwave.

---

## 12. Screen Flow

```
TITLE SCREEN
    ├─ "INSERT COIN" prompt (connect wallet)
    └─ LEADERBOARD (read-only, no wallet needed)

WALLET CONNECTED
    └─ SESSION SETUP (spend limit modal — once per session)
            └─ LOADOUT SCREEN
                    └─ GAMEPLAY
                            └─ GAME OVER
                                    ├─ Gemini commentary
                                    ├─ Score display
                                    ├─ Submit to chain (optional)
                                    ├─ Leaderboard
                                    └─ PLAY AGAIN → LOADOUT
```

---

## 13. Phased Development Plan

Mirrors Linear project milestones:

### Phase 1 — Foundation *(in progress)*
- [x] `OnchainArcade.sol` deployed to Base Sepolia
- [x] Leaderboard wired
- [x] E2E test passing (wallet → play → score → leaderboard)
- [ ] Gemini commentary tuned
- [ ] ESLint / audit issues resolved
- [ ] Pixel art sprites integrated via `SpriteAnimator.ts`
- [ ] Parallax background wired via `ParallaxBackground.ts`
- [ ] Production deploy to Vercel

### Phase 2 — Web3 UX Lab
- [ ] Session key / spend limit (`GameSession.ts`)
- [ ] Color-coded transaction UX
- [ ] `ConsumableItems.sol` (ERC-1155)
- [ ] Wildcard loot drops
- [ ] Roguelite upgrade pause screen
- [ ] Pre-run loadout screen
- [ ] Mobile touch controls

### Phase 3 — Polish
- [ ] Sound effects & music
- [ ] Visual effects (particles, screen shake, CRT overlay)
- [ ] Speed scaling tuning
- [ ] More obstacle variety
- [ ] Mainnet deployment

---

## 14. Out of Scope (v1)

- PvP or multiplayer
- User-generated levels
- NFT marketplace / trading
- Token rewards / play-to-earn
- Mobile native app

These are not "never" — they're "not until the core loop is fun and working."

---

## 15. Open Questions

| Question | Decision needed by | Notes |
|----------|-------------------|-------|
| ~~Which cyberpunk character is the protagonist?~~ | ✅ **DECIDED: Cyborg** | Arm-throw animation = fireball. No weapon sprites needed. |
| Obstacle art — reuse sprite pack or custom? | Phase 1 completion | Sprite pack may have environment tiles |
| Gemini model version? | Commentary integration | `gemini-1.5-flash` is fast and cheap |
| Score submission: mandatory or optional at game over? | Phase 1 completion | Optional reduces friction, mandatory is more onchain-native |
| Session key spend limit — what default? | Phase 2 start | Suggest 0.01 ETH default with user-adjustable |

---

*This document should be treated as a living reference. Update it when decisions are made, not after the fact.*

---

## 16. Invincibility — Visual Design & Chaos Events

### Shield Visual
No additional sprite art required. Implemented entirely in canvas:

**Active invincibility effect (layered):**
1. **Aura/field** — glowing cyan ellipse drawn slightly larger than the player hitbox each frame. `shadowBlur: 30`, `shadowColor: #00ffff`, fill `rgba(0,255,255,0.15)`. Gives clear "untouchable" read at a glance.
2. **Sprite pulse** — player sprite oscillates between 100% and 80% opacity at ~8Hz. Classic invincibility flicker, reinforces the aura.
3. **Colour shift** — cyborg sprite tinted cyan during active period (canvas `globalCompositeOperation` overlay). Player visually "becomes electric."
4. **Expiry warning** — at 1.5 seconds remaining, aura starts flickering erratically (randomised opacity per frame). Player knows it's about to end without a HUD timer.

The aura is readable from peripheral vision. A player watching obstacles should still catch "I'm invincible" without looking at the HUD.

---

### Chaos Events
Periodic scripted hazards that telegraph before firing. These give invincibility a **proactive** use case — not just a last-resort panic button.

**Design intent:** Player sees warning → has 2–3 seconds to decide → burn invincibility now for the guaranteed threat, or gamble and save it. That's a real decision with stakes.

**Frequency:** One chaos event every 750–900 points between milestones. Rare enough to feel significant, common enough to matter in a long run.

#### Warning Sequence
```
[T-3s]  "⚠ GRID SURGE INCOMING" warning banner slides in from top
[T-3s]  Gemini fires commentary ("Oh good. This should finish you off.")
[T-1s]  Screen edge pulses red
[T-0s]  Chaos event fires
```
The 3-second window is the decision point. Enough time to react, not enough to relax.

#### Chaos Event Types (Phase 1)

| Event | What happens | Why it's dangerous |
|-------|-------------|-------------------|
| **GRID SURGE** | Speed spikes to max (3×) for 4 seconds, then snaps back | Player suddenly can't react to obstacle spacing they'd memorised |
| **OBSTACLE BURST** | 4 obstacles spawn in rapid succession, tighter spacing than normal generation ever allows | Pattern is literally impossible at normal reaction speed above 2× |

#### Chaos Event Types (Phase 2, stretch)
| Event | What happens |
|-------|-------------|
| **EMP PULSE** | HUD blacks out for 3 seconds — score counter, HP hearts gone. Obstacles still there, just flying blind. |
| **DECOY LANE** | Ground texture briefly shows false safe path before revealing a pit |

#### Gemini commentary hooks
Chaos events are a prime Gemini trigger — always fire commentary on warning:
- GRID SURGE: *"Speed is a privilege, not a right. You've lost it."*
- OBSTACLE BURST: *"Mathematically, some of these are unavoidable. Poetic really."*
- If player survives without popping invincibility: *"...Huh. I'm almost impressed. Almost."*
- If player pops invincibility on warning: *"Smart. Boring, but smart."*

#### HUD element
Small "CHAOS" indicator in corner — shows current chaos event cooldown as a thin bar depleting. Gives experienced players a sense of when the next event window opens. Colour: deep red `#8b0000`, turns amber as it refills, no text label — just the bar.

---

## 17. Procedural Generation System

> **Implementation reference:** `lib/procgen.ts` and `lib/procgen.test.ts`. This section reflects what actually ships, not just intent. Update both this section and the code in lockstep — the impossibility contract test is the safety net that keeps them honest.

### The Core Distinction

**Random** = `Math.random()` per obstacle. No guarantees. Can produce back-to-back impossible sequences. Feels cheap and unfair — players blame the game, not themselves.

**Procedural** = deterministic rules + curated pattern library + seeded weighted selection. Feels varied but is always solvable. Players blame themselves, which is correct, and they come back.

The rule: **you never spawn an individual obstacle. You select and place a pattern chunk from a validated library.**

---

### Architecture

```
gameLoop (60Hz)
    │
    ├─> nextChunkX -= currentSpeed     ← spawn cursor slides with the world
    │
    └─> if nextChunkX <= canvas.width
            └─> selectNextChunk(rng, prevChunkId, currentSpeed)
                    │
                    ├─ 1. selectBucket()     ← 15% breath, else tier-weighted easy/medium/hard
                    ├─ 2. filter pool        ← not prev, in bucket, difficulty ≤ tier,
                    │                          every obstacle isClearable() at currentSpeed
                    ├─ 3. equal-weight pick  ← random candidate from filtered pool
                    └─ 4. spawnChunk()       ← drops obstacles into game state,
                                               advances nextChunkX by chunk.width + minGapAfter
```

There is no separate "validate" gate after selection. Validation happens **during** filtering — `isClearable()` is part of the candidate filter, so an unclearable chunk literally can't be picked. If the filter ever empties the pool the selector falls back to easy + breath chunks so the run never deadlocks.

---

### Seeded RNG

Deterministic [mulberry32](https://github.com/bryc/code/blob/master/jshash.md#mulberry32) PRNG, lives in `lib/procgen.ts`:

```typescript
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

**Current seeding:** `mulberry32(Date.now() & 0xffffffff)` per run mount in `Game.tsx`. Same seed = identical run, but the seed isn't surfaced anywhere yet — it's deterministic per session, useful for bug repros if we add a "show seed" debug overlay.

**Future hook:** wallet-derived seeds (`Date.now() ^ playerAddressHash`) for daily challenges and shareable runs. The RNG layer doesn't need to change — just where the seed comes from.

`Math.random()` is forbidden inside `lib/procgen.ts` and inside the obstacle-spawning path of `Game.tsx`. The RNG instance is the only source of randomness for chunk selection.

---

### Spawn Cursor (`nextChunkX`)

Implementation detail worth documenting because it explains how chunks land in the right place at any speed:

- `nextChunkX` is a screen-coordinate marker representing "where the next chunk's leading edge will appear."
- Initialised at `canvas.width + 200` so the first chunk spawns just off the right edge with a 200px head start.
- Decremented by `currentSpeed` every frame, so it slides left at exactly the same rate as the rest of the world.
- When `nextChunkX <= canvas.width`, the cursor is now visible — `selectNextChunk()` runs and `spawnChunk()` drops every obstacle in the chosen pattern at `nextChunkX + obstacle.xOffset`.
- After spawning, `nextChunkX += chunk.width + chunk.minGapAfter` — the cursor jumps to where the next chunk should anchor, guaranteeing the breathing room.

The cursor approach means spawn timing is decoupled from frame count entirely. No `frameCount % n` checks, no speed-dependent intervals — chunks land where they should regardless of how fast the world is moving.

---

### Pattern Library

Each entry is a **chunk**: a fixed-width slice of the world with zero or more obstacles at fixed positions. All obstacles are ground-aligned in Phase 1 — aerial bars, pits, and the duck mechanic come later.

**Chunk anatomy (TypeScript types from `lib/procgen.ts`):**

```typescript
type Obstacle = {
  xOffset: number;   // local x within the chunk, ground-aligned
  width: number;
  height: number;
};

type Pattern = {
  id: string;
  width: number;          // total slice width in px
  obstacles: Obstacle[];  // empty for breath chunks
  difficulty: 1 | 2 | 3 | 4 | 5;
  minGapAfter: number;    // px of empty corridor before the next chunk
};
```

**Phase 1 pattern library — 15 chunks (2 breath, 13 combat):**

| ID | Difficulty | Description | Avoid by |
|----|-----------|-------------|----------|
| `breath_short` | breath | 200px empty corridor | — |
| `breath_long` | breath | 350px empty corridor | — |
| `single_low` | 1 | One short bump (h=35, w=30) | Jump |
| `single_med` | 2 | One medium block (h=55, w=35) | Jump |
| `wide_short` | 2 | One wide low block (h=30, w=70) | Jump |
| `pair_far` | 2 | Two short bumps spaced 200px apart | Jump twice |
| `tall_thin` | 3 | One tall thin spike (h=80, w=25) | Jump |
| `staircase_up` | 3 | Short bump then taller bump | Jump twice |
| `pair_near` | 3 | Two medium bumps ~150px apart | Jump twice |
| `triple` | 4 | Three obstacles spaced ~140px | Jump three times |
| `tall_double` | 4 | Two tall thin spikes 150px apart | Jump twice |
| `wall` | 4 | One tall wide block (h=95, w=50) | Jump |
| `gauntlet` | 5 | Four alternating low/tall obstacles | Jump four times |
| `split_jump` | 5 | Two near-apex spikes 120px apart | Precise rhythm |
| `fortress` | 5 | One huge wall (h=100, w=80) | Jump |

All combat obstacle heights stay below the jump apex (~140px). Chunk authors space multi-obstacle chunks generously — see the "Known gap" note under Impossibility Contract.

---

### Speed Tiers & Bucket Weights

The player starts at `INITIAL_SPEED = 5` and accelerates by +0.5 every 500 frames, **capped at `MAX_SPEED = 15`** (3.0× base). The speed range is divided into 5 tiers via `getSpeedTier(speed)`:

| Tier | Speed range | Ratio |
|------|------------|-------|
| 1 | 5.00 – 6.24 | 1.0× – 1.25× |
| 2 | 6.25 – 8.74 | 1.25× – 1.75× |
| 3 | 8.75 – 11.24 | 1.75× – 2.25× |
| 4 | 11.25 – 13.74 | 2.25× – 2.75× |
| 5 | 13.75 – 15.00 | 2.75× – 3.0× (cap) |

**Bucket selection (`selectBucket()`):** breath is a flat 15% pre-roll at every tier. The remaining 85% rolls against tier-weighted easy / medium / hard distributions:

| Tier | Easy | Medium | Hard |
|------|------|--------|------|
| 1 | 80% | 20% | 0% |
| 2 | 50% | 40% | 10% |
| 3 | 30% | 50% | 20% |
| 4 | 20% | 40% | 40% |
| 5 | 10% | 30% | 60% |

Buckets map to difficulty ranges: **easy = difficulty 1–2**, **medium = difficulty 3**, **hard = difficulty 4–5**. Easier patterns never disappear — even at tier 5, easy chunks still appear 10% of the time. There are no "locked" patterns; difficulty is gated by the `difficulty <= tier` filter, not by unlock progression.

---

### isClearable — The Physics Filter

Per-obstacle clearability check, lives in `lib/procgen.ts`. This is the safety net that makes the impossibility contract enforceable at selection time.

**Inputs:** an obstacle (`{ width, height }`) and the current speed.

**Step 1 — apex check.** The maximum height the player's bottom edge can reach is:

```
JUMP_APEX = JUMP_VELOCITY² / (2 · GRAVITY) = 15² / 1.6 ≈ 140 px
```

Any obstacle with `height >= JUMP_APEX` is rejected outright.

**Step 2 — horizontal clearance.** Time spent above the obstacle's height (in frames):

```
dt = √(JUMP_VELOCITY² − 2 · GRAVITY · h) / (0.5 · GRAVITY)
```

Horizontal distance covered while airborne above height h:

```
clearance = dt · speed
```

**Step 3 — required clearance.** The player has to be entirely past the obstacle, so leading edge of player must clear trailing edge of obstacle:

```
required = obstacle.width + PLAYER_WIDTH
```

Clearable iff `clearance >= required`.

**The interesting consequence:** wide obstacles get *harder* to clear at low speed, not high. A wide block at tier 1 may be impossible because the player isn't moving fast enough to fly over it before gravity drags them back down. The same block at tier 5 is trivial. This is why `selectNextChunk()` re-runs `isClearable()` on every spawn instead of caching a per-tier pool.

---

### Selection Pipeline (4 steps, in order)

1. **Bucket roll.** `selectBucket(rng, tier)` — 15% breath, else weighted easy/medium/hard from the table above.
2. **Filter pool.** Build the candidate list:
    - `id !== prevChunkId` (no immediate repeats)
    - difficulty in the chosen bucket's range
    - `difficulty <= currentTier` (tier ceiling)
    - every obstacle in the chunk passes `isClearable()` at `currentSpeed`
3. **Pick.** Equal-weight random selection from the filtered candidates (could be tuned per-pattern later if some chunks deserve more screen time).
4. **Spawn.** `spawnChunk()` pushes every obstacle in the chosen pattern into `gameState.obstacles` at `nextChunkX + obstacle.xOffset`, then advances `nextChunkX` by `chunk.width + chunk.minGapAfter` and updates `prevChunkId`.

**Fallback chain.** If step 2 produces an empty pool (e.g. nothing in the "hard" bucket is clearable at current speed because everything's too wide), `selectNextChunk()` falls back to:
1. Any difficulty-1 combat chunk that isn't a repeat and is clearable.
2. The first breath chunk in the library.

The selector never returns null and never deadlocks the run.

---

### Impossibility Contract

Every pattern in the library is provably clearable at every speed tier where it can appear. The contract is enforced at CI time by Vitest:

```typescript
// lib/procgen.test.ts
describe('PATTERNS — impossibility contract', () => {
  it('every combat pattern is clearable at the base speed of its difficulty tier', () => {
    const boundarySpeedForTier = {
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
        expect(isClearable(o, minSpeed)).toBe(true);
      }
    }
  });
});
```

Validation happens at the **slowest** speed each pattern can appear at — that's the worst case, because higher speed always increases horizontal clearance for a given obstacle height. If anyone adds a pattern that's mathematically impossible to clear, CI fails and the PR cannot merge.

**Known gap.** The current contract validates **per-obstacle** clearability only. It does **not** validate that the player has enough physical distance between two obstacles in the same chunk to land and re-jump. Right now this is mitigated by hand — multi-obstacle chunks (`pair_far`, `pair_near`, `triple`, `gauntlet`, `staircase_up`, `tall_double`, `split_jump`) space their obstacles generously enough to be clearable in playtest, but the math isn't checked. A future pass should add a multi-obstacle physics walker that simulates a jump-land-jump sequence at each speed tier. Until then, **adding new multi-obstacle chunks requires manual physics review**.

Chaos events (GRID SURGE, OBSTACLE BURST — see Section 16) are explicitly exempt from this contract. They're scripted, telegraphed, and intentionally survivable only via invincibility or skill. That's the deal.

---

### Anti-Patterns to Avoid

- Never call `Math.random()` inside `lib/procgen.ts` or the obstacle-spawning path of `Game.tsx` — always use the seeded RNG instance
- Never spawn based on frame count modulo alone — the spawn cursor (`nextChunkX`) is the only timing primitive
- Never generate obstacle height or width randomly at spawn time — every value lives in the pattern library, fixed
- Never allow two combat chunks to spawn back-to-back without their `minGapAfter` enforced — that's what breath chunks and the spawn cursor are for
- Never bypass `isClearable()` — if a pattern needs a special-case rule, that rule belongs in the contract, not as an exception

