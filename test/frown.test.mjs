import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FrownTracker, rawFrownScore } from '../renderer/frown.js';

const face = (scores) => Object.entries(scores).map(([categoryName, score]) => ({ categoryName, score }));

test('rawFrownScore is null without a face', () => {
  assert.equal(rawFrownScore(undefined), null);
  assert.equal(rawFrownScore([]), null);
});

test('rawFrownScore picks up a furrowed brow or a turned-down mouth', () => {
  assert.equal(rawFrownScore(face({ browDownLeft: 0.6, browDownRight: 0.4 })), 0.5);
  assert.equal(rawFrownScore(face({ mouthFrownLeft: 0.3, mouthFrownRight: 0.5 })), 0.4);
  assert.equal(rawFrownScore(face({ eyeBlinkLeft: 0.9 })), 0);
});

test('smiling cancels out squinty brows', () => {
  const laughing = face({ browDownLeft: 0.5, browDownRight: 0.5, mouthSmileLeft: 0.8, mouthSmileRight: 0.8 });
  assert.equal(rawFrownScore(laughing), 0);
});

// Drive a tracker at ~12fps with a constant raw score for `ms`.
function run(tracker, raw, ms, clock) {
  const events = [];
  for (const end = clock.t + ms; clock.t < end; clock.t += 80) {
    const { event } = tracker.update(raw, clock.t);
    if (event) events.push(event);
  }
  return events;
}

// The mechanics tests use their own coarse thresholds so they don't depend
// on the (very sensitive) defaults, which are tested separately below.
const MECHANICS = { threshold: 0.3, releaseThreshold: 0.15, holdMs: 1000, calibrationMs: 500 };

function calibrated(baseline = 0.05) {
  const tracker = new FrownTracker(MECHANICS);
  const clock = { t: 0 };
  run(tracker, baseline, 600, clock);
  assert.equal(tracker.calibrating, false);
  return { tracker, clock };
}

test('calibration learns the resting face', () => {
  const { tracker } = calibrated(0.12);
  assert.equal(tracker.baseline, 0.12);
});

test('calibration ignores frames with no face', () => {
  const tracker = new FrownTracker(MECHANICS);
  const clock = { t: 0 };
  run(tracker, null, 2000, clock);
  assert.equal(tracker.calibrating, true);
});

test('baseline is capped so calibrating mid-frown still works', () => {
  const { tracker } = calibrated(0.9);
  assert.equal(tracker.baseline, tracker.opts.maxBaseline);
});

test('a sustained frown starts, and relaxing ends it', () => {
  const { tracker, clock } = calibrated();
  assert.deepEqual(run(tracker, 0.7, 2000, clock), ['start']);
  assert.equal(tracker.frowning, true);
  assert.deepEqual(run(tracker, 0.05, 3000, clock), ['end']);
  assert.equal(tracker.frowning, false);
});

test('a brief twitch does not count', () => {
  const { tracker, clock } = calibrated();
  assert.deepEqual(run(tracker, 0.8, 500, clock), []);
  assert.deepEqual(run(tracker, 0.05, 2000, clock), []);
});

test('a short relax mid-frown does not end it', () => {
  const { tracker, clock } = calibrated();
  run(tracker, 0.7, 2000, clock);
  assert.deepEqual(run(tracker, 0.05, 1000, clock), []);
  assert.deepEqual(run(tracker, 0.7, 1000, clock), []);
  assert.equal(tracker.frowning, true);
});

test('walking away from the camera eventually ends the frown', () => {
  const { tracker, clock } = calibrated();
  run(tracker, 0.7, 2000, clock);
  assert.deepEqual(run(tracker, null, 3000, clock), ['end']);
});

test('frowning is measured relative to the baseline', () => {
  const { tracker, clock } = calibrated(0.25);
  // 0.4 raw is only 0.15 above this person's resting face: below threshold.
  assert.deepEqual(run(tracker, 0.4, 3000, clock), []);
  assert.deepEqual(run(tracker, 0.7, 2000, clock), ['start']);
});

test('snapshot does not advance state', () => {
  const { tracker, clock } = calibrated();
  run(tracker, 0.7, 2000, clock);
  const before = tracker.snapshot();
  tracker.snapshot();
  assert.deepEqual(tracker.snapshot(), before);
});

// --- defaults: a raw score that shows as 0.01, held for 3 seconds ----------

function defaults() {
  return { tracker: new FrownTracker(), clock: { t: 0 } };
}

test('no calibration by default: the raw score is used as is', () => {
  const { tracker } = defaults();
  assert.equal(tracker.calibrating, false);
  assert.equal(tracker.baseline, 0);
});

test('raw 0.01 held for 3 seconds brings the creature', () => {
  const { tracker, clock } = defaults();
  assert.deepEqual(run(tracker, 0.01, 2800, clock), []);
  assert.deepEqual(run(tracker, 0.01, 600, clock), ['start']);
});

test('anything that shows as 0.01 counts, even if it wobbles', () => {
  const { tracker, clock } = defaults();
  const events = [];
  for (let i = 0; clock.t < 3500; i++, clock.t += 80) {
    const { event } = tracker.update(i % 2 ? 0.006 : 0.014, clock.t);
    if (event) events.push(event);
  }
  assert.deepEqual(events, ['start']);
});

test('a neutral 0.00 face does not bring it', () => {
  const { tracker, clock } = defaults();
  assert.deepEqual(run(tracker, 0.002, 10000, clock), []);
  assert.deepEqual(run(tracker, 0, 10000, clock), []);
});

test('dropping back to 0.00 before 3 seconds resets the countdown', () => {
  const { tracker, clock } = defaults();
  assert.deepEqual(run(tracker, 0.01, 2000, clock), []);
  assert.deepEqual(run(tracker, 0, 500, clock), []);
  assert.deepEqual(run(tracker, 0.01, 2000, clock), []);
});

test('back at 0.00 for 2 seconds, it leaves', () => {
  const { tracker, clock } = defaults();
  run(tracker, 0.01, 3500, clock);
  assert.equal(tracker.frowning, true);
  assert.deepEqual(run(tracker, 0, 2600, clock), ['end']);
});
