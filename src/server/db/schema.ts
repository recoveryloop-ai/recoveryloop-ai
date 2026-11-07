import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 160 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  demoMode: boolean("demo_mode").notNull().default(true),
  createdAt,
}, (table) => [check("merchants_currency_usd", sql`${table.currency} = 'USD'`)]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "restrict" }),
  authSubject: uuid("auth_subject").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  role: varchar("role", { length: 16 }).notNull(),
  createdAt,
}, (table) => [
  uniqueIndex("users_auth_subject_unique").on(table.authSubject),
  index("users_merchant_idx").on(table.merchantId),
  check("users_role_valid", sql`${table.role} in ('viewer', 'operator', 'admin')`),
]);

export const policyVersions = pgTable("policy_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "restrict" }),
  version: varchar("version", { length: 32 }).notNull(),
  jsonRules: jsonb("json_rules").notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
  createdAt,
}, (table) => [uniqueIndex("policy_versions_merchant_version_unique").on(table.merchantId, table.version)]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "restrict" }),
  externalRef: varchar("external_ref", { length: 80 }).notNull(),
  checkoutRequestId: uuid("checkout_request_id"),
  fixtureKey: varchar("fixture_key", { length: 8 }),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  totalMinor: integer("total_minor").notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  policyVersionId: uuid("policy_version_id").notNull().references(() => policyVersions.id, { onDelete: "restrict" }),
  createdAt,
}, (table) => [
  uniqueIndex("orders_merchant_external_ref_unique").on(table.merchantId, table.externalRef),
  uniqueIndex("orders_checkout_request_unique").on(table.checkoutRequestId),
  uniqueIndex("orders_fixture_key_unique").on(table.fixtureKey),
  index("orders_merchant_created_idx").on(table.merchantId, table.createdAt),
  index("orders_policy_version_idx").on(table.policyVersionId),
  check("orders_currency_usd", sql`${table.currency} = 'USD'`),
  check("orders_total_minor_nonnegative", sql`${table.totalMinor} >= 0`),
]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  sku: varchar("sku", { length: 64 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  quantity: integer("quantity").notNull(),
  unitMinor: integer("unit_minor").notNull(),
  taxMinor: integer("tax_minor").notNull().default(0),
  shippingAllocationMinor: integer("shipping_allocation_minor").notNull().default(0),
  fulfillmentStatus: varchar("fulfillment_status", { length: 32 }).notNull(),
  createdAt,
}, (table) => [
  uniqueIndex("order_items_order_sku_unique").on(table.orderId, table.sku),
  check("order_items_quantity_positive", sql`${table.quantity} > 0`),
  check("order_items_amounts_nonnegative", sql`${table.unitMinor} >= 0 and ${table.taxMinor} >= 0 and ${table.shippingAllocationMinor} >= 0`),
]);

export const shipments = pgTable("shipments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  provider: varchar("provider", { length: 24 }).notNull(),
  providerTrackerId: varchar("provider_tracker_id", { length: 128 }).notNull(),
  trackingCode: varchar("tracking_code", { length: 80 }).notNull(),
  carrier: varchar("carrier", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull(),
  statusDetail: varchar("status_detail", { length: 64 }),
  sourceTier: varchar("source_tier", { length: 32 }).notNull(),
  syntheticFlag: boolean("synthetic_flag").notNull().default(false),
  lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
  lastRecordedAt: timestamp("last_recorded_at", { withTimezone: true }).notNull().defaultNow(),
  rawPayloadHash: varchar("raw_payload_hash", { length: 64 }).notNull(),
  createdAt,
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("shipments_provider_tracker_unique").on(table.provider, table.providerTrackerId),
  index("shipments_order_idx").on(table.orderId),
  index("shipments_status_idx").on(table.status),
  check("shipments_source_tier_valid", sql`${table.sourceTier} in ('PROVIDER_TEST', 'SYNTHETIC')`),
]);

