CREATE INDEX "audit_events_merchant_idx" ON "audit_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "audit_events_case_idx" ON "audit_events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "captures_order_idx" ON "captures" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "cases_order_idx" ON "cases" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "obligations_case_idx" ON "obligations" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "obligations_item_idx" ON "obligations" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "obligations_policy_version_idx" ON "obligations" USING btree ("policy_version_id");--> statement-breakpoint
CREATE INDEX "orders_policy_version_idx" ON "orders" USING btree ("policy_version_id");--> statement-breakpoint
CREATE INDEX "refunds_capture_idx" ON "refunds" USING btree ("capture_id");--> statement-breakpoint
CREATE INDEX "users_merchant_idx" ON "users" USING btree ("merchant_id");