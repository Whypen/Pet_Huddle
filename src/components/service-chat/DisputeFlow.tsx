import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NeuButton } from "@/components/ui/NeuButton";

const DISPUTE_CATEGORIES = [
  "No-show",
  "Late arrival",
  "Poor service",
  "Injury / safety issue",
  "Wrong service delivered",
  "Property issue",
  "Payment issue",
  "Other",
];

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (category: string, description: string, evidenceUrls: string[]) => Promise<void>;
};

export const DisputeFlow = ({ open, onClose, onSubmit }: Props) => {
  const [category, setCategory] = useState(DISPUTE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(category, description.trim(), []);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dispute</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-10 rounded-xl border border-border bg-background px-3">
            {DISPUTE_CATEGORIES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe the issue" className="w-full rounded-xl border border-border bg-background px-3 py-2" />
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <AlertTriangle className="w-3.5 h-3.5" />
            Image evidence upload will be added in next pass.
          </p>
        </div>
        <DialogFooter className="!flex-row gap-2">
          <NeuButton variant="secondary" onClick={onClose}>Cancel</NeuButton>
          <NeuButton onClick={() => void submit()} disabled={submitting || !description.trim()}>
            Submit dispute
          </NeuButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