export const shipmentItems = pgTable("shipment_items", {
  shipmentId: uuid("shipment_id").notNull().references(() => shipments.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  sourceTier: varchar("source_tier", { length: 32 }).notNull(),
  syntheticFlag: boolean("synthetic_flag").notNull().default(true),
  createdAt,
}, (table) => [
  primaryKey({ columns: [table.shipmentId, table.orderItemId], name: "shipment_items_pk" }),
  index("shipment_items_order_item_idx").on(table.orderItemId),
  check("shipment_items_quantity_positive", sql`${table.quantity} > 0`),
  check("shipment_items_source_tier_valid", sql`${table.sourceTier} in ('MERCHANT_ATTESTED', 'SYNTHETIC')`),
]);

export const shipmentEvents = pgTable("shipment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  shipmentId: uuid("shipment_id").notNull().references(() => shipments.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 24 }).notNull(),
  providerEventId: varchar("provider_event_id", { length: 160 }).notNull(),
  eventType: varchar("event_type", { length: 32 }).notNull(),
  eventDetail: varchar("event_detail", { length: 64 }),
  message: text("message"),
  location: jsonb("location").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  sourceTier: varchar("source_tier", { length: 32 }).notNull(),
  syntheticFlag: boolean("synthetic_flag").notNull().default(false),
  rawPayloadHash: varchar("raw_payload_hash", { length: 64 }).notNull(),
  rawPayload: jsonb("raw_payload").notNull(),
}, (table) => [
  uniqueIndex("shipment_events_provider_event_unique").on(table.provider, table.providerEventId),
  index("shipment_events_shipment_observed_idx").on(table.shipmentId, table.observedAt),
  check("shipment_events_source_tier_valid", sql`${table.sourceTier} in ('PROVIDER_TEST', 'SYNTHETIC')`),
]);

export const captures = pgTable("captures", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  provider: varchar("provider", { length: 24 }).notNull().default("PAYPAL"),
  providerCaptureId: varchar("provider_capture_id", { length: 128 }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  capturedMinor: integer("captured_minor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt,
}, (table) => [
  uniqueIndex("captures_provider_id_unique").on(table.provider, table.providerCaptureId),
  index("captures_order_idx").on(table.orderId),
  check("captures_currency_usd", sql`${table.currency} = 'USD'`),
  check("captures_amount_positive", sql`${table.capturedMinor} > 0`),
]);

export const paypalOrders = pgTable("paypal_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  paypalOrderId: varchar("paypal_order_id", { length: 128 }).notNull(),
  createRequestId: uuid("create_request_id").notNull(),
  captureRequestId: uuid("capture_request_id"),
  status: varchar("status", { length: 32 }).notNull(),
  approvalUrl: text("approval_url").notNull(),
  providerResponseHash: varchar("provider_response_hash", { length: 64 }).notNull(),
  providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdAt,
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("paypal_orders_order_unique").on(table.orderId),
  uniqueIndex("paypal_orders_provider_unique").on(table.paypalOrderId),
  uniqueIndex("paypal_orders_create_request_unique").on(table.createRequestId),
  uniqueIndex("paypal_orders_capture_request_unique").on(table.captureRequestId),
  index("paypal_orders_status_idx").on(table.status),
]);

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  captureId: uuid("capture_id").notNull().references(() => captures.id, { onDelete: "restrict" }),
  providerRefundId: varchar("provider_refund_id", { length: 128 }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt,
}, (table) => [
  uniqueIndex("refunds_provider_id_unique").on(table.providerRefundId),
  index("refunds_capture_idx").on(table.captureId),
  check("refunds_currency_usd", sql`${table.currency} = 'USD'`),
  check("refunds_amount_positive", sql`${table.amountMinor} > 0`),
]);

export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  externalRef: varchar("external_ref", { length: 32 }).notNull(),
  kind: varchar("kind", { length: 40 }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  severity: varchar("severity", { length: 16 }).notNull(),
  detectionKey: varchar("detection_key", { length: 220 }),
  ruleKey: varchar("rule_key", { length: 16 }),
  sourceTier: varchar("source_tier", { length: 32 }).notNull().default("SYNTHETIC"),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("cases_external_ref_unique").on(table.externalRef),
  uniqueIndex("cases_detection_key_unique").on(table.detectionKey),
  index("cases_order_idx").on(table.orderId),
  check("cases_source_tier_valid", sql`${table.sourceTier} in ('PROVIDER_TEST', 'MERCHANT_ATTESTED', 'SYNTHETIC', 'AI_DERIVED')`),
]);

