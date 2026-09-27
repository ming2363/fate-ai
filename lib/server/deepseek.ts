export const DEEPSEEK_URL = "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions";
export const DEEPSEEK_MODEL = "deepseek-v4.1-flash";

export type ChatMessage = {
  readonly role: "system" | "user";
  readonly content: string;
};

export function deepseekRequestBody(messages: readonly ChatMessage[]): {
  readonly model: typeof DEEPSEEK_MODEL;
  readonly enable_thinking: true;
  readonly reasoning_effort: "max";
  readonly response_format: { readonly type: "json_object" };
  readonly max_tokens: 131072;
  readonly stream: true;
  readonly stream_options: { readonly include_usage: true };
  readonly messages: readonly ChatMessage[];
} {
  return {
    model: DEEPSEEK_MODEL,
    enable_thinking: true,
    reasoning_effort: "max",
    response_format: { type: "json_object" },
    max_tokens: 131072,
    stream: true,
    stream_options: { include_usage: true },
    messages,
  };
}

export function readServerApiKey(): string | null {
  const key = process.env.MAAS_IMAGE_API_KEY?.trim();
  return key ? key : null;
}
