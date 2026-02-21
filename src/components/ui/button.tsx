import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base: h-10 (40px), text-base 16px, 8px radius, 44px min-tap, focus ring
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-btn text-base font-medium",
    "min-h-[44px] h-10",
    "ring-offset-background transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2145CF] focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        // Neumorphic primary — Huddle Blue (spec §2.3)
        default: "neu-primary px-6 text-white font-semibold",
        // Neumorphic gold tier
        gold: "neu-gold px-6 font-semibold",
        // Flat secondary — no neu depth (per density rule)
        secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80 px-4",
        // Ghost — text link style
        ghost: "hover:bg-muted text-brandText px-4",
        // Outline
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4",
        // Destructive — flat red, not neumorphic
        destructive: "bg-brandError text-white hover:bg-brandError/90 px-4",
        // Link
        link: "text-primary underline-offset-4 hover:underline px-0 h-auto min-h-0",
      },
      size: {
        default: "h-10 min-h-[44px] px-6",
        sm:      "h-10 min-h-[44px] px-4 text-sub",
        lg:      "h-12 min-h-[44px] px-8 text-base",
        icon:    "h-[44px] w-[44px] p-0 rounded-full neu-icon",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