export const obligations = pgTable("obligations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  itemId: uuid("item_id").references(() => orderItems.id, { onDelete: "restrict" }),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "restrict" }),
  kind: varchar("kind", { length: 40 }).notNull(),
  reasonKey: varchar("reason_key", { length: 120 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  entitledMinor: integer("entitled_minor").notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  policyVersionId: uuid("policy_version_id").notNull().references(() => policyVersions.id, { onDelete: "restrict" }),
  createdAt,
}, (table) => [
  uniqueIndex("obligations_semantic_unique").on(table.orderId, table.itemId, table.reasonKey),
  index("obligations_case_idx").on(table.caseId),
  index("obligations_item_idx").on(table.itemId),
  index("obligations_policy_version_idx").on(table.policyVersionId),
  check("obligations_currency_usd", sql`${table.currency} = 'USD'`),
  check("obligations_amount_nonnegative", sql`${table.entitledMinor} >= 0`),
]);

export const obligationAllocations = pgTable("obligation_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  obligationId: uuid("obligation_id").notNull().references(() => obligations.id, { onDelete: "restrict" }),
  refundId: uuid("refund_id").notNull().references(() => refunds.id, { onDelete: "restrict" }),
  amountMinor: integer("amount_minor").notNull(),
  state: varchar("state", { length: 16 }).notNull(),
  createdAt,
}, (table) => [
  uniqueIndex("obligation_allocations_obligation_refund_unique").on(table.obligationId, table.refundId),
  index("obligation_allocations_refund_idx").on(table.refundId),
  check("obligation_allocations_amount_positive", sql`${table.amountMinor} > 0`),
  check("obligation_allocations_state_valid", sql`${table.state} in ('COMPLETED', 'RESERVED')`),
]);

export const evidence = pgTable("evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "restrict" }),
  provider: varchar("provider", { length: 40 }).notNull(),
  sourceTier: varchar("source_tier", { length: 32 }).notNull(),
  externalId: varchar("external_id", { length: 160 }).notNull(),
  payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  syntheticFlag: boolean("synthetic_flag").notNull().default(false),
  redactedJson: jsonb("redacted_json").notNull(),
  createdAt,
}, (table) => [
  uniqueIndex("evidence_case_external_unique").on(table.caseId, table.externalId),
  check("evidence_source_tier_valid", sql`${table.sourceTier} in ('PROVIDER_VERIFIED', 'PROVIDER_TEST', 'MERCHANT_ATTESTED', 'SYNTHETIC', 'AI_DERIVED')`),
]);

export const graphEdges = pgTable("graph_edges", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "restrict" }),
  fromType: varchar("from_type", { length: 24 }).notNull(),
  fromId: uuid("from_id").notNull(),
  relation: varchar("relation", { length: 32 }).notNull(),
  toType: varchar("to_type", { length: 24 }).notNull(),
  toId: uuid("to_id").notNull(),
  evidenceId: uuid("evidence_id").notNull().references(() => evidence.id, { onDelete: "restrict" }),
  createdAt,
}, (table) => [
  uniqueIndex("graph_edges_semantic_unique").on(
    table.caseId,
    table.fromType,
    table.fromId,
    table.relation,
    table.toType,
    table.toId,
    table.evidenceId,
  ),
  index("graph_edges_case_idx").on(table.caseId),
  index("graph_edges_evidence_idx").on(table.evidenceId),
  index("graph_edges_from_idx").on(table.fromType, table.fromId),
  index("graph_edges_to_idx").on(table.toType, table.toId),
  check("graph_edges_node_types_valid", sql`${table.fromType} in ('ORDER', 'ITEM', 'CAPTURE', 'REFUND', 'OBLIGATION', 'SHIPMENT', 'EVENT') and ${table.toType} in ('ORDER', 'ITEM', 'CAPTURE', 'REFUND', 'OBLIGATION', 'SHIPMENT', 'EVENT')`),
  check("graph_edges_relation_valid", sql`${table.relation} in ('HAS_ITEM', 'PAID_BY', 'PACKED_IN', 'REPORTED_AS', 'SUBJECT_TO', 'SATISFIES')`),
]);

