import { bigserial, bigint, timestamp } from "drizzle-orm/pg-core";

/** Standard auto-incrementing surrogate primary key. */
export const pk = () => bigserial("id", { mode: "number" }).primaryKey();

/** A nullable bigint foreign-key column (FK constraint added at table level via references). */
export const fk = (name: string) => bigint(name, { mode: "number" });

/** created_at / updated_at, timestamptz, UTC. Spread into a table definition. */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

/** Soft-delete marker for entities that support it. */
export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};
