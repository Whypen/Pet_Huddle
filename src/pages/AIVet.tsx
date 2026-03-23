/**
 * AIVet — T6 Conversational
 * GlobalHeader replaces custom glass-bar ChatHeader.
 * PetSelector moved to a permanent strip below the header.
 * MODE_A (empty) and MODE_B (conversation active).
 * No persona name · No "24/7" · No paw emoji · No blob gradient.
 */

import React, { useState, useRef, useEffect } from "react";
import { Activity, Salad, MapPin } from "lucide-react";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { Composer } from "@/components/chat/Composer";
import { NeuControl, NeuDropdown } from "@/components/ui";
import { BOTTOM_NAV_HEIGHT } from "@/components/layout/BottomNav";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  variant: "sent" | "ai";
  text: string;
}

interface Pet {
  id: string;
  name: string;
}

// ─── Suggestion chips ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { icon: Activity, label: "Check symptoms" },
  { icon: Salad,    label: "Nutrition tips" },
  { icon: MapPin,   label: "Find a vet" },
];

// ─── Component ────────────────────────────────────────────────────────────────

const AIVet: React.FC = () => {
  const { user, profile } = useAuth();

  const [messages, setMessages]       = useState<Message[]>([]);
  const [composerValue, setComposerValue] = useState("");
  const [isTyping, setIsTyping]       = useState(false);
  const [composerHeight, setComposerHeight] = useState(72);

  const [pets, setPets]               = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string | undefined>();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);

  // Fetch pets for the current user
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("pets")
      .select("id, name")
      .eq("owner_id", user.id)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setPets(data as Pet[]);
          setSelectedPetId(data[0].id);
        }
      });
  }, [user?.id]);

  // Scroll to bottom on new message
  useEffect(() => {
    const didMessageCountChange = messages.length !== previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;
    if (!didMessageCountChange) return;
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const displayName = profile?.display_name ?? "there";
  const selectedPet = pets.find((p) => p.id === selectedPetId);
  const petName     = selectedPet?.name ?? "your pet";

  const warningH = 36; // approx height of WarningStrip
  const composerBottom = BOTTOM_NAV_HEIGHT + composerHeight + warningH;

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { id: Date.now().toString(), variant: "sent", text }]);
    setComposerValue("");
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          variant: "ai",
          text: `I'm here to help with ${petName}. Could you share more details about the symptoms, age, and breed?`,
        },
      ]);
    }, 1800);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full min-h-0 flex flex-col relative overflow-x-hidden">

      {/* GlobalHeader — same as all pages */}
      <GlobalHeader />

      {/* Pet selector dropdown — always visible below header */}
      {pets.length > 0 && (
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <NeuDropdown
            placeholder="Select a pet…"
            options={pets.map((p) => ({ value: p.id, label: p.name }))}
            value={selectedPetId}
            onValueChange={setSelectedPetId}
          />
        </div>
      )}

      {/* ── MODE_A: Empty state ──────────────────────────────────────────────── */}
      {messages.length === 0 && !isTyping ? (
        <main
          className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-[20px]"
          style={{
            paddingBottom: `calc(${composerBottom + 24}px + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          {/* Greeting */}
          <h2
            className="text-[24px] font-[700] leading-[1.20] tracking-[-0.01em] text-[var(--text-primary)] mt-[24px] text-center"
          >
            Hi, {displayName}.
          </h2>
          <p className="text-[15px] font-[400] leading-[1.55] text-[var(--text-secondary)] mt-[8px] text-center max-w-[32ch]">
            What's going on with {petName}?
          </p>

          {/* Quick chips */}
          <div className="flex flex-wrap justify-center gap-[8px] mt-[24px]">
            {SUGGESTIONS.map(({ icon: Icon, label }) => (
              <NeuControl
                key={label}
                variant="secondary"
                size="sm"
                onClick={() => sendMessage(label)}
              >
                <Icon size={14} strokeWidth={1.75} aria-hidden />
                {label}
              </NeuControl>
            ))}
          </div>
        </main>
      ) : (
        /* ── MODE_B: Conversation active ──────────────────────────────────── */
        <main
          className="flex-1 min-h-0 overflow-y-auto px-[16px] space-y-[16px] pt-[12px]"
          style={{
            paddingBottom: `calc(${composerBottom + 16}px + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          {messages.map((msg) => (
            <ChatBubble key={msg.id} variant={msg.variant}>
              {msg.text}
            </ChatBubble>
          ))}
          {isTyping && <ChatBubble variant="ai" typing />}
          <div ref={messagesEndRef} />
        </main>
      )}

      {/* ── WarningStrip — always fixed ─────────────────────────────────────── */}
      <div
        className="fixed inset-x-0 z-[15] px-[20px] py-[8px] text-center"
        style={{ bottom: `${BOTTOM_NAV_HEIGHT + composerHeight}px` }}
      >
        <span className="text-[11px] font-[400] leading-[1.45] text-[var(--text-tertiary)]">
          Not a substitute for a vet. For information only.
        </span>
      </div>

      {/* ── Composer — always fixed ─────────────────────────────────────────── */}
      <Composer
        value={composerValue}
        onChange={setComposerValue}
        onSend={() => sendMessage(composerValue)}
        navOffset={BOTTOM_NAV_HEIGHT}
        placeholder={`Ask anything about ${petName}…`}
        onHeightChange={setComposerHeight}
        showAttach={false}
        showCamera
        alwaysShowSend
        hideTopBorder
      />
    </div>
  );
};

export default AIVet;
