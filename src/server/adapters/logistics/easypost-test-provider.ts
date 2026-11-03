import { createHash } from "node:crypto";

import { z } from "zod";

import type {
  CarrierEvent,
  CarrierProvider,
  CarrierTracker,
  NormalizedCarrierStatus,
} from "./carrier-provider";

const EASYPOST_BASE_URL = "https://api.easypost.com/v2";

const locationSchema = z.object({
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
}).passthrough();

const trackingDetailSchema = z.object({
  message: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.string(),
  status_detail: z.string().nullable().optional(),
  datetime: z.string(),
  source: z.string().nullable().optional(),
  carrier_code: z.string().nullable().optional(),
  tracking_location: locationSchema.nullable().optional(),
}).passthrough();

const trackerSchema = z.object({
  id: z.string().startsWith("trk_"),
  object: z.literal("Tracker"),
  mode: z.literal("test"),
  tracking_code: z.string().min(1),
  status: z.string(),
  status_detail: z.string().nullable().optional(),
  carrier: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  tracking_details: z.array(trackingDetailSchema).default([]),
}).passthrough();

type EasyPostTrackerPayload = z.infer<typeof trackerSchema>;
type EasyPostTrackingDetail = z.infer<typeof trackingDetailSchema>;

export class EasyPostProviderError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(`EASYPOST_${operation}_HTTP_${status}`);
    this.name = "EasyPostProviderError";
  }
}

export interface EasyPostTestProviderOptions {
  readonly apiKey: string;
  readonly fetchImplementation?: typeof fetch;
}

export function normalizeEasyPostStatus(status: string): NormalizedCarrierStatus {
  const normalized = status.trim().toLowerCase();
  const statuses: Record<string, NormalizedCarrierStatus> = {
    unknown: "UNKNOWN",
    pre_transit: "PRE_TRANSIT",
    in_transit: "IN_TRANSIT",
    out_for_delivery: "OUT_FOR_DELIVERY",
    delivered: "DELIVERED",
    available_for_pickup: "AVAILABLE_FOR_PICKUP",
    return_to_sender: "RETURN_TO_SENDER",
    failure: "FAILURE",
    cancelled: "CANCELLED",
    error: "ERROR",
  };
  return statuses[normalized] ?? "UNKNOWN";
}

function toIsoTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error("EASYPOST_TIMESTAMP_INVALID");
  return date.toISOString();
}

export function hashCarrierPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeEvent(trackerId: string, detail: EasyPostTrackingDetail): CarrierEvent {
  const rawPayload = { ...detail } as Record<string, unknown>;
  const rawPayloadHash = hashCarrierPayload(rawPayload);
  const location = detail.tracking_location;
  return {
    providerEventId: `ep_${trackerId}_${rawPayloadHash.slice(0, 40)}`,
    status: normalizeEasyPostStatus(detail.status),
    statusDetail: detail.status_detail ?? null,
    message: detail.message ?? detail.description ?? null,
    location: {
      city: location?.city ?? null,
      state: location?.state ?? null,
      country: location?.country ?? null,
      postalCode: location?.zip ?? null,
    },
    observedAt: toIsoTimestamp(detail.datetime),
    sourceTier: "PROVIDER_TEST",
    synthetic: false,
    rawPayloadHash,
    rawPayload,
  };
}

function topLevelEvent(payload: EasyPostTrackerPayload): CarrierEvent {
  const rawPayload = {
    status: payload.status,
    status_detail: payload.status_detail ?? null,
    datetime: payload.updated_at,
    source: "EasyPost",
  };
  const rawPayloadHash = hashCarrierPayload(rawPayload);
  return {
    providerEventId: `ep_${payload.id}_${rawPayloadHash.slice(0, 40)}`,
    status: normalizeEasyPostStatus(payload.status),
    statusDetail: payload.status_detail ?? null,
    message: null,
    location: { city: null, state: null, country: null, postalCode: null },
    observedAt: toIsoTimestamp(payload.updated_at),
    sourceTier: "PROVIDER_TEST",
    synthetic: false,
    rawPayloadHash,
    rawPayload,
  };
}

export function normalizeEasyPostTracker(input: unknown): CarrierTracker {
  const payload = trackerSchema.parse(input);
  const events = payload.tracking_details.map((detail) => normalizeEvent(payload.id, detail));
  if (events.length === 0) events.push(topLevelEvent(payload));
  return {
    provider: "EASYPOST",
    providerTrackerId: payload.id,
    trackingCode: payload.tracking_code,
    carrier: payload.carrier ?? null,
    status: normalizeEasyPostStatus(payload.status),
    statusDetail: payload.status_detail ?? null,
    observedAt: toIsoTimestamp(payload.updated_at),
    sourceTier: "PROVIDER_TEST",
    synthetic: false,
    rawPayloadHash: hashCarrierPayload(payload),
    events,
  };
}

export class EasyPostTestProvider implements CarrierProvider {
  readonly name = "easypost" as const;
  readonly environment = "test" as const;
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: EasyPostTestProviderOptions) {
    if (!options.apiKey.startsWith("EZTK")) throw new Error("EASYPOST_TEST_KEY_REQUIRED");
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async createTracker(trackingCode: string): Promise<CarrierTracker> {
    if (!trackingCode.trim()) throw new Error("TRACKING_CODE_REQUIRED");
    const payload = await this.request("TRACKER_CREATE", "/trackers", {
      method: "POST",
      body: JSON.stringify({ tracker: { tracking_code: trackingCode } }),
    });
    return normalizeEasyPostTracker(payload);
  }

  async getTracker(providerTrackerId: string): Promise<CarrierTracker | null> {
    try {
      return normalizeEasyPostTracker(await this.request("TRACKER_READ", `/trackers/${encodeURIComponent(providerTrackerId)}`));
    } catch (error) {
      if (error instanceof EasyPostProviderError && error.status === 404) return null;
      throw error;
    }
  }

  private async request(operation: string, path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetchImplementation(`${EASYPOST_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.options.apiKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new EasyPostProviderError(operation, response.status, response.status === 429 || response.status >= 500);
    return response.json();
  }
}
