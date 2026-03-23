export type ServiceStatus = "pending" | "booked" | "in_progress" | "completed" | "disputed";
export type ServiceRole = "requester" | "provider";

export type ServiceRequestCard = {
  serviceType: string;
  serviceTypes?: string[];
  petId: string;
  petName?: string;
  petType: string;
  dogSize?: string;
  requestedDates?: string[];
  requestedDate?: string;
  startTime: string;
  endTime: string;
  locationStyles?: string[];
  locationArea: string;
  suggestedCurrency?: string;
  suggestedPrice?: string;
  suggestedRate?: string;
  additionalNotes?: string;
  allowProfileAccess?: boolean;
};

export type ServiceQuoteCard = {
  serviceType?: string;
  serviceTypes?: string[];
  petId?: string;
  petName?: string;
  petType?: string;
  dogSize?: string;
  requestedDates?: string[];
  startTime?: string;
  endTime?: string;
  locationStyles?: string[];
  locationArea?: string;
  currency: string;
  finalPrice: string;
  rate: string;
  note?: string;
};

export type ServiceChatRow = {
  chat_id: string;
  requester_id: string;
  provider_id: string;
  status: ServiceStatus;
  request_card: ServiceRequestCard | null;
  quote_card: ServiceQuoteCard | null;
  request_sent_at: string | null;
  quote_sent_at: string | null;
  booked_at: string | null;
  in_progress_at?: string | null;
  completed_at: string | null;
  disputed_at?: string | null;
  requester_mark_finished: boolean;
  provider_mark_finished: boolean;
};

export type ChatMessageRow = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export type ServiceCounterpart = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  stripePayoutStatus: string | null;
  stripeAccountId: string | null;
};

export const STATUS_LABEL: Record<ServiceStatus, string> = {
  pending: "Pending",
  booked: "Booked",
  in_progress: "In Progress",
  completed: "Completed",
  disputed: "Disputed",
};

export const STATUS_BADGE_CLASS: Record<ServiceStatus, string> = {
  pending: "bg-[#888888]/10 text-[#888888]",
  booked: "bg-[#16a34a]/10 text-[#16a34a]",
  in_progress: "bg-[#16a34a]/10 text-[#16a34a]",
  completed: "bg-[#16a34a]/10 text-[#16a34a]",
  disputed: "bg-[#ef6450]/10 text-[#ef6450]",
};
