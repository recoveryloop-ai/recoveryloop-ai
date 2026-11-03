CREATE TABLE "graph_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"from_type" varchar(24) NOT NULL,
	"from_id" uuid NOT NULL,
	"relation" varchar(32) NOT NULL,
	"to_type" varchar(24) NOT NULL,
	"to_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graph_edges_node_types_valid" CHECK ("graph_edges"."from_type" in ('ORDER', 'ITEM', 'CAPTURE', 'REFUND', 'OBLIGATION', 'SHIPMENT', 'EVENT') and "graph_edges"."to_type" in ('ORDER', 'ITEM', 'CAPTURE', 'REFUND', 'OBLIGATION', 'SHIPMENT', 'EVENT')),
	CONSTRAINT "graph_edges_relation_valid" CHECK ("graph_edges"."relation" in ('HAS_ITEM', 'PAID_BY', 'PACKED_IN', 'REPORTED_AS', 'SUBJECT_TO', 'SATISFIES'))
);
--> statement-breakpoint
CREATE TABLE "obligation_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obligation_id" uuid NOT NULL,
	"refund_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"state" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obligation_allocations_amount_positive" CHECK ("obligation_allocations"."amount_minor" > 0),
	CONSTRAINT "obligation_allocations_state_valid" CHECK ("obligation_allocations"."state" in ('COMPLETED', 'RESERVED'))
);
--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_allocations" ADD CONSTRAINT "obligation_allocations_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_allocations" ADD CONSTRAINT "obligation_allocations_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "graph_edges_semantic_unique" ON "graph_edges" USING btree ("case_id","from_type","from_id","relation","to_type","to_id","evidence_id");--> statement-breakpoint
CREATE INDEX "graph_edges_case_idx" ON "graph_edges" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "graph_edges_evidence_idx" ON "graph_edges" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "graph_edges_from_idx" ON "graph_edges" USING btree ("from_type","from_id");--> statement-breakpoint
CREATE INDEX "graph_edges_to_idx" ON "graph_edges" USING btree ("to_type","to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "obligation_allocations_obligation_refund_unique" ON "obligation_allocations" USING btree ("obligation_id","refund_id");--> statement-breakpoint
CREATE INDEX "obligation_allocations_refund_idx" ON "obligation_allocations" USING btree ("refund_id");--> statement-breakpoint
ALTER TABLE "graph_edges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "obligation_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "graph_edges" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "obligation_allocations" FROM anon, authenticated;
