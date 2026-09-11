import { BRIDGE_TARGET, SOLO_STANDING_ZONE, STANDING_ZONES, type GestureId, type LiveEffect, type SceneId } from "./config";
import { screenCenterX, type Pose } from "./poseDetector";
import type { ExperienceMode } from "./stateMachine";

export type Particle = { x: number; y: number; vx: number; vy: number; life: number; size: number; hue: number };
export type SkyStroke = { points: Array<{ x: number; y: number }>; color: string };
type ScenePalette = {
  primary: string;
  secondary: string;
  tertiary: string;
  primaryRgb: [number, number, number];
  secondaryRgb: [number, number, number];
};

const SCENE_PALETTES: Record<SceneId, ScenePalette> = {
  "golden-gate": {
    primary: "#ffd166", secondary: "#ff503d", tertiary: "#fff0bc",
    primaryRgb: [255, 209, 102], secondaryRgb: [255, 80, 61],
  },
  "cable-car": {
    primary: "#59e8ff", secondary: "#b8ff54", tertiary: "#f0ffff",
    primaryRgb: [89, 232, 255], secondaryRgb: [184, 255, 84],
  },
  palace: {
    primary: "#b89cff", secondary: "#72e7ff", tertiary: "#f3ecff",
    primaryRgb: [184, 156, 255], secondaryRgb: [114, 231, 255],
  },
  live: {
    primary: "#ff5bc7", secondary: "#58ffc5", tertiary: "#fff0fb",
    primaryRgb: [255, 91, 199], secondaryRgb: [88, 255, 197],
  },
};

function rgba(rgb: [number, number, number], alpha: number) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

export function normalizedToCanvas(point: { x: number; y: number }, canvas: HTMLCanvasElement) {
  return { x: canvas.width * (1 - point.x), y: canvas.height * point.y };
}

function drawMirroredCamera(ctx: CanvasRenderingContext2D, video: HTMLVideoElement) {
  const canvas = ctx.canvas;
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  const vr = video.videoWidth / video.videoHeight;
  const cr = canvas.width / canvas.height;
  let sw = video.videoWidth, sh = video.videoHeight, sx = 0, sy = 0;
  if (vr > cr) {
    sw = video.videoHeight * cr;
    sx = (video.videoWidth - sw) / 2;
  } else {
    sh = video.videoWidth / cr;
    sy = (video.videoHeight - sh) / 2;
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

export function seedParticles(store: Particle[], x: number, y: number, count = 3) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    store.push({
      x, y, vx: Math.cos(a) * (0.4 + Math.random() * 1.4),
      vy: Math.sin(a) * (0.4 + Math.random() * 1.4) - 0.5,
      life: 1, size: 1.5 + Math.random() * 3, hue: 42 + Math.random() * 12,
    });
  }
  if (store.length > 320) store.splice(0, store.length - 320);
}

function glowDot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.2);
  g.addColorStop(0, `rgba(255,249,198,${alpha})`);
  g.addColorStop(.24, `rgba(255,217,120,${alpha * .85})`);
  g.addColorStop(1, "rgba(255,217,120,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, radius * 3.2, 0, Math.PI * 2); ctx.fill();
}

