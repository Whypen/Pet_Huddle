import { supabase } from "@/integrations/supabase/client";

export const SOCIAL_VIDEO_MAX_SECONDS = 15;

export type SocialVideoMetadata = {
  provider: "bunny_stream";
  providerVideoId: string;
  playbackUrl: string;
  embedUrl: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  duration: number | null;
  status: "created" | "uploading" | "uploaded" | "processing" | "ready" | "failed" | "abandoned" | "deleted";
};

type CreateUploadResponse = {
  videoId: string;
  libraryId: string;
  expirationTime: number;
  signature: string;
  tusEndpoint: string;
  collectionId?: string | null;
  playbackUrl: string;
  embedUrl: string;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
};

export const getVideoDuration = (file: File): Promise<number> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read video duration."));
    };
    video.src = url;
  });

export const compressAndTrimVideo = async (
  file: File,
  options: { startSeconds?: number; durationSeconds?: number } = {},
): Promise<File> => {
  const durationSeconds = Math.min(SOCIAL_VIDEO_MAX_SECONDS, Math.max(1, options.durationSeconds ?? SOCIAL_VIDEO_MAX_SECONDS));
  if (!("MediaRecorder" in window) || !HTMLCanvasElement.prototype.captureStream) {
    if ((await getVideoDuration(file)) > SOCIAL_VIDEO_MAX_SECONDS + 0.2) {
      throw new Error("This browser cannot trim video. Please trim the clip to 15 seconds before uploading.");
    }
    return file;
  }

  return new Promise((resolve, reject) => {
    const inputUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const chunks: BlobPart[] = [];
    let recorder: MediaRecorder | null = null;
    let frame = 0;
    let done = false;

    const cleanup = () => {
      done = true;
      URL.revokeObjectURL(inputUrl);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    const fail = (error: Error) => {
      if (done) return;
      cleanup();
      reject(error);
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = async () => {
      try {
        const scale = Math.min(1, 720 / Math.max(video.videoWidth || 720, video.videoHeight || 720));
        canvas.width = Math.max(2, Math.round((video.videoWidth || 720) * scale));
        canvas.height = Math.max(2, Math.round((video.videoHeight || 720) * scale));
        video.currentTime = Math.min(Math.max(0, options.startSeconds ?? 0), Math.max(0, video.duration - 0.5));
      } catch (err) {
        fail(err instanceof Error ? err : new Error("Unable to prepare video."));
      }
    };
    video.onseeked = async () => {
      if (!ctx) return fail(new Error("Unable to process video."));
      try {
        const stream = canvas.captureStream(24);
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
            ? "video/webm;codecs=vp8"
            : "video/webm";
        recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 900_000,
        });
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = () => fail(new Error("Video compression failed."));
        recorder.onstop = () => {
          if (done) return;
          cleanup();
          const blob = new Blob(chunks, { type: "video/webm" });
          const baseName = file.name.replace(/\.[^.]+$/, "") || "social-video";
          resolve(new File([blob], `${baseName}-huddle-720p.webm`, { type: "video/webm" }));
        };
        const draw = () => {
          if (done || video.paused || video.ended) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frame = window.requestAnimationFrame(draw);
        };
        recorder.start(500);
        await video.play();
        draw();
        window.setTimeout(() => {
          window.cancelAnimationFrame(frame);
          video.pause();
          if (recorder && recorder.state !== "inactive") recorder.stop();
        }, durationSeconds * 1000);
      } catch (err) {
        fail(err instanceof Error ? err : new Error("Unable to compress video."));
      }
    };
    video.onerror = () => fail(new Error("Unable to load video."));
    video.src = inputUrl;
  });
};

export const uploadSocialVideoToBunny = async (
  file: File,
  args: {
    title: string;
    durationSeconds: number;
    onProgress?: (progress: number) => void;
  },
): Promise<SocialVideoMetadata> => {
  if (args.durationSeconds > SOCIAL_VIDEO_MAX_SECONDS + 0.5) {
    throw new Error("Video must be trimmed to 15 seconds before upload.");
  }

  const { data: createData, error: createError } = await supabase.functions.invoke<CreateUploadResponse>(
    "social-video-create-upload",
    {
      body: {
        title: args.title,
        durationSeconds: args.durationSeconds,
        fileName: file.name,
        fileType: file.type || "video/mp4",
        fileSize: file.size,
      },
    },
  );
  if (createError) throw createError;
  if (!createData?.videoId) throw new Error("Video upload authorization failed.");

  const tus = await import("tus-js-client");
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: createData.tusEndpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        AuthorizationSignature: createData.signature,
        AuthorizationExpire: String(createData.expirationTime),
        LibraryId: String(createData.libraryId),
        VideoId: createData.videoId,
      },
      metadata: {
        filetype: file.type || "video/mp4",
        title: args.title || file.name,
        ...(createData.collectionId ? { collection: createData.collectionId } : {}),
      },
      onError: reject,
      onProgress: (bytesUploaded, bytesTotal) => {
        if (!bytesTotal) return;
        args.onProgress?.(Math.max(1, Math.min(95, Math.round((bytesUploaded / bytesTotal) * 95))));
      },
      onSuccess: () => resolve(),
    });
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    }).catch(reject);
  });

  const { data: finalizeData, error: finalizeError } = await supabase.functions.invoke<SocialVideoMetadata>(
    "social-video-finalize",
    {
      body: {
        videoId: createData.videoId,
        durationSeconds: args.durationSeconds,
      },
    },
  );
  if (finalizeError) throw finalizeError;
  if (!finalizeData?.providerVideoId) throw new Error("Video upload could not be finalized.");
  args.onProgress?.(100);
  return finalizeData;
};

export const attachSocialVideoToThread = async (video: SocialVideoMetadata, threadId: string) => {
  await supabase.functions.invoke("social-video-finalize", {
    body: {
      videoId: video.providerVideoId,
      threadId,
      durationSeconds: video.duration ?? SOCIAL_VIDEO_MAX_SECONDS,
    },
  });
};

export const deleteSocialVideo = async (videoId: string) => {
  await supabase.functions.invoke("social-video-delete", {
    body: { videoId },
  });
};
