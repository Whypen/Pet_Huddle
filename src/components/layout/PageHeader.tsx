import { Settings, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  onSettingsClick: () => void;
}

export const PageHeader = ({ title, showBack, onSettingsClick }: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between px-4 py-4 sticky top-0 bg-background/95 backdrop-blur-sm z-40">
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-2xl font-bold">{title}</h1>
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
