import { faGlobe } from "@fortawesome/free-solid-svg-icons";

export interface ShareCardData {
  elapsed: string;
  focus: string;
  started: string;
  today: string;
  username: string;
  quote: string;
  profileUrl: string | null;
  backgroundUrl: string | null;
  videoUrl: string | null;
  videoDuration: number | null;
  fit: "cover" | "contain";
  position: string;
  opacity: number;
  overlay: number;
  blur: number;
}

const WIDTH = 1260;
const HEIGHT = 855;

function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function positionRatio(position: string) {
  const [horizontal = "center", vertical = "center"] = position.split(" ");
  return {
    x: horizontal === "left" ? 0 : horizontal === "right" ? 1 : 0.5,
    y: vertical === "top" ? 0 : vertical === "bottom" ? 1 : 0.5,
  };
}

function drawMedia(
  context: CanvasRenderingContext2D,
  media: CanvasImageSource,
  mediaWidth: number,
  mediaHeight: number,
  data: ShareCardData,
) {
  if (!mediaWidth || !mediaHeight) return;
  const scale =
    data.fit === "contain"
      ? Math.min(WIDTH / mediaWidth, HEIGHT / mediaHeight)
      : Math.max(WIDTH / mediaWidth, HEIGHT / mediaHeight);
  const width = mediaWidth * scale;
  const height = mediaHeight * scale;
  const ratio = positionRatio(data.position);
  const x = (WIDTH - width) * ratio.x;
  const y = (HEIGHT - height) * ratio.y;
  context.save();
  context.globalAlpha = data.opacity;
  context.filter = data.blur ? `blur(${data.blur * 1.5}px)` : "none";
  context.drawImage(media, x, y, width, height);
  context.restore();
}

function text(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  weight = 650,
  color = "#f8f8fa",
) {
  context.fillStyle = color;
  context.font = `${weight} ${size}px "Geist Variable", "Geist", sans-serif`;
  context.fillText(value, x, y);
}

function drawGlobe(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const [width, height, , , pathData] = faGlobe.icon;
  const path = Array.isArray(pathData) ? pathData.join(" ") : pathData;
  context.save();
  context.translate(x, y);
  context.scale(size / width, size / height);
  context.fillStyle = "#f8f8fa";
  context.fill(new Path2D(path));
  context.restore();
}

