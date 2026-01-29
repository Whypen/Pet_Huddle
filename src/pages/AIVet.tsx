import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Settings, ArrowLeft, Plus, Mic, Send, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import aiVetAvatar from "@/assets/ai-vet-avatar.jpg";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Message {
  id: number;
  type: "user" | "ai";
  text: string;
  timestamp: string;
}

const initialMessages: Message[] = [
  {
    id: 1,
    type: "ai",
    text: "Hello there! I'm Dr. Huddle, your friendly neighborhood AI assistant. I'm here to help you with any questions about Max's health and wellness. While I can provide helpful information and guidance, remember that I'm always happy to point you toward your local vet for hands-on care. What can I help you with today? 🐾",
    timestamp: "10:30 AM"
  },
  {
    id: 2,
    type: "user",
    text: "Hi! Max has been scratching his ear a lot lately. Should I be worried?",
    timestamp: "10:31 AM"
  },
  {
    id: 3,
    type: "ai",
    text: "I understand your concern - it's wonderful that you're paying such close attention to Max! Ear scratching can happen for several reasons: simple irritation, ear wax buildup, allergies, or sometimes ear infections. Could you take a peek inside Max's ear and let me know if you notice any redness, discharge, or unusual odor? A photo would be really helpful too! In the meantime, make sure he hasn't gotten any water in his ears recently. 🩺",
    timestamp: "10:31 AM"
  },
];

const AIVet = () => {
  const { profile } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  
  const isPremium = profile?.user_role === 'premium';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const newUserMessage: Message = {
      id: messages.length + 1,
      type: "user",
      text: inputValue,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newUserMessage]);
    setInputValue("");

    // Simulate AI response with professional yet warm tone
    setTimeout(() => {
      const aiResponse: Message = {
        id: messages.length + 2,
        type: "ai",
        text: "Thanks so much for sharing that with me! Based on what you've described, I'd suggest keeping a close eye on Max over the next day or two. Monitor for any changes in appetite, energy levels, or the symptoms you mentioned. If things don't improve within 48 hours, or if you notice anything concerning, I'd definitely recommend popping into your local vet for a check-up. They'll be able to give Max a proper hands-on examination. In the meantime, I'm here if you have any questions! 🐕",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, aiResponse]);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <GlobalHeader onUpgradeClick={() => setIsPremiumOpen(true)} />
      
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
              <img 
                src={aiVetAvatar} 
                alt="Dr. Huddle" 
                className="w-10 h-10 rounded-full object-cover"
              />
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-accent rounded-full border-2 border-card" />
            </div>
            <div>
              <h1 className="font-semibold">Dr. Huddle</h1>
              <span className="text-xs text-accent">Online</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 rounded-full hover:bg-muted transition-colors"
        >
          <Settings className="w-5 h-5 text-muted-foreground" />
        </button>
      </header>

      {/* Analysis Bar */}
      <div className="px-4 py-2 bg-primary-soft border-b border-border">
        <p className="text-sm text-center">
          <span className="text-muted-foreground">Analyzing for:</span>{" "}
          <span className="font-medium">Max (Golden Retriever, 5 y/o)</span>
        </p>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ paddingBottom: '180px' }}>
        {messages.map((message, index) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={cn(
              "flex",
              message.type === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div className={cn(
              "max-w-[80%] rounded-2xl px-4 py-3",
              message.type === "user"
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-accent-soft text-foreground rounded-bl-sm"
            )}>
              <p className="text-sm">{message.text}</p>
              <span className={cn(
                "text-xs mt-1 block",
                message.type === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
              )}>
                {message.timestamp}
              </span>
            </div>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Safety Disclaimer */}
      <div className="fixed bottom-[calc(var(--nav-height)+64px)] left-0 right-0 bg-muted/90 backdrop-blur-sm px-4 py-2 border-t border-border">
        <p className="text-xs text-muted-foreground text-center max-w-md mx-auto">
          ⚠️ Dr. Huddle is an AI assistant for informational purposes only. Information provided can be wrong. 
          Always seek professional veterinary opinions. Visit a clinic immediately if you have doubts or an emergency.
        </p>
      </div>

      {/* Input Area */}
      <div className="fixed bottom-nav left-0 right-0 bg-card border-t border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-md mx-auto">
          <button className="p-2 rounded-full hover:bg-muted transition-colors">
            <Plus className="w-6 h-6 text-muted-foreground" />
          </button>
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message..."
              className="w-full bg-muted rounded-full px-4 py-3 pr-12 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
            {/* Audio button - disabled for free users */}
            <button 
              onClick={() => !isPremium && setIsPremiumOpen(true)}
              className={cn(
                "absolute right-3 top-1/2 -translate-y-1/2 p-1",
                !isPremium && "opacity-50"
              )}
            >
              {isPremium ? (
                <Mic className="w-5 h-5 text-muted-foreground" />
              ) : (
                <div className="relative">
                  <Mic className="w-5 h-5 text-muted-foreground" />
                  <Lock className="w-3 h-3 text-amber-500 absolute -top-1 -right-1" />
                </div>
              )}
            </button>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleSend}
            className="p-3 rounded-full bg-primary text-primary-foreground"
          >
            <Send className="w-5 h-5" />
          </motion.button>
        </div>
      </div>

      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
    </div>
  );
};

export default AIVet;
