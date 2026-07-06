import { boolean, index, integer, pgTable, text, varchar } from "drizzle-orm/pg-core";
import {
  audioSourceEnum,
  callStatusEnum,
  callTypeEnum,
  twilioVerificationTypeEnum,
} from "./_enums.js";
import { fk, pk, timestamps } from "./_helpers.js";
import { profiles } from "./tenancy.js";

/** v1 `audio` — call recordings / voicemail audio files. */
export const audio = pgTable("audio", {
  id: pk(),
  profileId: fk("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 255 }).notNull().default(""),
  source: audioSourceEnum("source").notNull().default("call"),
  ...timestamps,
});

/** v1 `call_settings` — per-profile call routing / voicemail config. */
export const callSettings = pgTable("call_settings", {
  profileId: fk("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  forwardTo: varchar("forward_to", { length: 45 }),
  timeout: integer("timeout").notNull().default(10),
  voicemailAudioId: fk("voicemail_audio_id").references(() => audio.id),
  voicemailActive: boolean("voicemail_active").notNull().default(false),
  voicemailText: varchar("voicemail_text", { length: 500 }),
  missedCallTextActive: boolean("missed_call_text_active").notNull().default(false),
  missedCallText: varchar("missed_call_text", { length: 255 }),
  allowRecording: boolean("allow_recording").notNull().default(false),
  recordingWarningActive: boolean("recording_warning_active").notNull().default(false),
  recordingWarningMessage: varchar("recording_warning_message", { length: 500 }),
  ...timestamps,
});

/** v1 `call_logs`. */
export const callLogs = pgTable(
  "call_logs",
  {
    id: pk(),
    profileId: fk("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    callSid: varchar("call_sid", { length: 45 }).notNull().default(""),
    caller: varchar("caller", { length: 45 }).notNull().default(""),
    duration: integer("duration").notNull().default(0),
    audioId: fk("audio_id").references(() => audio.id),
    topic: varchar("topic", { length: 255 }),
    transcript: text("transcript"),
    type: callTypeEnum("type").notNull().default("call"),
    recorded: boolean("recorded").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("call_logs_profile_idx").on(t.profileId)],
);

/** v1 `call_status` — status transitions for a call. */
export const callStatusHistory = pgTable("call_status_history", {
  id: pk(),
  callId: fk("call_id")
    .notNull()
    .references(() => callLogs.id, { onDelete: "cascade" }),
  status: callStatusEnum("status").notNull().default("queued"),
  ...timestamps,
});

/** v1 `twilio_verifications` — A2P 10DLC brand/campaign verification state. */
export const twilioVerifications = pgTable("twilio_verifications", {
  id: pk(),
  profileId: fk("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }),
  type: twilioVerificationTypeEnum("type").notNull().default("business"),
  status: integer("status").notNull().default(0),
  brandSid: varchar("brand_sid", { length: 255 }),
  brandStatus: integer("brand_status").notNull().default(0),
  campaignSid: varchar("campaign_sid", { length: 255 }),
  campaignStatus: integer("campaign_status").notNull().default(0),
  step: varchar("step", { length: 11 }).notNull().default("1.2"),
  sid: varchar("sid", { length: 255 }),
  trustProductSid: varchar("trust_product_sid", { length: 255 }),
  progressBarVisible: boolean("progress_bar_visible").notNull().default(true),
  ...timestamps,
});
