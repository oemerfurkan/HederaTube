import { bigserial, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const videoStatus = pgEnum("video_status", ["processing", "ready", "failed"]);
export const sessionStatus = pgEnum("session_status", ["locked", "streaming", "closing", "closed", "settled", "failed"]);

const money = (name: string) => numeric(name, { precision: 20, scale: 0 });

export const creators = pgTable("creators", {
  id: text("id").primaryKey(),
  wallet_address: text("wallet_address").notNull().unique(),
  hedera_account_id: text("hedera_account_id").notNull(),
  handle: text("handle").notNull().unique(),
  display_name: text("display_name").notNull(),
  description: text("description").notNull().default(""),
  /** Storage key of the channel photo; the file name carries a version so URLs can be cached forever. */
  avatar_key: text("avatar_key"),
  world_nullifier_hash: text("world_nullifier_hash").unique(),
  verified_at: timestamp("verified_at", { withTimezone: true }),
  subscribers: integer("subscribers").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const videos = pgTable("videos", {
  id: text("id").primaryKey(),
  creator_id: text("creator_id").notNull().references(() => creators.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  duration_seconds: real("duration_seconds").notNull().default(0),
  chunk_count: integer("chunk_count").notNull().default(0),
  segment_count: integer("segment_count").notNull().default(0),
  segment_durations: jsonb("segment_durations").$type<number[]>().notNull().default([]),
  status: videoStatus("status").notNull().default("processing"),
  free_preview_chunks: integer("free_preview_chunks").notNull().default(0),
  total_price: money("total_price").notNull().default("0"),
  thumbnail_key: text("thumbnail_key"),
  source_key: text("source_key"),
  seed_views: integer("seed_views").notNull().default(0),
  published_at: timestamp("published_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  error: text("error"),
});

export const settlements = pgTable("settlements", {
  id: text("id").primaryKey(),
  creator_id: text("creator_id").notNull().references(() => creators.id),
  tx_hash: text("tx_hash").notNull(),
  claim_tx_hashes: jsonb("claim_tx_hashes").$type<string[]>().notNull().default([]),
  session_count: integer("session_count").notNull().default(0),
  voucher_count: integer("voucher_count").notNull().default(0),
  total_to_creators: money("total_to_creators").notNull().default("0"),
  total_refunded: money("total_refunded").notNull().default("0"),
  submitted_at: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  confirmed_at: timestamp("confirmed_at", { withTimezone: true }),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    video_id: text("video_id").notNull().references(() => videos.id),
    viewer_address: text("viewer_address").notNull(),
    locked_amount: money("locked_amount").notNull(),
    priced_chunk_count: integer("priced_chunk_count").notNull(),
    free_preview_chunks: integer("free_preview_chunks").notNull().default(0),
    channel_id: text("channel_id"),
    lock_tx: text("lock_tx"),
    started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    ended_at: timestamp("ended_at", { withTimezone: true }),
    last_activity_at: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    chunks_served: integer("chunks_served").notNull().default(0),
    chunks_consumed: integer("chunks_consumed").notNull().default(0),
    /** Chunk indices that carried a voucher; seeking pays only chunks actually watched. */
    paid_chunks: jsonb("paid_chunks").$type<number[]>().notNull().default([]),
    consumed_amount: money("consumed_amount").notNull().default("0"),
    refunded_amount: money("refunded_amount").notNull().default("0"),
    refund_tx: text("refund_tx"),
    status: sessionStatus("status").notNull().default("locked"),
    close_reason: text("close_reason"),
    settlement_id: text("settlement_id").references(() => settlements.id),
  },
  t => [
    index("sessions_video_status_idx").on(t.video_id, t.status),
    index("sessions_viewer_started_idx").on(t.viewer_address, t.started_at),
    uniqueIndex("sessions_channel_idx").on(t.channel_id),
  ],
);

export const charges = pgTable(
  "charges",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    session_id: text("session_id").notNull().references(() => sessions.id),
    chunk_index: integer("chunk_index").notNull(),
    priced_index: integer("priced_index").notNull(),
    amount: money("amount").notNull(),
    cumulative: money("cumulative").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [uniqueIndex("charges_session_chunk_idx").on(t.session_id, t.chunk_index)],
);

export const likes = pgTable(
  "likes",
  {
    video_id: text("video_id").notNull().references(() => videos.id),
    viewer_address: text("viewer_address").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.video_id, t.viewer_address] })],
);

export const faucetDrips = pgTable("faucet_drips", {
  address: text("address").primaryKey(),
  tx_id: text("tx_id").notNull(),
  account_id: text("account_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CreatorRow = typeof creators.$inferSelect;
export type VideoRow = typeof videos.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type SettlementRow = typeof settlements.$inferSelect;
