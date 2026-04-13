// ============================================================
// PowerUpSystem.ts  —  /lib/PowerUpSystem.ts
// Vampire Survivors-style power-up pause + selection + action bar
// No engine required — pure canvas + game state flags
//
// Flow:
//   1. Milestone pause → player picks a card → item minted to wallet
//   2. Item appears in the action bar (keys 1-4)
//   3. Player presses key → item activated (effect applies) + burned
// ============================================================

// ─── Types ───────────────────────────────────────────────────

export type PowerUpId = "health" | "invincible" | "timeslow" | "fireball";

export interface PowerUpDef {
  id: PowerUpId;
  name: string;
  description: string;
  icon: string;       // emoji fallback until you have sprites
  color: string;      // card accent colour
  duration?: number;  // ms — undefined = permanent / instant
}

export interface ActiveEffect {
  id: PowerUpId;
  expiresAt: number;  // performance.now() timestamp
}

export interface Fireball {
  x: number;
  y: number;
  vx: number;         // pixels/ms
  radius: number;
  active: boolean;
}

// ─── Definitions ─────────────────────────────────────────────

export const POWER_UP_DEFS: Record<PowerUpId, PowerUpDef> = {
  health: {
    id: "health",
    name: "Health Potion",
    description: "Restore 1 life",
    icon: "🧪",
    color: "#e74c3c",
  },
  invincible: {
    id: "invincible",
    name: "Iron Skin",
    description: "Invincible for 5 seconds",
    icon: "🛡️",
    color: "#f39c12",
    duration: 5000,
  },
  timeslow: {
    id: "timeslow",
    name: "Time Warp",
    description: "Half speed for 4 seconds",
    icon: "⏳",
    color: "#9b59b6",
    duration: 4000,
  },
  fireball: {
    id: "fireball",
    name: "Fireball",
    description: "Launch a fireball — destroys crates",
    icon: "🔥",
    color: "#e67e22",
  },
};

// Action bar slot order — maps key 1-4 to power-up types
const ACTION_BAR_SLOTS: PowerUpId[] = ["health", "invincible", "timeslow", "fireball"];

// ─── PowerUpSystem ───────────────────────────────────────────

export class PowerUpSystem {
  // Consumable inventory — how many of each item the player has available
  private inventory: Map<PowerUpId, number> = new Map();
  // Which power-up NFTs the player holds (loaded from wallet on game start)
  private ownedIds: Set<PowerUpId> = new Set();
  // Currently active timed effects
  private activeEffects: ActiveEffect[] = [];
  // Fireballs in flight
  public fireballs: Fireball[] = [];
  // Score threshold between power-up offers
  private offerInterval = 500;
  private lastOfferScore = 0;

  // Overlay state
  public isPaused = false;
  private choices: PowerUpDef[] = [];
  private onChoiceCallback: ((id: PowerUpId) => void) | null = null;

  // Card layout (computed once per show)
  private cards: Array<{ x: number; y: number; w: number; h: number; def: PowerUpDef }> = [];

  // ── Inventory ───────────────────────────────────────────────

  /** Set inventory counts from wallet balances (called on game start). */
  setInventory(counts: Map<PowerUpId, number>) {
    this.inventory = new Map(counts);
    // Keep ownedIds in sync for card badge rendering
    this.ownedIds = new Set<PowerUpId>();
    for (const [id, count] of counts) {
      if (count > 0) this.ownedIds.add(id);
    }
  }

  /** Add one item to inventory (called after milestone claim / mint). */
  addToInventory(id: PowerUpId, count = 1) {
    this.inventory.set(id, (this.inventory.get(id) ?? 0) + count);
    this.ownedIds.add(id);
  }

  /** Get count of a specific item. */
  getCount(id: PowerUpId): number {
    return this.inventory.get(id) ?? 0;
  }

