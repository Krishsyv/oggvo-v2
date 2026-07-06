import { describe, expect, it } from "vitest";
import * as schema from "./schema/index.js";

/**
 * Smoke tests that guard the data model wiring without needing a live database.
 * Real integration tests (against the docker Postgres) live alongside each api module.
 */
describe("schema", () => {
  it("exports the core tenancy + auth tables", () => {
    expect(schema.users).toBeDefined();
    expect(schema.profiles).toBeDefined();
    expect(schema.userProfiles).toBeDefined();
  });

  it("splits the profile god-table into satellite tables", () => {
    expect(schema.profileReviewSettings).toBeDefined();
    expect(schema.profileGoogle).toBeDefined();
    expect(schema.profileEmailSettings).toBeDefined();
    expect(schema.profileMessagingSettings).toBeDefined();
    expect(schema.profileNewsletterSettings).toBeDefined();
    expect(schema.profileAffiliate).toBeDefined();
    expect(schema.profilePrompts).toBeDefined();
  });

  it("normalizes contacts, tags and messaging", () => {
    expect(schema.contacts).toBeDefined();
    expect(schema.contactTags).toBeDefined();
    expect(schema.contactTagAssignments).toBeDefined();
    expect(schema.conversations).toBeDefined();
    expect(schema.messages).toBeDefined();
  });

  it("does not re-introduce the dropped legacy tables", () => {
    expect("review_backup" in schema).toBe(false);
    expect("notificaiton_navbar" in schema).toBe(false);
  });
});
