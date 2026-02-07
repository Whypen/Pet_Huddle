import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  const isInvalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";
  return (
    <textarea
      className={cn(
        // UAT v1.1 input styling
        "flex min-h-[80px] w-full rounded-[12px] border bg-white px-3 py-2 text-sm text-center min-[600px]:text-left ring-offset-background",
        "border-brandText/40 placeholder:italic placeholder:text-gray-500/60",
        "focus-visible:outline-none focus-visible:border-brandBlue focus-visible:shadow-sm focus-visible:ring-0",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#f0f0f0]",
        isInvalid && "border-brandError text-brandError focus-visible:border-brandError",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