  /** Get the PowerUpId for a given action bar slot (1-indexed). */
  getSlotId(slot: number): PowerUpId | undefined {
    return ACTION_BAR_SLOTS[slot - 1];
  }

  /**
   * Use one item from inventory — decrements count + applies effect.
   * Returns true if the item was used, false if inventory was empty.
   */
  useFromInventory(
    id: PowerUpId,
    gameState: { lives: number; canvasW: number; playerY: number },
  ): boolean {
    const count = this.inventory.get(id) ?? 0;
    if (count <= 0) return false;

    this.inventory.set(id, count - 1);
    if (count - 1 <= 0) this.ownedIds.delete(id);

    this.apply(id, gameState);
    return true;
  }

  // ── Owned NFTs (legacy compat) ─────────────────────────────

  /** Call on game init — pass NFT token IDs read from wallet */
  setOwnedFromNFTs(tokenIds: PowerUpId[]) {
    this.ownedIds = new Set(tokenIds);
  }

  isOwned(id: PowerUpId): boolean {
    return this.ownedIds.has(id);
  }

  /** Add after successful mint */
  addOwned(id: PowerUpId) {
    this.ownedIds.add(id);
  }

  // ── Score-based trigger ─────────────────────────────────────

  /** Call every game tick. Returns true if an offer was triggered. */
  checkScoreTrigger(score: number): boolean {
    if (score - this.lastOfferScore >= this.offerInterval) {
      this.lastOfferScore = score;
      return true;
    }
    return false;
  }

  // ── Offer / Choice ──────────────────────────────────────────

  /**
   * Pause the game and show 3 random power-up cards.
   * @param canvasW  — canvas pixel width (for layout)
   * @param canvasH  — canvas pixel height
   * @param onChoice — called with chosen PowerUpId
   */
  showOffer(
    canvasW: number,
    canvasH: number,
    onChoice: (id: PowerUpId) => void
  ) {
    const pool = Object.values(POWER_UP_DEFS);
    this.choices = this.pickRandom(pool, 3);
    this.onChoiceCallback = onChoice;
    this.isPaused = true;
    this.buildCardLayout(canvasW, canvasH);
  }

