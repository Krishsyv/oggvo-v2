import { pgEnum } from "drizzle-orm/pg-core";

// Auth / tenancy
export const accountTypeEnum = pgEnum("account_type", [
  "user",
  "staff",
  "admin",
  "superadmin",
]);
export const verificationTypeEnum = pgEnum("verification_type", [
  "registration",
  "password_reset",
  "email_change",
]);
export const manageRequestTypeEnum = pgEnum("manage_request_type", ["user", "profile"]);
export const manageRequestStatusEnum = pgEnum("manage_request_status", ["pending", "deleted"]);

// Contacts
export const contactStatusEnum = pgEnum("contact_status", [
  "pending",
  "activated",
  "bounced",
  "unsubscribed",
  "suppressed",
]);
export const contactSourceEnum = pgEnum("contact_source", [
  "manual",
  "csv_import",
  "api",
  "widget",
]);
export const importStatusEnum = pgEnum("import_status", [
  "queued",
  "in_progress",
  "completed",
  "failed",
]);

// Campaigns
export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "active",
  "paused",
  "archived",
]);
export const campaignEventTypeEnum = pgEnum("campaign_event_type", [
  "queued",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "unsubscribed",
  "converted",
]);
export const campaignChannelEnum = pgEnum("campaign_channel", ["email", "sms"]);

// Messaging / Connect
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const messagePlatformEnum = pgEnum("message_platform", ["connect", "sms", "whatsapp"]);
export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "scheduled",
  "sent",
  "delivered",
  "failed",
]);

// Social
export const socialPostStatusEnum = pgEnum("social_post_status", [
  "pending",
  "posted",
  "failed",
]);
export const socialCampaignStatusEnum = pgEnum("social_campaign_status", [
  "inactive",
  "active",
  "paused",
  "archived",
]);
export const automatorStatusEnum = pgEnum("automator_status", [
  "inactive",
  "active",
  "archived",
]);
export const campaignPostStatusEnum = pgEnum("campaign_post_status", [
  "scheduled",
  "posted",
  "failed",
]);

// Surveys
export const surveyQuestionTypeEnum = pgEnum("survey_question_type", [
  "name",
  "email",
  "phone",
  "address",
  "website",
  "short_text",
  "long_text",
  "ranking_scale",
  "star_rating",
  "multiple_choice",
  "yes_no",
  "date_time",
  "file_upload",
]);

// Twilio / calls
export const twilioVerificationTypeEnum = pgEnum("twilio_verification_type", [
  "business",
  "personal",
]);
export const callTypeEnum = pgEnum("call_type", ["call", "voicemail"]);
export const callStatusEnum = pgEnum("call_status", [
  "queued",
  "ringing",
  "in_progress",
  "completed",
  "busy",
  "failed",
  "no_answer",
  "canceled",
]);

// Notifications
export const notificationStatusEnum = pgEnum("notification_status", ["unread", "read"]);
export const pushCampaignTypeEnum = pgEnum("push_campaign_type", ["single", "broadcast"]);
export const pushCampaignStatusEnum = pgEnum("push_campaign_status", [
  "pending",
  "scheduled",
  "sent",
  "failed",
]);

// Misc
export const referralStatusEnum = pgEnum("referral_status", ["pending", "accepted", "declined"]);
export const mediaSourceEnum = pgEnum("media_source", ["social", "upload"]);
export const audioSourceEnum = pgEnum("audio_source", ["call", "voicemail"]);
