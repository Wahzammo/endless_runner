// TODO: Not yet wired into Game.tsx. Needs Aseprite sprite assets
// (PNG spritesheet + JSON metadata) before it can replace the placeholder
// rectangles in the game loop. See export instructions below.
//
// ============================================================
// SpriteAnimator.ts
// Drop into /lib or /components — works with Aseprite JSON export
// Export from Aseprite: File > Export Sprite Sheet
//   Format: JSON (Array), Sheet type: Horizontal strip
// ============================================================

// ─── Types ───────────────────────────────────────────────────

export interface AsepriteFrame {
  frame: { x: number; y: number; w: number; h: number };
  duration: number; // ms per frame
}

export interface AsepriteFrameTag {
  name: string;
  from: number;
  to: number;
  direction: "forward" | "reverse" | "pingpong";
}

export interface AsepriteJSON {
  frames: AsepriteFrame[];
  meta: {
    frameTags: AsepriteFrameTag[];
    size: { w: number; h: number };
  };
}

export type AnimationState = string; // "run" | "jump" | "idle" | "die" etc.

// ─── SpriteSheet ─────────────────────────────────────────────
// Loads one PNG + one Aseprite JSON. Call await sheet.load() before use.

export class SpriteSheet {
  private image: HTMLImageElement;
  private data: AsepriteJSON | null = null;
  private loaded = false;

  constructor(
    private pngPath: string,
    private jsonPath: string
  ) {
    this.image = new Image();
  }

  async load(): Promise<void> {
    const [, json] = await Promise.all([
      new Promise<void>((res, rej) => {
        this.image.onload = () => res();
        this.image.onerror = () => rej(new Error(`Failed to load sprite: ${this.pngPath}`));
        this.image.src = this.pngPath;
      }),
      fetch(this.jsonPath).then((r) => r.json() as Promise<AsepriteJSON>),
    ]);
    this.data = json;
    this.loaded = true;
  }

  getFrame(index: number): AsepriteFrame {
    if (!this.data) throw new Error("SpriteSheet not loaded");
    return this.data.frames[index];
  }

  getTag(name: string): AsepriteFrameTag | undefined {
    return this.data?.meta.frameTags.find((t) => t.name === name);
  }

  get img(): HTMLImageElement {
    return this.image;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  get frameCount(): number {
    return this.data?.frames.length ?? 0;
  }
}

// ─── SpriteAnimator ──────────────────────────────────────────
// Tracks current animation state, advances frames, and draws to canvas.

export class SpriteAnimator {
  private sheet: SpriteSheet;
  private currentTag: AsepriteFrameTag | null = null;
  private currentFrameIndex = 0; // index within the tag range
  private elapsed = 0;           // ms accumulated this frame
  private currentState: AnimationState = "";

  // Scale factor — keeps pixel art crisp at any canvas size
  public scaleX = 1;
  public scaleY = 1;
  // Flip horizontally for left-facing sprites
  public flipX = false;

  constructor(sheet: SpriteSheet, initialState: AnimationState = "idle") {
    this.sheet = sheet;
    this.play(initialState);
  }

  // Switch animation. Restarts from frame 0 only if state actually changes.
  play(state: AnimationState): void {
    if (state === this.currentState) return;
    const tag = this.sheet.getTag(state);
    if (!tag) {
      console.warn(`SpriteAnimator: no tag named "${state}"`);
      return;
    }
    this.currentState = state;
    this.currentTag = tag;
    this.currentFrameIndex = 0;
    this.elapsed = 0;
  }

  // Call once per game loop tick. deltaTime is ms since last frame.
  update(deltaTime: number): void {
    if (!this.currentTag) return;

    const tag = this.currentTag;
    const absoluteIndex = tag.from + this.currentFrameIndex;
    const frame = this.sheet.getFrame(absoluteIndex);
    const duration = frame.duration || 100;

    this.elapsed += deltaTime;

    if (this.elapsed >= duration) {
      this.elapsed -= duration;
      const tagLength = tag.to - tag.from + 1;
      this.currentFrameIndex = (this.currentFrameIndex + 1) % tagLength;
    }
  }

  // Draw sprite at canvas position (x, y) — top-left corner.
  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.currentTag || !this.sheet.isLoaded) return;

    const absoluteIndex = this.currentTag.from + this.currentFrameIndex;
    const { frame } = this.sheet.getFrame(absoluteIndex);
    const dw = frame.w * this.scaleX;
    const dh = frame.h * this.scaleY;

    ctx.save();

    if (this.flipX) {
      // Mirror around the sprite's centre
      ctx.translate(x + dw / 2, y);
      ctx.scale(-1, 1);
      ctx.drawImage(this.sheet.img, frame.x, frame.y, frame.w, frame.h, -dw / 2, 0, dw, dh);
    } else {
      ctx.drawImage(this.sheet.img, frame.x, frame.y, frame.w, frame.h, x, y, dw, dh);
    }

    ctx.restore();
  }

  get state(): AnimationState {
    return this.currentState;
  }

  // Pixel width/height of one frame at current scale
  get width(): number {
    if (!this.currentTag) return 0;
    return this.sheet.getFrame(this.currentTag.from).frame.w * this.scaleX;
  }

  get height(): number {
    if (!this.currentTag) return 0;
    return this.sheet.getFrame(this.currentTag.from).frame.h * this.scaleY;
  }
}

// ─── SpriteLoader ─────────────────────────────────────────────
// Convenience: load multiple sprite sheets in one await.

export class SpriteLoader {
  private sheets: Map<string, SpriteSheet> = new Map();

  register(name: string, pngPath: string, jsonPath: string): this {
    this.sheets.set(name, new SpriteSheet(pngPath, jsonPath));
    return this;
  }

  async loadAll(): Promise<void> {
    await Promise.all([...this.sheets.values()].map((s) => s.load()));
  }

  get(name: string): SpriteSheet {
    const sheet = this.sheets.get(name);
    if (!sheet) throw new Error(`SpriteLoader: no sheet registered as "${name}"`);
    return sheet;
  }
}
