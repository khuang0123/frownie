// Downloads the MediaPipe face model once so frownie works offline.
// If this fails the app still works; it just fetches the model at startup.
const fs = require('node:fs');
const path = require('node:path');

const URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const DEST = path.resolve(__dirname, '..', 'models', 'face_landmarker.task');

async function main() {
  if (fs.existsSync(DEST)) return;
  console.log('frownie: downloading face model…');
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.writeFileSync(`${DEST}.part`, data);
  fs.renameSync(`${DEST}.part`, DEST);
  console.log(`frownie: saved ${(data.length / 1e6).toFixed(1)} MB to models/`);
}

main().catch((err) => {
  console.warn(`frownie: couldn't download the face model (${err.message}).`);
  console.warn('frownie: no problem, it will be fetched from the CDN when the app starts.');
});
