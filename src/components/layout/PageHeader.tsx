import { Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "@/components/ui/BackButton";

interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  onSettingsClick: () => void;
}

export const PageHeader = ({ title, showBack, onSettingsClick }: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between px-4 sticky top-0 bg-background/95 backdrop-blur-sm z-40 h-12">
      <div className="flex items-center gap-3">
        {showBack && (
          <BackButton />
        )}
        <h1 className="text-base font-semibold">{title}</h1>
      </div>
      <button
        onClick={onSettingsClick}
        className="p-2 rounded-full hover:bg-muted transition-colors"
      >
        <Settings className="w-6 h-6 text-muted-foreground" />
      </button>
    </header>
  );
};
