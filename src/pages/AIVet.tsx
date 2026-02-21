import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Mic, Send, Lock, Loader2, Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";
import aiVetAvatar from "@/assets/ai-vet-avatar.jpg";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PlusUpsell } from "@/components/social/PlusUpsell";
import { PlusFooter } from "@/components/monetization/PlusFooter";
import { useAuth } from "@/contexts/AuthContext";
import { useApi } from "@/hooks/useApi";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { compressImage, getImageDataUrl } from "@/lib/imageCompression";
import { normalizeMembershipTier } from "@/lib/membership";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  dob: string | null;
  weight: number | null;
  weight_unit: string | null;
  bio?: string | null;
  routine?: string | null;
  medications?: Array<{ name?: string; dosage?: string; frequency?: string; notes?: string }> | null;
  vaccinations?: Array<{ name?: string; date?: string }> | null;
}

const AIVet = () => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const { sendAiVetMessage, createAiVetConversation, getAiVetUsage } = useApi();
  const navigate = useNavigate();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPlusOpen, setIsPlusOpen] = useState(false);
  const [isPlusFooterOpen, setIsPlusFooterOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showEmergencyPrompt, setShowEmergencyPrompt] = useState(false);
  const [sendError, setSendError] = useState<{ title: string; description: string } | null>(null);
  const lastSendRef = useRef<{
    content: string;
    petId?: string | null;
    petProfile?: {
      name: string;
      species: string;
      breed: string | null;
      age: number | null;
      weight: number | null;
      weight_unit: string | null;
      history: string;
      medications: Array<{ name?: string; dosage?: string; frequency?: string; notes?: string }>;
      vaccinations: Array<{ name?: string; date?: string }>;
    };
    imageBase64?: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const membershipTier = normalizeMembershipTier(profile?.effective_tier ?? profile?.tier);
  const isPlus = membershipTier === "plus" || membershipTier === "gold";

  // Fetch user's pets
  useEffect(() => {
    if (user) {
      fetchPets();
      checkUsage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Contract override: AI Vet media is gated by QMS on upload. UI allows attach for Plus/Gold
  // and relies on the Edge Function to enforce plan limits.
  // UI gate: show lock if not plus/gold.
  const hasMediaCredits = isPlus;

  // Add initial greeting when conversation starts
  useEffect(() => {
    if (messages.length === 0 && selectedPet) {
      const petAge = selectedPet.dob
        ? Math.floor((Date.now() - new Date(selectedPet.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null;

      const greeting: Message = {
        id: "greeting",
        role: "assistant",
        content: `${t("Hello there! I'm Dr. Huddle, your friendly AI pet assistant. 🐾")}\n\n${t("I see you've selected")} ${selectedPet.name}${selectedPet.breed ? `, ${t("your")} ${selectedPet.breed}` : ""}${petAge ? ` (${petAge} ${t(petAge > 1 ? "years" : "year")} ${t("old")})` : ""}. ${t("I'm here to help with any questions about")} ${selectedPet.name}${t("'s health and wellness.")}\n\n${t("While I can provide helpful information and guidance, remember that I'm always happy to point you toward your local vet for hands-on care.")} ${t("What can I help you with today?")}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages([greeting]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPet]);

  const fetchPets = async () => {
    try {
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, species, breed, dob, weight, weight_unit, bio, routine, medications, vaccinations")
        .eq("owner_id", user!.id)
        .eq("is_active", true);

      if (!error && data && data.length > 0) {
        setPets(data as unknown as Pet[]);
        setSelectedPet(data[0] as unknown as Pet);
      }
    } catch (error) {
      console.error("Error fetching pets:", error);
    }
  };

  const checkUsage = async () => {
    if (!isPlus) {
      const result = await getAiVetUsage() as { success?: boolean; data?: { remaining?: number } };
      if (result.success && result.data) {
        setRemaining(result.data.remaining);
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const buildPetProfile = () => {
    if (!selectedPet) return undefined;
    return {
      name: selectedPet.name,
      species: selectedPet.species,
      breed: selectedPet.breed,
      age: selectedPet.dob
        ? Math.floor((Date.now() - new Date(selectedPet.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null,
      weight: selectedPet.weight,
      weight_unit: selectedPet.weight_unit,
      history: selectedPet.bio || selectedPet.routine || "",
      medications: selectedPet.medications || [],
      vaccinations: selectedPet.vaccinations || [],
    };
  };

  const sendMessage = async (options: { content: string; appendUserMessage: boolean; imageBase64Override?: string }) => {
    const trimmed = options.content.trim();
    if (!trimmed || isLoading) return;

    // Check rate limit for free users
    if (!isPlus && remaining !== null && remaining <= 0) {
      setShowUpgradeModal(true);
      setIsPlusOpen(true);
      return;
    }

    setSendError(null);
    if (options.appendUserMessage) {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInputValue("");
    }
    setIsLoading(true);

    try {
      const petProfile = buildPetProfile();
      lastSendRef.current = {
        content: trimmed,
        petId: selectedPet?.id ?? null,
        petProfile,
        imageBase64: options.imageBase64Override,
      };

      // Create conversation if needed
      let currentConversationId = conversationId;
      if (!currentConversationId) {
        const createResult = await createAiVetConversation(selectedPet?.id) as { success?: boolean; data?: { id?: string } };
        if (createResult.success && createResult.data?.id) {
          currentConversationId = createResult.data.id;
          setConversationId(currentConversationId);
        } else {
          setSendError({
            title: "We couldn’t start the chat",
            description: "Please try again in a moment. If this keeps happening, check your connection.",
          });
          return;
        }
      }

      // Send message to backend
      let imageBase64 = options.imageBase64Override;
      if (!imageBase64 && imageFile) {
        try {
          const reader = new FileReader();
          imageBase64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
          });
          imageBase64 = imageBase64.split(",")[1] || imageBase64;
        } catch (error) {
          console.error("AI Vet image encoding error:", error);
          setSendError({
            title: "Image couldn’t be attached",
            description: "Please try again or send your message without a photo.",
          });
          return;
        }
      }
      lastSendRef.current = {
        content: trimmed,
        petId: selectedPet?.id ?? null,
        petProfile,
        imageBase64,
      };

      const result = await sendAiVetMessage(currentConversationId, trimmed, selectedPet?.id, petProfile, imageBase64) as { success?: boolean; data?: { message: string; remaining?: number; triage?: boolean }; error?: string };

      if (result.success && result.data) {
        const aiMessage: Message = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: result.data.message,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, aiMessage]);

        // Update remaining count for free users
        if (!isPlus && result.data.remaining !== undefined) {
          setRemaining(result.data.remaining);
        }
        if (result.data.triage) {
          setShowEmergencyPrompt(true);
        }
        setImageFile(null);
        setImagePreview(null);
      } else if (result.error === "rate_limit_exceeded" || result.error === "quota_exceeded") {
        setShowUpgradeModal(true);
        setIsPlusOpen(true);
        toast.error(t("ai.errors.free_limit"));
      } else {
        setSendError({
          title: "We couldn’t get a response",
          description: "Please retry your message. If the issue continues, check your connection.",
        });
      }
    } catch (error: unknown) {
      console.error("AI Vet error:", error);
      setSendError({
        title: "We couldn’t get a response",
        description: "Please retry your message. If the issue continues, check your connection.",
      });
      toast.error(t("Failed to get response"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    void sendMessage({ content: inputValue, appendUserMessage: true });
  };

  const handleRetryLast = async () => {
    if (!lastSendRef.current || isLoading) return;
    void sendMessage({
      content: lastSendRef.current.content,
      appendUserMessage: false,
      imageBase64Override: lastSendRef.current.imageBase64,
    });
  };

  const handleMediaAccess = async () => {
    try {
      if (!user) return;
      if (!isPlus) {
        setIsPlusOpen(true);
        return;
      }
      imageInputRef.current?.click();
    } catch (error) {
      console.error("Failed to refresh media credits:", error);
      setIsPlusOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-nav">
      <GlobalHeader
        onUpgradeClick={() => setIsPlusOpen(true)}
        onMenuClick={() => setIsSettingsOpen(true)}
      />

      {/* Chat Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <img src={aiVetAvatar} alt={t("Dr. Huddle")} className="w-10 h-10 rounded-full object-cover" />
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-accent rounded-full border-2 border-card" />
            </div>
            <div>
              <h1 className="font-semibold">{t("Dr. Huddle")}</h1>
              <span className="text-xs text-accent">{t("Online")}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Analysis Bar - Pet Selector */}
      <div className="px-4 py-2 bg-primary-soft border-b border-border">
        {pets.length > 0 ? (
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm text-muted-foreground">{t("Analyzing for:")}</span>
            <select
              value={selectedPet?.id || ""}
              onChange={(e) => {
                const pet = pets.find((p) => p.id === e.target.value);
                setSelectedPet(pet || null);
                setMessages([]);
                setConversationId(null);
              }}
              className="bg-transparent font-medium text-sm border-none focus:outline-none cursor-pointer"
            >
              {pets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {pet.name} ({pet.species})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm text-center text-muted-foreground">
            No pets found.{" "}
            <button onClick={() => navigate("/edit-pet-profile")} className="text-primary underline">
              Add a pet
            </button>{" "}
            for personalized advice.
          </p>
        )}

        {/* Free tier remaining count */}
        {!isPlus && remaining !== null && (
          <p className="text-xs text-center text-muted-foreground mt-1">
            {remaining > 0
              ? t("ai.free_remaining").replace("{count}", String(remaining))
              : t("ai.free_exhausted")}
          </p>
        )}
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-[calc(var(--nav-height)+120px)]">
        {sendError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
            <div className="font-semibold">{sendError.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{sendError.description}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={handleRetryLast}
                className="inline-flex items-center justify-center rounded-full bg-destructive px-4 py-2 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
                disabled={isLoading}
              >
                Retry
              </button>
              <button
                onClick={() => setSendError(null)}
                className="inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02 }}
            className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3",
                message.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-accent-soft text-foreground rounded-bl-sm"
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              <span
                className={cn(
                  "text-xs mt-1 block",
                  message.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
                )}
              >
                {message.timestamp}
              </span>
            </div>
          </motion.div>
        ))}

        {/* Loading indicator */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex justify-start"
            >
              <div className="bg-accent-soft rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t("Dr. Huddle is thinking...")}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Safety Disclaimer */}
      <div className="fixed bottom-[calc(var(--nav-height)+64px)] left-0 right-0 bg-muted/90  px-4 py-2 border-t border-border">
        <p className="text-[10px] text-muted-foreground text-center max-w-md mx-auto">
          huddle AI provides informational content, not veterinary diagnosis. In emergencies, seek professional care immediately.
        </p>
      </div>

      {/* Input Area */}
      <div className="fixed bottom-nav left-0 right-0 bg-card border-t border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-md mx-auto">
          {/* Photo upload - Plus only */}
          <button
            onClick={handleMediaAccess}
            className={cn("p-2 rounded-full hover:bg-muted transition-colors relative", !hasMediaCredits && "opacity-50")}
          >
            <Camera className="w-5 h-5 text-muted-foreground" />
            {!hasMediaCredits && <Lock className="w-3 h-3 text-primary absolute -top-0.5 -right-0.5" />}
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const compressed = await compressImage(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1600, useWebWorker: true });
                if (compressed.size > 500 * 1024) {
                  toast.error(t("Image must be under 500KB"));
                  return;
                }
                setImageFile(compressed);
                const preview = await getImageDataUrl(compressed);
                setImagePreview(preview);
              } catch (err) {
                toast.error(t("Failed to process image"));
              } finally {
                e.target.value = "";
              }
            }}
          />

          <div className="flex-1 relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              className="w-full bg-muted rounded-full px-4 py-3 pr-12 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              disabled={isLoading}
            />
            {/* Audio button - Plus only */}
            <button
              onClick={handleMediaAccess}
              className={cn("absolute right-3 top-1/2 -translate-y-1/2 p-1", !hasMediaCredits && "opacity-50")}
            >
              {hasMediaCredits ? (
                <Mic className="w-5 h-5 text-muted-foreground" />
              ) : (
                <div className="relative">
                  <Mic className="w-5 h-5 text-muted-foreground" />
                  <Lock className="w-3 h-3 text-primary absolute -top-1 -right-1" />
                </div>
              )}
            </button>
          </div>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            className={cn(
              "p-3 rounded-full bg-primary text-primary-foreground",
              (isLoading || !inputValue.trim()) && "opacity-50"
            )}
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </motion.button>
        </div>
        {imagePreview && (
          <div className="mt-2 max-w-md mx-auto">
            <img src={imagePreview} alt={t("Preview")} className="rounded-xl max-h-40 object-cover w-full" />
          </div>
        )}
        {showEmergencyPrompt && (
          <div className="mt-2 max-w-md mx-auto rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between">
            <span>{t("Emergency detected. Open Map for immediate assistance.")}</span>
            <button className="text-destructive underline" onClick={() => navigate("/map?mode=broadcast")}>
              {t("Open Map")}
            </button>
          </div>
        )}
      </div>

      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <PlusUpsell isOpen={isPlusOpen} onClose={() => setIsPlusOpen(false)} />
      <PlusFooter
        isOpen={isPlusFooterOpen}
        onClose={() => setIsPlusFooterOpen(false)}
        triggerReason="chat_media"
      />
    </div>
  );
};

export default AIVet;
