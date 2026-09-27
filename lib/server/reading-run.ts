import type { ChartFacts, FortuneReading, IdentityReading, Reading, ReadingTaskId } from "@/lib/shared/chart-types";
import type { Focus } from "@/lib/shared/schemas";
import { z } from "zod";
import { MBTI_TYPES, type MbtiProfile, type MbtiType } from "@/lib/shared/mbti";
import { CONTENT_BYTE_LIMIT } from "@/lib/shared/versions";

import { deepseekRequestBody, DEEPSEEK_URL, type ChatMessage } from "@/lib/server/deepseek";
import { buildReadingContext, buildTaskContext } from "@/lib/server/reading-context";
import { validateReading, validateTaskReading } from "@/lib/server/reading-validate";
import { readUpstreamSse } from "@/lib/server/upstream";
import { FORTUNE_PROMPT, IDENTITY_PROMPT, MBTI_PROMPT, RETRY_INSTRUCTION, SYSTEM_PROMPT, TASK_REPAIR_PROMPT } from "@/prompts/system-prompt";

const mbtiProfileSchema = z.object({
  type: z.enum(MBTI_TYPES),
  overview: z.string().min(20).max(180),
  strengths: z.string().min(20).max(180),
  blindSpots: z.string().min(20).max(180),
  communication: z.string().min(20).max(180),
  growth: z.string().min(20).max(180),
}).strict();

export type ReadingEmit =
  | { readonly event: "status"; readonly phase: "waiting" | "thinking" | "answering" | "validating" }
  | { readonly event: "thinking_delta"; readonly text: string }
  | { readonly event: "retry"; readonly message: string }
  | { readonly event: "result"; readonly readingStatus: "generated" | "partial"; readonly reading: Reading }
  | { readonly event: "error"; readonly code: string; readonly message: string; readonly retryable: boolean };

export type UsageNote = {
  readonly modelMs: number;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly cacheHitTokens: number | null;
  readonly cacheMissTokens: number | null;
};

type AttemptFailure = {
  readonly retryable: boolean;
  readonly code: string;
  readonly message: string;
  readonly errors: readonly string[];
};

async function oneAttempt(args: {
  messages: readonly ChatMessage[];
  apiKey: string;
  signal: AbortSignal;
  emit: (event: ReadingEmit) => void;
  fetchImpl: typeof fetch;
  onUsage: (usage: UsageNote) => void;
}): Promise<{ readonly ok: true; readonly content: string } | { readonly ok: false; readonly failure: AttemptFailure }> {
  const started = Date.now();
  let usage: UsageNote = { modelMs: 0, promptTokens: null, completionTokens: null, cacheHitTokens: null, cacheMissTokens: null };
  try {
  args.emit({ event: "status", phase: "waiting" });
  let response: Response;
  try {
    response = await args.fetchImpl(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(deepseekRequestBody(args.messages)),
      redirect: "error",
      signal: args.signal,
    });
  } catch (error) {
    if (args.signal.aborted) return { ok: false, failure: { retryable: false, code: "CANCELLED", message: "解读已取消", errors: [] } };
    if (error instanceof Error) return { ok: false, failure: { retryable: true, code: "UPSTREAM_NETWORK", message: "模型连接中断", errors: [] } };
    throw error;
  }
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const code = response.status === 401 || response.status === 403 ? "UPSTREAM_AUTH" : "UPSTREAM_HTTP";
    return { ok: false, failure: { retryable: retryable && code !== "UPSTREAM_AUTH", code, message: "模型服务暂时不可用", errors: [] } };
  }
  let content = "";
  let sawThinking = false;
  let sawContent = false;
  let finishReason: string | null = null;
  let sawDone = false;
  try {
    for await (const item of readUpstreamSse(response)) {
      if (item === "done") {
        sawDone = true;
        continue;
      }
      if (item.reasoning) {
        if (!sawThinking) args.emit({ event: "status", phase: "thinking" });
        sawThinking = true;
        args.emit({ event: "thinking_delta", text: item.reasoning });
      }
      if (item.content) {
        if (!sawContent) args.emit({ event: "status", phase: "answering" });
        sawContent = true;
        content += item.content;
        if (Buffer.byteLength(content, "utf8") > CONTENT_BYTE_LIMIT) {
          return { ok: false, failure: { retryable: false, code: "CONTENT_TOO_LARGE", message: "模型正文超出缓冲上限", errors: [] } };
        }
      }
      if (item.finishReason) finishReason = item.finishReason;
      if (item.usage) usage = { modelMs: Date.now() - started, ...item.usage };
    }
  } catch (error) {
    if (args.signal.aborted) return { ok: false, failure: { retryable: false, code: "CANCELLED", message: "解读已取消", errors: [] } };
    if (error instanceof Error) return { ok: false, failure: { retryable: true, code: "UPSTREAM_TRUNCATED", message: "模型流意外中断", errors: [] } };
    throw error;
  }
  if (finishReason === "length") return { ok: false, failure: { retryable: false, code: "OUTPUT_TRUNCATED", message: "模型输出被截断，不能作为解读", errors: [] } };
  if (finishReason !== "stop" || !sawDone || content.trim().length === 0) {
    return { ok: false, failure: { retryable: true, code: "EMPTY_OUTPUT", message: "模型没有返回完整正文", errors: [] } };
  }
  return { ok: true, content };
  } finally {
    args.onUsage({ ...usage, modelMs: Date.now() - started });
  }
}

