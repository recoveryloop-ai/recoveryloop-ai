CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"request_id" uuid NOT NULL,
	"state" varchar(24) NOT NULL,
	"provider_resource_id" varchar(128),
	"provider_response_hash" varchar(64),
	"failure_code" varchar(80),
	"executed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actions_state_valid" CHECK ("actions"."state" in ('APPROVED', 'RESERVED', 'EXECUTING', 'COMPLETED', 'PENDING', 'UNKNOWN', 'FAILED', 'REJECTED', 'CANCELLED', 'BLOCKED', 'VERIFIED_CLOSED')),
	CONSTRAINT "actions_provider_hash_valid" CHECK ("actions"."provider_response_hash" is null or length("actions"."provider_response_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"certificate_hash" varchar(64) NOT NULL,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificates_hash_valid" CHECK (length("certificates"."certificate_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"evidence_hash" varchar(64) NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"snapshot_hash" varchar(64) NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'PROPOSED' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_kind_valid" CHECK ("proposals"."kind" = 'PAYPAL_REFUND'),
	CONSTRAINT "proposals_amount_positive" CHECK ("proposals"."amount_minor" > 0),
	CONSTRAINT "proposals_currency_usd" CHECK ("proposals"."currency" = 'USD'),
	CONSTRAINT "proposals_hashes_valid" CHECK (length("proposals"."evidence_hash") = 64 and length("proposals"."snapshot_hash") = 64),
	CONSTRAINT "proposals_status_valid" CHECK ("proposals"."status" in ('PROPOSED', 'APPROVED', 'BLOCKED', 'REJECTED'))
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "action_id" uuid;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actions_proposal_unique" ON "actions" USING btree ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "actions_request_unique" ON "actions" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "actions_provider_resource_unique" ON "actions" USING btree ("provider_resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "actions_active_obligation_unique" ON "actions" USING btree ("obligation_id") WHERE "actions"."state" in ('APPROVED', 'RESERVED', 'EXECUTING', 'PENDING', 'UNKNOWN');--> statement-breakpoint
CREATE INDEX "actions_obligation_created_idx" ON "actions" USING btree ("obligation_id","created_at");--> statement-breakpoint
CREATE INDEX "actions_state_updated_idx" ON "actions" USING btree ("state","updated_at");--> statement-breakpoint
CREATE INDEX "actions_approved_by_idx" ON "actions" USING btree ("approved_by");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_action_unique" ON "certificates" USING btree ("action_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_hash_unique" ON "certificates" USING btree ("certificate_hash");--> statement-breakpoint
CREATE INDEX "certificates_case_created_idx" ON "certificates" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "proposals_case_created_idx" ON "proposals" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "proposals_obligation_idx" ON "proposals" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "proposals_policy_version_idx" ON "proposals" USING btree ("policy_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_snapshot_unique" ON "proposals" USING btree ("snapshot_hash");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action_id");
--> statement-breakpoint
ALTER TABLE "proposals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "actions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "certificates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "proposals", "actions", "certificates" FROM anon, authenticated;