export const investigations = pgTable("investigations", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "restrict" }),
  model: varchar("model", { length: 64 }).notNull(),
  promptVersion: varchar("prompt_version", { length: 32 }).notNull(),
  evidenceHash: varchar("evidence_hash", { length: 64 }).notNull(),
  inputHash: varchar("input_hash", { length: 64 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  validationCode: varchar("validation_code", { length: 64 }).notNull(),
  outputJson: jsonb("output_json").notNull(),
  toolLog: jsonb("tool_log").notNull(),
  providerResponseHash: varchar("provider_response_hash", { length: 64 }),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  createdAt,
}, (table) => [
  index("investigations_case_created_idx").on(table.caseId, table.createdAt),
  index("investigations_evidence_hash_idx").on(table.evidenceHash),
  check("investigations_status_valid", sql`${table.status} in ('VALIDATED', 'FALLBACK')`),
  check("investigations_hashes_valid", sql`length(${table.evidenceHash}) = 64 and length(${table.inputHash}) = 64 and (${table.providerResponseHash} is null or length(${table.providerResponseHash}) = 64)`),
  check("investigations_tokens_nonnegative", sql`${table.promptTokens} >= 0 and ${table.completionTokens} >= 0`),
]);

export const proposals = pgTable("proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "restrict" }),
  obligationId: uuid("obligation_id").notNull().references(() => obligations.id, { onDelete: "restrict" }),
  kind: varchar("kind", { length: 32 }).notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  evidenceHash: varchar("evidence_hash", { length: 64 }).notNull(),
  policyVersionId: uuid("policy_version_id").notNull().references(() => policyVersions.id, { onDelete: "restrict" }),
  snapshotHash: varchar("snapshot_hash", { length: 64 }).notNull(),
  snapshotJson: jsonb("snapshot_json").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("PROPOSED"),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt,
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("proposals_case_created_idx").on(table.caseId, table.createdAt),
  index("proposals_obligation_idx").on(table.obligationId),
  index("proposals_policy_version_idx").on(table.policyVersionId),
  uniqueIndex("proposals_snapshot_unique").on(table.snapshotHash),
  check("proposals_kind_valid", sql`${table.kind} = 'PAYPAL_REFUND'`),
  check("proposals_amount_positive", sql`${table.amountMinor} > 0`),
  check("proposals_currency_usd", sql`${table.currency} = 'USD'`),
  check("proposals_hashes_valid", sql`length(${table.evidenceHash}) = 64 and length(${table.snapshotHash}) = 64`),
  check("proposals_status_valid", sql`${table.status} in ('PROPOSED', 'APPROVED', 'BLOCKED', 'REJECTED')`),
]);

export const actions = pgTable("actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalId: uuid("proposal_id").notNull().references(() => proposals.id, { onDelete: "restrict" }),
  obligationId: uuid("obligation_id").notNull().references(() => obligations.id, { onDelete: "restrict" }),
  approvedBy: uuid("approved_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
  requestId: uuid("request_id").notNull(),
  state: varchar("state", { length: 24 }).notNull(),
  providerResourceId: varchar("provider_resource_id", { length: 128 }),
  providerResponseHash: varchar("provider_response_hash", { length: 64 }),
  failureCode: varchar("failure_code", { length: 80 }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt,
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("actions_proposal_unique").on(table.proposalId),
  uniqueIndex("actions_request_unique").on(table.requestId),
  uniqueIndex("actions_provider_resource_unique").on(table.providerResourceId),
  uniqueIndex("actions_active_obligation_unique").on(table.obligationId)
    .where(sql`${table.state} in ('APPROVED', 'RESERVED', 'EXECUTING', 'PENDING', 'UNKNOWN')`),
  index("actions_obligation_created_idx").on(table.obligationId, table.createdAt),
  index("actions_state_updated_idx").on(table.state, table.updatedAt),
  index("actions_approved_by_idx").on(table.approvedBy),
  check("actions_state_valid", sql`${table.state} in ('APPROVED', 'RESERVED', 'EXECUTING', 'COMPLETED', 'PENDING', 'UNKNOWN', 'FAILED', 'REJECTED', 'CANCELLED', 'BLOCKED', 'VERIFIED_CLOSED')`),
  check("actions_provider_hash_valid", sql`${table.providerResponseHash} is null or length(${table.providerResponseHash}) = 64`),
]);

export const certificates = pgTable("certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "restrict" }),
  actionId: uuid("action_id").notNull().references(() => actions.id, { onDelete: "restrict" }),
  certificateHash: varchar("certificate_hash", { length: 64 }).notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  createdAt,
}, (table) => [
  uniqueIndex("certificates_action_unique").on(table.actionId),
  uniqueIndex("certificates_hash_unique").on(table.certificateHash),
  index("certificates_case_created_idx").on(table.caseId, table.createdAt),
  check("certificates_hash_valid", sql`length(${table.certificateHash}) = 64`),
]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "restrict" }),
  actor: varchar("actor", { length: 160 }).notNull(),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "restrict" }),
  actionId: uuid("action_id").references(() => actions.id, { onDelete: "restrict" }),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  detailsHash: varchar("details_hash", { length: 64 }).notNull(),
  details: jsonb("details").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("audit_events_merchant_idx").on(table.merchantId),
  index("audit_events_case_idx").on(table.caseId),
  index("audit_events_action_idx").on(table.actionId),
]);

