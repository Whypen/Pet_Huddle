import { motion } from "framer-motion";
import { PawPrint } from "lucide-react";
import { resolveCopy } from "@/lib/copy";
import firstJourneyImage from "@/assets/Notifications/Main Page (no Pet).png";
import exploreImage from "@/assets/Notifications/Main Page_Cat.png";

interface EmptyPetStateProps {
  onAddPet: () => void;
  firstTimeFromSetProfile?: boolean;
}

export const EmptyPetState = ({ onAddPet, firstTimeFromSetProfile = false }: EmptyPetStateProps) => {
  const t = resolveCopy;
  const title = firstTimeFromSetProfile
    ? "Your journey into huddle starts here."
    : "The best way to begin is simply to explore.";
  const imageSrc = firstTimeFromSetProfile ? firstJourneyImage : exploreImage;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl p-6 shadow-card"
      >
        <h2 className="text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965] mb-3">
          {title}
        </h2>

        <img
          src={imageSrc}
          alt=""
          aria-hidden
          className="w-full object-contain"
        />

        {firstTimeFromSetProfile ? (
          <>
            <p className="mt-3 text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed">
              Let&apos;s build a community where no pet is left behind—where we look out for the lost and the stray, while you prepare for your own first addition.
            </p>
            <p className="mt-2 text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed">
              Jump into <strong className="font-[600] text-[#000000]">Chats</strong> to find your people, check the{" "}
              <strong className="font-[600] text-[#000000]">Map</strong> to keep the community safe, or head to{" "}
              <strong className="font-[600] text-[#000000]">Social</strong> to lend a hand.
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed">
              Huddle is built by more than just pet owners; it&apos;s built by trusted guardians.
            </p>
            <p className="mt-2 text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed">
              Get verified to join the pack—protecting the lost on the <strong className="font-[600] text-[#000000]">Map</strong>, lending a hand in{" "}
              <strong className="font-[600] text-[#000000]">Social</strong>, and finding your people in{" "}
              <strong className="font-[600] text-[#000000]">Chats</strong>.
            </p>
            <p className="mt-2 text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed">
              Every great story starts with a first step.
            </p>
          </>
        )}
      </motion.div>

      <button
        type="button"
        onClick={onAddPet}
        aria-label={t("Add Your First Pet")}
        className="fixed right-5 bottom-[calc(64px+env(safe-area-inset-bottom)+35px)] z-30 h-14 w-14 rounded-full border border-white/40 bg-white/30 shadow-md backdrop-blur-md flex items-center justify-center transition-all duration-200"
      >
        <PawPrint className="w-6 h-6 text-[var(--text-secondary)]" />
      </button>
    </>
  );
};
