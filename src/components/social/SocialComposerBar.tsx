import type { ChangeEvent, RefObject } from "react";
import { Image } from "lucide-react";
import { SettingsAvatar } from "@/components/layout/SettingsAvatar";
import { cn } from "@/lib/utils";

export interface SocialComposerBarProps {
  avatarUrl?: string | null;
  displayName?: string | null;
  isVerified?: boolean;
  onOpen: () => void;
  value?: string;
  expanded?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  onContentChange?: (value: string, caret: number) => void;
  onContentFocus?: () => void;
  onContentBlur?: () => void;
  onMediaChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  className?: string;
}

export const SocialComposerBar = ({
  avatarUrl,
  displayName,
  isVerified = false,
  onOpen,
  value,
  expanded = false,
  inputRef,
  onContentChange,
  onContentFocus,
  onContentBlur,
  onMediaChange,
  onSubmit,
  submitDisabled = true,
  className,
}: SocialComposerBarProps) => {
  const writable = typeof onContentChange === "function";

  return (
    <div className={cn("border-b border-border/70 py-3", className)}>
      <div className="flex items-start gap-3">
        <SettingsAvatar displayName={displayName || "huddle"} avatarUrl={avatarUrl} isVerified={isVerified} size={40} />

        {writable ? (
          <textarea
            ref={inputRef}
            value={value ?? ""}
            rows={expanded ? 2 : 1}
            placeholder="What's happening?"
            onFocus={() => { onOpen(); onContentFocus?.(); }}
            onBlur={onContentBlur}
            onChange={(event) => {
              if (!expanded) onOpen();
              onContentChange(event.target.value, event.target.selectionStart ?? event.target.value.length);
            }}
            className={cn(
              "min-h-10 min-w-0 flex-1 resize-none rounded-[14px] border border-transparent bg-transparent px-3 py-2 text-[15px] font-medium leading-5 text-brandText outline-none transition-[background-color,border-color,box-shadow] placeholder:font-medium placeholder:text-[rgba(74,73,101,0.48)] hover:bg-muted/25 focus:border-brandBlue/35 focus:bg-background focus:shadow-[0_0_0_3px_rgba(33,69,207,0.10)] focus:outline-none",
              expanded && "min-h-16",
            )}
          />
        ) : (
          <textarea
            readOnly
            rows={1}
            value=""
            placeholder="What's happening?"
            onFocus={onOpen}
            onClick={onOpen}
            className="min-h-10 min-w-0 flex-1 resize-none rounded-[14px] border border-transparent bg-transparent px-3 py-2 text-[15px] font-medium leading-5 text-brandText outline-none placeholder:font-medium placeholder:text-[rgba(74,73,101,0.48)] hover:bg-muted/25 focus:border-brandBlue/35 focus:bg-background focus:shadow-[0_0_0_3px_rgba(33,69,207,0.10)]"
          />
        )}
      </div>

      {expanded ? <div className="mt-2 flex items-center justify-between pl-[52px]">
        {onMediaChange ? (
          <label className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-brandText" aria-label="Add photo or video">
            <Image className="h-5 w-5" />
            <input type="file" accept="image/*,video/*" multiple onChange={onMediaChange} className="hidden" />
          </label>
        ) : (
          <button type="button" onClick={onOpen} aria-label="Add photo or video" className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-brandText">
            <Image className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onClick={onSubmit ?? onOpen}
          disabled={writable ? submitDisabled : undefined}
          aria-disabled={writable ? submitDisabled : true}
          className="h-11 min-w-11 shrink-0 rounded-full bg-brandBlue px-4 text-[13px] font-bold text-white transition-opacity disabled:opacity-45"
        >
          Post
        </button>
      </div> : null}
    </div>
  );
};

export default SocialComposerBar;
