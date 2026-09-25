export type UpstreamDelta = {
  readonly reasoning: string | null;
  readonly content: string | null;
  readonly finishReason: string | null;
  readonly usage: { readonly promptTokens: number | null; readonly completionTokens: number | null } | null;
};

type ChoiceDelta = {
  readonly reasoning_content?: unknown;
  readonly content?: unknown;
};

function textField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseUpstreamPayload(payload: unknown): UpstreamDelta | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const choices = record.choices;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const choice = first && typeof first === "object" ? first as Record<string, unknown> : null;
  const delta = choice?.delta && typeof choice.delta === "object" ? choice.delta as ChoiceDelta : null;
  const usageRecord = record.usage && typeof record.usage === "object" ? record.usage as Record<string, unknown> : null;
  return {
    reasoning: textField(delta?.reasoning_content),
    content: textField(delta?.content),
    finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
    usage: usageRecord ? {
      promptTokens: typeof usageRecord.prompt_tokens === "number" ? usageRecord.prompt_tokens : null,
      completionTokens: typeof usageRecord.completion_tokens === "number" ? usageRecord.completion_tokens : null,
    } : null,
  };
}

export async function* readUpstreamSse(response: Response): AsyncGenerator<UpstreamDelta | "done"> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("上游没有响应流");
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (!trimmed.startsWith("data:")) continue;
        const raw = trimmed.slice(5).trim();
        if (raw === "[DONE]") {
          yield "done";
          continue;
        }
        try {
          const parsed = parseUpstreamPayload(JSON.parse(raw) as unknown);
          if (parsed) yield parsed;
        } catch (error) {
          if (error instanceof SyntaxError) continue;
          throw error;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
