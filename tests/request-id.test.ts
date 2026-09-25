import { afterEach, expect, test, vi } from "vitest";

import { createRequestId } from "@/lib/shared/request-id";

afterEach(() => vi.unstubAllGlobals());

test("creates a UUID when randomUUID is unavailable on HTTP pages", () => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  vi.stubGlobal("crypto", { getRandomValues });

  expect(createRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
