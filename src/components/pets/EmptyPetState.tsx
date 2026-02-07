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
      <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4">
        <PawPrint className="w-10 h-10 text-accent" />
      </div>
      
      <h2 className="text-xl font-bold mb-2">{t("Your Huddle is Empty")}</h2>
      <p className="text-muted-foreground text-sm mb-6">
        {t("Add your first pet to unlock full community features and connect with other pet lovers!")}
      </p>
      
      <Button
        onClick={onAddPet}
        className="h-14 px-8 rounded-2xl bg-primary hover:bg-primary/90 text-white font-semibold"
      >
        <Plus className="w-6 h-6 mr-2" />
        {t("Add Your First Pet")}
      </Button>
    </motion.div>
  );
};
