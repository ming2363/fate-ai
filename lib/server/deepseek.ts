export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export type ChatMessage = {
  readonly role: "system" | "user";
  readonly content: string;
};

export function deepseekRequestBody(messages: readonly ChatMessage[]): {
  readonly model: "deepseek-flash";
  readonly thinking: { readonly type: "enabled" };
  readonly reasoning_effort: "max";
  readonly response_format: { readonly type: "json_object" };
  readonly max_tokens: 131072;
  readonly stream: true;
  readonly stream_options: { readonly include_usage: true };
  readonly messages: readonly ChatMessage[];
} {
  return {
    model: "deepseek-flash",
    thinking: { type: "enabled" },
    reasoning_effort: "max",
    response_format: { type: "json_object" },
    max_tokens: 131072,
    stream: true,
    stream_options: { include_usage: true },
    messages,
  };
}

export function officialChatUrl(): string {
  const configured = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.hostname !== "api.deepseek.com") {
    throw new Error("只允许 DeepSeek 官方地址");
  }
  return DEEPSEEK_URL;
}

export function readServerApiKey(): string | null {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  return key ? key : null;
}
