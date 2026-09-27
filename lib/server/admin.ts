import { createHash, timingSafeEqual } from "node:crypto";

import { HttpError } from "@/lib/server/errors";

export function assertAdmin(request: Request): void {
  const token = process.env.ADMIN_API_TOKEN;
  if (!token || token.length < 32) throw new HttpError(503, "ADMIN_NOT_CONFIGURED", "管理员接口尚未配置", false);
  const supplied = request.headers.get("authorization") ?? "";
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(hash(supplied), hash(`Bearer ${token}`))) {
    throw new HttpError(401, "UNAUTHORIZED", "需要管理员凭证", false);
  }
}
