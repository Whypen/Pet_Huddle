export type CareConversationStateKind =
  | "clean_slate"
  | "scope_pending"
  | "agreement_signed"
  | "handoff_waiting"
  | "pin_shared"
  | "care_in_progress"
  | "under_review"
  | "completed";

export type CareConversationStatus = "pending" | "booked" | "in_progress" | "completed" | "disputed";

export type ActiveCareConversationRow = {
  id: string;
  status: string | null | undefined;
  careStatus: string | null | undefined;
  mutualSigned: boolean;
};

export type CareConversationState = {
  activeServiceChatId: string | null;
  careStatus: string | null;
  kind: CareConversationStateKind;
  status: CareConversationStatus;
  statusLabel: string;
};

// This is the sole adapter from the strict active service row to live Care UI.
// Historical rows are never valid input: no active row means a clean slate.
export const deriveCareConversationState = (
  activeServiceChat: ActiveCareConversationRow | null,
  underReview: boolean,
): CareConversationState => {
  if (!activeServiceChat) {
    return { activeServiceChatId: null, careStatus: null, kind: "clean_slate", status: "pending", statusLabel: "Pending Request" };
  }

  const careStatus = activeServiceChat.careStatus || null;
  if (underReview || activeServiceChat.status === "disputed" || ["under_dispute", "handoff_issue_review", "handoff_expired_manual_refund_required"].includes(careStatus || "")) {
    return { activeServiceChatId: activeServiceChat.id, careStatus, kind: "under_review", status: "disputed", statusLabel: careStatus === "handoff_expired_manual_refund_required" ? "Support review" : "Under Dispute" };
  }
  if (activeServiceChat.status === "in_progress" || careStatus === "in_progress") {
    return { activeServiceChatId: activeServiceChat.id, careStatus, kind: "care_in_progress", status: "in_progress", statusLabel: "Care in progress" };
  }
  if (activeServiceChat.status === "booked" || careStatus === "awaiting_handoff" || careStatus === "pin_shared") {
    return {
      activeServiceChatId: activeServiceChat.id,
      careStatus,
      kind: careStatus === "pin_shared" ? "pin_shared" : "handoff_waiting",
      status: "booked",
      statusLabel: "Booked",
    };
  }
  if (activeServiceChat.status === "completed" || careStatus === "completed") {
    return { activeServiceChatId: activeServiceChat.id, careStatus, kind: "completed", status: "completed", statusLabel: "Completed" };
  }
  if (activeServiceChat.mutualSigned) {
    return { activeServiceChatId: activeServiceChat.id, careStatus, kind: "agreement_signed", status: "pending", statusLabel: "Agreement signed" };
  }
  return { activeServiceChatId: activeServiceChat.id, careStatus, kind: "scope_pending", status: "pending", statusLabel: "Pending" };
};
