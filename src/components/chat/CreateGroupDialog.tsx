import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, Users, Check, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

interface Contact {
  id: string;
  name: string;
  avatar?: string;
  verified: boolean;
}

interface CreateGroupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateGroup: (groupData: GroupData) => void;
}

interface GroupData {
  name: string;
  members: Contact[];
  allowMemberControl: boolean;
}

// Mock verified contacts
const verifiedContacts: Contact[] = [
  { id: "1", name: "Marcus", verified: true },
  { id: "2", name: "Pet Care Pro", verified: true },
  { id: "3", name: "Dr. Wong", verified: true },
  { id: "4", name: "Emma's Pets", verified: true },
  { id: "5", name: "Cat Cafe", verified: true },
];

export const CreateGroupDialog = ({ isOpen, onClose, onCreateGroup }: CreateGroupDialogProps) => {
  const { t } = useLanguage();
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Contact[]>([]);
  const [allowMemberControl, setAllowMemberControl] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const availableContacts = verifiedContacts.filter(
    (contact) =>
      !selectedMembers.find((m) => m.id === contact.id) &&
      contact.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddMember = (contact: Contact) => {
    setSelectedMembers((prev) => [...prev, contact]);
    setSearchQuery("");
  };

  const handleRemoveMember = (contactId: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== contactId));
  };

  const handleCreate = () => {
    if (!groupName.trim()) {
      toast.error(t("Please enter a group name"));
      return;
    }
    if (selectedMembers.length < 1) {
      toast.error(t("Please add at least one member"));
      return;
    }

    onCreateGroup({
      name: groupName,
      members: selectedMembers,
      allowMemberControl,
    });

    // Reset form
    setGroupName("");
    setSelectedMembers([]);
    setAllowMemberControl(false);
    onClose();
    toast.success(t("Group created successfully!"));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50"
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-card rounded-2xl shadow-elevated z-50 max-h-[80vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">{t("Create Group")}</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Group Name */}
              <div className="space-y-2">
                <Label htmlFor="groupName">{t("Group Name")}</Label>
                <Input
                  id="groupName"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder={t("Enter group name...")}
                  className="h-12 rounded-xl"
                />
              </div>

              {/* Selected Members */}
              {selectedMembers.length > 0 && (
                <div className="space-y-2">
                  <Label>{t("Members")} ({selectedMembers.length})</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedMembers.map((member) => (
                      <motion.div
                        key={member.id}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent text-accent-foreground text-sm"
                      >
                        <span>{member.name}</span>
                        {member.verified && (
                          <Check className="w-3 h-3" />
                        )}
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="hover:text-destructive transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Contacts */}
              <div className="space-y-2">
                <Label>{t("Add Contacts")}</Label>
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("Search verified contacts...")}
                  className="h-11 rounded-xl"
                />
                
                {availableContacts.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {availableContacts.map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => handleAddMember(contact)}
                        className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-semibold">
                            {contact.name.charAt(0)}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{contact.name}</span>
                            {contact.verified && (
                              <div className="w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-accent-foreground" />
                              </div>
                            )}
                          </div>
                        </div>
                        <Plus className="w-5 h-5 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery && availableContacts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t("No verified contacts found")}
                  </p>
                )}
              </div>

              {/* Delegate Control */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Crown className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{t("Delegate Control")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("Allow members to add/remove others")}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={allowMemberControl}
                  onCheckedChange={setAllowMemberControl}
                />
              </div>

              <p className="text-xs text-muted-foreground text-center">
                {t("You can always edit group settings by clicking the group name")}
              </p>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border">
              <Button
                onClick={handleCreate}
                disabled={!groupName.trim() || selectedMembers.length === 0}
                className="w-full h-12 rounded-xl text-base font-semibold"
              >
                {t("Create Group")}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
