import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { CONFIG } from "./config";

export type Landmark = { x: number; y: number; z?: number; visibility?: number };
export type Pose = Landmark[];

export async function createPoseDetector() {
  const vision = await FilesetResolver.forVisionTasks(CONFIG.wasmPath);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: CONFIG.poseModel, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 2,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

function pairIsVisible(a?: Landmark, b?: Landmark, threshold = 0.35) {
  return !!a && !!b
    && Number.isFinite(a.x) && Number.isFinite(b.x)
    && (a.visibility ?? 0) >= threshold
    && (b.visibility ?? 0) >= threshold;
}

export function screenCenterX(pose: Pose) {
  const leftHip = pose[23], rightHip = pose[24];
  const leftShoulder = pose[11], rightShoulder = pose[12];

  // 全身入镜时使用髋部更稳定；半身构图或髋部被裁切时自动回退到双肩中心。
  // 最后一层兜底保留关键点坐标，避免单帧 visibility 抖动导致人物排序跳变。
  const pair = pairIsVisible(leftHip, rightHip)
    ? [leftHip, rightHip]
    : pairIsVisible(leftShoulder, rightShoulder, 0.45)
      ? [leftShoulder, rightShoulder]
      : leftShoulder && rightShoulder
        ? [leftShoulder, rightShoulder]
        : [leftHip, rightHip];

  if (!pair[0] || !pair[1]) return 0.5;
  // 视频镜像后，屏幕横坐标需反转。
  return 1 - (pair[0].x + pair[1].x) / 2;
}

export function sortPosesForScreen(poses: Pose[]) {
  return [...poses].sort((a, b) => screenCenterX(a) - screenCenterX(b));
}

export function isHandsRaised(pose?: Pose) {
  if (!pose) return false;
  const ls = pose[11], rs = pose[12], lw = pose[15], rw = pose[16];
  return [ls, rs, lw, rw].every((p) => (p?.visibility ?? 0) > 0.55)
    && lw.y < ls.y && rw.y < rs.y;
}

export function isOpenArms(pose?: Pose) {
  if (!pose) return false;
  const ls = pose[11], rs = pose[12], lw = pose[15], rw = pose[16];
  if (![ls, rs, lw, rw].every((p) => (p?.visibility ?? 0) > .55)) return false;
  const shoulderMinX = Math.min(ls.x, rs.x), shoulderMaxX = Math.max(ls.x, rs.x);
  const wristMinX = Math.min(lw.x, rw.x), wristMaxX = Math.max(lw.x, rw.x);
  const shoulderY = (ls.y + rs.y) / 2;
  return wristMinX < shoulderMinX - .055
    && wristMaxX > shoulderMaxX + .055
    && Math.abs(lw.y - shoulderY) < .16
    && Math.abs(rw.y - shoulderY) < .16;
}

export type WaveSample = { time: number; x: number };

export function detectWave(pose: Pose | undefined, now: number, samples: WaveSample[]) {
  if (!pose) { samples.length = 0; return false; }
  const ls = pose[11], rs = pose[12], lw = pose[15], rw = pose[16];
  const candidates = [
    { wrist: lw, shoulder: ls },
    { wrist: rw, shoulder: rs },
  ].filter(({ wrist, shoulder }) =>
    (wrist?.visibility ?? 0) > .55
    && (shoulder?.visibility ?? 0) > .55
    && wrist.y < shoulder.y + .04,
  );
  if (!candidates.length) {
    while (samples.length && samples[0].time < now - 450) samples.shift();
    return false;
  }
  const active = candidates.sort((a, b) => a.wrist.y - b.wrist.y)[0].wrist;
  samples.push({ time: now, x: active.x });
  while (samples.length && samples[0].time < now - 1250) samples.shift();
  if (samples.length < 7) return false;
  let min = 1, max = 0, turns = 0, lastDirection = 0;
  for (let i = 1; i < samples.length; i++) {
    min = Math.min(min, samples[i].x); max = Math.max(max, samples[i].x);
    const delta = samples[i].x - samples[i - 1].x;
    const direction = Math.abs(delta) > .012 ? Math.sign(delta) : lastDirection;
    if (lastDirection && direction && direction !== lastDirection) turns++;
    lastDirection = direction;
  }
  if (max - min > .11 && turns >= 2) {
    samples.length = 0;
    return true;
  }
  return false;
}

export type SpinTracker = { maxSpan: number; phase: "front" | "side"; startedAt: number };

export function detectSpin(pose: Pose | undefined, now: number, tracker: SpinTracker) {
  if (!pose) return false;
  const ls = pose[11], rs = pose[12];
  if ((ls?.visibility ?? 0) < .5 || (rs?.visibility ?? 0) < .5) return false;
  const span = Math.abs(ls.x - rs.x);
  tracker.maxSpan = Math.max(span, tracker.maxSpan * .997);
  if (tracker.phase === "front" && tracker.maxSpan > .075 && span < tracker.maxSpan * .56) {
    tracker.phase = "side"; tracker.startedAt = now;
    return false;
  }
  if (tracker.phase === "side") {
    if (now - tracker.startedAt > 3800) {
      tracker.phase = "front"; tracker.startedAt = 0;
    } else if (span > tracker.maxSpan * .82) {
      tracker.phase = "front"; tracker.startedAt = 0;
      return true;
    }
  }
  return false;
}

export type JumpTracker = { baselineY: number; cooldownUntil: number; lastSeenAt: number };

export function detectJump(pose: Pose | undefined, now: number, tracker: JumpTracker) {
  if (!pose) {
    if (now - tracker.lastSeenAt > 500) tracker.baselineY = 0;
    return false;
  }
  const leftShoulder = pose[11], rightShoulder = pose[12];
  if ((leftShoulder?.visibility ?? 0) < .55 || (rightShoulder?.visibility ?? 0) < .55) return false;
  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  tracker.lastSeenAt = now;
  if (!tracker.baselineY) {
    tracker.baselineY = shoulderY;
    return false;
  }
  const lift = tracker.baselineY - shoulderY;
  const detected = now > tracker.cooldownUntil && lift > .052;
  if (detected) {
    tracker.cooldownUntil = now + 1900;
    tracker.baselineY = shoulderY + .018;
    return true;
  }
  const settleRate = lift > .025 ? .018 : .055;
  tracker.baselineY = tracker.baselineY * (1 - settleRate) + shoulderY * settleRate;
  return false;
}