function glowDotTint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  primary: [number, number, number],
  secondary: [number, number, number],
  alpha = 1,
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.2);
  g.addColorStop(0, `rgba(255,255,255,${alpha})`);
  g.addColorStop(.2, rgba(primary, alpha * .92));
  g.addColorStop(.55, rgba(secondary, alpha * .46));
  g.addColorStop(1, rgba(secondary, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius * 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function guideFigure(ctx: CanvasRenderingContext2D, x: number, y: number, active: boolean, halfBody = false) {
  const h = ctx.canvas.height * .43;
  ctx.save();
  ctx.strokeStyle = active ? "rgba(255,217,120,.95)" : "rgba(247,246,241,.42)";
  ctx.fillStyle = active ? "rgba(255,217,120,.95)" : "rgba(247,246,241,.65)";
  ctx.lineWidth = active ? 3 : 2;
  ctx.setLineDash(active ? [] : [11, 13]);
  ctx.shadowColor = active ? "#ffd978" : "transparent";
  ctx.shadowBlur = active ? 22 : 0;
  ctx.beginPath(); ctx.arc(x, y - h * .34, h * .075, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - h * .25); ctx.lineTo(x, y + h * .08);
  ctx.moveTo(x, y - h * .13); ctx.lineTo(x - h * .13, y);
  ctx.moveTo(x, y - h * .13); ctx.lineTo(x + h * .13, y);
  if (!halfBody) {
    ctx.moveTo(x, y + h * .08); ctx.lineTo(x - h * .1, y + h * .3);
    ctx.moveTo(x, y + h * .08); ctx.lineTo(x + h * .1, y + h * .3);
  }
  ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, y + h * .34, h * .18, h * .038, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `700 ${Math.max(12, ctx.canvas.height * .017)}px Arial`;
  ctx.textAlign = "center";
  ctx.fillText(halfBody ? "CENTER YOUR SHOULDERS" : "STAND HERE", x, y + h * .43);
  ctx.font = `500 ${Math.max(11, ctx.canvas.height * .014)}px Arial`;
  ctx.fillText(halfBody ? "双肩保持在画面中央" : "站在这里", x, y + h * .49);
  ctx.restore();
}

function drawBridge(ctx: CanvasRenderingContext2D, amount: number, anchor = BRIDGE_TARGET) {
  if (amount <= 0) return;
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const cx = w * anchor.x, deckY = h * (anchor.y + .11), span = w * .46, towerH = h * .24;
  ctx.save();
  ctx.globalAlpha = Math.min(1, amount);
  ctx.strokeStyle = "#ffd978";
  ctx.lineWidth = Math.max(2, h * .004);
  ctx.shadowColor = "#ffb55e"; ctx.shadowBlur = 26 * amount;
  ctx.beginPath(); ctx.moveTo(cx - span / 2, deckY); ctx.lineTo(cx + span / 2, deckY); ctx.stroke();
  const towers = [cx - span * .3, cx + span * .3];
  towers.forEach((tx) => {
    ctx.strokeStyle = "#e95a3f";
    ctx.lineWidth = Math.max(4, h * .009);
    ctx.beginPath(); ctx.moveTo(tx, deckY + h * .08); ctx.lineTo(tx, deckY - towerH); ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const yy = deckY - towerH + i * towerH / 4;
      ctx.beginPath(); ctx.moveTo(tx - w * .018, yy); ctx.lineTo(tx + w * .018, yy); ctx.stroke();
    }
  });
  ctx.strokeStyle = "#ffd978"; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - span / 2, deckY - h * .03);
  ctx.quadraticCurveTo(towers[0], deckY - towerH, cx, deckY - h * .04);
  ctx.quadraticCurveTo(towers[1], deckY - towerH, cx + span / 2, deckY - h * .03);
  ctx.stroke();
  for (let i = 0; i <= 24 * amount; i++) {
    const x = cx - span / 2 + (span * i / 24);
    glowDot(ctx, x, deckY - h * .008, h * .005, .8);
  }
  const reflection = ctx.createLinearGradient(0, deckY, 0, h * .86);
  reflection.addColorStop(0, `rgba(255,217,120,${.25 * amount})`);
  reflection.addColorStop(1, "transparent");
  ctx.fillStyle = reflection;
  ctx.beginPath(); ctx.moveTo(cx - span * .35, deckY); ctx.lineTo(cx + span * .35, deckY);
  ctx.lineTo(cx + span * .16, h * .86); ctx.lineTo(cx - span * .16, h * .86); ctx.fill();
  ctx.restore();
}

function drawConnection(ctx: CanvasRenderingContext2D, poses: Pose[], anchor: { x: number; y: number }, amount: number) {
  if (amount <= 0) return;
  const target = { x: ctx.canvas.width * anchor.x, y: ctx.canvas.height * anchor.y };
  ctx.save();
  ctx.lineWidth = Math.max(1.5, ctx.canvas.height * .0025);
  ctx.strokeStyle = `rgba(255,217,120,${.72 * amount})`;
  ctx.shadowColor = "#ffd978"; ctx.shadowBlur = 18;
  poses.forEach((pose) => [pose[15], pose[16]].forEach((wrist) => {
    if (!wrist) return;
    const start = normalizedToCanvas(wrist, ctx.canvas);
    ctx.beginPath(); ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo((start.x + target.x) / 2, Math.min(start.y, target.y) - ctx.canvas.height * .08, target.x, target.y);
    ctx.stroke();
  }));
  glowDot(ctx, target.x, target.y, ctx.canvas.height * .012, amount);
  ctx.restore();
}

