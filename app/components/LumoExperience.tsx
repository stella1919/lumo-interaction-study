"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  CONFIG, DEBUG_DEFAULT, GESTURES, SCENES, SOLO_STANDING_ZONE, STANDING_ZONES,
  type GestureId, type LiveEffect, type SceneId,
} from "../lib/config";
import { playSuccessChime } from "../lib/audio";
import { createPostcard } from "../lib/postcard";
import {
  createPoseDetector, detectJump, detectSpin, detectWave, isHandsRaised, isOpenArms,
  screenCenterX, sortPosesForScreen, type JumpTracker, type Pose, type SpinTracker, type WaveSample,
} from "../lib/poseDetector";
import { countVictoryGestures, createHandGestureDetector, getPinchState, type PinchState } from "../lib/handDetector";
import { createJourneyGrid, type JourneyMemory } from "../lib/journey";
import { renderScene, type Particle, type SkyStroke } from "../lib/renderer";
import { getStateCopy, type ExperienceMode, type ExperienceState } from "../lib/stateMachine";
import { INTERACTION_MODES, allowsInteraction } from "../lib/interactionModes";
import type { InteractionAction, InteractionEventInput, InteractionMode, InteractionRunContext } from "../lib/interactionModes";

type InteractionTool = "direct" | "draw";
type SceneTransition = { from: SceneId; to: SceneId; startedAt: number };
const SCENE_ORDER: SceneId[] = ["golden-gate", "cable-car", "palace", "live"];
const GESTURE_EFFECTS: Record<GestureId, string> = {
  "open-arms": "Radial Light · 放射光束",
  "hands-up": "Glass Bubbles · 玻璃光泡",
  victory: "Balloons & Confetti · 气球彩纸",
  wave: "Flowing Light · 挥手光浪",
  spin: "Orbiting Light · 环绕星轨",
  jump: "Light Bounce · 跳跃光波",
};
const MODE_META: Record<InteractionMode, { icon: string; label: string; note: string }> = {
  global: { icon: "∞", label: "ALL LIVE", note: "No explicit mode" },
  play: { icon: "▶", label: "PLAY", note: "Effects + capture" },
  create: { icon: "✎", label: "CREATE", note: "Persistent drawing" },
  effect: { icon: "✦", label: "EFFECT", note: "Effects only" },
  draw: { icon: "✎", label: "DRAW", note: "Drawing only" },
  capture: { icon: "◎", label: "CAPTURE", note: "OK / Space only" },
};
const TASK_COPY = {
  play: { title: "Activate two different effects.", zh: "使用身体或手势激活两种不同特效。" },
  create: { title: "Leave a persistent mark.", zh: "用捏合手势在画面中留下一个持续可见的标记。" },
  capture: { title: "Take the final photograph.", zh: "稳定比 OK 手势拍照；空格键是记录在案的备用输入。" },
} as const;

function gestureIcon(id: GestureId) {
  if (id === "open-arms") return "—◯—";
  if (id === "hands-up") return "╲◯╱";
  if (id === "victory") return "✌";
  if (id === "wave") return "〰";
  if (id === "jump") return "↑";
  return "↻";
}

