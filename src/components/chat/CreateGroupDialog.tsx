import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Users, Check, Image as ImageIcon } from "lucide-react";
import { NeuButton } from "@/components/ui/NeuButton";
import { Label } from "@/components/ui/label";

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
  contacts: Contact[];
}

interface GroupData {
  name: string;
  members: Contact[];
  avatarFile?: File | null;
}

export const CreateGroupDialog = ({ isOpen, onClose, onCreateGroup, contacts }: CreateGroupDialogProps) => {
  const { t } = useLanguage();
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupAvatarFile, setGroupAvatarFile] = useState<File | null>(null);
  const [groupAvatarPreview, setGroupAvatarPreview] = useState<string | null>(null);

  const availableContacts = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return contacts.filter((contact) => {
      const name = String(contact.name || "");
      if (!name) return false;
      const alreadySelected = selectedMembers.some((m) => m.id === contact.id);
      if (alreadySelected) return false;
      if (!needle) return true;
      return name.toLowerCase().includes(needle);
    });
  }, [contacts, searchQuery, selectedMembers]);

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
      avatarFile: groupAvatarFile,
    });

    // Reset form
    setGroupName("");
    setSelectedMembers([]);
    if (groupAvatarPreview) {
      URL.revokeObjectURL(groupAvatarPreview);
    }
    setGroupAvatarPreview(null);
    setGroupAvatarFile(null);
    onClose();
    toast.success(t("Group created successfully!"));
  };

  useEffect(() => {
    if (!isOpen && groupAvatarPreview) {
      URL.revokeObjectURL(groupAvatarPreview);
      setGroupAvatarPreview(null);
      setGroupAvatarFile(null);
    }
  }, [groupAvatarPreview, isOpen]);

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      event.target.value = "";
      return;
    }
    if (groupAvatarPreview) {
      URL.revokeObjectURL(groupAvatarPreview);
    }
    setGroupAvatarFile(file);
    setGroupAvatarPreview(URL.createObjectURL(file));
    event.target.value = "";
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-[8500]"
          />

          {/* Bottom sheet */}
          <div className="fixed inset-x-0 bottom-0 z-[8600] flex justify-center">
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="w-full max-w-[var(--app-max-width,430px)] bg-card rounded-t-3xl shadow-elevated max-h-[92vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="relative h-10 w-10">
                  <div className="h-10 w-10 overflow-hidden rounded-full bg-primary/10 flex items-center justify-center">
                    {groupAvatarPreview ? (
                      <img src={groupAvatarPreview} alt="Group avatar preview" className="h-full w-full object-contain bg-white" />
                    ) : (
                      <Users className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <label className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-full bg-black/50">
                    <ImageIcon className="h-4 w-4 text-white" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  </label>
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
                <div className="form-field-rest relative flex items-center">
                  <input
                    id="groupName"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Title"
                    className="field-input-core bg-transparent text-sm"
                  />
                </div>
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
                <div className="form-field-rest relative flex items-center">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search contacts"
                    className="field-input-core bg-transparent text-sm"
                  />
                </div>
                
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

                {availableContacts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {searchQuery ? t("No contacts found") : "No matched friends available yet"}
                  </p>
                )}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                {t("Only verified members can add or remove users from this group.")}
              </p>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+12px)]">
              <NeuButton
                onClick={handleCreate}
                disabled={!groupName.trim() || selectedMembers.length === 0}
                className="w-full h-12 rounded-xl text-base font-semibold"
              >
                {t("Create Group")}
              </NeuButton>
            </div>
          </motion.div>
          </div>
      </>
    </AnimatePresence>
    , document.body
  );
};
