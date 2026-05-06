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

export type ParsedServiceAttachment = {
  url: string;
  mime: string;
  name: string;
};

export type ParsedServiceMessage = {
  text: string;
  attachments: ParsedServiceAttachment[];
  linkPreviewUrl: string | null;
  kind?: string;
  raw: Record<string, unknown> | null;
};
