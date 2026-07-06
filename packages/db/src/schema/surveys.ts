import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  varchar,
} from "drizzle-orm/pg-core";
import { surveyQuestionTypeEnum } from "./_enums.js";
import { fk, pk, softDelete, timestamps } from "./_helpers.js";
import { contacts } from "./contacts.js";
import { profiles } from "./tenancy.js";

/** v1 `surveys`. */
export const surveys = pgTable(
  "surveys",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 250 }).notNull(),
    pageTitle: varchar("page_title", { length: 100 }).notNull(),
    description: varchar("description", { length: 255 }),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    viewsCount: integer("views_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    startedCount: integer("started_count").notNull().default(0),
    completedCount: integer("completed_count").notNull().default(0),
    active: boolean("active").notNull().default(true),
    welcome: jsonb("welcome"),
    thankyou: jsonb("thankyou"),
    ...softDelete,
    ...timestamps,
  },
  (t) => [index("surveys_profile_idx").on(t.profileId)],
);

/** v1 `survey_questions`. */
export const surveyQuestions = pgTable(
  "survey_questions",
  {
    id: pk(),
    surveyId: fk("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    question: varchar("question", { length: 4000 }).notNull(),
    description: varchar("description", { length: 255 }).notNull().default(""),
    type: surveyQuestionTypeEnum("type").notNull().default("name"),
    required: boolean("required").notNull().default(true),
    options: jsonb("options"),
    order: integer("order").notNull(),
    ...softDelete,
    ...timestamps,
  },
  (t) => [index("survey_questions_survey_idx").on(t.surveyId)],
);

/** v1 `survey_tracking` — one response session. */
export const surveyTracking = pgTable(
  "survey_tracking",
  {
    id: pk(),
    surveyId: fk("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    recipientId: fk("recipient_id").references(() => contacts.id, { onDelete: "set null" }),
    trackingCode: varchar("tracking_code", { length: 45 }).notNull().unique(),
    step: integer("step").notNull().default(0),
    ...softDelete,
    ...timestamps,
  },
  (t) => [index("survey_tracking_survey_idx").on(t.surveyId)],
);

/** v1 `survey_answers`. */
export const surveyAnswers = pgTable(
  "survey_answers",
  {
    id: pk(),
    questionId: fk("question_id")
      .notNull()
      .references(() => surveyQuestions.id, { onDelete: "cascade" }),
    surveyTrackingId: fk("survey_tracking_id")
      .notNull()
      .references(() => surveyTracking.id, { onDelete: "cascade" }),
    answer: jsonb("answer").notNull(),
    ...softDelete,
    ...timestamps,
  },
  (t) => [
    index("survey_answers_question_idx").on(t.questionId),
    index("survey_answers_tracking_idx").on(t.surveyTrackingId),
  ],
);

/** v1 `survey_tracking_actions` — granular actions within a session. */
export const surveyTrackingActions = pgTable(
  "survey_tracking_actions",
  {
    id: pk(),
    surveyTrackingId: fk("survey_tracking_id")
      .notNull()
      .references(() => surveyTracking.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 255 }).notNull(),
    ...softDelete,
    ...timestamps,
  },
  (t) => [index("survey_tracking_actions_tracking_idx").on(t.surveyTrackingId)],
);

/** v1 `survey_style` — per-survey theming (1:1). */
export const surveyStyle = pgTable("survey_style", {
  surveyId: fk("survey_id")
    .primaryKey()
    .references(() => surveys.id, { onDelete: "cascade" }),
  font: varchar("font", { length: 45 }).notNull().default("Inter"),
  questionColor: varchar("question_color", { length: 7 }).notNull().default("#202020"),
  bodyColor: varchar("body_color", { length: 7 }).notNull().default("#202020"),
  buttonColor: varchar("button_color", { length: 7 }).notNull().default("#2E90FA"),
  buttonTextColor: varchar("button_text_color", { length: 7 }).notNull().default("#F2F4F7"),
  backgroundColor: varchar("background_color", { length: 7 }).notNull().default("#e8e8e8"),
  progressColor: varchar("progress_color", { length: 7 }).notNull().default("#2E90FA"),
  backgroundImage: varchar("background_image", { length: 255 }),
  logo: varchar("logo", { length: 255 }),
  ...softDelete,
  ...timestamps,
});
