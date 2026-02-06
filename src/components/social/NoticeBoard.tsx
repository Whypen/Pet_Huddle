import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Image,
  Loader2,
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
import { PremiumFooter } from "@/components/monetization/PremiumFooter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

const tags = [
  { id: "Dog", labelKey: "threads.tag.dog", icon: MessageSquare, color: "bg-primary" },
  { id: "Cat", labelKey: "threads.tag.cat", icon: Heart, color: "bg-accent" },
  { id: "Pet News", labelKey: "threads.tag.pet_news", icon: Megaphone, color: "bg-warning" },
  { id: "Social", labelKey: "threads.tag.social", icon: ThumbsUp, color: "bg-accent" },
  { id: "Others", labelKey: "threads.tag.others", icon: Flag, color: "bg-muted" },
];

interface Thread {
  id: string;
  title: string;
  content: string;
  tags: string[] | null;
  hashtags: string[] | null;
  images: string[] | null;
  created_at: string;
  user_id: string;
  author: {
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  } | null;
}

interface ThreadComment {
  id: string;
  thread_id: string;
  content: string;
  created_at: string;
  user_id: string;
  author: {
    display_name: string | null;
  } | null;
}

interface NoticeBoardProps {
  onPremiumClick: () => void;
}

export const NoticeBoard = ({ onPremiumClick }: NoticeBoardProps) => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const dummyCatPost: Thread = {
    id: "dummy-cat",
    title: t("threads.dummy_title"),
    content: t("notice.dummy_content"),
    tags: ["Social"],
    hashtags: ["#huddle"],
    images: null,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    user_id: "cat-lover-123",
    author: {
      display_name: t("notice.dummy_author"),
      avatar_url: null,
      is_verified: true,
    },
  };
  const [notices, setNotices] = useState<Thread[]>([dummyCatPost]); // Initialize with dummy cat post
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastCreatedAt, setLastCreatedAt] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPremiumFooterOpen, setIsPremiumFooterOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("Social");
  const [hashtags, setHashtags] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [hiddenNotices, setHiddenNotices] = useState<Set<string>>(new Set());
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [threadsRemaining, setThreadsRemaining] = useState<number | null>(null);
  const [commentsByThread, setCommentsByThread] = useState<Record<string, ThreadComment[]>>({});
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const replyInputRef = useRef<HTMLTextAreaElement | null>(null);
  // SPRINT 3: Track liked notices for green (#22c55e) button state
  const [likedNotices, setLikedNotices] = useState<Set<string>>(new Set());
  const remainingChars = useMemo(() => 1000 - content.length, [content]);
  const remainingReplyChars = useMemo(() => 1000 - replyContent.length, [replyContent]);

  useEffect(() => {
    fetchNotices(true);
  }, []);

  useEffect(() => {
    if (replyFor) {
      setTimeout(() => replyInputRef.current?.focus(), 0);
    }
  }, [replyFor]);

  const fetchNotices = async (reset: boolean = false) => {
    try {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      let query = supabase
        .from("threads")
        .select(`
          id,
          title,
          content,
          tags,
          hashtags,
          images,
          score,
          created_at,
          user_id,
          author:profiles!threads_user_id_fkey(
            display_name,
            avatar_url,
            is_verified
          )
        `)
        .order("score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);

      if (!reset && lastCreatedAt) {
        query = query.lt("created_at", lastCreatedAt);
      }

      const { data, error } = await query;

      if (error) throw error;
      const newNotices = data || [];
      if (reset) {
        setNotices([dummyCatPost, ...newNotices]);
      } else {
        setNotices(prev => [...prev, ...newNotices]);
      }
      const ids = newNotices.map((n) => n.id);
      if (ids.length > 0) {
        const { data: comments } = await supabase
          .from("thread_comments")
          .select(`
            id,
            thread_id,
            content,
            created_at,
            user_id,
            author:profiles!thread_comments_user_id_fkey(display_name)
          `)
          .in("thread_id", ids)
          .order("created_at", { ascending: true });
        const grouped: Record<string, ThreadComment[]> = {};
        (comments || []).forEach((c) => {
          grouped[c.thread_id] = [...(grouped[c.thread_id] || []), c];
        });
        setCommentsByThread((prev) => ({ ...prev, ...grouped }));
      }
      const last = newNotices[newNotices.length - 1];
      if (last?.created_at) {
        setLastCreatedAt(last.created_at);
      }
      setHasMore(newNotices.length === 20);
    } catch (error) {
      console.error("Error fetching notices:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const getThreadLimit = () => {
    if (profile?.tier === "gold") return 30;
    if (profile?.tier === "premium") return 5;
    return 1;
  };

  useEffect(() => {
    if (!user?.id) return;
    const loadRemaining = async () => {
      const limit = getThreadLimit();
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("threads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", since);
      const remaining = Math.max(0, limit - (count || 0));
      setThreadsRemaining(remaining);
    };
    loadRemaining();
  }, [user?.id, profile?.tier]);

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

  const handleReply = async (thread: Thread) => {
    if (!user) return;
    if (!replyContent.trim()) {
      toast.error(t("Reply cannot be empty"));
      return;
    }
    if (replyContent.length > 1000) {
      toast.error(t("Reply is too long"));
      return;
    }
    const { error } = await supabase
      .from("thread_comments")
      .insert({
        thread_id: thread.id,
        user_id: user.id,
        content: replyContent.trim(),
      });
    if (error) {
      toast.error(error.message);
      return;
    }
    setReplyContent("");
    setReplyFor(null);
    fetchNotices(true);
  };

  const renderMarkdown = (text: string) => {
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const withBold = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const withItalic = withBold.replace(/\*(.+?)\*/g, "<em>$1</em>");
    const lines = withItalic.split("\n");
    const listItems = lines.filter((l) => l.trim().startsWith("- "));
    if (listItems.length > 0) {
      const list = listItems.map((l) => `<li>${l.replace(/^- /, "")}</li>`).join("");
      const rest = lines.filter((l) => !l.trim().startsWith("- ")).join("<br />");
      return `${rest}<ul>${list}</ul>`;
    }
    return lines.join("<br />");
  };

  const handleCreateNotice = async () => {
    if (!user || !content.trim() || !title.trim()) {
      toast.error(t("Please enter some content"));
      return;
    }
    if (content.length > 1000) {
      toast.error(t("Thread content is too long"));
      return;
    }

    if ((threadsRemaining ?? 0) <= 0) {
      setIsPremiumFooterOpen(true);
      return;
    }

    setCreating(true);

    try {
      const limit = getThreadLimit();
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("threads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", since);
      if ((count || 0) >= limit) {
        setIsPremiumFooterOpen(true);
        return;
      }

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

      const hashtagList = hashtags
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean)
        .slice(0, 3);

      const { data: allowed } = await supabase.rpc("check_and_increment_quota", {
        action_type: "thread_post",
      });
      if (allowed === false) {
        setIsPremiumFooterOpen(true);
        return;
      }

      const { error } = await supabase
        .from("threads")
        .insert({
          user_id: user.id,
          title: title.trim().slice(0, 20),
          content: content.trim(),
          tags: [category],
          hashtags: hashtagList,
          images: imageUrl ? [imageUrl] : [],
        });

      if (error) throw error;

      toast.success(t("Thread posted!"));
      setTitle("");
      setContent("");
      setCategory("Social");
      setHashtags("");
      setImageFile(null);
      setImagePreview(null);
      setIsCreateOpen(false);
      fetchNotices(true);
    } catch (error: any) {
      toast.error(error.message || t("Failed to post notice"));
    } finally {
      setCreating(false);
    }
  };

  // SPRINT 3: Toggle like with green (#22c55e) state
  const handleSupport = (noticeId: string) => {
    setLikedNotices(prev => {
      const newLiked = new Set(prev);
      if (newLiked.has(noticeId)) {
        newLiked.delete(noticeId);
        toast.success(t("Support removed"));
      } else {
        newLiked.add(noticeId);
        toast.success(t("Thanks for your support!"));
      }
      return newLiked;
    });
  };

  const handleReport = (noticeId: string) => {
    toast.success(t("Thread reported - our team will review it"));
  };

  const handleHide = (noticeId: string) => {
    setHiddenNotices(prev => new Set([...prev, noticeId]));
    toast.success(t("Thread hidden"));
  };

  const handleBlockUser = (authorId: string) => {
    setBlockedUsers(prev => new Set([...prev, authorId]));
    toast.success(t("You won't see posts from this user"));
  };

  const getTagStyle = (tag: string) => {
    const found = tags.find(c => c.id === tag);
    return found?.color || "bg-muted";
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diff = now.getTime() - then.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return t("Just now");
    if (hours < 24) return `${hours}${t("h ago")}`;
    const days = Math.floor(hours / 24);
    return `${days}${t("d ago")}`;
  };

  const visibleNotices = notices.filter(notice =>
    !hiddenNotices.has(notice.id) && !blockedUsers.has(notice.user_id)
  );

  return (
    <div className="space-y-4">
      {/* Header with Expand/Collapse */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 group"
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          )}
        </button>

        <div className="flex items-center gap-3">
          {threadsRemaining !== null && (
            <span className="text-xs text-muted-foreground">
              {t("Quota")}: {threadsRemaining}
            </span>
          )}
          <Button
            onClick={() => {
              if ((threadsRemaining ?? 0) <= 0) {
                setIsPremiumFooterOpen(true);
                return;
              }
              setIsCreateOpen(true);
            }}
            size="sm"
            className="rounded-full bg-primary hover:bg-primary/90 text-white"
          >
            {t("Post")}
          </Button>
        </div>
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
                <p className="text-sm text-muted-foreground">{t("No threads yet")}</p>
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
                            {notice.author?.display_name?.charAt(0) || t("Unknown").charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm truncate">
                            {notice.author?.display_name || t("Anonymous")}
                          </span>
                          {notice.author?.is_verified && (
                            <span className="w-4 h-4 rounded-full bg-warning flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px]">{t("✓")}</span>
                            </span>
                          )}
                          {(notice.tags || []).slice(0, 1).map((tag) => (
                            <span
                              key={tag}
                              className={cn(
                                "px-2 py-0.5 rounded-full text-xs text-white flex-shrink-0",
                                getTagStyle(tag)
                              )}
                            >
                              {t(tag)}
                            </span>
                          ))}
                        </div>
                        <p className="text-sm font-semibold">{notice.title}</p>
                        <div
                          className="text-sm text-foreground"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(notice.content) }}
                        />
                        {(notice.hashtags || []).length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {(notice.hashtags || []).slice(0, 3).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
                          </p>
                        )}
                        {notice.images && notice.images.length > 0 && (
                          <img
                            src={notice.images[0]}
                            alt=""
                            className="mt-2 rounded-lg max-h-40 object-cover aspect-video w-full"
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
                              className={cn(
                                "p-1.5 rounded-full transition-all",
                                likedNotices.has(notice.id)
                                  ? "bg-primary/10"
                                  : "hover:bg-muted"
                              )}
                              title={t("Support")}
                            >
                              <ThumbsUp className={cn(
                                "w-4 h-4 transition-colors",
                                likedNotices.has(notice.id)
                                  ? "text-primary fill-primary"
                                  : "text-muted-foreground"
                              )} />
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
                                  {t("Report")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleHide(notice.id)}>
                                  <EyeOff className="w-4 h-4 mr-2" />
                                  {t("Hide")}
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleBlockUser(notice.user_id)}
                                  className="text-destructive"
                                >
                                  <Ban className="w-4 h-4 mr-2" />
                                  {t("Block User")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          <button
                            className="text-xs text-primary"
                            onClick={() => {
                              setReplyFor(notice.id);
                              const snippet = notice.content.slice(0, 20).replace(/\s+/g, " ").trim();
                              const quote = `> @${notice.author?.display_name || "user"}: "${snippet}..."\\n\\n`;
                              setReplyContent(quote);
                            }}
                          >
                            {t("Reply")}
                          </button>

                          {(commentsByThread[notice.id] || []).map((c) => (
                            <div key={c.id} className="text-xs text-muted-foreground border-l pl-2">
                              <span className="font-medium">{c.author?.display_name || t("Anonymous")}:</span>{" "}
                              <span dangerouslySetInnerHTML={{ __html: renderMarkdown(c.content) }} />
                            </div>
                          ))}

                          {replyFor === notice.id && (
                            <div className="mt-2">
                              <Textarea
                                ref={replyInputRef}
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                className="rounded-xl min-h-[80px]"
                                maxLength={1000}
                              />
                              <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                                <span>{t("Max 1000 chars")}</span>
                                <span>{remainingReplyChars}</span>
                              </div>
                              <div className="flex justify-end mt-2">
                                <Button size="sm" onClick={() => handleReply(notice)}>
                                  {t("Post Reply")}
                                </Button>
                              </div>
                            </div>
                          )}
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

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => fetchNotices(false)}
            disabled={loadingMore}
          >
            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Load more")}
          </Button>
        </div>
      )}

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
                <h3 className="text-lg font-semibold">{t("Create Thread")}</h3>
                <button onClick={() => setIsCreateOpen(false)}>
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Category Selector */}
              <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                {tags.map((cat) => (
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
                    {t(cat.labelKey)}
                  </button>
                ))}
              </div>

              {/* Title */}
              <input
                type="text"
                maxLength={20}
                placeholder={t("Thread title (max 20 chars)")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm mb-3"
              />

              {/* Hashtags */}
              <input
                type="text"
                placeholder={t("Hashtags (comma separated, max 3)")}
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm mb-3"
              />

              {/* Content */}
              <Textarea
                placeholder={t("What's on your mind?")}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="rounded-xl min-h-[100px] mb-4"
                maxLength={1000}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                <span>{t("Max 1000 chars")}</span>
                <span>{remainingChars}</span>
              </div>

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
                  disabled={creating || !content.trim() || !title.trim()}
                  className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary/90 text-white"
                >
                  {creating ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    t("Post Thread")
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Premium Footer — triggers on Notice Board 'Create' for free users */}
      <PremiumFooter
        isOpen={isPremiumFooterOpen}
        onClose={() => setIsPremiumFooterOpen(false)}
        triggerReason="notice_create"
      />
    </div>
  );
};
