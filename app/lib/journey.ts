export type JourneyMemory = {
  image: string;
  sceneId: string;
  sceneName: string;
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function coverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sx = 0, sy = 0, sw = image.width, sh = image.height;
  if (sourceRatio > targetRatio) {
    sw = image.height * targetRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / targetRatio;
    sy = (image.height - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

export async function createJourneyGrid(memories: JourneyMemory[]) {
  const selected = memories.slice(0, 4);
  const images = await Promise.all(selected.map((memory) => loadImage(memory.image)));
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1600;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#071421";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gap = 12;
  const cell = (1600 - gap) / 2;

  images.forEach((image, index) => {
    const x = (index % 2) * (cell + gap);
    const y = Math.floor(index / 2) * (cell + gap);
    coverImage(ctx, image, x, y, cell, cell);
    const shade = ctx.createLinearGradient(0, y + cell * .62, 0, y + cell);
    shade.addColorStop(0, "transparent");
    shade.addColorStop(1, "rgba(7,20,33,.78)");
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = "#ffd978";
    ctx.font = "700 21px Arial";
    ctx.fillText(`0${index + 1}`, x + 34, y + cell - 72);
    ctx.fillStyle = "#f7f6f1";
    ctx.font = "700 28px Georgia";
    ctx.fillText(selected[index].sceneName.slice(0, 34), x + 34, y + cell - 36);
  });

  ctx.save();
  ctx.translate(800, 800);
  ctx.fillStyle = "#071421";
  ctx.beginPath(); ctx.arc(0, 0, 88, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#ffd978"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#f7f6f1"; ctx.textAlign = "center";
  ctx.font = "italic 42px Georgia"; ctx.fillText("Lumo", 0, -4);
  ctx.font = "700 13px Arial"; ctx.fillStyle = "#ffd978";
  ctx.fillText("MOVE · CONNECT · LIGHT", 0, 27);
  ctx.restore();
  return canvas.toDataURL("image/png");
}