function drawCableCarLight(ctx: CanvasRenderingContext2D, amount: number, anchor: { x: number; y: number }) {
  if (amount <= 0) return;
  const w = ctx.canvas.width, h = ctx.canvas.height, vanX = w * anchor.x, vanY = h * anchor.y;
  ctx.save(); ctx.globalAlpha = Math.min(1, amount);
  ctx.shadowColor = "#59e8ff"; ctx.shadowBlur = 30;
  ctx.lineWidth = h * .006; ctx.strokeStyle = "#59e8ff";
  [[w * .12, h], [w * .38, h], [w * .62, h], [w * .88, h]].forEach((p, i) => {
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(vanX + (i < 2 ? -1 : 1) * w * .025, vanY); ctx.stroke();
  });
  const carY = vanY + h * .1, carW = w * .12, carH = h * .17;
  ctx.strokeStyle = "#b8ff54"; ctx.shadowColor = "#b8ff54"; ctx.lineWidth = h * .008;
  ctx.strokeRect(vanX - carW / 2, carY - carH / 2, carW, carH);
  ctx.lineWidth = 2; ctx.strokeStyle = "#f0ffff";
  ctx.beginPath(); ctx.moveTo(vanX, carY - carH / 2); ctx.lineTo(vanX, carY + carH / 2);
  ctx.moveTo(vanX - carW / 2, carY); ctx.lineTo(vanX + carW / 2, carY); ctx.stroke();
  for (let i = 0; i < 16 * amount; i++) {
    const t = i / 16;
    glowDotTint(ctx, w * (.18 + .64 * t), h * (1 - .51 * t), h * .004, [89, 232, 255], [184, 255, 84], .86);
  }
  ctx.restore();
}

function drawPalaceHalo(ctx: CanvasRenderingContext2D, amount: number, anchor: { x: number; y: number }) {
  if (amount <= 0) return;
  const w = ctx.canvas.width, h = ctx.canvas.height, cx = w * anchor.x, base = h * (anchor.y + .24), r = h * .23;
  ctx.save(); ctx.globalAlpha = Math.min(1, amount);
  ctx.strokeStyle = "#b89cff"; ctx.shadowColor = "#b89cff"; ctx.shadowBlur = 32; ctx.lineWidth = h * .006;
  ctx.beginPath(); ctx.arc(cx, base, r, Math.PI, 0); ctx.stroke();
  ctx.lineWidth = h * .004;
  for (let i = -3; i <= 3; i++) {
    const x = cx + i * r * .26;
    ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - r * (.76 + .07 * Math.cos(i))); ctx.stroke();
  }
  ctx.strokeStyle = "#72e7ff"; ctx.shadowColor = "#72e7ff"; ctx.lineWidth = h * .009;
  ctx.beginPath(); ctx.arc(cx, base - r * .57, r * .28, Math.PI, 0); ctx.stroke();
  for (let i = 0; i < 22 * amount; i++) {
    const a = Math.PI + Math.PI * (i / 21);
    glowDotTint(ctx, cx + Math.cos(a) * r, base + Math.sin(a) * r, h * .0045, [184, 156, 255], [114, 231, 255], .84);
  }
  ctx.restore();
}

function drawLiveEffect(ctx: CanvasRenderingContext2D, anchor: { x: number; y: number }, effect: LiveEffect, amount: number, elapsed: number) {
  if (amount <= 0) return;
  const x = ctx.canvas.width * anchor.x, y = ctx.canvas.height * anchor.y, h = ctx.canvas.height;
  ctx.save(); ctx.globalAlpha = Math.min(1, amount);
  if (effect === "skylight") {
    const radiusX = h * (.12 + .018 * Math.sin(elapsed / 350));
    const radiusY = radiusX * .38;
    ctx.translate(x, y); ctx.rotate(Math.sin(elapsed / 1000) * .06);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i === 1 ? "#58ffc5" : "#ff5bc7";
      ctx.lineWidth = Math.max(2, h * (.006 - i * .001));
      ctx.shadowColor = i === 1 ? "#58ffc5" : "#ff5bc7"; ctx.shadowBlur = 32;
      ctx.beginPath(); ctx.ellipse(0, 0, radiusX * (1 + i * .16), radiusY * (1 + i * .18), 0, 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2 + elapsed / 900;
      glowDotTint(ctx, Math.cos(a) * radiusX, Math.sin(a) * radiusY, h * .005, [255, 91, 199], [88, 255, 197], .86);
    }
  } else if (effect === "aurora") {
    ctx.strokeStyle = "rgba(88,255,197,.88)"; ctx.lineWidth = h * .025;
    ctx.shadowColor = "#ff5bc7"; ctx.shadowBlur = 28;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(x - h * .28, y + i * h * .025);
      ctx.bezierCurveTo(x - h * .12, y - h * (.16 + i * .02), x + h * .12, y + h * (.15 - i * .02), x + h * .28, y - i * h * .02);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 42 * amount; i++) {
      const a = i * 2.399 + elapsed / 1200;
      const r = h * (.025 + (i % 11) * .018);
      glowDotTint(ctx, x + Math.cos(a) * r, y + Math.sin(a * 1.2) * r * .65, h * (.003 + (i % 3) * .0015), [88, 255, 197], [255, 91, 199], .76);
    }
  }
  ctx.restore();
}