function appendStrokePoint(stroke: SkyStroke, point: { x: number; y: number }, spacing = .004) {
  const last = stroke.points[stroke.points.length - 1];
  if (!last) {
    stroke.points.push(point);
    return;
  }
  const distance = Math.hypot(point.x - last.x, point.y - last.y);
  if (distance < spacing * .35) return;
  const steps = Math.max(1, Math.min(16, Math.ceil(distance / spacing)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const eased = t * t * (3 - 2 * t);
    stroke.points.push({
      x: last.x + (point.x - last.x) * eased,
      y: last.y + (point.y - last.y) * eased,
    });
  }
  if (stroke.points.length > 900) stroke.points.splice(0, stroke.points.length - 900);
}

export function LumoExperience({ studyRun }: { studyRun?: InteractionRunContext } = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<Awaited<ReturnType<typeof createPoseDetector>> | null>(null);
  const handDetectorRef = useRef<Awaited<ReturnType<typeof createHandGestureDetector>> | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const posesRef = useRef<Pose[]>([]);
  const stateRef = useRef<ExperienceState>("welcome");
  const debugRef = useRef(DEBUG_DEFAULT);
  const modeRef = useRef<ExperienceMode>("solo");
  const sceneRef = useRef<SceneId>("golden-gate");
  const liveEffectRef = useRef<LiveEffect>("skylight");
  const gestureRef = useRef<GestureId>("open-arms");
  const anchorRef = useRef({ ...SCENES["golden-gate"].anchor });
  const customNameRef = useRef("My San Francisco Moment");
  const toolRef = useRef<InteractionTool>("direct");
  const studyRunRef = useRef(studyRun);
  studyRunRef.current = studyRun;
  const studyModeRef = useRef<InteractionMode>(studyRun ? INTERACTION_MODES[studyRun.condition].defaultMode : "global");
  const studyModeEnteredAtRef = useRef(performance.now());
  const lastInteractionModeSwitchRef = useRef<{ from: InteractionMode; to: InteractionMode; at: number } | null>(null);
  const blockedActionCooldownRef = useRef<Record<InteractionAction, number>>({ effect: 0, draw: 0, capture: 0 });
  const pinchStateRef = useRef<PinchState>({ pinching: false, okSign: false, point: null });
  const okHoldStartRef = useRef(0);
  const okOriginRef = useRef<{ x: number; y: number } | null>(null);
  const okBlockedUntilReleaseRef = useRef(false);
  const effectAtRef = useRef(-10000);
  const effectCooldownRef = useRef<Record<GestureId, number>>({
    "open-arms": 0, "hands-up": 0, victory: 0, wave: 0, spin: 0, jump: 0,
  });
  const strokesRef = useRef<SkyStroke[]>([]);
  const pointerDrawingRef = useRef(false);
  const pointerMovingRef = useRef(false);
  const handDrawingRef = useRef(false);
  const handPenPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasPlayedRef = useRef(false);
  const sceneTransitionRef = useRef<SceneTransition | null>(null);
  const sceneSwitchCooldownRef = useRef(0);
  const memoriesRef = useRef<JourneyMemory[]>([]);
  const successAtRef = useRef(0);
  const holdStartRef = useRef(0);
  const raisedLostRef = useRef(0);
  const poseLostRef = useRef(0);
  const readyAtRef = useRef(0);
  const lastDetectRef = useRef(0);
  const lastHandDetectRef = useRef(0);
  const victoryCountRef = useRef(0);
  const waveSamplesRef = useRef<[WaveSample[], WaveSample[]]>([[], []]);
  const spinTrackersRef = useRef<[SpinTracker, SpinTracker]>([
    { maxSpan: 0, phase: "front", startedAt: 0 },
    { maxSpan: 0, phase: "front", startedAt: 0 },
  ]);
  const jumpTrackersRef = useRef<[JumpTracker, JumpTracker]>([
    { baselineY: 0, cooldownUntil: 0, lastSeenAt: 0 },
    { baselineY: 0, cooldownUntil: 0, lastSeenAt: 0 },
  ]);
  const gestureLatchRef = useRef<[number, number]>([0, 0]);
  const detectFramesRef = useRef<number[]>([]);
  const countdownStartedRef = useRef(false);
  const captureSourceRef = useRef<"ok-sign" | "space" | "researcher">("ok-sign");
  const timersRef = useRef<number[]>([]);

  const [state, setStateValue] = useState<ExperienceState>("welcome");
  const [mode, setModeValue] = useState<ExperienceMode>("solo");
  const [scene, setSceneValue] = useState<SceneId>("golden-gate");
  const [liveEffect, setLiveEffectValue] = useState<LiveEffect>("skylight");
  const [gesture, setGestureValue] = useState<GestureId>("open-arms");
  const [anchor, setAnchorValue] = useState({ ...SCENES["golden-gate"].anchor });
  const [customName, setCustomNameValue] = useState("My San Francisco Moment");
  const [tool, setToolValue] = useState<InteractionTool>("direct");
  const [studyMode, setInteractionModeValue] = useState<InteractionMode>(
    studyRun ? INTERACTION_MODES[studyRun.condition].defaultMode : "global",
  );
  const [hasPlayed, setHasPlayed] = useState(false);
  const [showPlayHint, setShowPlayHint] = useState(true);
  const [gestureFeedback, setGestureFeedback] = useState<{ id: GestureId; key: number } | null>(null);
  const [sceneTransition, setSceneTransition] = useState<SceneTransition | null>(null);
  const [memories, setMemories] = useState<JourneyMemory[]>([]);
  const [journeyImage, setJourneyImage] = useState("");
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const [debug, setDebug] = useState(DEBUG_DEFAULT);
  const [postcard, setPostcard] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [errorDetail, setErrorDetail] = useState("");
  const [successSub, setSuccessSub] = useState("Energy detected · 检测到互动能量");
  const [metrics, setMetrics] = useState({ count: 0, left: 0, right: 0, leftUp: false, rightUp: false, fps: 0, victory: 0 });

  const logStudy = useCallback((event: InteractionEventInput) => {
    studyRunRef.current?.log({
      ...event,
      currentMode: event.currentMode ?? studyModeRef.current,
      task: event.task ?? studyRunRef.current.task,
    });
  }, []);

  const allowsAction = useCallback((action: InteractionAction) => {
    const run = studyRunRef.current;
    if (run) return allowsInteraction(run.condition, studyModeRef.current, action);
    if (action === "draw") return toolRef.current === "draw";
    return toolRef.current === "direct";
  }, []);

  const noteBlockedAction = useCallback((
    action: InteractionAction,
    gestureId: InteractionEventInput["gestureId"],
    now: number,
  ) => {
    if (!studyRunRef.current || now < blockedActionCooldownRef.current[action]) return;
    blockedActionCooldownRef.current[action] = now + 1800;
    const recognized = gestureId ?? action;
    logStudy({
      eventName: "gesture_recognized",
      gestureId,
      recognizedInput: String(recognized),
      systemConsequence: "ignored_action_not_available_in_current_mode",
      success: false,
    });
    logStudy({
      eventName: "behavioral_mode_error",
      gestureId,
      recognizedInput: String(recognized),
      systemConsequence: "action_attempted_in_unsupported_mode",
      success: false,
      metadata: { attemptedAction: action },
    });
  }, [logStudy]);

  const setState = useCallback((next: ExperienceState) => {
    stateRef.current = next;
    setStateValue(next);
  }, []);

  const setMode = (next: ExperienceMode) => {
    modeRef.current = next;
    setModeValue(next);
  };

  const setScene = useCallback((next: SceneId, preserveFlow = false) => {
    sceneRef.current = next;
    setSceneValue(next);
    const nextAnchor = { ...SCENES[next].anchor };
    anchorRef.current = nextAnchor;
    setAnchorValue(nextAnchor);
    if (!preserveFlow) {
      hasPlayedRef.current = false;
      setHasPlayed(false);
    }
    setShowPlayHint(!preserveFlow);
  }, []);

  const setLiveEffect = (next: LiveEffect) => {
    liveEffectRef.current = next;
    setLiveEffectValue(next);
  };

  const activateEffect = useCallback((next: GestureId, now: number) => {
    if (now < effectCooldownRef.current[next]) return;
    effectCooldownRef.current[next] = now + 1900;
    logStudy({
      eventName: "gesture_recognized",
      gestureId: next,
      sceneId: sceneRef.current,
      recognizedInput: next,
      systemConsequence: "effect_activation_requested",
      success: true,
    });
    gestureRef.current = next;
    effectAtRef.current = now;
    setGestureValue(next);
    setShowPlayHint(false);
    if (!hasPlayedRef.current) {
      hasPlayedRef.current = true;
      setHasPlayed(true);
    }
    setGestureFeedback({ id: next, key: Math.round(now) });
    logStudy({
      eventName: "effect_activated",
      gestureId: next,
      sceneId: sceneRef.current,
      recognizedInput: next,
      systemConsequence: `effect_${next}_rendered`,
      success: true,
    });
  }, [logStudy]);

  const startSceneTransition = useCallback((direction: -1 | 1, now: number) => {
    if (sceneTransitionRef.current || now < sceneSwitchCooldownRef.current) return;
    const currentIndex = SCENE_ORDER.indexOf(sceneRef.current);
    const next = SCENE_ORDER[(currentIndex + direction + SCENE_ORDER.length) % SCENE_ORDER.length];
    const transition = { from: sceneRef.current, to: next, startedAt: now };
    sceneTransitionRef.current = transition;
    sceneSwitchCooldownRef.current = now + 1200;
    setSceneTransition(transition);
    activateEffect("wave", now);
    timersRef.current.push(window.setTimeout(() => setScene(next, true), 650));
    timersRef.current.push(window.setTimeout(() => {
      sceneTransitionRef.current = null;
      setSceneTransition(null);
    }, 1750));
  }, [activateEffect, setScene]);

  const setTool = (next: InteractionTool) => {
    toolRef.current = next;
    setToolValue(next);
    okHoldStartRef.current = 0;
    okOriginRef.current = null;
    okBlockedUntilReleaseRef.current = false;
    handDrawingRef.current = false;
    handPenPointRef.current = null;
    pointerDrawingRef.current = false;
    pointerMovingRef.current = false;
  };

  const setStudyInteractionMode = useCallback((next: InteractionMode, source = "participant_toolbar") => {
    const run = studyRunRef.current;
    if (!run || studyModeRef.current === next) return;
    const previous = studyModeRef.current;
    const now = performance.now();
    const dwellMs = Math.round(now - studyModeEnteredAtRef.current);
    const priorSwitch = lastInteractionModeSwitchRef.current;
    studyModeRef.current = next;
    studyModeEnteredAtRef.current = now;
    lastInteractionModeSwitchRef.current = { from: previous, to: next, at: now };
    setInteractionModeValue(next);
    toolRef.current = next === "draw" || next === "create" ? "draw" : "direct";
    setToolValue(toolRef.current);
    okHoldStartRef.current = 0;
    okOriginRef.current = null;
    okBlockedUntilReleaseRef.current = false;
    handDrawingRef.current = false;
    handPenPointRef.current = null;
    pointerDrawingRef.current = false;
    pointerMovingRef.current = false;
    logStudy({
      eventName: "mode_exited",
      currentMode: previous,
      previousMode: previous,
      systemConsequence: `switch_to_${next}`,
      metadata: { source, modeDwellMs: dwellMs },
    });
    logStudy({
      eventName: "mode_entered",
      currentMode: next,
      previousMode: previous,
      systemConsequence: `mode_${next}_active`,
      metadata: { source },
    });
    if (priorSwitch && priorSwitch.from === next && priorSwitch.to === previous && now - priorSwitch.at <= 1800) {
      logStudy({
        eventName: "mode_switch_reversal",
        currentMode: next,
        previousMode: previous,
        systemConsequence: "returned_to_previous_mode_within_1800ms",
        metadata: { source, reversalWindowMs: Math.round(now - priorSwitch.at) },
      });
    }
    const expectedAction: InteractionAction = run.task === "play" ? "effect" : run.task === "create" ? "draw" : "capture";
    if (!allowsInteraction(run.condition, next, expectedAction)) {
      logStudy({
        eventName: "incorrect_mode_entry",
        currentMode: next,
        previousMode: previous,
        systemConsequence: `mode_does_not_support_${expectedAction}_task`,
        success: false,
        metadata: { expectedAction, source },
      });
    }
  }, [logStudy]);

  useEffect(() => {
    if (!studyRun) return;
    const next = INTERACTION_MODES[studyRun.condition].defaultMode;
    studyModeRef.current = next;
    studyModeEnteredAtRef.current = performance.now();
    lastInteractionModeSwitchRef.current = null;
    setInteractionModeValue(next);
    toolRef.current = next === "draw" || next === "create" ? "draw" : "direct";
    setToolValue(toolRef.current);
    blockedActionCooldownRef.current = { effect: 0, draw: 0, capture: 0 };
  }, [studyRun?.condition]);

  useEffect(() => {
    if (studyRun && stateRef.current === "welcome") setState("sceneSelect");
  }, [setState, studyRun]);

  const setCustomName = (next: string) => {
    customNameRef.current = next;
    setCustomNameValue(next);
  };

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  const reset = useCallback(() => {
    clearTimers();
    particlesRef.current.length = 0;
    posesRef.current = [];
    successAtRef.current = 0;
    holdStartRef.current = 0;
    raisedLostRef.current = 0;
    readyAtRef.current = 0;
    countdownStartedRef.current = false;
    victoryCountRef.current = 0;
    waveSamplesRef.current.forEach((samples) => { samples.length = 0; });
    spinTrackersRef.current = [
      { maxSpan: 0, phase: "front", startedAt: 0 },
      { maxSpan: 0, phase: "front", startedAt: 0 },
    ];
    jumpTrackersRef.current = [
      { baselineY: 0, cooldownUntil: 0, lastSeenAt: 0 },
      { baselineY: 0, cooldownUntil: 0, lastSeenAt: 0 },
    ];
    gestureLatchRef.current = [0, 0];
    pinchStateRef.current = { pinching: false, okSign: false, point: null };
    okHoldStartRef.current = 0;
    okOriginRef.current = null;
    okBlockedUntilReleaseRef.current = false;
    handPenPointRef.current = null;
    pointerDrawingRef.current = false;
    pointerMovingRef.current = false;
    const defaultInteractionMode = studyRunRef.current
      ? INTERACTION_MODES[studyRunRef.current.condition].defaultMode
      : "global";
    studyModeRef.current = defaultInteractionMode;
    setInteractionModeValue(defaultInteractionMode);
    toolRef.current = defaultInteractionMode === "draw" || defaultInteractionMode === "create" ? "draw" : "direct";
    setToolValue(toolRef.current);
    hasPlayedRef.current = false;
    setHasPlayed(false);
    setGestureFeedback(null);
    setShowPlayHint(true);
    sceneTransitionRef.current = null;
    sceneSwitchCooldownRef.current = 0;
    setSceneTransition(null);
    setSuccessSub("Moment locked · 已锁定这一刻");
    progressRef.current = 0;
    setProgress(0);
    setPostcard("");
    setCountdown(null);
    setState(streamRef.current ? "waiting" : "welcome");
  }, [setState]);

  const startCountdown = useCallback(() => {
    if (countdownStartedRef.current) return;
    countdownStartedRef.current = true;
    setState("countdown");
    [3, 2, 1].forEach((n, i) => {
      timersRef.current.push(window.setTimeout(() => setCountdown(n), i * 850));
    });
    timersRef.current.push(window.setTimeout(async () => {
      setCountdown(null);
      if (canvasRef.current) {
        const card = createPostcard(canvasRef.current, {
          mode: modeRef.current,
          scene: sceneRef.current,
          gesture: gestureRef.current,
          customName: customNameRef.current,
        });
        setPostcard(card);
        const sceneName = sceneRef.current === "live" && customNameRef.current.trim()
          ? customNameRef.current.trim()
          : SCENES[sceneRef.current].name;
        const memory = { image: card, sceneId: sceneRef.current, sceneName };
        const nextMemories = [...memoriesRef.current.filter((item) => item.sceneId !== memory.sceneId), memory].slice(-4);
        memoriesRef.current = nextMemories;
        setMemories(nextMemories);
        if (nextMemories.length === 4) {
          try { setJourneyImage(await createJourneyGrid(nextMemories)); } catch { setJourneyImage(""); }
        }
      }
      logStudy({
        eventName: "capture_completed",
        gestureId: captureSourceRef.current === "researcher" ? undefined : captureSourceRef.current,
        sceneId: sceneRef.current,
        systemConsequence: "memory_card_generated",
        success: true,
      });
      setState("result");
    }, 2700));
  }, [logStudy, setState]);

  const triggerSuccess = useCallback((source: "ok-sign" | "space" | "researcher" = "ok-sign") => {
    if (successAtRef.current) return;
    captureSourceRef.current = source;
    logStudy({
      eventName: "capture_triggered",
      gestureId: source === "researcher" ? undefined : source,
      sceneId: sceneRef.current,
      recognizedInput: source,
      systemConsequence: "capture_countdown_started",
      success: true,
    });
    successAtRef.current = performance.now();
    progressRef.current = 1; setProgress(1);
    setState("success");
    playSuccessChime();
    setSuccessSub("Moment locked · 已锁定这一刻");
    timersRef.current.push(window.setTimeout(() => setSuccessSub("Preparing your memory... · 正在准备旅行记忆……"), 500));
    timersRef.current.push(window.setTimeout(startCountdown, 1050));
  }, [logStudy, setState, startCountdown]);

  const startCamera = useCallback(async () => {
    if (streamRef.current?.active) {
      setState("waiting");
      return;
    }
    setState("permission");
    setErrorDetail("");
    logStudy({
      eventName: "camera_requested",
      sceneId: sceneRef.current,
      systemConsequence: "browser_permission_prompt_requested",
    });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("waiting");
      logStudy({
        eventName: "camera_ready",
        sceneId: sceneRef.current,
        systemConsequence: "camera_stream_active",
        success: true,
      });
      createPoseDetector().then((detector) => { detectorRef.current = detector; }).catch((error) => {
        setErrorDetail(`Pose model unavailable: ${String(error)}`);
      });
      createHandGestureDetector().then((detector) => { handDetectorRef.current = detector; }).catch(() => {
        // 手部模型不可用时，其他四种姿态手势仍可正常演示。
      });
    } catch (error) {
      setErrorDetail(error instanceof Error ? error.message : String(error));
      setState("cameraError");
      logStudy({
        eventName: "camera_error",
        sceneId: sceneRef.current,
        systemConsequence: "camera_stream_unavailable",
        success: false,
        notes: error instanceof Error ? error.message : String(error),
      });
    }
  }, [logStudy, setState]);

  useEffect(() => {
    let active = true;
    const loop = (now: number) => {
      if (!active) return;
      const canvas = canvasRef.current, video = videoRef.current;
      if (canvas && video) {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
        const width = Math.round(innerWidth * dpr), height = Math.round(innerHeight * dpr);
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }

        if (detectorRef.current && video.readyState >= 2 && now - lastDetectRef.current >= 1000 / CONFIG.detectionFps && !successAtRef.current) {
          lastDetectRef.current = now;
          try {
            const result = detectorRef.current.detectForVideo(video, now);
            if (result.landmarks.length) {
              posesRef.current = sortPosesForScreen(result.landmarks as Pose[]);
              poseLostRef.current = now;
            } else if (now - poseLostRef.current > CONFIG.poseLostGrace) posesRef.current = [];
            detectFramesRef.current.push(now);
            while (detectFramesRef.current[0] < now - 1000) detectFramesRef.current.shift();
          } catch { /* 单帧检测错误不会打断体验。 */ }
        }
        if (handDetectorRef.current && video.readyState >= 2 && now - lastHandDetectRef.current >= 70 && !successAtRef.current) {
          lastHandDetectRef.current = now;
          try {
            const handResult = handDetectorRef.current.recognizeForVideo(video, now);
            victoryCountRef.current = countVictoryGestures(handResult);
            const pinch = getPinchState(handResult);
            pinchStateRef.current = pinch;
            if (pinch.pinching && pinch.point) {
              if (allowsAction("draw")) {
                if (!handDrawingRef.current) {
                  strokesRef.current.push({ points: [], color: "#ffd978" });
                  handDrawingRef.current = true;
                  handPenPointRef.current = pinch.point;
                  logStudy({
                    eventName: "draw_started",
                    gestureId: "pinch",
                    sceneId: sceneRef.current,
                    recognizedInput: "pinch",
                    systemConsequence: "persistent_trace_started",
                    success: true,
                    metadata: { inputSource: "hand" },
                  });
                }
                const stroke = strokesRef.current[strokesRef.current.length - 1];
                const previous = handPenPointRef.current ?? pinch.point;
                const smoothed = {
                  x: previous.x * .48 + pinch.point.x * .52,
                  y: previous.y * .48 + pinch.point.y * .52,
                };
                appendStrokePoint(stroke, smoothed, .0038);
                handPenPointRef.current = smoothed;
              } else if (!studyRunRef.current && toolRef.current === "direct") {
                const next = {
                  x: Math.max(.07, Math.min(.93, pinch.point.x)),
                  y: Math.max(.07, Math.min(.8, pinch.point.y)),
                };
                anchorRef.current = next; setAnchorValue(next);
                if (!hasPlayedRef.current) {
                  hasPlayedRef.current = true;
                  setHasPlayed(true);
                  setShowPlayHint(false);
                }
              } else if (!pinch.okSign) {
                noteBlockedAction("draw", "pinch", now);
              }
            } else {
              if (handDrawingRef.current) {
                const stroke = strokesRef.current[strokesRef.current.length - 1];
                logStudy({
                  eventName: "draw_ended",
                  gestureId: "pinch",
                  sceneId: sceneRef.current,
                  recognizedInput: "pinch_release",
                  systemConsequence: "persistent_trace_finished",
                  success: true,
                  metadata: { inputSource: "hand", pointCount: stroke?.points.length ?? 0 },
                });
              }
              handDrawingRef.current = false;
              handPenPointRef.current = null;
            }
          } catch {
            victoryCountRef.current = 0;
            pinchStateRef.current = { pinching: false, okSign: false, point: null };
          }
        }

        const detectedPoses = posesRef.current;
        const poses = modeRef.current === "solo"
          ? [...detectedPoses].sort((a, b) => Math.abs(screenCenterX(a) - .5) - Math.abs(screenCenterX(b) - .5)).slice(0, 1)
          : detectedPoses;
        const leftX = poses[0] ? screenCenterX(poses[0]) : 0;
        const rightX = poses[1] ? screenCenterX(poses[1]) : 0;
        const leftUp = isHandsRaised(poses[0]), rightUp = isHandsRaised(poses[1]);
        const isSolo = modeRef.current === "solo";
        const placed = isSolo
          ? poses.length >= 1 && leftX > SOLO_STANDING_ZONE.minX && leftX < SOLO_STANDING_ZONE.maxX
          : poses.length >= 2
            && leftX > STANDING_ZONES.left.minX && leftX < STANDING_ZONES.left.maxX
            && rightX > STANDING_ZONES.right.minX && rightX < STANDING_ZONES.right.maxX;
        const peopleNeeded = isSolo ? 1 : 2;
        let waveDetected = false, spinDetected = false, jumpDetected = false;
        if (placed) {
          poses.slice(0, peopleNeeded).forEach((pose, index) => {
            waveDetected = detectWave(pose, now, waveSamplesRef.current[index]) || waveDetected;
            spinDetected = detectSpin(pose, now, spinTrackersRef.current[index]) || spinDetected;
            jumpDetected = detectJump(pose, now, jumpTrackersRef.current[index]) || jumpDetected;
          });
        }

        if (!successAtRef.current && !["welcome", "sceneSelect", "permission", "cameraError"].includes(stateRef.current)) {
          if (poses.length === 0) { readyAtRef.current = 0; setState("waiting"); }
          else if (!isSolo && poses.length === 1) { readyAtRef.current = 0; setState("solo"); }
          else if (!placed) { readyAtRef.current = 0; setState("positioning"); }
          else {
            if (!readyAtRef.current) readyAtRef.current = now;
            if (now - readyAtRef.current < 500) setState("ready");
            else {
              setState("play");
              if (!sceneTransitionRef.current) {
                const detectedEffect: GestureId | null =
                  victoryCountRef.current > 0 ? "victory"
                    : waveDetected ? "wave"
                      : jumpDetected ? "jump"
                        : spinDetected ? "spin"
                          : poses.slice(0, peopleNeeded).some((pose) => isOpenArms(pose)) ? "open-arms"
                            : poses.slice(0, peopleNeeded).some((pose) => isHandsRaised(pose)) ? "hands-up"
                              : null;
                if (detectedEffect) {
                  if (allowsAction("effect")) activateEffect(detectedEffect, now);
                  else noteBlockedAction("effect", detectedEffect, now);
                }

                const pinch = pinchStateRef.current;
                if (allowsAction("capture")) {
                  if (!pinch.pinching) {
                    if (okHoldStartRef.current) {
                      logStudy({
                        eventName: "capture_cancelled",
                        gestureId: "ok-sign",
                        sceneId: sceneRef.current,
                        recognizedInput: "ok_released_before_hold_threshold",
                        systemConsequence: "capture_not_started",
                        success: false,
                      });
                    }
                    okBlockedUntilReleaseRef.current = false;
                    okHoldStartRef.current = 0;
                    okOriginRef.current = null;
                  } else if (
                    pinch.okSign
                    && pinch.point
                    && !okBlockedUntilReleaseRef.current
                  ) {
                    if (!okHoldStartRef.current || !okOriginRef.current) {
                      okHoldStartRef.current = now;
                      okOriginRef.current = { ...pinch.point };
                      logStudy({
                        eventName: "capture_armed",
                        gestureId: "ok-sign",
                        sceneId: sceneRef.current,
                        recognizedInput: "ok_sign_stable_hold_started",
                        systemConsequence: "capture_hold_timer_started",
                      });
                    } else if (
                      Math.hypot(pinch.point.x - okOriginRef.current.x, pinch.point.y - okOriginRef.current.y)
                      > CONFIG.okMotionTolerance
                    ) {
                      // A moving pinch is a drawing/drag action. Require a full
                      // release before the next OK sign can arm capture.
                      okBlockedUntilReleaseRef.current = true;
                      okHoldStartRef.current = 0;
                      okOriginRef.current = null;
                      logStudy({
                        eventName: "capture_cancelled",
                        gestureId: "ok-sign",
                        sceneId: sceneRef.current,
                        recognizedInput: "ok_sign_moved_beyond_tolerance",
                        systemConsequence: "capture_hold_timer_cancelled",
                        success: false,
                      });
                    } else if (now - okHoldStartRef.current >= CONFIG.okHoldDuration) {
                      triggerSuccess("ok-sign");
                    }
                  } else {
                    okHoldStartRef.current = 0;
                    okOriginRef.current = null;
                  }
                } else {
                  if (pinch.okSign) noteBlockedAction("capture", "ok-sign", now);
                  okHoldStartRef.current = 0;
                  okOriginRef.current = null;
                  okBlockedUntilReleaseRef.current = false;
                }
              } else {
                okHoldStartRef.current = 0;
                okOriginRef.current = null;
              }
            }
          }
        }

        renderScene({
          canvas, video, poses, progress: progressRef.current,
          elapsedSuccess: successAtRef.current ? now - successAtRef.current : 0,
          successLocked: !!successAtRef.current, particles: particlesRef.current, debug: debugRef.current,
          mode: modeRef.current,
          scene: sceneRef.current,
          liveEffect: liveEffectRef.current,
          anchor: anchorRef.current,
          gesture: gestureRef.current,
          playEffectElapsed: now - effectAtRef.current,
          strokes: strokesRef.current,
          sceneTransitionElapsed: sceneTransitionRef.current ? now - sceneTransitionRef.current.startedAt : -1,
          frameTime: now,
        });
        if (debugRef.current && Math.floor(now / 180) !== Math.floor((now - 16) / 180)) {
          setMetrics({ count: poses.length, left: leftX, right: rightX, leftUp, rightUp, fps: detectFramesRef.current.length, victory: victoryCountRef.current });
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      active = false; cancelAnimationFrame(rafRef.current); clearTimers();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      detectorRef.current?.close();
      handDetectorRef.current?.close();
    };
  }, [activateEffect, allowsAction, logStudy, noteBlockedAction, setState, triggerSuccess]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
        && stateRef.current === "play"
        && !successAtRef.current
      ) {
        event.preventDefault();
        startSceneTransition(event.key === "ArrowLeft" ? -1 : 1, performance.now());
      } else if (
        (event.code === "Space" || event.key === " ")
        && stateRef.current === "play"
        && !successAtRef.current
      ) {
        event.preventDefault();
        if (allowsAction("capture")) triggerSuccess("space");
        else noteBlockedAction("capture", "space", performance.now());
      } else if (event.key.toLowerCase() === "d") {
        debugRef.current = !debugRef.current; setDebug(debugRef.current);
      } else if (event.key.toLowerCase() === "s") triggerSuccess("researcher");
      else if (event.key.toLowerCase() === "r") reset();
      else if (event.key.toLowerCase() === "f") document.documentElement.requestFullscreen?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowsAction, noteBlockedAction, reset, startSceneTransition, triggerSuccess]);

  const sceneInfo = SCENES[scene];
  const baseCopy = getStateCopy(state, mode);
  const gestureInfo = GESTURES[gesture];
  const copy = state === "challenge"
    ? {
        eyebrow: gestureInfo.instruction,
        title: `${gestureInfo.name} to awaken ${scene === "live" ? "this place" : sceneInfo.name}.`,
        zh: gestureInfo.instructionZh,
      }
    : baseCopy;
  const chooseEntry = (next: "sf" | "live") => {
    setScene(next === "live" ? "live" : "golden-gate");
    setState("sceneSelect");
  };
  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(.08, Math.min(.92, (event.clientX - rect.left) / rect.width)),
      y: Math.max(.08, Math.min(.76, (event.clientY - rect.top) / rect.height)),
    };
  };
  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (successAtRef.current || ["welcome", "sceneSelect", "result"].includes(stateRef.current)) return;
    const point = canvasPoint(event);
    if (allowsAction("draw")) {
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerDrawingRef.current = true;
      strokesRef.current.push({ points: [point], color: "#ffd978" });
      logStudy({
        eventName: "draw_started",
        gestureId: "pinch",
        sceneId: sceneRef.current,
        recognizedInput: "pointer_down",
        systemConsequence: "persistent_trace_started",
        success: true,
        metadata: { inputSource: "pointer" },
      });
    } else if (!studyRunRef.current && toolRef.current === "direct") {
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerMovingRef.current = true;
      anchorRef.current = point;
      setAnchorValue(point);
      if (!hasPlayedRef.current) {
        hasPlayedRef.current = true;
        setHasPlayed(true);
        setShowPlayHint(false);
      }
    }
  };
  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerMovingRef.current && !studyRunRef.current && toolRef.current === "direct") {
      const point = canvasPoint(event);
      anchorRef.current = point;
      setAnchorValue(point);
      return;
    }
    if (pointerDrawingRef.current && allowsAction("draw")) {
      const stroke = strokesRef.current[strokesRef.current.length - 1];
      if (stroke) appendStrokePoint(stroke, canvasPoint(event), .0025);
    }
  };
  const handleCanvasPointerUp = () => {
    if (pointerDrawingRef.current) {
      const stroke = strokesRef.current[strokesRef.current.length - 1];
      logStudy({
        eventName: "draw_ended",
        gestureId: "pinch",
        sceneId: sceneRef.current,
        recognizedInput: "pointer_up",
        systemConsequence: "persistent_trace_finished",
        success: true,
        metadata: { inputSource: "pointer", pointCount: stroke?.points.length ?? 0 },
      });
    }
    pointerDrawingRef.current = false;
    pointerMovingRef.current = false;
  };
  const clearCanvasContent = () => {
    strokesRef.current = [];
    particlesRef.current = [];
    effectAtRef.current = -10000;
    setGestureFeedback(null);
    logStudy({
      eventName: "content_cleared",
      sceneId: sceneRef.current,
      systemConsequence: "persistent_trace_and_effects_removed",
      success: true,
    });
  };
  const returnToScenes = () => {
    reset();
    setState("sceneSelect");
  };
  const newJourney = () => {
    memoriesRef.current = [];
    setMemories([]);
    setJourneyImage("");
    returnToScenes();
  };
  const studyDefinition = studyRun ? INTERACTION_MODES[studyRun.condition] : null;
  const drawAvailable = studyRun
    ? allowsInteraction(studyRun.condition, studyMode, "draw")
    : tool === "draw";
  const captureAvailable = studyRun
    ? allowsInteraction(studyRun.condition, studyMode, "capture")
    : tool === "direct";
  return (
    <main className={`experience state-${state} active-scene-${scene} ${studyRun ? "study-experience" : ""}`}>
      <video ref={videoRef} className="camera-source" playsInline muted />
      <canvas
        ref={canvasRef}
        className={`ar-canvas ${drawAvailable ? "draw-enabled" : studyRun ? "study-locked" : "anchor-enabled"}`}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
      />
      <div className="atmosphere" />

      {state === "welcome" && (
        <section className="welcome-panel">
          <div className="logo-orbit"><span>L</span></div>
          <p className="kicker">AN INTERACTIVE CITY MOMENT</p>
          <h1>Lumo <i>旅光</i></h1>
          <p className="hero-line">{copy.title}</p>
          <p className="zh">{copy.zh}</p>
          <div className="entry-grid">
            <button className="entry-card sf-entry" onClick={() => chooseEntry("sf")}>
              <i>01 · CITY COLLECTION</i>
              <span>Explore San Francisco<small>探索旧金山光影场景</small></span>
              <b>Golden Gate · Cable Car · Palace</b><em>↗</em>
            </button>
            <button className="entry-card live-entry" onClick={() => chooseEntry("live")}>
              <i>02 · YOUR PLACE</i>
              <span>Live Scene Studio<small>为任意实景添加 AR 特效</small></span>
              <b>Skylight · Aurora · Fireflies</b><em>＋</em>
            </button>
          </div>
          <p className="intro-note">Choose a city story or awaken the place in front of you</p>
        </section>
      )}

      {state === "sceneSelect" && (
        <section className="scene-select-panel">
          <div className="scene-select-head">
            <button className="back-button" onClick={() => setState("welcome")}>← <span>Back</span></button>
            <div><p className="kicker">CHOOSE YOUR AR MOMENT</p><h2>{copy.title}</h2><small>{copy.zh}</small></div>
            <div className="mini-brand">Lumo <span>{memories.length}/4 MOMENTS</span></div>
          </div>
          {memories.length > 0 && (
            <div className="journey-progress">
              <b>YOUR LIGHT TRAIL</b>
              {[0, 1, 2, 3].map((index) => (
                <span key={index} className={memories[index] ? "filled" : ""}>
                  {memories[index] ? memories[index].sceneName : `Moment 0${index + 1}`}
                </span>
              ))}
              <button onClick={newJourney}>New Journey · 新旅程</button>
            </div>
          )}
          <div className="scene-library">
            {(Object.keys(SCENES) as SceneId[]).map((id, index) => (
              <button key={id} className={`scene-card scene-${id} ${scene === id ? "selected" : ""}`} onClick={() => setScene(id)}>
                <span className="scene-art"><i /><i /><i /></span>
                <span className="scene-number">0{index + 1}</span>
                <strong>{SCENES[id].name}<small>{SCENES[id].zh}</small></strong>
                <p>{SCENES[id].description}</p>
                <b>{scene === id ? "SELECTED" : "SELECT"}</b>
              </button>
            ))}
          </div>
          <div className="scene-controls">
            <div className="mode-picker compact-picker" role="group" aria-label="选择体验人数">
              <button className={mode === "solo" ? "selected" : ""} onClick={() => setMode("solo")}>
                <i>01</i><span>Solo · Half Body<small>单人半身</small></span><b>一人</b>
              </button>
              <button className={mode === "duo" ? "selected" : ""} onClick={() => setMode("duo")}>
                <i>02</i><span>Together · Two People<small>双人同行</small></span><b>两人</b>
              </button>
            </div>
            {scene === "live" && (
              <div className="live-settings">
                <label>SCENE NAME<input value={customName} maxLength={36} onChange={(event) => setCustomName(event.target.value)} placeholder="My skylight" /></label>
                <div className="effect-picker">
                  {([
                    ["skylight", "Skylight Portal", "天窗传送门"],
                    ["aurora", "Aurora Ribbon", "极光丝带"],
                    ["fireflies", "Light Seeds", "萤火光点"],
                  ] as [LiveEffect, string, string][]).map(([id, label, zh]) => (
                    <button key={id} className={liveEffect === id ? "selected" : ""} onClick={() => setLiveEffect(id)}>
                      {label}<small>{zh}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="gesture-guide" aria-label="可用互动动作">
              <p><b>ALL GESTURES ARE LIVE</b><small>键盘 ← / → 切换场景，OK 手势才会拍照</small></p>
              {(Object.keys(GESTURES) as GestureId[]).map((id) => (
                <div key={id}>
                  <i>{gestureIcon(id)}</i>
                  <span>{GESTURES[id].name}<small>{GESTURE_EFFECTS[id]}</small></span>
                </div>
              ))}
            </div>
            <button className="primary scene-start" onClick={startCamera}>
              <span>Enter {scene === "live" ? "Live Scene" : sceneInfo.name}</span><small>进入场景</small><b>↗</b>
            </button>
          </div>
        </section>
      )}

      {!["welcome", "sceneSelect"].includes(state) && (
        <>
          <header>
            <div className="header-left">
              <button className="experience-back" onClick={returnToScenes}>←<small>返回场景</small></button>
              <div className="brand">Lumo <span>旅光</span><small>{scene === "live" && customName.trim() ? customName : sceneInfo.name} · {sceneInfo.city}</small></div>
            </div>
            <div className="status-pill"><i />{copy.title}<small>{copy.zh}</small></div>
          </header>

          {state === "cameraError" ? (
            <section className="camera-error glass">
              <span>CAMERA OFFLINE</span><h2>{copy.title}</h2><p>{copy.zh}</p>
              {errorDetail && <code>{errorDetail}</code>}
              <button className="primary compact" onClick={startCamera}>Try Again <small>重新授权</small></button>
            </section>
          ) : (
            <section className={`center-message ${["success", "countdown"].includes(state) ? "success-message" : ""}`}>
              {copy.eyebrow && <p className="gesture-label">{copy.eyebrow}</p>}
              {state === "success" ? (
                <><h2>MOMENT LOCKED</h2><p>{successSub}</p><small>这一刻已经被光记住。</small></>
              ) : state === "countdown" ? (
                <><p className="capture-copy">{copy.title}<small>{copy.zh}</small></p>{countdown && <strong className="countdown" key={countdown}>{countdown}</strong>}</>
              ) : state === "permission" ? (
                <div className="loader"><i /><p>{copy.title}<small>{copy.zh}</small></p></div>
              ) : state === "play" ? (
                <div className={`play-copy ${showPlayHint ? "" : "dismissed"}`}>
                  <p>{studyRun ? `${studyDefinition?.shortLabel} · ${studyRun.task.toUpperCase()} TASK` : "MOVE TO PLAY · OK / SPACE TO CAPTURE"}</p>
                  <h2>{studyRun ? TASK_COPY[studyRun.task].title : "Make the place respond."}</h2>
                  <small>{studyRun ? TASK_COPY[studyRun.task].zh : "动作随时激活特效；键盘 ← / → 切换场景，稳定比 OK 或按空格进入拍照倒计时。"}</small>
                </div>
              ) : ["ready", "challenge", "holding"].includes(state) ? (
                <><h2>{copy.title}</h2><p>{copy.zh}</p></>
              ) : null}
            </section>
          )}

          {state === "play" && (
            <div className="spatial-toolbar direct-toolbar glass">
              <div className={`mode-switch ${studyDefinition ? `study-modes modes-${studyDefinition.modes.length}` : ""}`} role="group" aria-label="互动模式">
                {studyDefinition ? (
                  studyDefinition.modes.map((modeId) => {
                    const meta = MODE_META[modeId];
                    return studyDefinition.modes.length === 1 ? (
                      <div className="modeless-status" key={modeId}>
                        <i>{meta.icon}</i><span>{meta.label}<small>{meta.note}</small></span>
                      </div>
                    ) : (
                      <button
                        key={modeId}
                        className={studyMode === modeId ? "selected" : ""}
                        onClick={() => setStudyInteractionMode(modeId)}
                        aria-pressed={studyMode === modeId}
                      >
                        <i>{meta.icon}</i><span>{meta.label}<small>{meta.note}</small></span>
                      </button>
                    );
                  })
                ) : (
                  <>
                    <button
                      className={tool === "direct" ? "selected" : ""}
                      onClick={() => setTool("direct")}
                      aria-pressed={tool === "direct"}
                    >
                      <i>▶</i><span>PLAY<small>全部手势 · OK 拍照</small></span>
                    </button>
                    <button
                      className={tool === "draw" ? "selected" : ""}
                      onClick={() => setTool("draw")}
                      aria-pressed={tool === "draw"}
                    >
                      <i>✎</i><span>SKY PEN<small>绘制内容持续保留</small></span>
                    </button>
                  </>
                )}
              </div>
              <button className="clear-content" onClick={clearCanvasContent} title="清除笔迹并立即收起当前特效">
                <i>×</i><span>CLEAR<small>清除全部</small></span>
              </button>
              <div className={`ok-capture ${captureAvailable ? "" : "capture-paused"}`}>
                <i>OK</i>
                {captureAvailable ? (
                  <>
                    <span>Hold OK or press Space<small>稳定约 0.9 秒后开始倒计时</small></span>
                    <kbd>SPACE</kbd>
                  </>
                ) : (
                  <span>Capture is unavailable here<small>当前显式状态不接受拍照动作</small></span>
                )}
              </div>
            </div>
          )}

          {state === "play" && !studyRun && tool === "direct" && (
            <div className="anchor-hint">
              <i style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }} />
              {!hasPlayed && <span>Drag or pinch the glowing point — no mode needed<small>直接拖动或捏合光点，不需要选择模式</small></span>}
            </div>
          )}
          {state === "play" && drawAvailable && (
            <div className="draw-hint">Pinch or drag to draw<small>笔迹持续保留，直到点击 CLEAR</small></div>
          )}

          {state === "play" && gestureFeedback && (gestureFeedback.id !== "wave" || !sceneTransition) && (
            <div className="gesture-feedback" key={gestureFeedback.key}>
              <i>{gestureIcon(gestureFeedback.id)}</i>
              <span><b>{GESTURES[gestureFeedback.id].name} detected</b><small>{GESTURE_EFFECTS[gestureFeedback.id]}</small></span>
            </div>
          )}

          {sceneTransition && (
            <div className="scene-switch-copy" aria-live="polite">
              <small>KEYBOARD SCENE SWITCH · ← / →</small>
              <strong>{SCENES[sceneTransition.to].name}</strong>
              <span>{SCENES[sceneTransition.to].zh} · 方向键换景</span>
            </div>
          )}

          {debug && (
            <aside className="debug-panel">
              <b>LIVE CALIBRATION</b>
              <span>STATE <em>{state}</em></span><span>POSES <em>{metrics.count}</em></span>
              <span>LEFT X <em>{metrics.left.toFixed(3)}</em></span><span>RIGHT X <em>{metrics.right.toFixed(3)}</em></span>
              <span>HANDS <em>{String(metrics.leftUp)} / {String(metrics.rightUp)}</em></span>
              <span>HOLD <em>{Math.round(progress * 100)}%</em></span><span>MODEL FPS <em>{metrics.fps}</em></span>
              <span>EFFECT <em>{gesture}</em></span><span>V SIGNS <em>{metrics.victory}</em></span>
              <small>D debug · S success · R reset · F fullscreen</small>
            </aside>
          )}
        </>
      )}

      {state === "result" && postcard && (
        <section className="result-overlay">
          <div className="result-shell">
            <div className={`card-preview ${journeyImage ? "journey-preview" : ""}`}>
              <img src={journeyImage || postcard} alt={journeyImage ? "Lumo four-scene journey grid" : `Lumo ${sceneInfo.name} memory card`} />
            </div>
            <div className="result-copy">
              <p className="kicker">YOUR LIGHT TRAIL · {memories.length}/4</p>
              <h2>{journeyImage ? <>Four places.<br />One journey.</> : <>Your moment<br />is ready.</>}</h2>
              <p className="zh">{journeyImage ? "四个场景已经汇成一张 Lumo 四宫格。" : mode === "solo" ? "属于你的旅行瞬间已经生成。" : "属于你们的旅行瞬间已经生成。"}</p>
              <div className="result-rule" />
              <p className="place">{scene === "live" && customName.trim() ? customName : sceneInfo.name}<small>{sceneInfo.city}</small></p>
              <div className="actions">
                {journeyImage ? (
                  <a className="primary" href={journeyImage} download="lumo-san-francisco-journey-grid.png"><span>Download 4-Grid</span><small>导出四宫格</small><b>↓</b></a>
                ) : (
                  <button className="primary" onClick={returnToScenes}><span>Next Place</span><small>继续打卡下一个场景</small><b>↗</b></button>
                )}
                <a className="secondary download-link" href={postcard} download={`lumo-${scene}-memory.png`}>This Memory <small>单张纪念卡</small></a>
                <button className="secondary" onClick={reset}>Try Again <small>再次体验</small></button>
                <button className="mode-link" onClick={returnToScenes}>← Back to Scenes <small>返回场景</small></button>
                {journeyImage && <button className="mode-link" onClick={newJourney}>New Journey <small>重新开始四宫格</small></button>}
              </div>
              <p className="result-tagline">Move. Connect. Light up the place.</p>
            </div>
          </div>
        </section>
      )}

      <button className="fullscreen" aria-label="进入全屏" onClick={() => document.documentElement.requestFullscreen?.()}>⛶</button>
    </main>
  );
}
