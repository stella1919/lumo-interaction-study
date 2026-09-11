export type ExperienceState =
  | "welcome"
  | "sceneSelect"
  | "permission"
  | "cameraError"
  | "waiting"
  | "solo"
  | "positioning"
  | "ready"
  | "challenge"
  | "play"
  | "holding"
  | "success"
  | "countdown"
  | "result";

export type ExperienceMode = "solo" | "duo";

export const STATE_COPY: Record<
  ExperienceState,
  { eyebrow?: string; title: string; zh: string }
> = {
  welcome: { title: "Move. Connect. Light up the place.", zh: "动起来，与此地发生连接。" },
  sceneSelect: { title: "Choose a place to awaken.", zh: "选择一个等待被唤醒的场景。" },
  permission: { title: "Preparing your experience...", zh: "正在准备互动体验……" },
  cameraError: { title: "Camera access is needed to begin.", zh: "需要开启摄像头才能开始体验。" },
  waiting: { title: "A hidden moment is waiting to be unlocked.", zh: "一个隐藏时刻，正在等待被唤醒。" },
  solo: { title: "One more traveler is needed.", zh: "还需要一位同行者。" },
  positioning: { title: "Step into the light.", zh: "请站进光影轮廓。" },
  ready: { title: "Both travelers are ready.", zh: "两位旅行者已就位。" },
  challenge: {
    eyebrow: "RAISE YOUR HANDS TOGETHER",
    title: "This moment needs two people.",
    zh: "请两个人同时举起双手。",
  },
  play: { title: "Play with the place.", zh: "用动作探索特效，准备好时比出 OK。" },
  holding: { title: "Hold the moment...", zh: "保持这个动作……" },
  success: { title: "MISSION COMPLETE", zh: "你让城市回应了你。" },
  countdown: { title: "Capturing your moment...", zh: "记录这一刻……" },
  result: { title: "Your moment is ready.", zh: "属于你们的旅行瞬间已经生成。" },
};

const SOLO_COPY: Partial<typeof STATE_COPY> = {
  waiting: { title: "Step into the center light.", zh: "请站进中央光影轮廓。" },
  positioning: { title: "Move into the center.", zh: "请站到画面中央。" },
  ready: { title: "Traveler is ready.", zh: "旅行者已就位。" },
  challenge: {
    eyebrow: "RAISE YOUR HANDS",
    title: "This moment is yours.",
    zh: "请举起双手。",
  },
  play: { title: "This place is listening.", zh: "试试不同动作，准备好时比出 OK。" },
  result: { title: "Your moment is ready.", zh: "属于你的旅行瞬间已经生成。" },
};

export function getStateCopy(state: ExperienceState, mode: ExperienceMode) {
  return mode === "solo" ? SOLO_COPY[state] ?? STATE_COPY[state] : STATE_COPY[state];
}