function drawSceneAtmosphere(
  ctx: CanvasRenderingContext2D,
  scene: SceneId,
  liveEffect: LiveEffect,
  anchor: { x: number; y: number },
  elapsed: number,
) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const x = w * anchor.x, y = h * anchor.y;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  if (scene === "golden-gate") {
    const sunset = ctx.createRadialGradient(w * .78, h * .63, 0, w * .78, h * .63, h * .72);
    sunset.addColorStop(0, "rgba(255,80,61,.34)");
    sunset.addColorStop(.34, "rgba(255,209,102,.14)");
    sunset.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sunset;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      const drift = Math.sin(elapsed / (1300 + i * 170) + i) * w * .035;
      const fog = ctx.createLinearGradient(0, h * (.63 + i * .045), w, h * (.65 + i * .045));
      fog.addColorStop(0, "rgba(255,255,255,0)");
      fog.addColorStop(.48, `rgba(255,232,195,${.035 + i * .008})`);
      fog.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = fog;
      ctx.fillRect(drift, h * (.61 + i * .045), w, h * .055);
    }
    drawSeagull(ctx, w * (.15 + ((elapsed / 26000) % .7)), h * .24, .66);
  } else if (scene === "cable-car") {
    const cityGlow = ctx.createLinearGradient(0, 0, w, h);
    cityGlow.addColorStop(0, "rgba(89,232,255,.26)");
    cityGlow.addColorStop(.52, "rgba(0,0,0,0)");
    cityGlow.addColorStop(1, "rgba(184,255,84,.22)");
    ctx.fillStyle = cityGlow;
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = Math.max(1.5, h * .002);
    ["rgba(89,232,255,.52)", "rgba(184,255,84,.42)", "rgba(240,255,255,.34)"].forEach((color, index) => {
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      const bottomX = w * (.06 + index * .44);
      ctx.beginPath();
      ctx.moveTo(bottomX, h * 1.04);
      ctx.lineTo(x + (index - 1) * w * .035, y);
      ctx.stroke();
    });
    for (let i = 0; i < 18; i++) {
      const t = (i / 18 + elapsed / 5200) % 1;
      const perspective = t * t;
      const px = x + (w * .46 - x) * perspective;
      const py = y + (h * 1.02 - y) * perspective;
      glowDotTint(ctx, px, py, h * (.0018 + perspective * .003), [89, 232, 255], [184, 255, 84], .38 + perspective * .44);
    }
  } else if (scene === "palace") {
    const moon = ctx.createRadialGradient(w * .75, h * .25, 0, w * .75, h * .25, h * .56);
    moon.addColorStop(0, "rgba(184,156,255,.3)");
    moon.addColorStop(.32, "rgba(114,231,255,.2)");
    moon.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(114,231,255,.44)";
    ctx.shadowColor = "#b89cff";
    ctx.shadowBlur = 19;
    for (let i = 0; i < 6; i++) {
      const ripple = ((elapsed / 2600 + i / 6) % 1);
      ctx.globalAlpha = (1 - ripple) * .72;
      ctx.lineWidth = Math.max(1, h * .0015);
      ctx.beginPath();
      ctx.ellipse(x, h * .78, h * (.055 + ripple * .36), h * (.012 + ripple * .07), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = .38;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(x + i * h * .09, h * .7, h * (.12 + Math.abs(i) * .012), Math.PI, 0);
      ctx.stroke();
    }
  } else if (liveEffect === "aurora") {
    ["rgba(255,91,199,.32)", "rgba(88,255,197,.28)", "rgba(114,231,255,.2)"].forEach((color, index) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = h * (.045 - index * .008);
      ctx.shadowColor = color;
      ctx.shadowBlur = 28;
      ctx.beginPath();
      ctx.moveTo(-w * .08, h * (.22 + index * .08));
      ctx.bezierCurveTo(w * .25, h * (.02 + .04 * Math.sin(elapsed / 850 + index)), w * .62, h * .5, w * 1.08, h * (.16 + index * .06));
      ctx.stroke();
    });
  } else if (liveEffect === "fireflies") {
    for (let i = 0; i < 34; i++) {
      const a = i * 2.399 + elapsed / 2600;
      const radius = h * (.05 + (i % 13) * .025);
      glowDotTint(ctx, x + Math.cos(a) * radius, y + Math.sin(a * 1.13) * radius * .62, h * (.0018 + (i % 4) * .0007), [88, 255, 197], [255, 91, 199], .5);
    }
  } else {
    const portalGlow = ctx.createRadialGradient(x, y, 0, x, y, h * .32);
    portalGlow.addColorStop(0, "rgba(255,91,199,.3)");
    portalGlow.addColorStop(.35, "rgba(88,255,197,.17)");
    portalGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = portalGlow;
    ctx.fillRect(x - h * .34, y - h * .34, h * .68, h * .68);
  }
  ctx.restore();
}

