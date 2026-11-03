import { describe, expect, it, vi } from "vitest";

import {
  EasyPostProviderError,
  EasyPostTestProvider,
  normalizeEasyPostStatus,
  normalizeEasyPostTracker,
} from "../src/server/adapters/logistics/easypost-test-provider";

function trackerPayload(status = "return_to_sender") {
  return {
    id: "trk_test_123",
    object: "Tracker",
    mode: "test",
    tracking_code: "EZ5000000005",
    status,
    status_detail: "return",
    carrier: "USPS",
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-03T10:00:00Z",
    tracking_details: [{
      object: "TrackingDetail",
      message: "Package is being returned to sender",
      description: "",
      status,
      status_detail: "return",
      datetime: "2026-11-03T09:00:00Z",
      source: "USPS",
      carrier_code: "RTS",
      tracking_location: { object: "TrackingLocation", city: "NEW YORK", state: "NY", country: "US", zip: "10011" },
    }],
  };
}

describe("EasyPost test adapter", () => {
  it.each([
    ["delivered", "DELIVERED"],
    ["return_to_sender", "RETURN_TO_SENDER"],
    ["failure", "FAILURE"],
    ["new_provider_state", "UNKNOWN"],
  ])("normalizes %s to %s", (providerStatus, expected) => {
    expect(normalizeEasyPostStatus(providerStatus)).toBe(expected);
  });

  it("normalizes tracker events with provider-test provenance and stable IDs", () => {
    const first = normalizeEasyPostTracker(trackerPayload());
    const replay = normalizeEasyPostTracker(trackerPayload());
    expect(first).toMatchObject({
      provider: "EASYPOST",
      status: "RETURN_TO_SENDER",
      sourceTier: "PROVIDER_TEST",
      synthetic: false,
    });
    expect(first.events[0]).toMatchObject({
      status: "RETURN_TO_SENDER",
      sourceTier: "PROVIDER_TEST",
      synthetic: false,
      location: { postalCode: "10011" },
    });
    expect(replay.events[0]?.providerEventId).toBe(first.events[0]?.providerEventId);
  });

  it("creates a tracker through the test-only endpoint", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(trackerPayload()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const provider = new EasyPostTestProvider({ apiKey: "EZTK_test_key", fetchImplementation });
    const tracker = await provider.createTracker("EZ5000000005");
    expect(tracker.status).toBe("RETURN_TO_SENDER");
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.easypost.com/v2/trackers",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects production keys and surfaces retryable provider failures without response bodies", async () => {
    expect(() => new EasyPostTestProvider({ apiKey: "EZAK_live_key" })).toThrow("EASYPOST_TEST_KEY_REQUIRED");
    const provider = new EasyPostTestProvider({
      apiKey: "EZTK_test_key",
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(new Response("provider secret body", { status: 503 })),
    });
    await expect(provider.createTracker("EZ5000000005")).rejects.toMatchObject({
      message: "EASYPOST_TRACKER_CREATE_HTTP_503",
      retryable: true,
      status: 503,
    } satisfies Partial<EasyPostProviderError>);
  });

  it("returns null for a missing tracker and treats validation failures as non-retryable", async () => {
    const missingProvider = new EasyPostTestProvider({
      apiKey: "EZTK_test_key",
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 404 })),
    });
    await expect(missingProvider.getTracker("trk_missing")).resolves.toBeNull();

    const invalidProvider = new EasyPostTestProvider({
      apiKey: "EZTK_test_key",
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 422 })),
    });
    await expect(invalidProvider.createTracker("invalid")).rejects.toMatchObject({ status: 422, retryable: false });
  });
});
