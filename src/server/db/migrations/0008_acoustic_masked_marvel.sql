CREATE TABLE "demo_overlays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"case_ref" varchar(32) DEFAULT 'RG-2048' NOT NULL,
	"scenario" varchar(40) NOT NULL,
	"evidence_hash" varchar(64) NOT NULL,
	"payload_json" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_overlays_case_allowlist" CHECK ("demo_overlays"."case_ref" = 'RG-2048'),
	CONSTRAINT "demo_overlays_scenario_allowlist" CHECK ("demo_overlays"."scenario" in ('ALREADY_REFUNDED', 'CONTRADICTORY_DELIVERY')),
	CONSTRAINT "demo_overlays_evidence_hash_valid" CHECK (length("demo_overlays"."evidence_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "judge_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"ai_call_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judge_sessions_token_hash_valid" CHECK (length("judge_sessions"."token_hash") = 64),
	CONSTRAINT "judge_sessions_counters_nonnegative" CHECK ("judge_sessions"."request_count" >= 0 and "judge_sessions"."ai_call_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "demo_overlays" ADD CONSTRAINT "demo_overlays_session_id_judge_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."judge_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "demo_overlays_session_case_unique" ON "demo_overlays" USING btree ("session_id","case_ref");--> statement-breakpoint
CREATE INDEX "demo_overlays_session_expires_idx" ON "demo_overlays" USING btree ("session_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "judge_sessions_token_hash_unique" ON "judge_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "judge_sessions_expires_idx" ON "judge_sessions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "judge_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "demo_overlays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "judge_sessions", "demo_overlays" FROM anon, authenticated;