function drawBalloonField(ctx: CanvasRenderingContext2D, amount: number, elapsed: number) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const colors = ["#ff6b5b", "#ffd978", "#8fd5ff", "#f4a7c5", "#98e0c1", "#f7f6f1"];
  ctx.save();
  for (let i = 0; i < 24; i++) {
    const size = h * (.035 + ((i * 7) % 9) * .005);
    const x = w * (.035 + ((i * 37) % 94) / 100);
    const speed = h * (.000035 + (i % 5) * .000007);
    const phase = h * ((i * 43) % 150) / 100;
    const travel = (elapsed * speed + phase) % (h * 1.48);
    const y = h * 1.18 - travel;
    const sway = Math.sin(elapsed / (650 + i * 17) + i) * size * .45;
    ctx.save(); ctx.translate(x + sway, y);
    ctx.globalAlpha = amount * (.72 + (i % 4) * .07);
    const gradient = ctx.createRadialGradient(-size * .22, -size * .32, size * .05, 0, 0, size);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(.14, colors[i % colors.length]);
    gradient.addColorStop(1, `${colors[i % colors.length]}aa`);
    ctx.fillStyle = gradient; ctx.shadowColor = colors[i % colors.length]; ctx.shadowBlur = size * .32;
    ctx.beginPath(); ctx.ellipse(0, 0, size * .72, size, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath(); ctx.moveTo(-size * .09, size * .94); ctx.lineTo(size * .09, size * .94); ctx.lineTo(0, size * 1.14); ctx.fill();
    ctx.strokeStyle = "rgba(247,246,241,.38)"; ctx.lineWidth = Math.max(1, h * .0012);
    ctx.beginPath(); ctx.moveTo(0, size * 1.1);
    ctx.bezierCurveTo(size * .25, size * 1.55, -size * .24, size * 1.9, 0, size * 2.35); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawConfettiField(ctx: CanvasRenderingContext2D, amount: number, elapsed: number) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const colors = ["#ffd978", "#ff6b5b", "#8fd5ff", "#f4a7c5", "#98e0c1", "#f7f6f1"];
  ctx.save();
  for (let i = 0; i < 72; i++) {
    const x = w * (((i * 61) % 101) / 100);
    const fall = (elapsed * (.000055 + (i % 6) * .000009) + ((i * 29) % 120) / 100) % 1.24;
    const y = h * (fall - .12);
    const size = h * (.006 + (i % 4) * .002);
    ctx.save();
    ctx.translate(x + Math.sin(elapsed / 420 + i) * size * 2.2, y);
    ctx.rotate(elapsed / (360 + i * 4) + i);
    ctx.globalAlpha = amount * (.56 + (i % 5) * .09);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-size * .55, -size * .18, size * 1.1, size * .36);
    ctx.restore();
  }
  ctx.restore();
}

