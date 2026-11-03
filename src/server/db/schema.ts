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

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "restrict" }),
  actor: varchar("actor", { length: 160 }).notNull(),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "restrict" }),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  detailsHash: varchar("details_hash", { length: 64 }).notNull(),
  details: jsonb("details").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("audit_events_merchant_idx").on(table.merchantId),
  index("audit_events_case_idx").on(table.caseId),
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
