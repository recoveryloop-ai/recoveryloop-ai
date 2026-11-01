CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"actor" varchar(160) NOT NULL,
	"case_id" uuid,
	"event_type" varchar(80) NOT NULL,
	"details_hash" varchar(64) NOT NULL,
	"details" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" varchar(24) DEFAULT 'PAYPAL' NOT NULL,
	"provider_capture_id" varchar(128) NOT NULL,
	"status" varchar(24) NOT NULL,
	"captured_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "captures_currency_usd" CHECK ("captures"."currency" = 'USD'),
	CONSTRAINT "captures_amount_positive" CHECK ("captures"."captured_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"external_ref" varchar(32) NOT NULL,
	"kind" varchar(40) NOT NULL,
	"status" varchar(24) NOT NULL,
	"severity" varchar(16) NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"source_tier" varchar(32) NOT NULL,
	"external_id" varchar(160) NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"redacted_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_source_tier_valid" CHECK ("evidence"."source_tier" in ('PROVIDER_VERIFIED', 'MERCHANT_ATTESTED', 'SYNTHETIC_TEST'))
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"demo_mode" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_currency_usd" CHECK ("merchants"."currency" = 'USD')
);
--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid,
	"case_id" uuid,
	"kind" varchar(40) NOT NULL,
	"reason_key" varchar(120) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"entitled_minor" integer NOT NULL,
	"status" varchar(24) NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obligations_currency_usd" CHECK ("obligations"."currency" = 'USD'),
	CONSTRAINT "obligations_amount_nonnegative" CHECK ("obligations"."entitled_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"sku" varchar(64) NOT NULL,
	"name" varchar(180) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_minor" integer NOT NULL,
	"tax_minor" integer DEFAULT 0 NOT NULL,
	"shipping_allocation_minor" integer DEFAULT 0 NOT NULL,
	"fulfillment_status" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_amounts_nonnegative" CHECK ("order_items"."unit_minor" >= 0 and "order_items"."tax_minor" >= 0 and "order_items"."shipping_allocation_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"external_ref" varchar(80) NOT NULL,
	"fixture_key" varchar(8),
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"total_minor" integer NOT NULL,
	"status" varchar(24) NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_currency_usd" CHECK ("orders"."currency" = 'USD'),
	CONSTRAINT "orders_total_minor_nonnegative" CHECK ("orders"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"version" varchar(32) NOT NULL,
	"json_rules" jsonb NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capture_id" uuid NOT NULL,
	"provider_refund_id" varchar(128) NOT NULL,
	"status" varchar(24) NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_currency_usd" CHECK ("refunds"."currency" = 'USD'),
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"auth_subject" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"role" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_valid" CHECK ("users"."role" in ('viewer', 'operator', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captures" ADD CONSTRAINT "captures_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_item_id_order_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "captures_provider_id_unique" ON "captures" USING btree ("provider","provider_capture_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_external_ref_unique" ON "cases" USING btree ("external_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_case_external_unique" ON "evidence" USING btree ("case_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "obligations_semantic_unique" ON "obligations" USING btree ("order_id","item_id","reason_key");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_sku_unique" ON "order_items" USING btree ("order_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_merchant_external_ref_unique" ON "orders" USING btree ("merchant_id","external_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_fixture_key_unique" ON "orders" USING btree ("fixture_key");--> statement-breakpoint
CREATE INDEX "orders_merchant_created_idx" ON "orders" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_versions_merchant_version_unique" ON "policy_versions" USING btree ("merchant_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_id_unique" ON "refunds" USING btree ("provider_refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_subject_unique" ON "users" USING btree ("auth_subject");
--> statement-breakpoint
ALTER TABLE "merchants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "policy_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "captures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "obligations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "merchants", "users", "policy_versions", "orders", "order_items", "captures", "refunds", "cases", "obligations", "evidence", "audit_events" FROM anon, authenticated;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.__drizzle_migrations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.__drizzle_migrations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.__drizzle_migrations FROM anon, authenticated';
  END IF;
END $$;