export const webhookInbox = pgTable("webhook_inbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: varchar("provider", { length: 24 }).notNull(),
  eventId: varchar("event_id", { length: 160 }).notNull(),
  verified: boolean("verified").notNull().default(false),
  payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("webhook_inbox_provider_event_unique").on(table.provider, table.eventId),
]);

/**
 * One row per (PayPal dispute, disputed capture). Linked to captures by the provider
 * capture ID rather than a foreign key so a dispute that arrives before its capture is
 * recorded is held, not dropped, and starts guarding as soon as the capture exists.
 */
export const paymentDisputes = pgTable("payment_disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: varchar("provider", { length: 24 }).notNull().default("PAYPAL"),
  providerDisputeId: varchar("provider_dispute_id", { length: 128 }).notNull(),
  providerCaptureId: varchar("provider_capture_id", { length: 128 }).notNull(),
  providerStatus: varchar("provider_status", { length: 64 }).notNull(),
  outcomeCode: varchar("outcome_code", { length: 64 }),
  reason: varchar("reason", { length: 64 }),
  lifecycleStage: varchar("lifecycle_stage", { length: 64 }),
  guardState: varchar("guard_state", { length: 24 }).notNull(),
  amountMinor: integer("amount_minor"),
  currency: varchar("currency", { length: 3 }),
  providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
  providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true }).notNull(),
  lastEventId: varchar("last_event_id", { length: 160 }).notNull(),
  createdAt,
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("payment_disputes_provider_dispute_capture_unique").on(table.provider, table.providerDisputeId, table.providerCaptureId),
  index("payment_disputes_capture_guard_idx").on(table.provider, table.providerCaptureId, table.guardState),
  check("payment_disputes_guard_state_valid", sql`${table.guardState} in ('OPEN', 'BUYER_PAID', 'CLOSED_NO_PAYOUT')`),
  check("payment_disputes_provider_paypal", sql`${table.provider} = 'PAYPAL'`),
  check("payment_disputes_amount_nonnegative", sql`${table.amountMinor} is null or ${table.amountMinor} >= 0`),
]);

export const judgeSessions = pgTable("judge_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  requestCount: integer("request_count").notNull().default(0),
  aiCallCount: integer("ai_call_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt,
}, (table) => [
  uniqueIndex("judge_sessions_token_hash_unique").on(table.tokenHash),
  index("judge_sessions_expires_idx").on(table.expiresAt),
  check("judge_sessions_token_hash_valid", sql`length(${table.tokenHash}) = 64`),
  check("judge_sessions_counters_nonnegative", sql`${table.requestCount} >= 0 and ${table.aiCallCount} >= 0`),
]);

export const demoOverlays = pgTable("demo_overlays", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => judgeSessions.id, { onDelete: "cascade" }),
  caseRef: varchar("case_ref", { length: 32 }).notNull().default("RG-2048"),
  scenario: varchar("scenario", { length: 40 }).notNull(),
  evidenceHash: varchar("evidence_hash", { length: 64 }).notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt,
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("demo_overlays_session_case_unique").on(table.sessionId, table.caseRef),
  index("demo_overlays_session_expires_idx").on(table.sessionId, table.expiresAt),
  check("demo_overlays_case_allowlist", sql`${table.caseRef} = 'RG-2048'`),
  check("demo_overlays_scenario_allowlist", sql`${table.scenario} in ('ALREADY_REFUNDED', 'CONTRADICTORY_DELIVERY', 'BUYER_DISPUTE')`),
  check("demo_overlays_evidence_hash_valid", sql`length(${table.evidenceHash}) = 64`),
]);
