export type SsePhase = "waiting" | "thinking" | "answering" | "validating";

export type SseEnvelope = {
  readonly requestId: string;
  readonly chartFingerprint: string;
  readonly attempt: number;
  readonly seq: number;
};

export function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function parseSseBlock(block: string): { readonly event: string; readonly data: unknown } | null {
  const trimmed = block.trim();
  if (!trimmed || trimmed.startsWith(":")) return null;
  let event = "message";
  const dataLines: string[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(raw) as unknown };
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}
