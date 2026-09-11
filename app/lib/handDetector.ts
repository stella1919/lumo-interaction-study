import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";
import { CONFIG } from "./config";

export async function createHandGestureDetector() {
  const vision = await FilesetResolver.forVisionTasks(CONFIG.wasmPath);
  return GestureRecognizer.createFromOptions(vision, {
    baseOptions: { modelAssetPath: CONFIG.gestureModel, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: .42,
    minHandPresenceConfidence: .42,
    minTrackingConfidence: .42,
  });
}

export function countVictoryGestures(
  result?: ReturnType<GestureRecognizer["recognizeForVideo"]>,
) {
  if (!result) return 0;
  return result.gestures.filter((categories) =>
    categories.some((category) =>
      category.categoryName === "Victory" && category.score >= .55,
    ),
  ).length;
}

export type PinchState = {
  pinching: boolean;
  okSign: boolean;
  point: { x: number; y: number } | null;
};

export function getPinchState(
  result?: ReturnType<GestureRecognizer["recognizeForVideo"]>,
): PinchState {
  const hand = result?.landmarks?.[0];
  if (!hand?.[0] || !hand?.[4] || !hand?.[8]) {
    return { pinching: false, okSign: false, point: null };
  }
  const thumb = hand[4], index = hand[8];
  const distance = Math.hypot(thumb.x - index.x, thumb.y - index.y);
  const wrist = hand[0];
  const distanceFromWrist = (landmarkIndex: number) => {
    const point = hand[landmarkIndex];
    return point ? Math.hypot(point.x - wrist.x, point.y - wrist.y) : 0;
  };
  const isExtended = (tipIndex: number, pipIndex: number) =>
    distanceFromWrist(tipIndex) > distanceFromWrist(pipIndex) + .02;
  const openFingers = [
    isExtended(12, 10),
    isExtended(16, 14),
    isExtended(20, 18),
  ].filter(Boolean).length;
  const pinching = distance < .065;
  return {
    pinching,
    // A capture OK sign is stricter than the everyday Vision Pro-style pinch
    // used to move the anchor: thumb and index touch while at least two of the
    // remaining fingers are visibly open.
    okSign: pinching && distance < .06 && openFingers >= 2,
    point: {
      x: 1 - (thumb.x + index.x) / 2,
      y: (thumb.y + index.y) / 2,
    },
  };
}