function drawGlassOrbs(ctx: CanvasRenderingContext2D, amount: number, elapsed: number) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const colors = ["143,213,255", "255,217,120", "244,167,197", "152,224,193"];
  ctx.save();
  for (let i = 0; i < 16; i++) {
    const radius = h * (.018 + (i % 5) * .011);
    const baseX = w * (.04 + ((i * 47) % 92) / 100);
    const travel = (elapsed * (.000025 + (i % 3) * .000007) + ((i * 31) % 120) / 100) % 1.32;
    const y = h * (1.18 - travel);
    const x = baseX + Math.sin(elapsed / (760 + i * 19) + i) * radius * 1.5;
    const color = colors[i % colors.length];
    const glass = ctx.createRadialGradient(x - radius * .28, y - radius * .32, radius * .05, x, y, radius);
    glass.addColorStop(0, `rgba(255,255,255,${.9 * amount})`);
    glass.addColorStop(.17, `rgba(${color},${.28 * amount})`);
    glass.addColorStop(.72, `rgba(${color},${.08 * amount})`);
    glass.addColorStop(1, `rgba(${color},${.46 * amount})`);
    ctx.fillStyle = glass;
    ctx.strokeStyle = `rgba(255,255,255,${.38 * amount})`;
    ctx.lineWidth = Math.max(1, h * .0012);
    ctx.shadowColor = `rgba(${color},.8)`;
    ctx.shadowBlur = radius * .7;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawGestureAccent(
  ctx: CanvasRenderingContext2D,
  anchor: { x: number; y: number },
  gesture: GestureId,
  amount: number,
  elapsed: number,
  scene: SceneId,
) {
  if (amount <= 0) return;
  const x = ctx.canvas.width * anchor.x, y = ctx.canvas.height * anchor.y, h = ctx.canvas.height, w = ctx.canvas.width;
  const palette = SCENE_PALETTES[scene];
  ctx.save(); ctx.globalAlpha = Math.min(1, amount);
  ctx.strokeStyle = palette.primary; ctx.fillStyle = palette.primary; ctx.shadowColor = palette.secondary; ctx.shadowBlur = 24;
  if (gesture === "victory") {
    drawBalloonField(ctx, amount, elapsed);
    drawConfettiField(ctx, amount, elapsed);
    [[w * .24, h * .2], [w * .76, h * .18], [w * .5, h * .12]].forEach(([fx, fy], burst) => {
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2 + burst;
        const r = h * (.045 + .025 * Math.sin(elapsed / 220 + burst));
        ctx.beginPath(); ctx.moveTo(fx + Math.cos(a) * r * .35, fy + Math.sin(a) * r * .35);
        ctx.lineTo(fx + Math.cos(a) * r, fy + Math.sin(a) * r); ctx.stroke();
      }
    });
  } else if (gesture === "wave") {
    const ribbonColors = [palette.primary, palette.secondary, palette.tertiary, palette.primary];
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = ribbonColors[i];
      ctx.shadowColor = ribbonColors[i];
      ctx.lineWidth = h * (.014 - i * .0018);
      ctx.globalAlpha = amount * (.72 - i * .1);
      ctx.beginPath(); ctx.moveTo(-w * .05, y + i * h * .025);
      ctx.bezierCurveTo(
        w * .24,
        y - h * (.14 + .025 * Math.sin(elapsed / 380 + i)),
        w * .7,
        y + h * (.13 + .03 * Math.cos(elapsed / 440 + i)),
        w * 1.05,
        y - i * h * .02,
      );
      ctx.stroke();
    }
  } else if (gesture === "spin") {
    ctx.translate(x, y); ctx.rotate(elapsed / 650);
    const orbitColors = [palette.primary, palette.secondary, palette.tertiary, palette.primary];
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = orbitColors[i];
      ctx.shadowColor = orbitColors[i];
      ctx.lineWidth = Math.max(2, h * (.005 - i * .001));
      ctx.beginPath(); ctx.ellipse(0, 0, h * (.12 + i * .05), h * (.04 + i * .018), i * .55, 0, Math.PI * 2); ctx.stroke();
      glowDot(ctx, Math.cos(i * 2.1) * h * (.12 + i * .05), Math.sin(i * 2.1) * h * (.04 + i * .018), h * .006, .9);
    }
    for (let i = 0; i < 28; i++) {
      const a = i * 2.399 + elapsed / 850;
      const r = h * (.09 + (i % 9) * .026);
      glowDotTint(ctx, Math.cos(a) * r, Math.sin(a) * r * .48, h * (.002 + (i % 3) * .001), palette.primaryRgb, palette.secondaryRgb, amount * .68);
    }
  } else if (gesture === "jump") {
    const centerX = w * .5;
    const groundY = h * .82;
    for (let i = 0; i < 5; i++) {
      const phase = Math.max(0, Math.min(1, elapsed / 1500 - i * .12));
      ctx.globalAlpha = amount * (1 - phase) * (.72 - i * .08);
      ctx.strokeStyle = i % 2 ? palette.secondary : palette.primary;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.lineWidth = Math.max(2, h * (.006 - i * .0007));
      ctx.beginPath();
      ctx.ellipse(centerX, groundY, h * (.04 + phase * .48), h * (.012 + phase * .09), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 22; i++) {
      const spread = (i / 21 - .5) * w * .72;
      const lift = ((elapsed * (.00018 + (i % 5) * .000025) + (i % 7) * .08) % 1);
      const px = centerX + spread * (.35 + lift * .65);
      const py = groundY - lift * h * (.34 + (i % 4) * .05);
      glowDotTint(ctx, px, py, h * (.0025 + (i % 3) * .0012), palette.primaryRgb, palette.secondaryRgb, amount * (1 - lift) * .88);
    }
  } else if (gesture === "open-arms") {
    ctx.lineWidth = Math.max(1.5, h * .003);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * h * .04, y + Math.sin(a) * h * .04);
      ctx.lineTo(x + Math.cos(a) * h * .2, y + Math.sin(a) * h * .2); ctx.stroke();
    }
  } else {
    drawGlassOrbs(ctx, amount, elapsed);
    ctx.lineWidth = h * .008;
    [-.09, -.03, .03, .09].forEach((offset, i) => {
      ctx.globalAlpha = amount * (.45 + i * .1);
      ctx.beginPath(); ctx.moveTo(x + w * offset, h * .68); ctx.lineTo(x + w * offset * .35, y); ctx.stroke();
    });
  }
  ctx.restore();
}

