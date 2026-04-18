type Props = {
  onClick: () => void;
};

export const StartRequestBar = ({ onClick }: Props) => {
  return (
    <div className="border-t border-border/40 bg-background px-4 py-2 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+16px)]">
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-full py-3 px-4 flex items-center justify-center gap-2 bg-gradient-to-br from-[#2A53E0] to-[#1C3ECC] text-white text-[14px] font-semibold shadow-[0_4px_16px_rgba(33,69,207,0.28)]"
      >
        Start with a request
      </button>
    </div>
  );
};
