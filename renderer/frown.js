// Turns MediaPipe face blendshapes into a 0..1 "how much are you frowning"
// signal, and decides when a frown has lasted long enough to count.
// No DOM in here so it can be unit tested under plain Node.

export const DEFAULT_OPTIONS = {
  // Smoothed score that counts as a frown. 0.005 is anything the debug panel
  // rounds to 0.01 or more, so even a very faint frown counts.
  threshold: 0.005,
  releaseThreshold: 0.003, // score you have to drop below for the frown to be "over"
  holdMs: 3000, // how long a frown must last before the creature comes
  releaseMs: 2000, // how long you must stop frowning before it leaves
  smoothing: 0.35, // EMA factor per frame; higher = snappier, noisier
  // How long to watch your resting face at startup and measure frowns
  // relative to it. 0 = off: thresholds apply to the raw score directly.
  calibrationMs: 0,
  maxBaseline: 0.3, // cap so calibrating mid-frown doesn't make you un-detectable
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const avg = (a, b) => (a + b) / 2;

/**
 * @param {{categoryName: string, score: number}[] | undefined} categories
 *   `result.faceBlendshapes[0].categories` from a MediaPipe FaceLandmarker.
 * @returns {number | null} 0..1, or null when there is no face.
 */
export function rawFrownScore(categories) {
  if (!categories || categories.length === 0) return null;
  const s = new Map(categories.map((c) => [c.categoryName, c.score]));
  const g = (name) => s.get(name) ?? 0;

  const brow = avg(g('browDownLeft'), g('browDownRight')); // furrowed brow
  const mouth = avg(g('mouthFrownLeft'), g('mouthFrownRight')); // turned-down mouth
  // Laughing squints the brows down too; a smile means it's not a frown.
  const smile = avg(g('mouthSmileLeft'), g('mouthSmileRight'));

  return clamp01(Math.max(brow, mouth) - smile);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : avg(sorted[mid - 1], sorted[mid]);
}

/**
 * Feed it one raw score per video frame; it tells you when a frown starts
 * and ends, with smoothing and hysteresis so a twitch doesn't summon anything.
 */
export class FrownTracker {
  constructor(options = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    this.recalibrate();
  }

  /** Reset, and re-learn the resting face if calibration is on. */
  recalibrate() {
    this.baseline = 0;
    this.calibration = this.opts.calibrationMs > 0 ? { start: null, samples: [] } : null;
    this.score = 0;
    this.frowning = false;
    this.pendingSince = null;
  }

  get calibrating() {
    return this.calibration !== null;
  }

  /**
   * @param {number | null} raw  output of rawFrownScore (null = no face seen)
   * @param {number} now  timestamp in ms
   * @returns {{score: number, frowning: boolean, calibrating: boolean,
   *            event: 'start' | 'end' | null}}
   */
  update(raw, now) {
    const o = this.opts;

    if (this.calibration) {
      if (raw != null) {
        this.calibration.start ??= now;
        this.calibration.samples.push(raw);
        if (now - this.calibration.start >= o.calibrationMs) {
          this.baseline = Math.min(o.maxBaseline, median(this.calibration.samples));
          this.calibration = null;
        }
      }
      return this.snapshot(null);
    }

    // No face: let the score decay so the creature eventually wanders off.
    const target = raw == null ? 0 : clamp01(raw - this.baseline);
    this.score += (target - this.score) * o.smoothing;

    const wantsToFlip = this.frowning
      ? this.score < o.releaseThreshold
      : this.score >= o.threshold;

    let event = null;
    if (!wantsToFlip) {
      this.pendingSince = null;
    } else {
      this.pendingSince ??= now;
      const needed = this.frowning ? o.releaseMs : o.holdMs;
      if (now - this.pendingSince >= needed) {
        this.frowning = !this.frowning;
        this.pendingSince = null;
        event = this.frowning ? 'start' : 'end';
      }
    }
    return this.snapshot(event);
  }

  /** Current state, without advancing anything. */
  snapshot(event = null) {
    return {
      score: this.score,
      frowning: this.frowning,
      calibrating: this.calibrating,
      event,
    };
  }
}
