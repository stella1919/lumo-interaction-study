export const DEBUG_DEFAULT = true;

export const CONFIG = {
  backgroundMode: "camera" as "camera" | "photo" | "video",
  backgroundImage: "/assets/golden-gate-background.jpg",
  backgroundVideo: "/assets/golden-gate-background.mp4",
  poseModel:
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  gestureModel:
    "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
  wasmPath:
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
  detectionFps: 18,
  holdDuration: 1000,
  okHoldDuration: 900,
  okMotionTolerance: 0.06,
  poseLostGrace: 300,
  raisedLostGrace: 150,
};

export const ASSETS = {
  bridgeGlow: "/assets/bridge-glow.png",
  seagull1: "/assets/seagull-1.png",
  seagull2: "/assets/seagull-2.png",
  logo: "/assets/lumo-logo.png",
};

export const STANDING_ZONES = {
  left: { minX: 0.2, maxX: 0.48 },
  right: { minX: 0.52, maxX: 0.8 },
};

export const SOLO_STANDING_ZONE = { minX: 0.34, maxX: 0.66 };

export const BRIDGE_TARGET = { x: 0.5, y: 0.42 };

export type SceneId = "golden-gate" | "cable-car" | "palace" | "live";
export type LiveEffect = "skylight" | "aurora" | "fireflies";
export type GestureId = "open-arms" | "hands-up" | "victory" | "wave" | "spin" | "jump";

export const GESTURES: Record<GestureId, {
  name: string;
  zh: string;
  instruction: string;
  instructionZh: string;
}> = {
  "open-arms": {
    name: "Open Arms",
    zh: "打开成大字",
    instruction: "OPEN YOUR ARMS WIDE",
    instructionZh: "张开双臂，摆出“大”字。",
  },
  "hands-up": {
    name: "Hands Up",
    zh: "双手举高",
    instruction: "RAISE BOTH HANDS",
    instructionZh: "将双手举过肩膀。",
  },
  victory: {
    name: "Victory",
    zh: "比一个耶",
    instruction: "MAKE A V SIGN",
    instructionZh: "对镜头比出“耶”的手势。",
  },
  wave: {
    name: "Wave",
    zh: "挥挥手",
    instruction: "WAVE TO THE PLACE",
    instructionZh: "抬起一只手，左右挥动。",
  },
  spin: {
    name: "Turn Around",
    zh: "转一圈",
    instruction: "TURN AROUND ONCE",
    instructionZh: "慢慢转一圈，再面向镜头。",
  },
  jump: {
    name: "Jump",
    zh: "向上跳跃",
    instruction: "JUMP TO LIFT THE LIGHT",
    instructionZh: "轻轻向上跳跃，释放地面光波。",
  },
};

export const SCENES: Record<SceneId, {
  name: string;
  zh: string;
  city: string;
  eyebrow: string;
  description: string;
  anchor: { x: number; y: number };
}> = {
  "golden-gate": {
    name: "Golden Gate Bridge",
    zh: "金门大桥",
    city: "San Francisco · California",
    eyebrow: "LIGHT THE BRIDGE",
    description: "Wake the bridge with flowing city light.",
    anchor: { x: .54, y: .42 },
  },
  "cable-car": {
    name: "California Street",
    zh: "叮当车光轨",
    city: "San Francisco · California",
    eyebrow: "TRACE THE CITY",
    description: "Send a ribbon of light down the rails.",
    anchor: { x: .34, y: .5 },
  },
  palace: {
    name: "Palace of Fine Arts",
    zh: "艺术宫光环",
    city: "San Francisco · California",
    eyebrow: "AWAKEN THE ARCH",
    description: "Reveal a warm celestial halo.",
    anchor: { x: .7, y: .38 },
  },
  live: {
    name: "Live Scene Studio",
    zh: "任意实景工作室",
    city: "Your place · Live",
    eyebrow: "ANCHOR THE LIGHT",
    description: "Point, place and awaken any real place.",
    anchor: { x: .5, y: .28 },
  },
};
