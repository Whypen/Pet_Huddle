import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { LegalContent } from "@/components/legal/LegalContent";
import { BackButton } from "@/components/ui/BackButton";

const ServiceAgreement = () => (
  <div className="h-full min-h-0 w-full max-w-full bg-background overflow-x-hidden">
    <GlobalHeader />
    <header className="flex items-center gap-3 px-4 border-b border-border h-12">
      <BackButton />
      <h1 className="text-base font-semibold">Service Agreement</h1>
    </header>
    <div className="px-4 py-6">
      <LegalContent type="service-agreement" />
    </div>
  </div>
);

export default ServiceAgreement;
