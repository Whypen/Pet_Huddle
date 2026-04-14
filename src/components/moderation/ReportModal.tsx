import { useCallback, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export type ReportSource = "Chat" | "Group Chat" | "Social" | "Map";

const REPORT_CATEGORIES = [
  "Unsafe behavior or Safety Incident or Threat",
  "Animal Welfare or Cruelty",
  "Privacy Violation",
  "Suspicious Behavior or Potential Scam",
  "False Information or \"Crying Wolf\" (Fake alerts)",
  "Inappropriate or Explicit Content",
  "Harassment or Hate Speech or Offensive Content",
  "Commercial Spam",
  "Others",
] as const;

type ReportCategory = (typeof REPORT_CATEGORIES)[number];

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  targetUserId: string | null;
  targetName?: string;
  source: ReportSource;
  onSubmitSuccess?: () => Promise<void> | void;
}

async function uploadReportImages(files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `reports/attachments/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("notices").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) continue;
    const { data } = supabase.storage.from("notices").getPublicUrl(path);
    if (data?.publicUrl) urls.push(data.publicUrl);
  }
  return urls;
}

export function ReportModal({
  open,
  onClose,
  targetUserId,
  targetName,
  source,
  onSubmitSuccess,
}: ReportModalProps) {
  const { profile } = useAuth();
  const [reasons, setReasons] = useState<Set<ReportCategory>>(new Set());
  const [otherText, setOtherText] = useState("");
  const [details, setDetails] = useState("");
  const [uploads, setUploads] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setReasons(new Set());
    setOtherText("");
    setDetails("");
    setUploads([]);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleSubmit = useCallback(async () => {
    if (!profile?.id) {
      toast.error("Please login to report.");
      return;
    }
    if (!targetUserId) {
      toast.error("Unable to submit report right now.");
      return;
    }
    const selectedCategories = Array.from(reasons);
    if (selectedCategories.length === 0) {
      toast.error("Select at least one reason.");
      return;
    }
    setSubmitting(true);
    try {
      const attachmentUrls = await uploadReportImages(uploads);

      // Score + apply enforcement via DB function
      await (
        supabase.rpc as (
          fn: string,
          args?: Record<string, unknown>
        ) => Promise<{ error: unknown }>
      )("process_user_report", {
        p_target_id: targetUserId,
        p_categories: selectedCategories,
        p_details: details.trim() || null,
        p_attachment_urls: attachmentUrls,
      });

      // Fire email via edge function (best-effort)
      void supabase.functions.invoke("support-request", {
        body: {
          userId: profile.id,
          subject: `Report: ${targetName || targetUserId}`,
          message: JSON.stringify({
            target_user_id: targetUserId,
            categories: selectedCategories,
            other: reasons.has("Others") ? otherText.trim() : "",
            details: details.trim(),
            attachments: attachmentUrls,
          }),
          email: (profile as unknown as { email?: string }).email || null,
          source,
        },
      });

      await onSubmitSuccess?.();
      toast.success("Report sent");
      handleClose();
    } catch {
      toast.error("Unable to submit report right now.");
    } finally {
      setSubmitting(false);
    }
  }, [
    details,
    handleClose,
    otherText,
    profile,
    reasons,
    source,
    targetName,
    targetUserId,
    onSubmitSuccess,
    uploads,
  ]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report</DialogTitle>
          <DialogDescription>
            Tell us what happened so we can protect the community.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            {REPORT_CATEGORIES.map((cat) => (
              <label key={cat} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reasons.has(cat)}
                  onChange={(e) => {
                    setReasons((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(cat);
                      else next.delete(cat);
                      return next;
                    });
                  }}
                />
                <span>{cat}</span>
              </label>
            ))}
          </div>
          {reasons.has("Others") && (
            <div className="form-field-rest relative flex items-center">
              <input
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Other reason"
                className="field-input-core"
              />
            </div>
          )}
          <div className="form-field-rest relative h-auto min-h-[96px] py-3">
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Add details (optional)"
              className="field-input-core min-h-[72px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
          <div>
            <button
              type="button"
              className="neu-icon h-10 w-10"
              onClick={() => imageInputRef.current?.click()}
              aria-label="Upload image"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setUploads((prev) => [...prev, ...files].slice(0, 5));
                e.currentTarget.value = "";
              }}
            />
            {uploads.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {uploads.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="h-[96px] w-[96px] overflow-hidden rounded-xl bg-muted/30"
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Upload ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="h-11 w-full rounded-full bg-brandBlue text-sm font-semibold text-white disabled:opacity-45"
          >
            {submitting ? "Sending..." : "Send report"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
