CREATE TABLE "payment_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(24) DEFAULT 'PAYPAL' NOT NULL,
	"provider_dispute_id" varchar(128) NOT NULL,
	"provider_capture_id" varchar(128) NOT NULL,
	"provider_status" varchar(64) NOT NULL,
	"outcome_code" varchar(64),
	"reason" varchar(64),
	"lifecycle_stage" varchar(64),
	"guard_state" varchar(24) NOT NULL,
	"amount_minor" integer,
	"currency" varchar(3),
	"provider_created_at" timestamp with time zone,
	"provider_updated_at" timestamp with time zone NOT NULL,
	"last_event_id" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_disputes_guard_state_valid" CHECK ("payment_disputes"."guard_state" in ('OPEN', 'BUYER_PAID', 'CLOSED_NO_PAYOUT')),
	CONSTRAINT "payment_disputes_provider_paypal" CHECK ("payment_disputes"."provider" = 'PAYPAL'),
	CONSTRAINT "payment_disputes_amount_nonnegative" CHECK ("payment_disputes"."amount_minor" is null or "payment_disputes"."amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "demo_overlays" DROP CONSTRAINT "demo_overlays_scenario_allowlist";--> statement-breakpoint
CREATE UNIQUE INDEX "payment_disputes_provider_dispute_capture_unique" ON "payment_disputes" USING btree ("provider","provider_dispute_id","provider_capture_id");--> statement-breakpoint
CREATE INDEX "payment_disputes_capture_guard_idx" ON "payment_disputes" USING btree ("provider","provider_capture_id","guard_state");--> statement-breakpoint
ALTER TABLE "demo_overlays" ADD CONSTRAINT "demo_overlays_scenario_allowlist" CHECK ("demo_overlays"."scenario" in ('ALREADY_REFUNDED', 'CONTRADICTORY_DELIVERY', 'BUYER_DISPUTE'));--> statement-breakpoint
ALTER TABLE "payment_disputes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "payment_disputes" FROM anon, authenticated;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enforce_refund_dispute_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Database backstop for the application-level dispute guard: a refund action can never
  -- be reserved or start executing while a PayPal dispute on the same order is open or has
  -- already paid the buyer. The application checks first and returns DISPUTE_OPEN; this
  -- trigger only fires if a code path ever skips that check.
  IF NEW.state IN ('RESERVED', 'EXECUTING')
    AND (TG_OP = 'INSERT' OR NEW.state IS DISTINCT FROM OLD.state) THEN
    IF EXISTS (
      SELECT 1
      FROM obligations ob
      JOIN captures c ON c.order_id = ob.order_id AND c.provider = 'PAYPAL'
      JOIN payment_disputes d ON d.provider = 'PAYPAL' AND d.provider_capture_id = c.provider_capture_id
      WHERE ob.id = NEW.obligation_id AND d.guard_state IN ('OPEN', 'BUYER_PAID')
    ) THEN
      RAISE EXCEPTION 'DISPUTE_GUARD_BLOCKED'
        USING ERRCODE = 'P0001', HINT = 'An open or buyer-paid PayPal dispute exists on this order.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.enforce_refund_dispute_guard() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
CREATE TRIGGER "actions_dispute_guard"
  BEFORE INSERT OR UPDATE OF "state" ON "actions"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_refund_dispute_guard();
