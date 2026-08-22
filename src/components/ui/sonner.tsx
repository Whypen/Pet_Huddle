import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      // NativeToast is deliberately a light glass rail regardless of the
      // device colour scheme. Letting Sonner inherit `system` is what produced
      // the opaque black banner on a white Huddle surface.
      theme="light"
      className="toaster group"
      position="top-center"
      duration={4200}
      visibleToasts={1}
      gap={8}
      offset="calc(env(safe-area-inset-top, 0px) + 4px)"
      toastOptions={{
        duration: 4200,
        style: {
          background: "rgba(255,255,255,0.94)",
          borderColor: "rgba(255,255,255,0.85)",
          color: "#1C2135",
          boxShadow: "0 10px 28px rgba(33,69,207,0.18)",
        },
        classNames: {
          toast:
            "huddle-native-toast group toast !w-[min(430px,calc(100vw-24px))] !min-h-0 !items-center !overflow-hidden !rounded-[26px] !border !px-4 !py-[17px] !font-sans !backdrop-blur-2xl",
          success: "huddle-native-toast--done",
          info: "huddle-native-toast--system",
          warning: "huddle-native-toast--limit",
          error: "huddle-native-toast--failed",
          title: "!text-[16px] !font-extrabold !leading-[19px] !tracking-[-0.015em]",
          description: "!text-[12.5px] !font-semibold !leading-[17px] !text-brandText/75",
          icon: "huddle-native-toast__disc !grid !h-11 !w-11 !shrink-0 !place-items-center !rounded-full !border !border-white/70",
          actionButton: "!h-9 !rounded-full !bg-brandBlue !px-4 !font-bold !text-white",
          cancelButton: "!h-9 !rounded-full !bg-muted !px-4 !font-bold !text-brandText",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