export async function runMbtiProfile(args: {
  type: MbtiType;
  apiKey: string;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
  onUsage?: (usage: UsageNote) => void;
  onStatus?: (phase: "waiting" | "thinking" | "answering" | "validating") => void;
}): Promise<MbtiProfile | null> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 75_000);
  try {
    const result = await oneAttempt({
      messages: [{ role: "system", content: MBTI_PROMPT }, { role: "user", content: JSON.stringify({ type: args.type }) }],
      apiKey: args.apiKey,
      signal: AbortSignal.any([args.signal, timeout.signal]),
      fetchImpl: args.fetchImpl ?? fetch,
      onUsage: (usage) => args.onUsage?.(usage),
      emit: (event) => { if (event.event === "status") args.onStatus?.(event.phase); },
    });
    if (!result.ok || args.signal.aborted || timeout.signal.aborted) return null;
    args.onStatus?.("validating");
    let payload: unknown;
    try { payload = JSON.parse(result.content) as unknown; } catch { return null; }
    const parsed = mbtiProfileSchema.safeParse(payload);
    return parsed.success && parsed.data.type === args.type ? parsed.data : null;
  } finally {
    clearTimeout(timer);
  }
}

export async function runReading(args: {
  facts: ChartFacts;
  focus: Focus;
  question: string;
  mbtiProfile?: MbtiProfile | null;
  apiKey: string;
  signal: AbortSignal;
  deadlineMs: number;
  emit: (event: ReadingEmit) => void;
  fetchImpl?: typeof fetch;
  onUsage?: (usage: UsageNote) => void;
}): Promise<"success" | "failed" | "cancelled"> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), Math.max(0, args.deadlineMs - Date.now()));
  const signal = AbortSignal.any([args.signal, timeout.signal]);
  try {
    const fetchImpl = args.fetchImpl ?? fetch;
    const context = buildReadingContext(args.facts, args.focus, args.question, args.mbtiProfile);
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(context) },
    ];
    let repairNotes: readonly string[] = [];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (args.signal.aborted) return "cancelled";
      if (Date.now() >= args.deadlineMs) {
        args.emit({ event: "error", code: "TIMEOUT", message: "解读超过整轮时限", retryable: false });
        return "failed";
      }
      const attemptMessages = repairNotes.length === 0 ? messages : [
        ...messages,
        { role: "user" as const, content: `${RETRY_INSTRUCTION}\n${JSON.stringify(repairNotes)}` },
      ];
      const result = await oneAttempt({
        messages: attemptMessages,
        apiKey: args.apiKey,
        signal,
        emit: args.emit,
        fetchImpl,
        onUsage: (usage) => args.onUsage?.(usage),
      });
      if (timeout.signal.aborted || Date.now() >= args.deadlineMs) {
        args.emit({ event: "error", code: "TIMEOUT", message: "解读超过整轮时限", retryable: false });
        return "failed";
      }
      if (!result.ok) {
        if (result.failure.code === "CANCELLED") return "cancelled";
        const canRetry = attempt === 1 && result.failure.retryable && Date.now() < args.deadlineMs && !args.signal.aborted;
        if (!canRetry) {
          args.emit({ event: "error", code: result.failure.code, message: result.failure.message, retryable: result.failure.retryable });
          return "failed";
        }
        repairNotes = result.failure.errors;
        args.emit({ event: "retry", message: "正在重新生成" });
        continue;
      }
      args.emit({ event: "status", phase: "validating" });
      let payload: unknown;
      try {
        payload = JSON.parse(result.content) as unknown;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        if (attempt === 1 && Date.now() < args.deadlineMs) {
          repairNotes = ["content 不是合法 JSON"];
          args.emit({ event: "retry", message: "正在重新生成" });
          continue;
        }
        args.emit({ event: "error", code: "INVALID_JSON", message: "模型没有返回可校验的 JSON", retryable: true });
        return "failed";
      }
      const validated = validateReading(payload, args.facts, Boolean(args.mbtiProfile));
      if (timeout.signal.aborted || Date.now() >= args.deadlineMs) {
        args.emit({ event: "error", code: "TIMEOUT", message: "解读超过整轮时限", retryable: false });
        return "failed";
      }
      if (!validated.ok) {
        if (attempt === 1 && Date.now() < args.deadlineMs && !args.signal.aborted) {
          repairNotes = validated.errors;
          args.emit({ event: "retry", message: "正在重新生成" });
          continue;
        }
        args.emit({ event: "error", code: "SCHEMA_INVALID", message: "解读没有通过结构检查", retryable: true });
        return "failed";
      }
      if (args.signal.aborted) return "cancelled";
      args.emit({ event: "result", readingStatus: validated.status, reading: validated.reading });
      return "success";
    }
    args.emit({ event: "error", code: "SCHEMA_INVALID", message: "解读没有通过结构检查", retryable: true });
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

