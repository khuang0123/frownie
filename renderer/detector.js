// Webcam + MediaPipe FaceLandmarker. Everything runs locally in the page;
// no frames ever leave the machine.

import {
  FaceLandmarker,
  FilesetResolver,
} from '/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';

const WASM_PATH = '/node_modules/@mediapipe/tasks-vision/wasm';
const LOCAL_MODEL = '/models/face_landmarker.task';
const REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

async function pickModel() {
  try {
    const res = await fetch(LOCAL_MODEL, { method: 'HEAD' });
    if (res.ok) return LOCAL_MODEL;
  } catch {
    // fall through to the CDN copy
  }
  console.warn('[frownie] no local model, downloading from', REMOTE_MODEL);
  return REMOTE_MODEL;
}

async function createLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  const modelAssetPath = await pickModel();
  const make = (delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
    });
  try {
    return await make('GPU');
  } catch (err) {
    console.warn('[frownie] GPU delegate failed, using CPU', err);
    return make('CPU');
  }
}

export class FaceWatcher {
  /** @param {HTMLVideoElement} video */
  constructor(video) {
    this.video = video;
    this.landmarker = null;
    this.stream = null;
    this.lastTimestamp = -1;
  }

  async init() {
    this.landmarker ??= await createLandmarker();
  }

  async startCamera() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  /** Releases the webcam so its light turns off. */
  stopCamera() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  get running() {
    return this.stream !== null;
  }

  /**
   * @returns {{categoryName: string, score: number}[] | null | undefined}
   *   blendshapes for the detected face, null if no face is in view,
   *   undefined if there was no new frame to look at.
   */
  detect() {
    if (!this.landmarker || !this.running) return undefined;
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return undefined;
    // MediaPipe requires strictly increasing timestamps.
    const ts = Math.max(performance.now(), this.lastTimestamp + 1);
    this.lastTimestamp = ts;
    const result = this.landmarker.detectForVideo(this.video, ts);
    return result.faceBlendshapes?.[0]?.categories ?? null;
  }
}
