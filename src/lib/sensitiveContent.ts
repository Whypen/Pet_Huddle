const NSFW_THRESHOLD = 0.7;
const NSFW_MODEL_URL = "https://cdn.jsdelivr.net/npm/nsfwjs@2.4.2/dist/model/";
const NSFW_CLASSES = new Set(["Porn", "Sexy", "Hentai"]);

type NsfwPrediction = {
  className: string;
  probability: number;
};

let modelPromise: Promise<{
  classify: (img: HTMLCanvasElement) => Promise<NsfwPrediction[]>;
}> | null = null;

const getModel = async () => {
  if (!modelPromise) {
    modelPromise = import("nsfwjs")
      .then((mod) => mod.load(NSFW_MODEL_URL))
      .catch((error) => {
        modelPromise = null;
        throw error;
      });
  }
  return modelPromise;
};

const buildInferenceCanvas = async (file: File): Promise<HTMLCanvasElement> => {
  const bitmap = await createImageBitmap(file);
  const maxSize = 224;
  const ratio = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_context_unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas;
};

export const detectSensitiveImage = async (file: File): Promise<{
  isSensitive: boolean;
  score: number;
}> => {
  const [model, canvas] = await Promise.all([getModel(), buildInferenceCanvas(file)]);
  const predictions = await model.classify(canvas);
  const score = predictions
    .filter((prediction) => NSFW_CLASSES.has(prediction.className))
    .reduce((max, prediction) => Math.max(max, Number(prediction.probability || 0)), 0);
  return {
    isSensitive: score > NSFW_THRESHOLD,
    score,
  };
};
