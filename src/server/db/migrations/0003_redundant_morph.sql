ALTER TABLE "evidence" DROP CONSTRAINT "evidence_source_tier_valid";--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "provider" varchar(40);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "synthetic_flag" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "evidence"
SET "provider" = 'FIXTURE', "source_tier" = 'SYNTHETIC', "synthetic_flag" = true
WHERE "source_tier" = 'SYNTHETIC_TEST';--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "provider" SET NOT NULL;--> statement-breakpoint
UPDATE "cases" AS c
SET "external_ref" = 'TMP-' || o."fixture_key" || '-' || left(c."id"::text, 8)
FROM "orders" AS o
WHERE o."id" = c."order_id" AND o."fixture_key" IN ('F02', 'F03', 'F04', 'F05');--> statement-breakpoint
UPDATE "cases" AS c
SET "external_ref" = fixture."external_ref"
FROM "orders" AS o
JOIN (VALUES
  ('F02', 'RG-2048'),
  ('F03', 'RG-2049'),
  ('F04', 'RG-2050'),
  ('F05', 'RG-2051')
) AS fixture("fixture_key", "external_ref") ON fixture."fixture_key" = o."fixture_key"
WHERE o."id" = c."order_id";--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_tier_valid" CHECK ("evidence"."source_tier" in ('PROVIDER_VERIFIED', 'PROVIDER_TEST', 'MERCHANT_ATTESTED', 'SYNTHETIC', 'AI_DERIVED'));
