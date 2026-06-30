export type WhatsAppProviderName = "meta_cloud_api" | "third_party";
export type WhatsAppReportType = "daily_report" | "stock_alert" | "tempo_reminder" | "test";

export type WhatsAppRecipient = {
  id: string;
  name: string;
  phoneNumber: string;
  isActive: boolean;
  receivesDailyReport: boolean;
  receivesStockAlert: boolean;
  receivesTempoReminder: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WhatsAppRecipientInput = {
  name: string;
  phoneNumber: string;
  isActive?: boolean;
  receivesDailyReport?: boolean;
  receivesStockAlert?: boolean;
  receivesTempoReminder?: boolean;
};

export type WhatsAppMessageLog = {
  id: string;
  reportType: WhatsAppReportType;
  recipientId?: string;
  recipientNameSnapshot: string;
  phoneMaskedSnapshot: string;
  provider: WhatsAppProviderName | "not_configured";
  status: "pending" | "sent" | "failed";
  providerMessageId?: string;
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
};

export type WhatsAppSendInput = {
  to: string;
  body: string;
};

export type WhatsAppSendResult = {
  status: "sent" | "failed";
  provider: WhatsAppProviderName;
  providerMessageId?: string;
  errorMessage?: string;
};

export type WhatsAppProviderStatus = {
  provider: WhatsAppProviderName | null;
  ready: boolean;
  label: string;
  message: string;
  missing: string[];
};
