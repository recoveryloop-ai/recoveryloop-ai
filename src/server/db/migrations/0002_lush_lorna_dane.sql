CREATE TABLE "paypal_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"paypal_order_id" varchar(128) NOT NULL,
	"create_request_id" uuid NOT NULL,
	"capture_request_id" uuid,
	"status" varchar(32) NOT NULL,
	"approval_url" text NOT NULL,
	"provider_response_hash" varchar(64) NOT NULL,
	"provider_created_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(24) NOT NULL,
	"event_id" varchar(160) NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_request_id" uuid;--> statement-breakpoint
ALTER TABLE "paypal_orders" ADD CONSTRAINT "paypal_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_orders_order_unique" ON "paypal_orders" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_orders_provider_unique" ON "paypal_orders" USING btree ("paypal_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_orders_create_request_unique" ON "paypal_orders" USING btree ("create_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_orders_capture_request_unique" ON "paypal_orders" USING btree ("capture_request_id");--> statement-breakpoint
CREATE INDEX "paypal_orders_status_idx" ON "paypal_orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_inbox_provider_event_unique" ON "webhook_inbox" USING btree ("provider","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_checkout_request_unique" ON "orders" USING btree ("checkout_request_id");
--> statement-breakpoint
ALTER TABLE "paypal_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_inbox" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "paypal_orders", "webhook_inbox" FROM anon, authenticated;
