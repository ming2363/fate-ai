import { expect, it } from "vitest";
import { requestVisitor } from "@/lib/server/visitor";
import { visitorSchema } from "@/lib/shared/visitor";
it("records available devices without inventing iPhone models or retaining referrer queries", () => {
  const ios = requestVisitor(new Request("https://example.com", { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.50" } }), { screenWidth: 390, screenHeight: 844, referrerOrigin: "https://example.org/private?token=secret" });
  expect(ios).toMatchObject({ device: "mobile", os: "iOS/iPadOS", browser: "微信", model: null, modelSource: "unavailable", referrerOrigin: "https://example.org" });
  const android = requestVisitor(new Request("https://example.com", { headers: { "user-agent": "Mozilla/5.0 (Linux; Android 14; SM-S9180 Build/UP1A) Chrome/120.0 Mobile Safari/537.36" } }));
  expect(android.model).toBe("SM-S9180");
  const reduced = requestVisitor(new Request("https://example.com", { headers: { "user-agent": "Mozilla/5.0 (Linux; Android 10; K) Chrome/120.0 Mobile Safari/537.36" } }));
  expect(reduced.model).toBeNull();
  const direct = new Request("https://example.com/api/activity", { headers: { referer: "https://example.com/?token=secret" } });
  expect(requestVisitor(direct, { referrerOrigin: "" }).referrerOrigin).toBeNull();
  expect(requestVisitor(direct).referrerOrigin).toBe("https://example.com");
  expect(visitorSchema.safeParse({ latitude: 30, cookie: "secret" }).success).toBe(false);
  expect(visitorSchema.safeParse({ screenWidth: -1 }).success).toBe(false);
});
