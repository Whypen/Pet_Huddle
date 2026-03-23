import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { NeuControl } from "@/components/ui/NeuControl";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ServiceProviderAgreement = () => {
  const navigate = useNavigate();
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <GlobalHeader />
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <NeuControl size="icon-md" variant="tertiary" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
        </NeuControl>
        <h1 className="text-xl font-bold">Service Provider Agreement</h1>
      </header>
      <div className="flex-1 min-h-0 overflow-hidden">
        <iframe
          src="/legal/service-provider-agreement.html"
          className="w-full h-full border-0"
          title="Service Provider Agreement"
        />
      </div>
    </div>
  );
};

export default ServiceProviderAgreement;
