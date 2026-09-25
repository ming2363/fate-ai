import { afterEach, expect, test, vi } from "vitest";

import { readOrCreateSession } from "@/lib/server/guard";

afterEach(() => vi.unstubAllEnvs());

test("session cookie stays within the app path and follows the request protocol", () => {
  vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/fate");
  const http = readOrCreateSession(new Request("http://example.com/fate/api/reading", { headers: { "x-forwarded-proto": "http" } }));
  const https = readOrCreateSession(new Request("http://example.com/fate/api/reading", { headers: { "x-forwarded-proto": "https" } }));

  expect(http.cookie).toContain("Path=/fate;");
  expect(http.cookie).not.toContain("; Secure");
  expect(https.cookie).toContain("; Secure");
});