  private pickRandom<T>(arr: T[], n: number): T[] {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, shuffled.length));
  }

  private buildCardLayout(canvasW: number, canvasH: number) {
    const cardW = Math.min(160, canvasW / 4);
    const cardH = cardW * 1.5;
    const gap = 20;
    const totalW = this.choices.length * cardW + (this.choices.length - 1) * gap;
    const startX = (canvasW - totalW) / 2;
    const startY = (canvasH - cardH) / 2;

    this.cards = this.choices.map((def, i) => ({
      x: startX + i * (cardW + gap),
      y: startY,
      w: cardW,
      h: cardH,
      def,
    }));
  }

  /** Call from your canvas click/touch handler */
  handleClick(mouseX: number, mouseY: number) {
    if (!this.isPaused) return;
    for (const card of this.cards) {
      if (
        mouseX >= card.x &&
        mouseX <= card.x + card.w &&
        mouseY >= card.y &&
        mouseY <= card.y + card.h
      ) {
        this.isPaused = false;
        this.onChoiceCallback?.(card.def.id);
        this.cards = [];
        return;
      }
    }
  }

  // ── Effect Application ──────────────────────────────────────

  /**
   * Apply a chosen power-up to game state.
   * Returns a mutation object your game loop reads.
   */
  apply(id: PowerUpId, gameState: { lives: number; canvasW: number; playerY: number }) {
    const def = POWER_UP_DEFS[id];
    const now = performance.now();

    switch (id) {
      case "health":
        gameState.lives = Math.min(gameState.lives + 1, 5);
        break;

      case "invincible":
      case "timeslow":
        // Timed effects are mutually exclusive per design — applying any
        // timed effect replaces any other timed effect. Player always gets
        // what they picked from the milestone card.
        this.activeEffects = this.activeEffects.filter(
          (e) => e.id !== "invincible" && e.id !== "timeslow",
        );
        this.activeEffects.push({ id, expiresAt: now + (def.duration ?? 0) });
        break;

      case "fireball":
        this.fireballs.push({
          x: gameState.canvasW * 0.3, // matches PLAYER_X_FRACTION
          y: gameState.playerY,
          vx: 0.6,                    // px/ms — adjust to taste
          radius: 10,
          active: true,
        });
        break;
    }
  }

  // ── Rollback (if burn-on-use fails) ─────────────────────────

  /**
   * Reverse an optimistically-applied effect when the on-chain burn
   * fails. Called by GameSession.burnPowerUp's onFail callback.
   */
  reverseEffect(id: PowerUpId, gameState: { lives: number }) {
    switch (id) {
      case 'health':
        gameState.lives = Math.max(0, gameState.lives - 1);
        break;
      case 'invincible':
      case 'timeslow':
        this.activeEffects = this.activeEffects.filter(e => e.id !== id);
        break;
      case 'fireball':
        // Remove the most recently added fireball
        if (this.fireballs.length > 0) {
          this.fireballs.pop();
        }
        break;
    }
  }

  // ── Per-tick Update ─────────────────────────────────────────

  /** Returns current speed multiplier (1 = normal, 0.5 = slowed) */
  update(deltaTime: number): number {
    const now = performance.now();
    this.activeEffects = this.activeEffects.filter((e) => e.expiresAt > now);

    // Advance fireballs
    for (const fb of this.fireballs) {
      if (fb.active) fb.x += fb.vx * deltaTime;
    }
    // Cull off-screen fireballs
    this.fireballs = this.fireballs.filter((fb) => fb.x < 2000 && fb.active);

    return this.isSlowed ? 0.5 : 1.0;
  }

  get isInvincible(): boolean {
    return this.activeEffects.some((e) => e.id === "invincible");
  }

  get isSlowed(): boolean {
    return this.activeEffects.some((e) => e.id === "timeslow");
  }

  /** Remaining ms on an effect (for HUD timer) */
  remainingMs(id: PowerUpId): number {
    const effect = this.activeEffects.find((e) => e.id === id);
    if (!effect) return 0;
    return Math.max(0, effect.expiresAt - performance.now());
  }

  // ── Crate Collision ─────────────────────────────────────────

  /**
   * Check each fireball against a crate rect.
   * Deactivates both fireball and crate on hit.
   * Call from your existing obstacle collision loop.
   */
  checkFireballCrateCollision(crate: {
    x: number;
    y: number;
    w: number;
    h: number;
    isCrate: boolean;
    destroyed: boolean;
  }) {
    if (!crate.isCrate || crate.destroyed) return;
    for (const fb of this.fireballs) {
      if (!fb.active) continue;
      const hit =
        fb.x + fb.radius > crate.x &&
        fb.x - fb.radius < crate.x + crate.w &&
        fb.y + fb.radius > crate.y &&
        fb.y - fb.radius < crate.y + crate.h;
      if (hit) {
        fb.active = false;
        crate.destroyed = true;
      }
    }
  }

  // ── Canvas Rendering ────────────────────────────────────────

  /** Draw the pause overlay + cards. Call after your game draw. */
  drawOverlay(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) {
    if (!this.isPaused || this.cards.length === 0) return;

    // Dim background
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Title
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(canvasH * 0.045)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("CHOOSE YOUR POWER", canvasW / 2, this.cards[0].y - 24);

    for (const card of this.cards) {
      this.drawCard(ctx, card);
    }
  }

  private drawCard(
    ctx: CanvasRenderingContext2D,
    card: { x: number; y: number; w: number; h: number; def: PowerUpDef }
  ) {
    const { x, y, w, h, def } = card;
    const r = 10; // corner radius

    // Card background
    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();

    // Accent border
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.stroke();

    // NFT "owned" badge
    if (this.isOwned(def.id)) {
      ctx.fillStyle = def.color;
      ctx.font = `bold 10px monospace`;
      ctx.textAlign = "center";
      ctx.fillText("OWNED", x + w / 2, y + 14);
    }

    // Icon
    ctx.font = `${Math.round(w * 0.35)}px serif`;
    ctx.textAlign = "center";
    ctx.fillText(def.icon, x + w / 2, y + h * 0.48);

    // Name
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(w * 0.12)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(def.name.toUpperCase(), x + w / 2, y + h * 0.66);

    // Description
    ctx.fillStyle = "#aaaaaa";
    ctx.font = `${Math.round(w * 0.1)}px monospace`;
    this.wrapText(ctx, def.description, x + w / 2, y + h * 0.78, w - 16, 14);
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    cx: number,
    y: number,
    maxW: number,
    lineH: number
  ) {
    const words = text.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, cx, y);
        line = word;
        y += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, cx, y);
  }

  /** Draw active fireballs. Call in your main draw loop. */
  drawFireballs(ctx: CanvasRenderingContext2D) {
    for (const fb of this.fireballs) {
      if (!fb.active) continue;
      const grad = ctx.createRadialGradient(fb.x, fb.y, 0, fb.x, fb.y, fb.radius);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.3, "#ffcc00");
      grad.addColorStop(1, "rgba(255, 80, 0, 0)");
      ctx.beginPath();
      ctx.arc(fb.x, fb.y, fb.radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  /** Draw HUD timers for active effects. Top-right corner. */
  drawHUD(ctx: CanvasRenderingContext2D, canvasW: number) {
    const timedEffects: PowerUpId[] = ["invincible", "timeslow"];
    let offsetY = 40;

    for (const id of timedEffects) {
      const ms = this.remainingMs(id);
      if (ms <= 0) continue;
      const def = POWER_UP_DEFS[id];
      const secs = (ms / 1000).toFixed(1);

      ctx.fillStyle = def.color;
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${def.icon} ${def.name} ${secs}s`, canvasW - 12, offsetY);
      offsetY += 18;
    }
  }

  /** Draw the action bar — 4 slots at bottom-center showing inventory. */
  drawActionBar(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) {
    const slotW = 56;
    const slotH = 48;
    const gap = 8;
    const totalW = ACTION_BAR_SLOTS.length * slotW + (ACTION_BAR_SLOTS.length - 1) * gap;
    const startX = (canvasW - totalW) / 2;
    const y = 52; // same padding as before, but from the top
    const r = 6;

    for (let i = 0; i < ACTION_BAR_SLOTS.length; i++) {
      const id = ACTION_BAR_SLOTS[i];
      const def = POWER_UP_DEFS[id];
      const count = this.getCount(id);
      const x = startX + i * (slotW + gap);
      const hasItem = count > 0;

      // Slot background
      ctx.fillStyle = hasItem ? 'rgba(26, 26, 46, 0.85)' : 'rgba(10, 10, 20, 0.5)';
      ctx.beginPath();
      ctx.roundRect(x, y, slotW, slotH, r);
      ctx.fill();

      // Border — accent color if available, dim if empty
      ctx.strokeStyle = hasItem ? def.color : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = hasItem ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(x, y, slotW, slotH, r);
      ctx.stroke();

      // Key number badge (top-left corner)
      ctx.fillStyle = hasItem ? '#ffffff' : 'rgba(255,255,255,0.3)';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}`, x + 5, y + 12);

      // Icon (centered)
      ctx.globalAlpha = hasItem ? 1 : 0.3;
      ctx.font = `${Math.round(slotW * 0.38)}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText(def.icon, x + slotW / 2, y + slotH * 0.65);
      ctx.globalAlpha = 1;

      // Count badge (bottom-right corner) — only if > 0
      if (count > 0) {
        ctx.fillStyle = def.color;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`×${count}`, x + slotW - 4, y + slotH - 5);
      }
    }
  }
}
