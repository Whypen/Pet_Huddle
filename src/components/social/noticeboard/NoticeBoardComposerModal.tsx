import { memo, type ChangeEvent, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { Image, Loader2, Play, Scissors, X } from "lucide-react";

import { MediaThumb } from "@/components/media/MediaThumb";
import { NeuButton } from "@/components/ui/NeuButton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ComposerMedia, ComposerUploadState, LinkPreview, MentionEntry } from "@/components/social/noticeboard/types";

type TagOption = {
  id: string;
  label: string;
};

type NoticeBoardComposerModalProps = {
  activePreviewUrl: string | null;
  category: string;
  composerUploadState: ComposerUploadState;
  content: string;
  createContentPreview: LinkPreview | null;
  createErrors: { title?: string; content?: string };
  createInputRef: RefObject<HTMLTextAreaElement | null>;
  createIsSensitive: boolean;
  createMediaFiles: ComposerMedia[];
  createMentions: MentionEntry[];
  createSensitiveSuggested: boolean;
  creating: boolean;
  editingNoticeId: string | null;
  isOpen: boolean;
  mentionSuggestionsContent: ReactNode;
  onCategoryChange: (value: string) => void;
  onClose: () => void;
  onContentBlur: () => void;
  onContentChange: (value: string, caret: number) => void;
  onContentFocus: () => void;
  onDismissPreview: (url: string) => void;
  onMediaChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveMedia: (index: number) => void;
  onSensitiveChange: (checked: boolean) => void;
  onSubmit: () => void;
  onVideoTrimStartChange: (index: number, value: number) => void;
  onTitleChange: (value: string) => void;
  previewUrlLabel: (url: string) => string;
  remainingCreateWords: number;
  renderComposerTextWithMentions: (value: string, entries: MentionEntry[], placeholder: string, keyPrefix: string) => ReactNode;
  tags: TagOption[];
  title: string;
  translate: (value: string) => string;
};

export const NoticeBoardComposerModal = memo(({
  activePreviewUrl,
  category,
  composerUploadState,
  content,
  createContentPreview,
  createErrors,
  createInputRef,
  createIsSensitive,
  createMediaFiles,
  createMentions,
  createSensitiveSuggested,
  creating,
  editingNoticeId,
  isOpen,
  mentionSuggestionsContent,
  onCategoryChange,
  onClose,
  onContentBlur,
  onContentChange,
  onContentFocus,
  onDismissPreview,
  onMediaChange,
  onRemoveMedia,
  onSensitiveChange,
  onSubmit,
  onVideoTrimStartChange,
  onTitleChange,
  previewUrlLabel,
  remainingCreateWords,
  renderComposerTextWithMentions,
  tags,
  title,
  translate,
}: NoticeBoardComposerModalProps) => {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[5000] bg-black/50"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            onClick={(event) => event.stopPropagation()}
            className="fixed bottom-0 left-0 right-0 mx-auto max-h-[calc(100svh-env(safe-area-inset-bottom,0px)-8px)] w-full max-w-[var(--app-max-width,430px)] overflow-y-auto rounded-t-3xl bg-card px-6 pt-6 huddle-sheet-bottom-padding"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editingNoticeId ? translate("Edit Post") : translate("Create Post")}</h3>
              <button onClick={onClose}>
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="form-field-rest relative flex items-center">
                <select
                  value={category}
                  onChange={(event) => onCategoryChange(event.target.value)}
                  className="field-input-core bg-transparent pr-8 text-sm"
                >
                  {tags.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className={cn("form-field-rest relative flex items-center", createErrors.title && "form-field-error")}>
                  <input
                    type="text"
                    placeholder={translate("Title")}
                    value={title}
                    onChange={(event) => onTitleChange(event.target.value)}
                    className="field-input-core rounded-none border-0 bg-transparent px-0 py-0 shadow-none outline-none focus-visible:ring-0"
                    aria-invalid={Boolean(createErrors.title)}
                  />
                </div>
                {createErrors.title ? <p className="mt-1 text-xs text-destructive">{createErrors.title}</p> : null}
              </div>

              <div>
                <div className={cn("form-field-rest relative h-auto min-h-[132px] py-3", createErrors.content && "form-field-error")}>
                  <div className="relative min-h-[108px]">
                    <div className="pointer-events-none min-h-[108px] whitespace-pre-wrap break-words text-sm leading-5">
                      {renderComposerTextWithMentions(content, createMentions, translate("What's on your mind?"), "create-composer")}
                    </div>
                    <Textarea
                      ref={createInputRef}
                      value={content}
                      onChange={(event) => onContentChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
                      onFocus={onContentFocus}
                      onBlur={onContentBlur}
                      className="field-input-core absolute inset-x-0 bottom-0 top-0 min-h-[108px] resize-none rounded-none border-0 bg-transparent px-0 py-0 text-transparent caret-[var(--text-primary)] shadow-none outline-none focus-visible:ring-0"
                      aria-invalid={Boolean(createErrors.content)}
                    />
                  </div>
                </div>
                {activePreviewUrl ? (
                  <div className="relative mt-2">
                    <button
                      type="button"
                      onClick={() => onDismissPreview(activePreviewUrl)}
                      aria-label="Remove link preview"
                      className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-brandText shadow-sm hover:bg-background"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <a
                      href={activePreviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="form-field-rest block !h-auto !overflow-hidden !p-0 transition-colors hover:bg-muted/20"
                    >
                      {createContentPreview?.image ? (
                        <img
                          src={createContentPreview.image}
                          alt={createContentPreview.title || "Link preview"}
                          className="h-40 w-full object-cover"
                        />
                      ) : null}
                      <div className="space-y-1.5 px-3 py-2.5">
                        <p className="text-xs text-[rgba(74,73,101,0.62)]">
                          {createContentPreview?.siteName || (() => {
                            try {
                              return new URL(activePreviewUrl).hostname.replace(/^www\./, "");
                            } catch {
                              return "External link";
                            }
                          })()}
                        </p>
                        <p className="line-clamp-2 text-[15px] font-semibold leading-5 text-brandText">
                          {createContentPreview?.title || previewUrlLabel(activePreviewUrl)}
                        </p>
                        {createContentPreview?.loading ? (
                          <p className="text-xs text-[rgba(74,73,101,0.62)]">Loading preview...</p>
                        ) : null}
                        {createContentPreview?.failed ? (
                          <p className="text-xs text-[rgba(74,73,101,0.62)]">
                            Preview unavailable{import.meta.env.DEV && createContentPreview.error ? `: ${createContentPreview.error}` : ""}
                          </p>
                        ) : null}
                      </div>
                    </a>
                  </div>
                ) : null}
                {mentionSuggestionsContent}
                {remainingCreateWords < 0 ? (
                  <div className="mt-2 text-right text-xs font-medium text-destructive">{remainingCreateWords}</div>
                ) : null}
                {createErrors.content ? <p className="mt-1 text-xs text-destructive">{createErrors.content}</p> : null}
              </div>
            </div>

            {createMediaFiles.length > 0 ? (
              <div className="mb-4 mt-4 flex flex-wrap items-start gap-3">
                {createMediaFiles.map((item, index) => (
                  <div key={`create-media-${index}`} className="w-[150px] shrink-0">
                    <div className="relative overflow-hidden rounded-[24px]">
                      <MediaThumb
                        src={item.previewUrl}
                        alt="Thread preview"
                        className={cn(
                          "block w-full rounded-[24px]",
                          composerUploadState.scope === "thread" && composerUploadState.status === "uploading" && "opacity-70 blur-[1.5px]",
                        )}
                        style={{ aspectRatio: `${item.aspectRatio || 1}` }}
                      />
                      {item.kind === "video" ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45">
                            <Play className="ml-0.5 h-4 w-4 fill-current" />
                          </span>
                        </div>
                      ) : null}
                      {composerUploadState.scope === "thread" && composerUploadState.status === "uploading" ? (
                        <div className="pointer-events-none absolute inset-0 z-[8] flex items-center justify-center bg-black/25 text-xs font-semibold text-white">
                          Uploading {Math.round(composerUploadState.progress)}%
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onRemoveMedia(index)}
                        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/45"
                      >
                        <X className="h-4 w-4 text-white" />
                      </button>
                    </div>
                    {item.kind === "video" ? (
                      <div className="mt-2 rounded-2xl border border-border/70 bg-muted/30 p-2">
                        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-[rgba(74,73,101,0.72)]">
                          <Scissors className="h-3.5 w-3.5" />
                          <span>
                            {item.needsTrim
                              ? `Trim to ${Math.min(15, Math.round(item.durationSeconds || 15))}s`
                              : `${Math.min(15, Math.round(item.durationSeconds || 0))}s video`}
                          </span>
                        </div>
                        {item.needsTrim ? (
                          <input
                            type="range"
                            min={0}
                            max={Math.max(0, Math.floor((item.durationSeconds || 15) - 15))}
                            step={0.5}
                            value={item.trimStartSeconds || 0}
                            onChange={(event) => onVideoTrimStartChange(index, Number(event.target.value))}
                            className="w-full accent-primary"
                            aria-label="Trim start"
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {createMediaFiles.length > 0 ? (
              <div className="mb-4">
                <label className="flex items-start gap-2 text-xs text-[rgba(74,73,101,0.78)]">
                  <input
                    type="checkbox"
                    checked={createIsSensitive}
                    onChange={(event) => onSensitiveChange(event.target.checked)}
                    className="mt-[2px] h-4 w-4 rounded border-border"
                  />
                  <span>This photo contains injury, blood, sensitive or disturbing content</span>
                </label>
                {createSensitiveSuggested ? <p className="mt-1 text-xs text-[#B46900]">Detected possible sensitive content</p> : null}
              </div>
            ) : null}

            <div className="mt-3 flex items-center gap-3 pb-2">
              <label className="cursor-pointer rounded-full bg-muted p-2 hover:bg-muted/80">
                <Image className="h-5 w-5 text-muted-foreground" />
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={onMediaChange}
                  className="hidden"
                />
              </label>

              <NeuButton
                onClick={onSubmit}
                disabled={creating || !content.trim() || !title.trim() || remainingCreateWords < 0}
                className="h-12 flex-1 rounded-xl bg-primary text-white hover:bg-primary/90"
              >
                {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : "Post"}
              </NeuButton>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
});

NoticeBoardComposerModal.displayName = "NoticeBoardComposerModal";
