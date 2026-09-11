CREATE TYPE "public"."session_status" AS ENUM('locked', 'streaming', 'closing', 'closed', 'settled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "charges" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"priced_index" integer NOT NULL,
	"amount" numeric(20, 0) NOT NULL,
	"cumulative" numeric(20, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"hedera_account_id" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"world_nullifier_hash" text,
	"verified_at" timestamp with time zone,
	"subscribers" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creators_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "creators_handle_unique" UNIQUE("handle"),
	CONSTRAINT "creators_world_nullifier_hash_unique" UNIQUE("world_nullifier_hash")
);
--> statement-breakpoint
CREATE TABLE "faucet_drips" (
	"address" text PRIMARY KEY NOT NULL,
	"tx_id" text NOT NULL,
	"account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"video_id" text NOT NULL,
	"viewer_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "likes_video_id_viewer_address_pk" PRIMARY KEY("video_id","viewer_address")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"viewer_address" text NOT NULL,
	"locked_amount" numeric(20, 0) NOT NULL,
	"priced_chunk_count" integer NOT NULL,
	"free_preview_chunks" integer DEFAULT 0 NOT NULL,
	"channel_id" text,
	"lock_tx" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"chunks_served" integer DEFAULT 0 NOT NULL,
	"chunks_consumed" integer DEFAULT 0 NOT NULL,
	"consumed_amount" numeric(20, 0) DEFAULT '0' NOT NULL,
	"refunded_amount" numeric(20, 0) DEFAULT '0' NOT NULL,
	"refund_tx" text,
	"status" "session_status" DEFAULT 'locked' NOT NULL,
	"close_reason" text,
	"settlement_id" text
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"claim_tx_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"session_count" integer DEFAULT 0 NOT NULL,
	"voucher_count" integer DEFAULT 0 NOT NULL,
	"total_to_creators" numeric(20, 0) DEFAULT '0' NOT NULL,
	"total_refunded" numeric(20, 0) DEFAULT '0' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"duration_seconds" real DEFAULT 0 NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"segment_count" integer DEFAULT 0 NOT NULL,
	"segment_durations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "video_status" DEFAULT 'processing' NOT NULL,
	"free_preview_chunks" integer DEFAULT 0 NOT NULL,
	"total_price" numeric(20, 0) DEFAULT '0' NOT NULL,
	"thumbnail_key" text,
	"source_key" text,
	"seed_views" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "charges_session_chunk_idx" ON "charges" USING btree ("session_id","chunk_index");--> statement-breakpoint
CREATE INDEX "sessions_video_status_idx" ON "sessions" USING btree ("video_id","status");--> statement-breakpoint
CREATE INDEX "sessions_viewer_started_idx" ON "sessions" USING btree ("viewer_address","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_channel_idx" ON "sessions" USING btree ("channel_id");