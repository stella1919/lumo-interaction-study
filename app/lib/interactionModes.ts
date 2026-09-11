import type { GestureId, SceneId } from "./config";

export type InteractionCondition = "M" | "A" | "C";
export type InteractionAction = "effect" | "draw" | "capture";
export type InteractionMode = "global" | "play" | "create" | "effect" | "draw" | "capture";
export type InteractionTask = "play" | "create" | "capture";

export interface InteractionEventInput {
  eventName: string;
  task?: InteractionTask;
  currentMode?: InteractionMode;
  previousMode?: InteractionMode | null;
  gestureId?: GestureId | "ok-sign" | "pinch" | "space";
  sceneId?: SceneId;
  recognizedInput?: string | null;
  systemConsequence?: string | null;
  success?: boolean | null;
  metadata?: Record<string, unknown>;
}

export interface InteractionRunContext {
  condition: InteractionCondition;
  task: InteractionTask;
  log: (event: InteractionEventInput) => void;
}

export interface InteractionDefinition {
  id: InteractionCondition;
  label: string;
  shortLabel: string;
  description: string;
  modes: InteractionMode[];
  defaultMode: InteractionMode;
  allowedActions: Record<InteractionMode, InteractionAction[]>;
}

export const INTERACTION_MODES: Record<InteractionCondition, InteractionDefinition> = {
  M: {
    id: "M",
    label: "Flexible interaction",
    shortLabel: "FLEX",
    description: "Effects, drawing, and capture remain available together.",
    modes: ["global"],
    defaultMode: "global",
    allowedActions: { global: ["effect", "draw", "capture"], play: [], create: [], effect: [], draw: [], capture: [] },
  },
  A: {
    id: "A",
    label: "Activity modes",
    shortLabel: "ACTIVITY",
    description: "PLAY groups effects with capture; CREATE contains drawing.",
    modes: ["play", "create"],
    defaultMode: "play",
    allowedActions: { global: [], play: ["effect", "capture"], create: ["draw"], effect: [], draw: [], capture: [] },
  },
  C: {
    id: "C",
    label: "Command modes",
    shortLabel: "COMMAND",
    description: "EFFECT, DRAW, and CAPTURE are explicit interaction modes.",
    modes: ["effect", "draw", "capture"],
    defaultMode: "effect",
    allowedActions: { global: [], play: [], create: [], effect: ["effect"], draw: ["draw"], capture: ["capture"] },
  },
};

export function allowsInteraction(condition: InteractionCondition, mode: InteractionMode, action: InteractionAction) {
  return INTERACTION_MODES[condition].allowedActions[mode]?.includes(action) ?? false;
}
