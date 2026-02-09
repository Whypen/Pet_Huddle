import { motion } from "framer-motion";
import { PawPrint, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

interface EmptyPetStateProps {
  onAddPet: () => void;
}

export const EmptyPetState = ({ onAddPet }: EmptyPetStateProps) => {
  const { t } = useLanguage();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl p-8 shadow-card text-center"
    >
      <div className="w-20 h-20 rounded-full bg-[#2043cf]/10 flex items-center justify-center mx-auto mb-4">
        <PawPrint className="w-10 h-10 text-[#2043cf]" />
      </div>

      <div className="text-[20px] font-bold leading-7 mb-2">
        <h6>
          Welcome to <strong className="text-[#2143ce]">huddle</strong>
          <span className="text-[#2143ce]">’</span>s Pet Hub
        </h6>
      </div>
      <div className="text-[#4a4a4a] font-normal leading-5 mb-6 text-[12px]">
        <p className="text-[14px]">
          Add your furry friend to connect fully—or enjoy sightings and shares
          as an animal lover right away.
        </p>
      </div>

      <Button
        onClick={onAddPet}
        className="h-[36px] px-5 rounded-full bg-[#2043cf] hover:bg-[#2043cf]/90 text-white font-semibold text-sm"
      >
        <Plus className="w-4 h-4 mr-2" />
        {t("Add Your First Pet")}
      </Button>
    </motion.div>
  );
};
