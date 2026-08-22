import { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  fullBleed?: boolean;
};

export const AppShell = ({ children, fullBleed = false }: AppShellProps) => {
  if (fullBleed) {
    return (
      <div
        data-app-shell="fullbleed"
        className="min-h-[100svh] h-[100svh] w-full relative overflow-x-hidden flex flex-col [&>*:first-child]:flex-1 [&>*:first-child]:min-h-0"
      >
        {children}
      </div>
    );
  }

  return (
    <div
      data-app-shell="main"
      // Reads the design system token (global.css:25-32): 430px, widening to
      // 640px past lg. Not a hand-written breakpoint — the token already exists
      // and its own comment names the shell as a surface that should read it.
      className="w-full max-w-[var(--app-max-width,430px)] mx-auto min-h-[100svh] h-[100svh] relative overflow-x-hidden flex flex-col [&>*:first-child]:flex-1 [&>*:first-child]:min-h-0"
    >
      {children}
    </div>
  );
};
