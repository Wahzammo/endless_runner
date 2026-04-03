// ============================================================
// ParallaxBackground.ts  —  /lib/ParallaxBackground.ts
// Infinite scrolling layered background for endless runner
// Each layer is one seamlessly tileable PNG
// ============================================================

// ─── Types ───────────────────────────────────────────────────

export interface LayerConfig {
  src: string;          // path to PNG in /public/
  speedFactor: number;  // 0.0 = static, 1.0 = full game speed
  y?: number;           // top offset in px (default 0)
  height?: number;      // override draw height (default: canvas height)
}

// ─── ParallaxLayer ────────────────────────────────────────────

class ParallaxLayer {
  private img: HTMLImageElement;
  private x = 0;          // current scroll position of copy A
  public loaded = false;

  constructor(
    private config: LayerConfig,
    private canvasW: number,
    private canvasH: number
  ) {
    this.img = new Image();
    this.img.onload = () => (this.loaded = true);
    this.img.src = config.src;
  }

  /** deltaTime in ms, gameSpeed in px/ms */
  update(deltaTime: number, gameSpeed: number) {
    if (!this.loaded) return;

    const scrollAmount = gameSpeed * this.config.speedFactor * deltaTime;
    this.x -= scrollAmount;

    // When copy A has fully exited left, reset — copy B snaps into A's old slot
    if (this.x <= -this.canvasW) {
      this.x += this.canvasW;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.loaded) return;

    const y = this.config.y ?? 0;
    const h = this.config.height ?? this.canvasH;
    const w = this.canvasW;

    // Draw copy A
    ctx.drawImage(this.img, this.x, y, w, h);
    // Draw copy B immediately to the right — fills the gap as A scrolls off
    ctx.drawImage(this.img, this.x + w, y, w, h);
  }

  /** Call if canvas is resized */
  resize(canvasW: number, canvasH: number) {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
  }
}

// ─── ParallaxBackground ───────────────────────────────────────

export class ParallaxBackground {
  private layers: ParallaxLayer[] = [];
  private canvasW: number;
  private canvasH: number;

  constructor(canvasW: number, canvasH: number) {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
  }

  /**
   * Add layers back-to-front (first added = furthest back)
   * speedFactor: 0.1 = slow/distant, 0.8 = fast/near
   */
  addLayer(config: LayerConfig): this {
    this.layers.push(new ParallaxLayer(config, this.canvasW, this.canvasH));
    return this;
  }

  get allLoaded(): boolean {
    return this.layers.every((l) => l.loaded);
  }

  /** Call every game tick BEFORE drawing game objects */
  update(deltaTime: number, gameSpeed: number) {
    for (const layer of this.layers) {
      layer.update(deltaTime, gameSpeed);
    }
  }

  /** Draws all layers in order — furthest back first */
  draw(ctx: CanvasRenderingContext2D) {
    for (const layer of this.layers) {
      layer.draw(ctx);
    }
  }

  resize(canvasW: number, canvasH: number) {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    for (const layer of this.layers) layer.resize(canvasW, canvasH);
  }
}


// ============================================================
// USAGE — wire into Game.tsx
// ============================================================

/*

import { ParallaxBackground } from "@/lib/ParallaxBackground";

// ── Init (once) ──────────────────────────────────────────────
const bg = new ParallaxBackground(canvas.width, canvas.height)
  .addLayer({ src: "/bg/sky.png",        speedFactor: 0.05 }) // barely moves
  .addLayer({ src: "/bg/city_far.png",   speedFactor: 0.15 }) // distant buildings
  .addLayer({ src: "/bg/city_near.png",  speedFactor: 0.35 }) // mid buildings
  .addLayer({ src: "/bg/street.png",     speedFactor: 0.6  }) // near detail
  .addLayer({ src: "/bg/ground.png",     speedFactor: 1.0,    // matches game speed
               y: canvas.height - 40, height: 40 });          // ground strip only

// ── Game loop ────────────────────────────────────────────────
function gameLoop(timestamp: number) {
  const deltaTime = timestamp - lastTime;
  lastTime = timestamp;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // gameSpeed is your existing speed variable (px/ms)
  // When timeslow is active, pass gameSpeed * 0.5
  const speed = gameSpeed * powerUps.update(deltaTime);

  bg.update(deltaTime, speed);   // ← advance scroll positions
  bg.draw(ctx);                  // ← draw all layers FIRST

  // Then draw game objects on top as normal
  playerAnim.draw(ctx, player.x, player.y);
  // ... obstacles, fireballs, HUD etc.

  requestAnimationFrame(gameLoop);
}

// ── Canvas resize ────────────────────────────────────────────
window.addEventListener("resize", () => {
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  bg.resize(canvas.width, canvas.height);
});

*/


// ============================================================
// ASEPRITE — making tileable background layers
// ============================================================

/*

Canvas size: 320 × 180px (or match your game canvas ratio)

The left and right edges of the PNG MUST match — when two
copies are placed side by side, the seam must be invisible.

How to check the seam in Aseprite:
  View menu → Wrap around (toggle on)
  This shows you how the tile looks when tiled — the seam is live.

Layer suggestions for an 80s arcade runner:
  sky.png        — solid gradient or star field, no features near edges
  city_far.png   — distant silhouettes, low detail, muted colours
  city_near.png  — closer buildings, more contrast, maybe neon signs
  street.png     — pavement cracks, graffiti, rubbish — fast layer
  ground.png     — the actual floor strip (can be a thin tile)

Colour palette tip:
  Far layers: desaturated, dark (atmospheric haze)
  Near layers: more saturated, higher contrast
  This sells the depth without any actual 3D

*/
