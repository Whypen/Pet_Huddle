import { useState } from "react";
import { motion } from "framer-motion";
import { Settings, Stethoscope, MapPin, Users, MessageCircle, Plus, Check, Clock, Pill, Lightbulb } from "lucide-react";
import goldenRetriever from "@/assets/pets/golden-retriever.jpg";
import tabbyCat from "@/assets/pets/tabby-cat.jpg";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { cn } from "@/lib/utils";

const pets = [
  { id: 1, name: "Max", breed: "Golden Retriever", age: 5, weight: "32kg", image: goldenRetriever },
  { id: 2, name: "Whiskers", breed: "Tabby Cat", age: 3, weight: "4.5kg", image: tabbyCat },
];

const quickActions = [
  { icon: Stethoscope, label: "AI Vet", path: "/ai-vet", color: "bg-primary" },
  { icon: MapPin, label: "Map", path: "/map", color: "bg-accent" },
  { icon: Users, label: "Social", path: "/social", color: "bg-primary" },
  { icon: MessageCircle, label: "Chat", path: "/chats", color: "bg-accent" },
];

const timeline = [
  { time: "8:00 AM", event: "Morning Meal", status: "completed", icon: "🍖" },
  { time: "12:00 PM", event: "Mid-day Walk", status: "upcoming", icon: "🦮" },
  { time: "3:00 PM", event: "Play Time", status: "pending", icon: "🎾" },
  { time: "8:00 PM", event: "Evening Meds", status: "pending", icon: "💊" },
];

const Index = () => {
  const [selectedPet, setSelectedPet] = useState(pets[0]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background pb-nav">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-6 pb-4">
        <div>
          <motion.h1 
            className="text-2xl font-bold"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Hi, Alex! 👋
          </motion.h1>
          <p className="text-muted-foreground text-sm">Let's care for your pets</p>
        </div>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 rounded-full hover:bg-muted transition-colors"
        >
          <Settings className="w-6 h-6 text-muted-foreground" />
        </button>
      </header>

      {/* Pet Selector */}
      <section className="px-5 py-3">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
          {pets.map((pet) => (
            <motion.button
              key={pet.id}
              onClick={() => setSelectedPet(pet)}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "relative flex-shrink-0 w-16 h-16 rounded-full overflow-hidden ring-4 transition-all",
                selectedPet.id === pet.id
                  ? "ring-primary shadow-soft"
                  : "ring-transparent hover:ring-muted"
              )}
            >
              <img src={pet.image} alt={pet.name} className="w-full h-full object-cover" />
              {selectedPet.id === pet.id && (
                <motion.div 
                  layoutId="petHighlight"
                  className="absolute inset-0 bg-primary/20"
                />
              )}
            </motion.button>
          ))}
          <button className="flex-shrink-0 w-16 h-16 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
            <Plus className="w-6 h-6 text-muted-foreground" />
          </button>
        </div>
      </section>

      {/* Selected Pet Card */}
      <section className="px-5 py-3">
        <motion.div 
          layout
          className="relative rounded-2xl overflow-hidden shadow-card"
        >
          <div className="absolute inset-0">
            <img 
              src={selectedPet.image} 
              alt={selectedPet.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/40 to-transparent" />
          </div>
          <div className="relative p-5 pt-24">
            <motion.div
              key={selectedPet.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h2 className="text-2xl font-bold text-primary-foreground">{selectedPet.name}, {selectedPet.age} Years Old</h2>
              <div className="flex gap-4 mt-2 text-primary-foreground/80 text-sm">
                <span>Weight: {selectedPet.weight}</span>
                <span>•</span>
                <span>Breed: {selectedPet.breed}</span>
              </div>
              <div className="mt-4 bg-primary-foreground/20 backdrop-blur-sm rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-primary-foreground">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-medium">Next Event: Mid-day Walk, 12:00 PM</span>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Quick Actions */}
      <section className="px-5 py-4">
        <div className="flex justify-around">
          {quickActions.map((action, index) => (
            <motion.a
              key={action.label}
              href={action.path}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              whileTap={{ scale: 0.9 }}
              className="flex flex-col items-center gap-2"
            >
              <div className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center shadow-card",
                action.color
              )}>
                <action.icon className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{action.label}</span>
            </motion.a>
          ))}
        </div>
      </section>

      {/* Daily Timeline */}
      <section className="px-5 py-4">
        <h3 className="text-lg font-semibold mb-3">Today's Schedule</h3>
        <div className="space-y-3">
          {timeline.map((item, index) => (
            <motion.div
              key={item.time}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "flex items-center gap-4 p-4 rounded-xl bg-card shadow-card",
                item.status === "completed" && "opacity-70"
              )}
            >
              <div className="text-2xl">{item.icon}</div>
              <div className="flex-1">
                <p className="font-medium">{item.event}</p>
                <p className="text-sm text-muted-foreground">{item.time}</p>
              </div>
              {item.status === "completed" && (
                <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                  <Check className="w-4 h-4 text-accent-foreground" />
                </div>
              )}
              {item.status === "upcoming" && (
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Clock className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Huddle Wisdom */}
      <section className="px-5 py-4 pb-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-5 shadow-card"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
              <Lightbulb className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h4 className="font-semibold text-primary-foreground mb-1">Huddle Wisdom</h4>
              <p className="text-sm text-primary-foreground/90">
                Golden Retrievers need 1-2 hours of exercise daily. Consider adding an extra 
                evening walk to help Max burn energy and sleep better!
              </p>
            </div>
          </div>
        </motion.div>
      </section>

      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default Index;
