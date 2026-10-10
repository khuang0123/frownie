import { Creature } from './creature.js';
import { FaceWatcher } from './detector.js';
import { DEFAULT_OPTIONS, FrownTracker, rawFrownScore } from './frown.js';

const DETECT_FPS = 12;

// Any tracker option can be overridden from the URL, e.g. ?threshold=0.2
const params = new URLSearchParams(location.search);
const options = {};
for (const key of Object.keys(DEFAULT_OPTIONS)) {
  const value = Number(params.get(key));
  if (params.has(key) && Number.isFinite(value)) options[key] = value;
}

const bridge = window.frownie; // present when running inside Electron
if (!bridge) document.body.classList.add('web');

const $ = (id) => document.getElementById(id);
const hud = {
  root: $('hud'),
  preview: $('preview'),
  state: $('hud-state'),
  fill: $('hud-fill'),
  numbers: $('hud-numbers'),
};

const tracker = new FrownTracker(options);
const creature = new Creature();
const watcher = new FaceWatcher($('camera'));

let paused = false;
let lastRaw = null;
let lastStatus = '';

$('hud-threshold').style.left = `${tracker.opts.threshold * 100}%`;
$('hud-release').style.left = `${tracker.opts.releaseThreshold * 100}%`;
$('hud-help').textContent = bridge
  ? 'tray menu: summon · debug · recalibrate · pause'
  : 'keys: [s]ummon [d]ebug [c]alibrate [p]ause';

function setStatus(status) {
  if (status === lastStatus) return;
  lastStatus = status;
  bridge?.setStatus(status);
}

let toastTimer;
function toast(text, ms = 4000) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => (el.hidden = true), ms);
}

function renderHud(snapshot) {
  if (hud.root.hidden) return;
  const state = paused
    ? 'paused'
    : lastRaw == null
      ? 'no face in view'
      : snapshot.calibrating
        ? 'calibrating… keep a neutral face'
        : snapshot.frowning
          ? 'frowning!'
          : 'watching';
  hud.state.textContent = `${state} · creature: ${creature.state}`;
  hud.fill.style.width = `${Math.round(snapshot.score * 100)}%`;
  hud.numbers.textContent =
    `raw ${lastRaw == null ? '—' : lastRaw.toFixed(2)}  ` +
    `score ${snapshot.score.toFixed(2)}  base ${tracker.baseline.toFixed(2)}`;
}

let failures = 0;

function tick() {
  setTimeout(tick, 1000 / DETECT_FPS); // reschedule first so one bad frame can't stop the loop
  if (paused) return;
  let blendshapes;
  try {
    blendshapes = watcher.detect();
    failures = 0;
  } catch (err) {
    if (++failures === 1) console.error('[frownie] face detection failed', err);
    if (failures === DETECT_FPS * 3) {
      setStatus('face detection failing');
      toast(`frownie's face detection keeps failing: ${err.message || err}`, 0);
    }
    return;
  }
  if (blendshapes === undefined) return;
  lastRaw = rawFrownScore(blendshapes);
  const snapshot = tracker.update(lastRaw, performance.now());
  if (snapshot.event === 'start') creature.summon();
  if (snapshot.event === 'end') creature.dismiss();
  setStatus(snapshot.calibrating ? 'calibrating' : snapshot.frowning ? 'frowning' : 'watching');
  renderHud(snapshot);
}

async function startCamera() {
  try {
    await watcher.startCamera();
    hud.preview.srcObject = watcher.stream;
    hud.preview.play().catch(() => {});
  } catch (err) {
    console.error('[frownie] camera failed', err);
    setStatus('camera unavailable');
    toast(`frownie can't open the camera: ${err.message || err.name}`, 0);
    throw err;
  }
}

async function setPaused(value) {
  paused = value;
  if (paused) {
    watcher.stopCamera();
    creature.dismiss();
    setStatus('paused');
  } else {
    tracker.recalibrate();
    await startCamera().catch(() => {});
  }
  renderHud(tracker.snapshot());
}

const commands = {
  summon: () => (creature.visible ? creature.dismiss() : creature.summon()),
  debug: () => {
    hud.root.hidden = !hud.root.hidden;
    renderHud(tracker.snapshot());
  },
  recalibrate: () => {
    tracker.recalibrate();
    creature.dismiss(); // the tracker forgot it was frowning, so no 'end' will come
    if (tracker.calibrating) toast('recalibrating — relax your face for a few seconds', 3000);
  },
  pause: () => setPaused(true),
  resume: () => setPaused(false),
  togglePause: () => setPaused(!paused),
};

bridge?.onCommand((name) => commands[name]?.());

if (!bridge) {
  const keys = { s: 'summon', d: 'debug', c: 'recalibrate', p: 'togglePause' };
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    commands[keys[e.key.toLowerCase()]]?.();
  });
  if (params.has('debug')) hud.root.hidden = false;
}

async function main() {
  setStatus('loading face model');
  try {
    await watcher.init();
  } catch (err) {
    console.error('[frownie] model failed to load', err);
    setStatus('model failed to load');
    toast(`frownie couldn't load the face model: ${err.message || err}`, 0);
    return;
  }
  await startCamera().catch(() => {});
  if (!bridge) toast('frownie is watching — frown at your camera! (press D for debug view)', 5000);
  tick();
}

main();
