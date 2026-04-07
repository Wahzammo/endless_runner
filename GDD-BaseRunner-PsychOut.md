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

### The Core Distinction

**Random** = `Math.random()` per obstacle. No guarantees. Can produce back-to-back impossible sequences. Feels cheap and unfair — players blame the game, not themselves.

**Procedural** = deterministic rules + curated pattern library + seeded weighted selection. Feels varied but is always solvable. Players blame themselves, which is correct, and they come back.

The rule: **you never spawn an individual obstacle. You select and place a pattern chunk from a validated library.**

---

### Architecture

```
SpeedTier (1–5)
    └─> PatternLibrary.getWeightedPool(tier)
            └─> seededRNG.pick(pool)
                    └─> PatternChunk.validate(tier)  ← gate — never skipped
                            └─> spawn chunk at world x
```

---

### Seeded RNG

Use a deterministic PRNG — [mulberry32](https://github.com/bryc/code/blob/master/jshash.md#mulberry32) is 4 lines and fast enough.

```typescript
function mulberry32(seed: number) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
```

Seed is generated fresh each run (`Date.now() ^ playerAddress`). Same seed = identical run — useful for debugging and potential future "daily challenge" mode. `Math.random()` is never used in obstacle logic.

---

### Pattern Library

Each entry is a **chunk**: a fixed-width slice of the world with one or more obstacles at defined positions. Chunks are hand-authored, not generated.

**Chunk anatomy:**
```
width: number          // world units, defines gap before next chunk
obstacles: [{
  type: 'ground' | 'aerial' | 'pit',
  x: number,           // offset within chunk
  height: number,
  requiresJump: bool,
  requiresDuck: bool,
}]
difficulty: 1–5        // max speed tier this chunk is valid at
minGapAfter: number    // enforced breathing room after this chunk
```

**Phase 1 pattern library (hand-authored, ~15 chunks):**

| ID | Description | Avoid by | Max tier |
|----|------------|----------|----------|
| P01 | Single ground crate | Jump | 5 |
| P02 | Single aerial bar | Duck | 5 |
| P03 | Two ground crates, jumpable gap | Jump twice | 5 |
| P04 | Ground crate then aerial bar | Jump then duck | 4 |
| P05 | Tall crate (forces jump, not duck) | Jump | 5 |
| P06 | Short aerial (forces duck, not jump) | Duck | 5 |
| P07 | Three-crate staircase, wide | Jump early | 3 |
| P08 | Ground + aerial same column (gap to pass through middle) | Precise jump height | 3 |
| P09 | Double aerial bars, tight spacing | Duck, stay down | 3 |
| P10 | Pit (no floor for 3 units) | Don't fall | 4 |
| P11 | Crate before pit edge | Jump clears both | 3 |
| P12 | Breathing room (empty chunk) | — | 5 |
| P13 | Aerial only, very low | Duck and hold | 2 |
| P14 | Two pits separated by one tile | Jump, land, jump | 2 |
| P15 | Crate-aerial-crate sandwich | Jump, duck, jump | 2 |

---

### Speed Tiers & Pattern Weights

Speed tiers map to difficulty. Higher tier = more weight on harder patterns. Easier patterns never fully disappear — the game stays varied, not sadistic.

| Tier | Speed multiplier | Locked patterns | Weight distribution |
|------|-----------------|----------------|-------------------|
| 1 | 1.0× | None | 80% easy (P01-P06), 20% medium (P07-P11) |
| 2 | 1.5× | None | 50% easy, 40% medium, 10% hard |
| 3 | 2.0× | P13, P14, P15 unlocked | 30% easy, 50% medium, 20% hard |
| 4 | 2.5× | All unlocked | 20% easy, 40% medium, 40% hard |
| 5 | 3.0× (cap) | All unlocked | 10% easy, 30% medium, 60% hard |

P12 (breathing room) has a fixed 15% slot across all tiers — always present, prevents relentless pressure.

---

### Placement Rules (enforced every spawn)

These fire as constraints before any chunk is placed. If a constraint fails, re-roll once, then fall back to a safe pattern:

1. **No immediate repeat** — same chunk ID cannot spawn back-to-back
2. **Minimum gap enforced** — `chunk.minGapAfter` units of clear ground after every chunk
3. **Tier gate** — chunk `difficulty` must be ≤ current speed tier
4. **Jump-height physics check** — at current speed, player CAN physically clear any `requiresJump` obstacle (recalculated when speed changes)
5. **No overlapping hitboxes** — new chunk's obstacles cannot share x-space with previous chunk's tail

Rule 4 is the critical one. When speed increases, the physics check reruns against all patterns in the active pool. Any pattern that becomes physically impossible at the new speed is removed from the pool until speed drops back (speed potion).

---

### Impossibility Contract

Every pattern in the library has a `maxTier` value. Before the game ships, run a validation pass:

```typescript
// Pseudocode — run in dev/test only
for (const pattern of patternLibrary) {
  for (let tier = 1; tier <= pattern.maxTier; tier++) {
    const speed = tierToSpeed(tier);
    assert(canPlayerClear(pattern, speed), 
      `Pattern ${pattern.id} is impossible at tier ${tier} speed ${speed}`);
  }
}
```

This is the guarantee. Every pattern that appears in the game has been proven clearable at the speed it appears at. Players cannot die to an impossible sequence — only to their own reaction time.

Chaos events (GRID SURGE, OBSTACLE BURST) are explicitly exempt from this contract. They're scripted, telegraphed, and optional to survive via invincibility. That's the deal.

---

### Anti-Patterns to Avoid

- Never call `Math.random()` directly in obstacle logic — always use the seeded RNG instance
- Never spawn based on frame count modulo alone (that's what the current placeholder does — replace it)
- Never generate obstacle height randomly at spawn time — heights are fixed per pattern, not rolled
- Never allow two "gap required" patterns in a row without a breathing room chunk between them