export type TaskReadingEmit =
  | { readonly event: "module_status"; readonly taskId: ReadingTaskId; readonly attempt: number; readonly phase: "waiting" | "thinking" | "answering" | "validating" }
  | { readonly event: "module_thinking_delta"; readonly taskId: ReadingTaskId; readonly attempt: number; readonly text: string }
  | { readonly event: "module_retry"; readonly taskId: ReadingTaskId; readonly attempt: 2; readonly message: string }
  | { readonly event: "module_result"; readonly taskId: "identity"; readonly attempt: number; readonly part: IdentityReading }
  | { readonly event: "module_result"; readonly taskId: "fortune"; readonly attempt: number; readonly part: FortuneReading }
  | { readonly event: "module_error"; readonly taskId: ReadingTaskId; readonly attempt: number; readonly code: string; readonly message: string; readonly retryable: boolean };

type TaskFailure = AttemptFailure & { readonly content?: string };
type TaskOutcome = { readonly ok: true } | { readonly ok: false; readonly taskId: ReadingTaskId; readonly attempt: number; readonly failure: TaskFailure };

export async function runParallelReading(args: {
  facts: ChartFacts;
  focus: Focus;
  question: string;
  mbtiProfile?: MbtiProfile | null;
  apiKey: string;
  signal: AbortSignal;
  deadlineMs: number;
  tasks?: readonly ReadingTaskId[];
  emit: (event: TaskReadingEmit) => void;
  fetchImpl?: typeof fetch;
  onUsage?: (usage: UsageNote, taskId: ReadingTaskId, attempt: number) => void;
}): Promise<"success" | "partial" | "failed" | "cancelled"> {
  const wanted = args.tasks ?? ["identity", "fortune"];
  const tasks = wanted.filter((taskId) => taskId === "identity"
    ? args.facts.allowedTopics.personality || args.facts.allowedTopics.zodiac
    : args.facts.allowedTopics.currentLuck || args.facts.allowedTopics.annualYears.length > 0);
  if (tasks.length === 0) return "failed";
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), Math.max(0, args.deadlineMs - Date.now()));
  const signal = AbortSignal.any([args.signal, timeout.signal]);
  const fetchImpl = args.fetchImpl ?? fetch;
  async function runTask(taskId: ReadingTaskId, attempt: number, previous?: TaskFailure): Promise<TaskOutcome> {
    if (signal.aborted) return { ok: false, taskId, attempt, failure: { code: "CANCELLED", message: "解读已取消", retryable: false, errors: [] } };
    const messages: ChatMessage[] = [
      { role: "system", content: taskId === "identity" ? IDENTITY_PROMPT : FORTUNE_PROMPT },
      { role: "user", content: JSON.stringify(buildTaskContext(args.facts, taskId, args.focus, args.question, args.mbtiProfile)) },
    ];
    if (previous) messages.push({ role: "user", content: `${TASK_REPAIR_PROMPT}\n${JSON.stringify({ errors: previous.errors, oldOutput: previous.content?.slice(0, 8000) ?? null })}` });
    const result = await oneAttempt({
      messages, apiKey: args.apiKey, signal, fetchImpl,
      onUsage: (usage) => args.onUsage?.(usage, taskId, attempt),
      emit: (event) => {
        if (event.event === "status") args.emit({ event: "module_status", taskId, attempt, phase: event.phase });
        if (event.event === "thinking_delta") args.emit({ event: "module_thinking_delta", taskId, attempt, text: event.text });
      },
    });
    if (signal.aborted) return { ok: false, taskId, attempt, failure: { code: "CANCELLED", message: "解读已取消", retryable: false, errors: [] } };
    if (!result.ok) return { ok: false, taskId, attempt, failure: result.failure };
    args.emit({ event: "module_status", taskId, attempt, phase: "validating" });
    let payload: unknown;
    try {
      payload = JSON.parse(result.content) as unknown;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return { ok: false, taskId, attempt, failure: { code: "INVALID_JSON", message: "模型没有返回可校验的 JSON", retryable: true, errors: ["content 不是合法 JSON"], content: result.content } };
    }
    const validated = taskId === "identity"
      ? validateTaskReading(payload, args.facts, "identity", Boolean(args.mbtiProfile))
      : validateTaskReading(payload, args.facts, "fortune");
    if (!validated.ok) return { ok: false, taskId, attempt, failure: { code: "SCHEMA_INVALID", message: "解读没有通过结构检查", retryable: true, errors: validated.errors, content: result.content } };
    if (taskId === "identity") args.emit({ event: "module_result", taskId, attempt, part: validated.part as IdentityReading });
    else args.emit({ event: "module_result", taskId, attempt, part: validated.part as FortuneReading });
    return { ok: true };
  }
  try {
    const initial = await Promise.all(tasks.map((taskId) => runTask(taskId, 1)));
    if (args.signal.aborted) return "cancelled";
    const failures = initial.filter((item): item is Extract<TaskOutcome, { ok: false }> => !item.ok);
    const repair = failures.find((item) => item.taskId === "fortune" && item.failure.retryable)
      ?? failures.find((item) => item.failure.retryable);
    let repaired: TaskOutcome | null = null;
    if (repair && !signal.aborted && Date.now() < args.deadlineMs) {
      args.emit({ event: "module_retry", taskId: repair.taskId, attempt: 2, message: "正在修复未通过校验的部分" });
      repaired = await runTask(repair.taskId, 2, repair.failure);
    }
    if (args.signal.aborted) return "cancelled";
    const finalFailures = failures.filter((item) => item !== repair || !repaired?.ok);
    if (repaired && !repaired.ok) finalFailures.splice(finalFailures.findIndex((item) => item === repair), 1, repaired);
    for (const item of finalFailures) args.emit({ event: "module_error", taskId: item.taskId, attempt: item.attempt, code: timeout.signal.aborted ? "TIMEOUT" : item.failure.code, message: timeout.signal.aborted ? "解读超过整轮时限" : item.failure.message, retryable: timeout.signal.aborted ? false : item.failure.retryable });
    const succeeded = initial.filter((item) => item.ok).length + (repaired?.ok ? 1 : 0);
    return succeeded === tasks.length ? "success" : succeeded > 0 ? "partial" : "failed";
  } finally {
    clearTimeout(timer);
  }
}
