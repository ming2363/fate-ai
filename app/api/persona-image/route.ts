import { jsonResponse } from "@/lib/server/http";
export async function POST(): Promise<Response> { return jsonResponse({ code: "CLIENT_UPGRADE", message: "请刷新页面后重新开始解读。" }, 410); }
