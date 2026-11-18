/**
 * Street Walk synthesizes its horn, crashes, explosions, splashes and combat sounds with Web Audio.
 * `wake` creates or resumes the audio context on a key or tap. Every sound is optional on browsers
 * without Web Audio.
 */

type Context = AudioContext;

const HORN_NOTES = [392, 494];
const HORN_GAIN = 0.06;

export class WalkSound {
  private ctx: Context | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private hornNodes: { gain: GainNode; oscs: OscillatorNode[] } | null = null;
  private on = true;

  /** The sound switch: off, nothing plays (and a held horn stops). */
  get enabled(): boolean {
    return this.on;
  }

  set enabled(on: boolean) {
    this.on = on;
    if (!on) this.horn(false);
    else this.wake();
  }

  /** Makes the audio context, or lets it play, from inside a key or a tap. */
  wake(): void {
    if (!this.on) return;
    try {
      if (!this.ctx) {
        const Ctor =
          globalThis.AudioContext ??
          (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    } catch {
      this.ctx = null;
    }
  }

  private live(): Context | null {
    return this.on && this.ctx && this.ctx.state !== "closed" ? this.ctx : null;
  }

  /** A second and a half of white noise, made once. */
  private noise(a: Context): AudioBuffer {
    if (!this.noiseBuffer) {
      const buf = a.createBuffer(1, Math.floor(a.sampleRate * 1.5), a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  /** A burst of noise through a filter, dying away over `length` seconds. */
  private burst(
    a: Context,
    length: number,
    gain: number,
    filter: BiquadFilterType,
    freq: number,
    q = 1,
  ) {
    const t = a.currentTime;
    const src = a.createBufferSource();
    src.buffer = this.noise(a);
    const f = a.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t, Math.random() * 0.2, length + 0.05);
  }

  /** A low thump: a tone falling from `from` to `to` Hz. */
  private thump(a: Context, length: number, gain: number, from: number, to: number) {
    const t = a.currentTime;
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + length);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + length + 0.05);
  }

  /** The horn, for as long as it is held: two square tones a third apart. */
  horn(on: boolean): void {
    const a = this.ctx;
    if (!on) {
      const h = this.hornNodes;
      this.hornNodes = null;
      if (!h || !a) return;
      const t = a.currentTime;
      h.gain.gain.cancelScheduledValues(t);
      h.gain.gain.setValueAtTime(h.gain.gain.value, t);
      h.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      for (const o of h.oscs) o.stop(t + 0.08);
      return;
    }
    const live = this.live();
    if (!live || this.hornNodes) return;
    const t = live.currentTime;
    const gain = live.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(HORN_GAIN, t + 0.02);
    const f = live.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2400;
    f.connect(gain).connect(live.destination);
    const oscs = HORN_NOTES.map((freq) => {
      const o = live.createOscillator();
      o.type = "square";
      o.frequency.value = freq;
      o.connect(f);
      o.start(t);
      return o;
    });
    this.hornNodes = { gain, oscs };
  }

  /** A crash, `strength` 0 to 1 (how hard, and how near): louder and brighter the harder. */
  crash(strength: number): void {
    const a = this.live();
    const s = Math.max(0, Math.min(1, strength));
    if (!a || s <= 0.01) return;
    this.burst(a, 0.35, 0.04 + 0.4 * s, "lowpass", 500 + 2200 * s);
    this.thump(a, 0.18, 0.25 * s, 140, 60);
  }

  /** The dull boom of a car catching fire. */
  boom(strength = 1): void {
    const a = this.live();
    const s = Math.max(0, Math.min(1, strength));
    if (!a || s <= 0.01) return;
    this.burst(a, 1.4, 0.6 * s, "lowpass", 260);
    this.thump(a, 0.9, 0.5 * s, 70, 32);
  }

  swing(): void {
    const a = this.live();
    if (a) this.burst(a, 0.09, 0.07, "bandpass", 920, 0.65);
  }

  punch(): void {
    const a = this.live();
    if (!a) return;
    this.burst(a, 0.08, 0.34, "bandpass", 1550, 0.7);
    this.thump(a, 0.12, 0.24, 180, 74);
  }

  /** A deeper thud when a vehicle knocks down a pedestrian. */
  pedestrianHit(strength: number): void {
    const a = this.live();
    const s = Math.min(1, strength);
    if (!a || s <= 0.01) return;
    this.burst(a, 0.16, 0.38 * s, "lowpass", 530);
    this.thump(a, 0.23, 0.35 * s, 125, 45);
  }

  /** A short descending grunt, scaled by the fraction of health lost. */
  hurt(strength: number): void {
    const a = this.live();
    if (!a || strength <= 0) return;
    const s = 0.6 + 0.4 * Math.min(1, strength);
    this.thump(a, 0.26, 0.22 * s, 235, 112);
    this.thump(a, 0.26, 0.09 * s, 470, 224);
    this.burst(a, 0.13, 0.17 * s, "bandpass", 690, 1.2);
  }

  /** Something going into the water. */
  splash(strength = 1): void {
    const a = this.live();
    const s = Math.max(0, Math.min(1, strength));
    if (!a || s <= 0.01) return;
    this.burst(a, 0.7, 0.3 * s, "bandpass", 1100, 0.7);
  }

  dispose(): void {
    this.horn(false);
    const a = this.ctx;
    this.ctx = null;
    this.noiseBuffer = null;
    a?.close().catch(() => {});
  }
}
