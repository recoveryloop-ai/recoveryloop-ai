export type NormalizedCarrierStatus =
  | "UNKNOWN"
  | "PRE_TRANSIT"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "AVAILABLE_FOR_PICKUP"
  | "RETURN_TO_SENDER"
  | "FAILURE"
  | "CANCELLED"
  | "ERROR";

export type CarrierLocation = {
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
};

export type CarrierEvent = {
  providerEventId: string;
  status: NormalizedCarrierStatus;
  statusDetail: string | null;
  message: string | null;
  location: CarrierLocation;
  observedAt: string;
  sourceTier: "PROVIDER_TEST";
  synthetic: false;
  rawPayloadHash: string;
  rawPayload: Record<string, unknown>;
};

export type CarrierTracker = {
  provider: "EASYPOST";
  providerTrackerId: string;
  trackingCode: string;
  carrier: string | null;
  status: NormalizedCarrierStatus;
  statusDetail: string | null;
  observedAt: string;
  sourceTier: "PROVIDER_TEST";
  synthetic: false;
  rawPayloadHash: string;
  events: readonly CarrierEvent[];
};

export interface CarrierProvider {
  readonly name: "easypost";
  readonly environment: "test";
  createTracker(trackingCode: string): Promise<CarrierTracker>;
  getTracker(providerTrackerId: string): Promise<CarrierTracker | null>;
}
