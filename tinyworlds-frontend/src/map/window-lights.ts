import type { PaneJob } from "./window-panes.worker";

/** Masks belong to decoded images. Analyse one visible image at a time so panning
 * never leaves a queue of off-screen work competing with the new view. */
export class WindowLights {
  private readonly masks = new Map<ImageBitmap, ImageBitmap | null>();
  private pending: { image: ImageBitmap | null } | null = null;
  private worker: Worker | null = null;
  private unavailable = false;
  private on = false;
  /** Each nonempty mask consumes another decoded tile's worth of memory. */
  pixels = 0;

  get activeContext(): CanvasRenderingContext2D | null {
    return this.on && !this.unavailable ? this.ctx : null;
  }

  private readonly ctx: CanvasRenderingContext2D | null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly invalidate: () => void,
  ) {
    this.ctx = canvas.getContext("2d");
  }

  setStrength(amount: number): void {
    const on = amount > 0.01;
    this.canvas.style.opacity = on ? String(amount) : "0";
    if (on !== this.on) {
      this.on = on;
      this.invalidate();
    }
  }

  begin(smooth: boolean): void {
    if (!this.ctx || !this.on) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.imageSmoothingEnabled = smooth;
    this.ctx.imageSmoothingQuality = "medium";
  }

  /** The caller uses the same source crop and rounded destination as the daylight tile. */
  draw(
    image: ImageBitmap,
    left: number,
    top: number,
    step: number,
    alpha: number,
    occludes: boolean,
    rect: [number, number, number, number, number, number, number, number],
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.on || this.unavailable) return;
    ctx.globalAlpha = alpha;
    if (occludes) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(image, ...rect);
      ctx.globalCompositeOperation = "source-over";
    }
    const mask = this.masks.get(image);
    if (mask) ctx.drawImage(mask, ...rect);
    else if (
      mask === undefined &&
      !this.pending &&
      step <= 8 &&
      image.width * image.height <= 1_048_576
    ) {
      this.request({ image, left, top, step });
    }
    ctx.globalAlpha = 1;
  }

  private request(job: PaneJob): void {
    try {
      if (!this.worker) {
        this.worker = new Worker(new URL("./window-panes.worker.ts", import.meta.url));
        this.worker.onmessage = ({ data }: MessageEvent<ImageBitmap | null>) => {
          if (this.pending?.image) {
            this.masks.set(this.pending.image, data);
            if (data) this.pixels += data.width * data.height;
          } else data?.close();
          this.pending = null;
          this.invalidate();
        };
        this.worker.onerror = () => this.disable();
      }
      this.pending = { image: job.image };
      this.worker.postMessage(job);
    } catch {
      this.disable();
    }
  }

  private disable(): void {
    this.unavailable = true;
    this.dispose();
  }

  release(image: ImageBitmap): void {
    const mask = this.masks.get(image);
    if (mask) {
      this.pixels -= mask.width * mask.height;
      mask.close();
    }
    this.masks.delete(image);
    // An evicted image's reply must be discarded before the worker takes another job.
    if (this.pending?.image === image) this.pending.image = null;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending = null;
    for (const mask of this.masks.values()) mask?.close();
    this.masks.clear();
    this.pixels = 0;
  }
}
