import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NeuButton } from "@/components/ui/NeuButton";
import { cn } from "@/lib/utils";

const REVIEW_TAGS = [
  "Punctual",
  "Great with pets",
  "Clear communication",
  "Friendly",
  "Reliable",
  "Patient",
  "Attentive",
  "Professional",
  "Flexible",
  "Helpful",
  "Clean and tidy",
  "Followed instructions",
];

type Props = {
  open: boolean;
  onClose: () => void;
  providerName: string;
  onSubmit: (rating: number, tags: string[], text: string) => Promise<void>;
};

export const ReviewFlow = ({ open, onClose, providerName, onSubmit }: Props) => {
  const [rating, setRating] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(rating, tags, text.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>How was {providerName}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={cn(
                  "h-9 w-9 rounded-full border text-sm font-bold",
                  rating >= star ? "border-[#f3be4f] bg-[#f3be4f]/25 text-[#b67d03]" : "border-border text-muted-foreground"
                )}
                onClick={() => setRating(star)}
              >
                ★
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {REVIEW_TAGS.map((tag) => {
              const selected = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={cn("rounded-full px-3 py-1 text-xs", selected ? "bg-primary text-primary-foreground" : "bg-muted text-brandText")}
                  onClick={() => setTags((prev) => (selected ? prev.filter((item) => item !== tag) : [...prev, tag]))}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Write a public review" className="w-full rounded-xl border border-border bg-background px-3 py-2" />
        </div>
        <DialogFooter className="!flex-row gap-2">
          <NeuButton variant="secondary" onClick={onClose}>Cancel</NeuButton>
          <NeuButton onClick={() => void submit()} disabled={submitting}>
            Submit review
          </NeuButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