function drawSceneEffect(
  ctx: CanvasRenderingContext2D,
  scene: SceneId,
  liveEffect: LiveEffect,
  anchor: { x: number; y: number },
  amount: number,
  elapsed: number,
) {
  if (scene === "golden-gate") drawBridge(ctx, amount, anchor);
  else if (scene === "cable-car") drawCableCarLight(ctx, amount, anchor);
  else if (scene === "palace") drawPalaceHalo(ctx, amount, anchor);
  else drawLiveEffect(ctx, anchor, liveEffect, amount, elapsed);
}

function drawSkyStrokes(ctx: CanvasRenderingContext2D, strokes: SkyStroke[]) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  strokes.forEach((stroke) => {
    if (stroke.points.length < 2) return;
    const traceCurve = () => {
      const first = stroke.points[0];
      ctx.beginPath();
      ctx.moveTo(first.x * ctx.canvas.width, first.y * ctx.canvas.height);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const point = stroke.points[i];
        const next = stroke.points[i + 1];
        ctx.quadraticCurveTo(
          point.x * ctx.canvas.width,
          point.y * ctx.canvas.height,
          (point.x + next.x) * .5 * ctx.canvas.width,
          (point.y + next.y) * .5 * ctx.canvas.height,
        );
      }
      const last = stroke.points[stroke.points.length - 1];
      ctx.lineTo(last.x * ctx.canvas.width, last.y * ctx.canvas.height);
    };
    ctx.globalAlpha = .42;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = Math.max(8, ctx.canvas.height * .014);
    ctx.shadowColor = stroke.color;
    ctx.shadowBlur = Math.max(18, ctx.canvas.height * .026);
    traceCurve();
    ctx.stroke();
    ctx.globalAlpha = .96;
    ctx.lineWidth = Math.max(2.4, ctx.canvas.height * .0042);
    ctx.shadowBlur = Math.max(7, ctx.canvas.height * .009);
    traceCurve();
    ctx.stroke();
    ctx.globalAlpha = .74;
    for (let i = 0; i < stroke.points.length; i += 12) {
      const point = stroke.points[i];
      glowDot(ctx, point.x * ctx.canvas.width, point.y * ctx.canvas.height, ctx.canvas.height * .0024, .58);
    }
  });
  ctx.restore();
}

