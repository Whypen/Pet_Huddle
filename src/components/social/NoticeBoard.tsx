import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Image, 
  Loader2, 
  Lock,
  MessageSquare,
  Heart,
  Megaphone,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  Flag,
  EyeOff,
  Ban,
  MoreHorizontal
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const categories = [
  { id: "Social", label: "Social", icon: MessageSquare, color: "bg-primary" },
  { id: "Charity", label: "Charity", icon: Heart, color: "bg-accent" },
  { id: "News", label: "News", icon: Megaphone, color: "bg-warning" },
];

interface Notice {
  id: string;
  content: string;
  category: string;
  image_url: string | null;
  created_at: string;
  author_id: string;
  author: {
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  } | null;
}

interface NoticeBoardProps {
  isPremium: boolean;
  onPremiumClick: () => void;
}

export const NoticeBoard = ({ isPremium, onPremiumClick }: NoticeBoardProps) => {
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("Social");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [hiddenNotices, setHiddenNotices] = useState<Set<string>>(new Set());
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchNotices();
  }, []);

  const fetchNotices = async () => {
    try {
      const { data, error } = await supabase
        .from("notice_board")
        .select(`
          id,
          content,
          category,
          image_url,
          created_at,
          author_id,
          author:profiles!notice_board_author_id_fkey(
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setNotices(data || []);
    } catch (error) {
      console.error("Error fetching notices:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateNotice = async () => {
    if (!user || !content.trim()) {
      toast.error("Please enter some content");
      return;
    }

    setCreating(true);

    try {
      let imageUrl = null;

      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("notices")
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("notices")
          .getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      const { error } = await supabase
        .from("notice_board")
        .insert({
          author_id: user.id,
          content: content.trim(),
          category,
          image_url: imageUrl,
        });

      if (error) throw error;

      toast.success("Notice posted!");
      setContent("");
      setCategory("Social");
      setImageFile(null);
      setImagePreview(null);
      setIsCreateOpen(false);
      fetchNotices();
    } catch (error: any) {
      toast.error(error.message || "Failed to post notice");
    } finally {
      setCreating(false);
    }
  };

  const handleSupport = (noticeId: string) => {
    toast.success("Thanks for your support!");
  };

  const handleReport = (noticeId: string) => {
    toast.success("Notice reported - our team will review it");
  };

  const handleHide = (noticeId: string) => {
    setHiddenNotices(prev => new Set([...prev, noticeId]));
    toast.success("Notice hidden");
  };

  const handleBlockUser = (authorId: string) => {
    setBlockedUsers(prev => new Set([...prev, authorId]));
    toast.success("You won't see posts from this user");
  };

  const getCategoryStyle = (cat: string) => {
    const found = categories.find(c => c.id === cat);
    return found?.color || "bg-muted";
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diff = now.getTime() - then.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const visibleNotices = notices.filter(notice => 
    !hiddenNotices.has(notice.id) && !blockedUsers.has(notice.author_id)
  );

  return (
    <div className="space-y-4">
      {/* Header with Expand/Collapse */}
      <div className="flex items-center justify-between">
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 group"
        >
          <h3 className="text-lg font-semibold">Notice Board</h3>
          <span className="px-2 py-0.5 rounded-full bg-warning/20 text-warning text-xs font-medium">
            Premium
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          )}
        </button>
        
        {isPremium ? (
          <Button
            onClick={() => setIsCreateOpen(true)}
            size="sm"
            className="rounded-full bg-accent hover:bg-accent/90"
          >
            Post
          </Button>
        ) : (
          <Button
            onClick={onPremiumClick}
            size="sm"
            variant="outline"
            className="rounded-full"
          >
            <Lock className="w-4 h-4 mr-1" />
            Unlock
          </Button>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : visibleNotices.length === 0 ? (
              <div className="bg-muted/50 rounded-xl p-6 text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No notices yet</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-visible pr-1">
                {visibleNotices.map((notice) => (
                  <motion.div
                    key={notice.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card rounded-xl p-4 border border-border"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                        {notice.author?.avatar_url ? (
                          <img 
                            src={notice.author.avatar_url} 
                            alt="" 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <span className="text-sm font-semibold">
                            {notice.author?.display_name?.charAt(0) || "?"}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm truncate">
                            {notice.author?.display_name || "Anonymous"}
                          </span>
                          {notice.author?.is_verified && (
                            <span className="w-4 h-4 rounded-full bg-warning flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px]">✓</span>
                            </span>
                          )}
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-xs text-white flex-shrink-0",
                            getCategoryStyle(notice.category)
                          )}>
                            {notice.category}
                          </span>
                        </div>
                        <p className="text-sm text-foreground">{notice.content}</p>
                        {notice.image_url && (
                          <img 
                            src={notice.image_url} 
                            alt="" 
                            className="mt-2 rounded-lg max-h-40 object-cover" 
                          />
                        )}
                        
                        {/* Actions Row */}
                        <div className="flex items-center justify-between mt-3">
                          <p className="text-xs text-muted-foreground">
                            {formatTimeAgo(notice.created_at)}
                          </p>
                          
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleSupport(notice.id)}
                              className="p-1.5 rounded-full hover:bg-muted transition-colors"
                              title="Support"
                            >
                              <ThumbsUp className="w-4 h-4 text-muted-foreground" />
                            </button>
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-1.5 rounded-full hover:bg-muted transition-colors">
                                  <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleReport(notice.id)}>
                                  <Flag className="w-4 h-4 mr-2" />
                                  Report
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleHide(notice.id)}>
                                  <EyeOff className="w-4 h-4 mr-2" />
                                  Hide
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleBlockUser(notice.author_id)}
                                  className="text-destructive"
                                >
                                  <Ban className="w-4 h-4 mr-2" />
                                  Block User
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Notice Modal */}
      <AnimatePresence>
        {isCreateOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end"
            onClick={() => setIsCreateOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-card rounded-t-3xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Create Notice</h3>
                <button onClick={() => setIsCreateOpen(false)}>
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Category Selector */}
              <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all",
                      category === cat.id
                        ? `${cat.color} text-white`
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <cat.icon className="w-4 h-4" />
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <Textarea
                placeholder="What's on your mind?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="rounded-xl min-h-[100px] mb-4"
              />

              {/* Image Preview */}
              {imagePreview && (
                <div className="relative mb-4">
                  <img 
                    src={imagePreview} 
                    alt="" 
                    className="rounded-xl max-h-40 object-cover" 
                  />
                  <button
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <label className="p-2 rounded-full bg-muted cursor-pointer hover:bg-muted/80">
                  <Image className="w-5 h-5 text-muted-foreground" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>

                <Button
                  onClick={handleCreateNotice}
                  disabled={creating || !content.trim()}
                  className="flex-1 h-12 rounded-xl bg-accent hover:bg-accent/90"
                >
                  {creating ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Post Notice"
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
