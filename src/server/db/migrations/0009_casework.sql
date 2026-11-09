CREATE TABLE casework_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES cases(id),
 scenario varchar(40) NOT NULL, facts jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(case_id, scenario), CHECK (scenario IN ('ALREADY_REFUNDED','CONTRADICTORY_DELIVERY','PENDING_REFUND','DAMAGED_ITEM','NOT_RECEIVED','DISPUTE_INQUIRY','ENTITY_REVIEW'))
);
--> statement-breakpoint
CREATE TABLE casework_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES cases(id),
 scenario varchar(40) NOT NULL, evidence_hash varchar(64) NOT NULL, model varchar(64) NOT NULL,
 prompt_version varchar(40) NOT NULL, output_json jsonb NOT NULL, tool_log jsonb NOT NULL,
 provider_response_hash varchar(64) NOT NULL, prompt_tokens integer NOT NULL, completion_tokens integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(length(evidence_hash)=64)
);
--> statement-breakpoint
CREATE INDEX casework_runs_case_scenario_idx ON casework_runs(case_id,scenario,created_at DESC);
--> statement-breakpoint
CREATE TABLE casework_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL UNIQUE REFERENCES casework_runs(id),
 case_id uuid NOT NULL REFERENCES cases(id), merchant_id uuid NOT NULL REFERENCES merchants(id),
 outcome varchar(40) NOT NULL CHECK(outcome IN ('REQUEST_EVIDENCE','ROUTE_TO_OPERATOR','MONITOR_PAYMENT','NO_ACTION','READY_FOR_POLICY_REVIEW')),
 state varchar(20) NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','OVERRIDDEN','CLOSED')),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0), created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX casework_tasks_merchant_idx ON casework_tasks(merchant_id,case_id);
--> statement-breakpoint
ALTER TABLE casework_evidence ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE casework_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE casework_tasks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE casework_evidence,casework_runs,casework_tasks FROM anon,authenticated;
--> statement-breakpoint
ALTER TABLE demo_overlays DROP CONSTRAINT demo_overlays_scenario_allowlist;
--> statement-breakpoint
ALTER TABLE demo_overlays ADD CONSTRAINT demo_overlays_scenario_allowlist CHECK(scenario IN ('ALREADY_REFUNDED','CONTRADICTORY_DELIVERY','PENDING_REFUND','DAMAGED_ITEM','NOT_RECEIVED','DISPUTE_INQUIRY','ENTITY_REVIEW'));