export async function prepareShareCard(
  data: ShareCardData,
  video: HTMLVideoElement | null,
) {
  await document.fonts.ready;
  const [background, profile, logo] = await Promise.all([
    video ? Promise.resolve(null) : loadImage(data.backgroundUrl),
    loadImage(data.profileUrl),
    loadImage("/sesh-logo.png"),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Could not create the share card.");

  const draw = () => {
    context.filter = "none";
    context.globalAlpha = 1;
    context.fillStyle = "#090a0c";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    const source = video?.readyState && video.videoWidth ? video : background;
    if (source instanceof HTMLVideoElement) {
      drawMedia(context, source, source.videoWidth, source.videoHeight, data);
    } else if (source) {
      drawMedia(context, source, source.naturalWidth, source.naturalHeight, data);
    } else {
      context.strokeStyle = "#17191f";
      context.lineWidth = 2;
      for (let offset = -HEIGHT; offset < WIDTH; offset += 150) {
        context.beginPath();
        context.moveTo(offset, HEIGHT);
        context.lineTo(offset + HEIGHT, 0);
        context.stroke();
      }
    }
    if (data.backgroundUrl || video) {
      context.fillStyle = `rgba(0,0,0,${data.overlay})`;
      context.fillRect(0, 0, WIDTH, HEIGHT);
    }

    if (logo) context.drawImage(logo, 43, 28, 100, 100);
    context.textAlign = "right";
    text(context, "SESH", 1210, 102, 65, 680);
    context.textAlign = "left";

    text(context, "ELAPSED", 53, 231, 60, 720);
    context.fillStyle = "#2fddb0";
    context.fillRect(52, 265, 578, 117);
    text(context, data.elapsed, 79, 350, 76, 710, "#07161a");

    text(context, "FOCUS", 79, 478, 38, 680);
    text(context, data.focus, 450, 478, 38, 680, "#2fddb0");
    text(context, "Started", 79, 541, 36, 630);
    text(context, data.started, 450, 541, 36, 630);
    text(context, "Today", 79, 602, 36, 630);
    text(context, data.today, 450, 602, 36, 630);

    context.save();
    context.beginPath();
    context.rect(52, 680, 69, 69);
    context.clip();
    if (profile) context.drawImage(profile, 52, 680, 69, 69);
    else {
      context.fillStyle = "#f1f1f2";
      context.fillRect(52, 680, 69, 69);
      context.fillStyle = "#77797e";
      context.beginPath();
      context.arc(86.5, 704, 13, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(86.5, 748, 25, 27, 0, Math.PI, Math.PI * 2);
      context.fill();
    }
    context.restore();
    text(context, data.username, 145, 735, 57, 700);
    drawGlobe(context, 52, 774, 22);
    text(context, "sesh.timer", 80, 793, 23, 570);
    text(context, data.quote, 270, 793, 22, 560);

    context.strokeStyle = "#ffffff2e";
    context.lineWidth = 2;
    context.strokeRect(1, 1, WIDTH - 2, HEIGHT - 2);
  };
  draw();
  return { canvas, draw };
}

async function loadVideo(url: string) {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.loop = false;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () =>
      reject(new Error("Could not load the video loop for export."));
    video.load();
  });
  return video;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Export failed."))),
      type,
      quality,
    ),
  );
}

export async function renderShareImage(
  data: ShareCardData,
) {
  const video = data.videoUrl ? await loadVideo(data.videoUrl) : null;
  const { canvas } = await prepareShareCard(data, video);
  const blob = await canvasBlob(canvas, "image/png");
  if (video) {
    video.removeAttribute("src");
    video.load();
  }
  return blob;
}

export async function renderShareVideo(
  data: ShareCardData,
): Promise<{ blob: Blob; extension: "webm" | "mp4" }> {
  if (!data.videoUrl) throw new Error("There is no video background to export.");
  const video = await loadVideo(data.videoUrl);
  const durationMs = video.duration * 1_000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("This video does not report a usable loop duration.");
  }
  const { canvas, draw } = await prepareShareCard(data, video);
  if (!("captureStream" in canvas) || typeof MediaRecorder === "undefined") {
    throw new Error("Video export is not supported on this device.");
  }
  const format = preferredVideoFormat();
  if (!format) throw new Error("Video export is not supported on this device.");
  const { mimeType, extension } = format;
  const stream = canvas.captureStream(30);
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_000_000,
  });
  const complete = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => reject(new Error("Could not record the share card."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });
  recorder.start(250);
  video.currentTime = 0;
  await video.play();
  await new Promise<void>((resolve) => {
    const frame = () => {
      draw();
      if (video.ended || video.currentTime * 1_000 >= durationMs - 16) resolve();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  video.pause();
  draw();
  recorder.stop();
  const blob = await complete;
  stream.getTracks().forEach((track) => track.stop());
  video.removeAttribute("src");
  video.load();
  return { blob, extension };
}

export function preferredVideoFormat(): {
  mimeType: string;
  extension: "mp4" | "webm";
} | null {
  if (typeof MediaRecorder === "undefined") return null;
  const formats: { mimeType: string; extension: "mp4" | "webm" }[] = [
    { mimeType: "video/mp4;codecs=avc1.42E01E", extension: "mp4" },
    { mimeType: "video/mp4;codecs=avc3.42E01E", extension: "mp4" },
    { mimeType: "video/mp4", extension: "mp4" },
    { mimeType: "video/webm;codecs=vp9", extension: "webm" },
    { mimeType: "video/webm;codecs=vp8", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
  ];
  return formats.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
}
