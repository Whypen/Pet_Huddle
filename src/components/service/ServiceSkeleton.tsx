import { HuddleVideoLoader } from "@/components/ui/HuddleVideoLoader";

export function ServiceSkeleton() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <HuddleVideoLoader size={32} />
    </div>
  );
}