function drawSceneTransition(ctx: CanvasRenderingContext2D, elapsed: number, scene: SceneId) {
  if (elapsed < 0 || elapsed > 1750) return;
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const progress = Math.max(0, Math.min(1, elapsed / 1750));
  const sweep = progress < .5
    ? Math.pow(progress * 2, .72)
    : 1 - Math.pow((progress - .5) * 2, 1.7);
  const opacity = Math.sin(progress * Math.PI);
  const edgeX = progress < .5 ? sweep * w : (1 - sweep) * w;
  ctx.save();
  const wash = ctx.createLinearGradient(0, 0, w, h);
  wash.addColorStop(0, `rgba(3,12,24,${.82 * opacity})`);
  wash.addColorStop(.45, `rgba(16,44,68,${.88 * opacity})`);
  wash.addColorStop(1, `rgba(3,12,24,${.78 * opacity})`);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "screen";
  const palette = SCENE_PALETTES[scene];
  const colors = [palette.primary, palette.secondary, palette.tertiary, palette.primary];
  for (let i = 0; i < 7; i++) {
    const color = colors[i % colors.length];
    const offset = (i - 3) * h * .038;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 28;
    ctx.globalAlpha = opacity * (.48 + (i % 3) * .14);
    ctx.lineWidth = h * (.018 - (i % 3) * .003);
    ctx.beginPath();
    ctx.moveTo(edgeX - w * .28, -h * .08);
    ctx.bezierCurveTo(
      edgeX + w * .17 + offset,
      h * .22,
      edgeX - w * .16 - offset,
      h * .72,
      edgeX + w * .24,
      h * 1.08,
    );
    ctx.stroke();
  }
  if (progress > .3 && progress < .66) {
    const flash = 1 - Math.abs(progress - .48) / .18;
    ctx.fillStyle = `rgba(255,249,224,${Math.max(0, flash) * .24})`;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function drawSeagull(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.strokeStyle = "rgba(247,246,241,.9)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-18, 2); ctx.quadraticCurveTo(-9, -8, 0, 1);
  ctx.quadraticCurveTo(9, -8, 18, 2); ctx.stroke(); ctx.restore();
}

export function renderScene(opts: {
  canvas: HTMLCanvasElement; video: HTMLVideoElement; poses: Pose[]; progress: number;
  elapsedSuccess: number; successLocked: boolean; particles: Particle[]; debug: boolean;
  mode: ExperienceMode; scene: SceneId; liveEffect: LiveEffect; anchor: { x: number; y: number };
  gesture: GestureId; playEffectElapsed: number; strokes: SkyStroke[];
  sceneTransitionElapsed: number; frameTime: number;
}) {
  const {
    canvas, video, poses, progress, elapsedSuccess, successLocked, particles, debug,
    mode, scene, liveEffect, anchor, gesture, playEffectElapsed, strokes,
    sceneTransitionElapsed, frameTime,
  } = opts;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (video.readyState >= 2) {
    drawMirroredCamera(ctx, video);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "#071421"); g.addColorStop(1, "#102b3b"); ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = "rgba(7,20,33,.2)"; ctx.fillRect(0, 0, canvas.width, canvas.height);

  const playDuration = gesture === "victory" ? 9000 : gesture === "wave" ? 6200 : 5200;
  const playActive = !successLocked && playEffectElapsed >= 0 && playEffectElapsed < playDuration;
  const playRise = Math.min(1, playEffectElapsed / 260);
  const playFade = Math.min(1, (playDuration - playEffectElapsed) / 1200);
  const playAmount = playActive ? Math.max(0, Math.min(playRise, playFade)) : 0;
  drawSceneAtmosphere(ctx, scene, liveEffect, anchor, frameTime);

  if (!successLocked) {
    if (mode === "solo") {
      guideFigure(ctx, canvas.width * .5, canvas.height * .5,
        !!poses[0] && (() => { const x = screenCenterX(poses[0]); return x > SOLO_STANDING_ZONE.minX && x < SOLO_STANDING_ZONE.maxX; })(), true);
    } else {
      guideFigure(ctx, canvas.width * .35, canvas.height * .5,
        !!poses[0] && (() => { const x = screenCenterX(poses[0]); return x > STANDING_ZONES.left.minX && x < STANDING_ZONES.left.maxX; })());
      guideFigure(ctx, canvas.width * .65, canvas.height * .5,
        !!poses[1] && (() => { const x = screenCenterX(poses[1]); return x > STANDING_ZONES.right.minX && x < STANDING_ZONES.right.maxX; })());
    }
    if (scene === "live") {
      const ax = canvas.width * anchor.x, ay = canvas.height * anchor.y;
      ctx.save(); ctx.strokeStyle = "rgba(255,217,120,.78)"; ctx.lineWidth = Math.max(2, canvas.height * .002);
      ctx.setLineDash([7, 8]); ctx.shadowColor = "#ffd978"; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(ax, ay, canvas.height * .028, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); glowDot(ctx, ax, ay, canvas.height * .006, .7); ctx.restore();
    }
  }

  poses.forEach((pose) => {
    [pose[15], pose[16]].forEach((wrist) => {
      if ((wrist?.visibility ?? 0) > .45 && progress > 0) {
        const p = normalizedToCanvas(wrist, canvas);
        glowDot(ctx, p.x, p.y, canvas.height * (.012 + progress * .009), .75 + progress * .25);
        seedParticles(particles, p.x, p.y, progress > .7 ? 4 : 1);
      }
    });
  });
  particles.forEach((p) => {
    p.x += p.vx; p.y += p.vy; p.vy += .006; p.life -= .012;
    ctx.fillStyle = `hsla(${p.hue},100%,72%,${Math.max(0, p.life)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  });
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);

  drawSkyStrokes(ctx, strokes);

  if (playActive) {
    drawSceneEffect(ctx, scene, liveEffect, anchor, playAmount * .82, playEffectElapsed);
    drawGestureAccent(ctx, anchor, gesture, playAmount, playEffectElapsed, scene);
  }

  if (successLocked) {
    const connection = Math.max(0, Math.min(1, (elapsedSuccess - 450) / 700));
    drawConnection(ctx, poses, anchor, connection);
    const reveal = Math.max(0, Math.min(1, (elapsedSuccess - 900) / 800));
    drawSceneEffect(ctx, scene, liveEffect, anchor, reveal, elapsedSuccess);
    drawGestureAccent(ctx, anchor, gesture, reveal, elapsedSuccess, scene);
    if (elapsedSuccess > 1900) {
      const t = (elapsedSuccess - 1900) / 1000;
      if (scene !== "live") {
        drawSeagull(ctx, canvas.width * (.44 + t * .18), canvas.height * (.43 - t * .08), 1.2);
        drawSeagull(ctx, canvas.width * (.55 - t * .16), canvas.height * (.39 - t * .04), .85);
      }
      if (Math.random() > .45) seedParticles(particles, canvas.width * (.25 + Math.random() * .5), canvas.height * (.14 + Math.random() * .22), 2);
    }
  }
  drawSceneTransition(ctx, sceneTransitionElapsed, scene);
  if (debug) {
    ctx.fillStyle = "rgba(255,217,120,.7)";
    poses.forEach((pose) => pose.forEach((point) => {
      if ((point.visibility ?? 0) > .5) {
        const p = normalizedToCanvas(point, canvas);
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }));
  }
}
