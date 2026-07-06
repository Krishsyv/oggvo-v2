import { relations } from "drizzle-orm";
import { authSessions, users, verifications } from "./auth.js";
import { campaignEvents, campaignSchedules, campaigns } from "./campaigns.js";
import { contactImports, contactTagAssignments, contactTags, contacts } from "./contacts.js";
import { designs, palettes } from "./design.js";
import { conversations, messages } from "./messaging.js";
import { reviews } from "./reviews.js";
import {
  socialAccounts,
  socialCampaignPosts,
  socialCampaigns,
  socialInsights,
  socialPosts,
} from "./social.js";
import {
  surveyAnswers,
  surveyQuestions,
  surveyStyle,
  surveyTracking,
  surveys,
} from "./surveys.js";
import {
  profileAffiliate,
  profileEmailSettings,
  profileGoogle,
  profileMessagingSettings,
  profileNewsletterSettings,
  profilePrompts,
  profileReviewSettings,
  profiles,
  userProfiles,
} from "./tenancy.js";

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(authSessions),
  verifications: many(verifications),
  memberships: many(userProfiles),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  members: many(userProfiles),
  reviewSettings: one(profileReviewSettings),
  google: one(profileGoogle),
  emailSettings: one(profileEmailSettings),
  messagingSettings: one(profileMessagingSettings),
  newsletterSettings: one(profileNewsletterSettings),
  affiliate: one(profileAffiliate),
  prompts: one(profilePrompts),
  reviews: many(reviews),
  contacts: many(contacts),
  campaigns: many(campaigns),
  socialAccounts: many(socialAccounts),
  surveys: many(surveys),
  conversations: many(conversations),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, { fields: [userProfiles.userId], references: [users.id] }),
  profile: one(profiles, { fields: [userProfiles.profileId], references: [profiles.id] }),
}));

export const profileReviewSettingsRelations = relations(profileReviewSettings, ({ one }) => ({
  profile: one(profiles, {
    fields: [profileReviewSettings.profileId],
    references: [profiles.id],
  }),
  design: one(designs, { fields: [profileReviewSettings.designId], references: [designs.id] }),
  palette: one(palettes, {
    fields: [profileReviewSettings.paletteId],
    references: [palettes.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  profile: one(profiles, { fields: [reviews.profileId], references: [profiles.id] }),
  socialAccount: one(socialAccounts, {
    fields: [reviews.socialAccountId],
    references: [socialAccounts.id],
  }),
  recipient: one(contacts, { fields: [reviews.recipientId], references: [contacts.id] }),
  socialPosts: many(socialPosts),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  profile: one(profiles, { fields: [contacts.profileId], references: [profiles.id] }),
  tags: many(contactTagAssignments),
  schedules: many(campaignSchedules),
}));

export const contactTagAssignmentsRelations = relations(contactTagAssignments, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactTagAssignments.contactId],
    references: [contacts.id],
  }),
  tag: one(contactTags, { fields: [contactTagAssignments.tagId], references: [contactTags.id] }),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  profile: one(profiles, { fields: [campaigns.profileId], references: [profiles.id] }),
  schedules: many(campaignSchedules),
  events: many(campaignEvents),
}));

export const socialAccountsRelations = relations(socialAccounts, ({ one, many }) => ({
  profile: one(profiles, { fields: [socialAccounts.profileId], references: [profiles.id] }),
  posts: many(socialPosts),
  insights: many(socialInsights),
}));

export const socialCampaignsRelations = relations(socialCampaigns, ({ one, many }) => ({
  profile: one(profiles, { fields: [socialCampaigns.profileId], references: [profiles.id] }),
  posts: many(socialCampaignPosts),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  profile: one(profiles, { fields: [conversations.profileId], references: [profiles.id] }),
  recipient: one(contacts, { fields: [conversations.recipientId], references: [contacts.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const surveysRelations = relations(surveys, ({ one, many }) => ({
  profile: one(profiles, { fields: [surveys.profileId], references: [profiles.id] }),
  questions: many(surveyQuestions),
  tracking: many(surveyTracking),
  style: one(surveyStyle),
}));

export const surveyQuestionsRelations = relations(surveyQuestions, ({ one, many }) => ({
  survey: one(surveys, { fields: [surveyQuestions.surveyId], references: [surveys.id] }),
  answers: many(surveyAnswers),
}));

export const surveyTrackingRelations = relations(surveyTracking, ({ one, many }) => ({
  survey: one(surveys, { fields: [surveyTracking.surveyId], references: [surveys.id] }),
  answers: many(surveyAnswers),
}));
