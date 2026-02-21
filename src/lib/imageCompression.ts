export type ImageCompressionOptions = import("browser-image-compression").Options;

let compressionModulePromise: Promise<typeof import("browser-image-compression")> | null = null;

const loadCompressionModule = () => {
  if (!compressionModulePromise) {
    compressionModulePromise = import("browser-image-compression");
  }
  return compressionModulePromise;
};

export const compressImage = async (file: File, options: ImageCompressionOptions) => {
  const module = await loadCompressionModule();
  return module.default(file, options);
};

export const getImageDataUrl = async (file: File) => {
  const module = await loadCompressionModule();
  return module.getDataUrlFromFile(file);
};
