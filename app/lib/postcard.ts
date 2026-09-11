import { GESTURES, SCENES, type GestureId, type SceneId } from "./config";
import type { ExperienceMode } from "./stateMachine";

export function createPostcard(
  source: HTMLCanvasElement,
  options: { mode: ExperienceMode; scene: SceneId; gesture: GestureId; customName?: string },
) {
  const { mode, scene, gesture, customName } = options;
  const sceneInfo = SCENES[scene];
  const title = scene === "live" && customName?.trim() ? customName.trim() : sceneInfo.name;
  const card = document.createElement("canvas");
  card.width = 1080;
  card.height = 1350;
  const ctx = card.getContext("2d")!;
  const photoH = 855;
  ctx.fillStyle = "#f7f6f1";
  ctx.fillRect(0, 0, card.width, card.height);

  const srcRatio = source.width / source.height;
  const targetRatio = card.width / photoH;
  let sx = 0, sy = 0, sw = source.width, sh = source.height;
  if (srcRatio > targetRatio) {
    sw = source.height * targetRatio;
    sx = (source.width - sw) / 2;
  } else {
    sh = source.width / targetRatio;
    sy = (source.height - sh) / 2;
  }
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, card.width, photoH);
  const vignette = ctx.createLinearGradient(0, 580, 0, photoH);
  vignette.addColorStop(0, "transparent");
  vignette.addColorStop(1, "rgba(7,20,33,.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, card.width, photoH);

  ctx.fillStyle = "#071421";
  ctx.font = "700 34px Arial";
  ctx.fillText("LUMO  旅光", 72, 930);
  ctx.fillStyle = "#e95a3f";
  ctx.fillRect(72, 964, 82, 5);
  ctx.fillStyle = "#071421";
  ctx.font = `700 ${title.length > 24 ? 42 : 52}px Georgia`;
  ctx.fillText(title.slice(0, 36), 72, 1044);
  ctx.font = "500 25px Arial";
  ctx.fillStyle = "#52606b";
  ctx.fillText(sceneInfo.city, 72, 1088);
  ctx.textAlign = "right";
  ctx.fillText(new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date()), 1008, 1088);
  ctx.textAlign = "left";
  ctx.font = "26px Georgia";
  ctx.fillStyle = "#071421";
  const englishMemory = scene === "live"
    ? mode === "solo" ? "I found the light hidden in this place." : "We found the light hidden in this place."
    : mode === "solo" ? "I didn’t just visit this place. I brought it to light." : "We didn’t just visit this place. We unlocked it together.";
  ctx.fillText(englishMemory, 72, 1160);
  ctx.font = "25px Arial";
  const chineseMemory = scene === "live"
    ? mode === "solo" ? "我发现了藏在这里的光。" : "我们发现了藏在这里的光。"
    : mode === "solo" ? "我不只是来过，也让这里亮了起来。" : "我们不只是来过，而是一起唤醒了这里。";
  ctx.fillText(chineseMemory, 72, 1205);
  ctx.font = "700 21px Arial";
  ctx.fillStyle = "#b2543f";
  ctx.fillText("MOVE. CONNECT. LIGHT UP THE PLACE.", 72, 1282);
  ctx.textAlign = "right";
  ctx.fillStyle = "#52606b";
  ctx.font = "700 18px Arial";
  ctx.fillText(`${GESTURES[gesture].name.toUpperCase()} · ${GESTURES[gesture].zh}`, 1008, 1282);
  return card.toDataURL("image/png");
}
