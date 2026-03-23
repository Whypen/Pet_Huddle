export function ServiceSkeleton() {
  return (
    <div className="px-4 pb-28">
      <div className="grid grid-cols-2 gap-x-3">
        <div className="space-y-[14px]">
          <div className="h-[230px] rounded-[18px] bg-muted/60 animate-pulse" />
          <div className="h-[280px] rounded-[18px] bg-muted/60 animate-pulse" />
        </div>
        <div className="space-y-[14px] pt-[86px]">
          <div className="h-[255px] rounded-[18px] bg-muted/60 animate-pulse" />
          <div className="h-[210px] rounded-[18px] bg-muted/60 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
