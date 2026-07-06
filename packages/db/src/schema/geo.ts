import { doublePrecision, index, pgTable, varchar } from "drizzle-orm/pg-core";
import { fk, pk, timestamps } from "./_helpers.js";
import { profiles } from "./tenancy.js";

/** v1 `geo_zipcodes` — zip → lat/long reference data. */
export const geoZipcodes = pgTable(
  "geo_zipcodes",
  {
    id: pk(),
    zipCode: varchar("zip_code", { length: 32 }),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    ...timestamps,
  },
  (t) => [index("geo_zipcodes_zip_idx").on(t.zipCode)],
);

/** v1 `geo_zipcodes_profile` — zip codes a profile targets. */
export const geoZipcodesProfile = pgTable(
  "geo_zipcodes_profile",
  {
    id: pk(),
    profileId: fk("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    zipcodeId: fk("zipcode_id")
      .notNull()
      .references(() => geoZipcodes.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("geo_zipcodes_profile_profile_idx").on(t.profileId)],
);
