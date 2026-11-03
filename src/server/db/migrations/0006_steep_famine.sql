CREATE TABLE "investigations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"model" varchar(64) NOT NULL,
	"prompt_version" varchar(32) NOT NULL,
	"evidence_hash" varchar(64) NOT NULL,
	"input_hash" varchar(64) NOT NULL,
	"status" varchar(16) NOT NULL,
	"validation_code" varchar(64) NOT NULL,
	"output_json" jsonb NOT NULL,
	"tool_log" jsonb NOT NULL,
	"provider_response_hash" varchar(64),
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investigations_status_valid" CHECK ("investigations"."status" in ('VALIDATED', 'FALLBACK')),
	CONSTRAINT "investigations_hashes_valid" CHECK (length("investigations"."evidence_hash") = 64 and length("investigations"."input_hash") = 64 and ("investigations"."provider_response_hash" is null or length("investigations"."provider_response_hash") = 64)),
	CONSTRAINT "investigations_tokens_nonnegative" CHECK ("investigations"."prompt_tokens" >= 0 and "investigations"."completion_tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investigations_case_created_idx" ON "investigations" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "investigations_evidence_hash_idx" ON "investigations" USING btree ("evidence_hash");--> statement-breakpoint
ALTER TABLE "investigations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "investigations" FROM anon, authenticated;
