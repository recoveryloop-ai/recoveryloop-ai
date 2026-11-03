CREATE TABLE "shipment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"provider" varchar(24) NOT NULL,
	"provider_event_id" varchar(160) NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"event_detail" varchar(64),
	"message" text,
	"location" jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_tier" varchar(32) NOT NULL,
	"synthetic_flag" boolean DEFAULT false NOT NULL,
	"raw_payload_hash" varchar(64) NOT NULL,
	"raw_payload" jsonb NOT NULL,
	CONSTRAINT "shipment_events_source_tier_valid" CHECK ("shipment_events"."source_tier" in ('PROVIDER_TEST', 'SYNTHETIC'))
);
--> statement-breakpoint
CREATE TABLE "shipment_items" (
	"shipment_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"source_tier" varchar(32) NOT NULL,
	"synthetic_flag" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_items_pk" PRIMARY KEY("shipment_id","order_item_id"),
	CONSTRAINT "shipment_items_quantity_positive" CHECK ("shipment_items"."quantity" > 0),
	CONSTRAINT "shipment_items_source_tier_valid" CHECK ("shipment_items"."source_tier" in ('MERCHANT_ATTESTED', 'SYNTHETIC'))
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" varchar(24) NOT NULL,
	"provider_tracker_id" varchar(128) NOT NULL,
	"tracking_code" varchar(80) NOT NULL,
	"carrier" varchar(64),
	"status" varchar(32) NOT NULL,
	"status_detail" varchar(64),
	"source_tier" varchar(32) NOT NULL,
	"synthetic_flag" boolean DEFAULT false NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	"last_recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_payload_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_source_tier_valid" CHECK ("shipments"."source_tier" in ('PROVIDER_TEST', 'SYNTHETIC'))
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "detection_key" varchar(220);--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "rule_key" varchar(16);--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "source_tier" varchar(32) DEFAULT 'SYNTHETIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "last_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_events_provider_event_unique" ON "shipment_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "shipment_events_shipment_observed_idx" ON "shipment_events" USING btree ("shipment_id","observed_at");--> statement-breakpoint
CREATE INDEX "shipment_items_order_item_idx" ON "shipment_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_provider_tracker_unique" ON "shipments" USING btree ("provider","provider_tracker_id");--> statement-breakpoint
CREATE INDEX "shipments_order_idx" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipments_status_idx" ON "shipments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_detection_key_unique" ON "cases" USING btree ("detection_key");--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_source_tier_valid" CHECK ("cases"."source_tier" in ('PROVIDER_TEST', 'MERCHANT_ATTESTED', 'SYNTHETIC', 'AI_DERIVED'));--> statement-breakpoint
ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shipment_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shipment_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "shipments", "shipment_items", "shipment_events" FROM anon, authenticated;
