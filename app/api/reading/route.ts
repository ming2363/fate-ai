import { Temporal } from "@js-temporal/polyfill";

import type { BirthInput, ReadingRequest } from "@/lib/shared/schemas";
import type { Reading } from "@/lib/shared/chart-types";
import { readingRequestSchema } from "@/lib/shared/schemas";
import { encodeSse } from "@/lib/shared/sse";
import { AS_OF_MAX_SKEW_MS, READING_TIMEOUT_MS } from "@/lib/shared/versions";
import { buildChart } from "@/lib/server/chart";
import { readServerApiKey } from "@/lib/server/deepseek";
import { HttpError } from "@/lib/server/errors";
import { requestBodyFingerprint } from "@/lib/server/fingerprint";
import { assertSameOrigin, beginInflight, clientAddress, consumeRateLimit, endInflight, readOrCreateSession } from "@/lib/server/guard";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { logEvent } from "@/lib/server/log";
import { logOperation, saveReading, tryStore } from "@/lib/server/history";
import { runParallelReading, runReading, type ReadingEmit, type TaskReadingEmit, type UsageNote } from "@/lib/server/reading-run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 320;

function birthOf(body: ReadingRequest): BirthInput {
  return {
    calendar: body.calendar,
    birthDate: body.birthDate,
    birthTime: body.birthTime,
    genderForCalculation: body.genderForCalculation,
    birthPlace: body.birthPlace,
  };
}

function withCookie(response: Response, cookie: string | null): Response {
  if (!cookie) return response;
  response.headers.append("Set-Cookie", cookie);
  return response;
}

export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  const session = readOrCreateSession(request);
  try {
    assertSameOrigin(request);
    const body = readingRequestSchema.parse(await readJson(request));
    let asOf: Temporal.Instant;
    try {
      asOf = Temporal.Instant.from(body.asOfUtc);
    } catch (error) {
      if (error instanceof RangeError) throw new HttpError(422, "AS_OF_STALE", "排盘时刻无效，请重新计算。", true);
      throw error;
    }
    if (Math.abs(asOf.epochMilliseconds - Date.now()) > AS_OF_MAX_SKEW_MS) {
      throw new HttpError(422, "AS_OF_STALE", "排盘时刻已过期，请重新计算。", true);
    }
    const input = birthOf(body);
    const facts = buildChart(input, asOf);
    const headers = new Headers();
    if (session.cookie) headers.set("Set-Cookie", session.cookie);
    const topics = facts.allowedTopics;
    const availableTasks = {
      identity: topics.personality || topics.zodiac,
      fortune: topics.currentLuck || topics.annualYears.length > 0,
    };
    const requestedTasks = [...new Set(body.requestedTasks ?? ["identity", "fortune"])] as Array<"identity" | "fortune">;
    if (!requestedTasks.some((taskId) => availableTasks[taskId])) {
      return withCookie(jsonResponse({
        code: "INSUFFICIENT_FACTS",
        message: "目前只能展示已确定的排盘事实。补充更准确的出生时间后，再生成个人解读。",
        retryable: false,
      }), session.cookie);
    }
    const apiKey = readServerApiKey();
    if (!apiKey) {
      return withCookie(jsonResponse({ code: "AI_NOT_CONFIGURED", message: "AI 解读尚未配置", retryable: false }, 503), session.cookie);
    }
    const abort = beginInflight(session.id, body.requestId, requestBodyFingerprint(input, body.focus, body.question, body.asOfUtc, requestedTasks));
    try {
      consumeRateLimit(clientAddress(request));
    } catch (error) {
      endInflight(session.id, body.requestId);
      throw error;
    }
    const onAbort = () => abort.abort();
    request.signal.addEventListener("abort", onAbort);
    let seq = 0;
    let attempt = 1;
    let readingPatch: Partial<Reading> = {};
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const modelCalls: Array<{ usage: UsageNote; taskId: string; attempt: number; at: Date }> = [];
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch (error) {
            if (error instanceof Error) abort.abort();
          }
        }, 15_000);
        const write = (event: string, data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(encodeSse(event, {
            requestId: body.requestId,
            chartFingerprint: facts.chartFingerprint,
            attempt,
            seq: seq + 1,
            ...data,
          })));
          seq += 1;
        };
        try {
          const shared = {
            facts,
            focus: body.focus,
            question: body.question,
            apiKey,
            signal: abort.signal,
            deadlineMs: started + READING_TIMEOUT_MS,
            fetchImpl: fetch,
          };
          const outcome = process.env.READING_MODE === "single" ? await runReading({
            ...shared,
            onUsage: (usage) => {
              modelCalls.push({ usage, taskId: "single", attempt, at: new Date() });
              logEvent({
                requestId: body.requestId,
                phase: "model",
                modelMs: usage.modelMs,
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                rulesVersion: facts.rulesVersion,
                attempt,
              });
            },
            emit: (event: ReadingEmit) => {
              if (event.event === "retry") attempt = 2;
              if (event.event === "status") write("status", { phase: event.phase });
              if (event.event === "thinking_delta") write("thinking_delta", { text: event.text });
              if (event.event === "retry") write("retry", { message: event.message });
              if (event.event === "result") { readingPatch = event.reading; write("result", { readingStatus: event.readingStatus, reading: event.reading }); }
              if (event.event === "error") write("error", { readingStatus: "failed", reading: null, code: event.code, message: event.message, retryable: event.retryable });
            },
          }) : await runParallelReading({
            ...shared,
            tasks: requestedTasks,
            onUsage: (usage, taskId, taskAttempt) => {
              modelCalls.push({ usage, taskId, attempt: taskAttempt, at: new Date() });
              logEvent({
                requestId: body.requestId,
                phase: `model-${taskId}`,
                modelMs: usage.modelMs,
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                rulesVersion: facts.rulesVersion,
                attempt: taskAttempt,
              });
            },
            emit: (event: TaskReadingEmit) => {
              if (event.event === "module_status") write(event.event, { taskId: event.taskId, attempt: event.attempt, phase: event.phase });
              if (event.event === "module_thinking_delta") write(event.event, { taskId: event.taskId, attempt: event.attempt, text: event.text });
              if (event.event === "module_retry") write(event.event, { taskId: event.taskId, attempt: event.attempt, message: event.message });
              if (event.event === "module_result") { readingPatch = { ...readingPatch, ...event.part }; write(event.event, { taskId: event.taskId, attempt: event.attempt, part: event.part }); }
              if (event.event === "module_error") write(event.event, { taskId: event.taskId, attempt: event.attempt, code: event.code, message: event.message, retryable: event.retryable });
            },
          });
          if (outcome !== "cancelled") {
            if (body.historyId) await tryStore(() => saveReading(body.historyId!, session.id, readingPatch, outcome === "success" ? "complete" : outcome === "partial" ? "partial" : "failed", body.focus, body.question));
            await tryStore(() => logOperation({ request, sessionId: session.id, historyId: body.historyId, event: "reading", outcome, durationMs: Date.now() - started }));
            write("done", { outcome, protocolVersion: process.env.READING_MODE === "single" ? "reading-stream.v1" : "reading-stream.v2" });
          }
          logEvent({ requestId: body.requestId, phase: "reading", durationMs: Date.now() - started, rulesVersion: facts.rulesVersion, attempt });
        } catch (error) {
          if (!abort.signal.aborted) {
            write("error", { readingStatus: "failed", reading: null, code: "READING_FAILED", message: "解读没有完成", retryable: true });
            write("done", { outcome: "failed" });
          }
          logEvent({ requestId: body.requestId, phase: "reading-error", durationMs: Date.now() - started, errorCode: error instanceof Error ? error.name : "UNKNOWN" });
          await tryStore(() => logOperation({ request, sessionId: session.id, historyId: body.historyId, event: "reading", outcome: "failed", durationMs: Date.now() - started, errorCode: error instanceof Error ? error.name : "UNKNOWN" }));
        } finally {
          await Promise.all(modelCalls.map(({ usage, taskId, attempt: modelAttempt, at }) => tryStore(() => logOperation({
            request, sessionId: session.id, historyId: body.historyId, requestId: body.requestId,
            event: "model_call", outcome: usage.promptTokens === null ? "unreported" : "reported",
            taskId, attempt: modelAttempt, model: "deepseek-flash", usage, usageAt: at, durationMs: usage.modelMs,
          }))));
          clearInterval(heartbeat);
          request.signal.removeEventListener("abort", onAbort);
          endInflight(session.id, body.requestId);
          try {
            controller.close();
          } catch (error) {
            if (!(error instanceof Error)) throw error;
          }
        }
      },
      cancel() {
        abort.abort();
        endInflight(session.id, body.requestId);
      },
    });
    headers.set("Content-Type", "text/event-stream; charset=utf-8");
    headers.set("Cache-Control", "no-store, no-transform");
    headers.set("X-Accel-Buffering", "no");
    return new Response(stream, { headers });
  } catch (error) {
    logEvent({ phase: "reading-rejected", durationMs: Date.now() - started, errorCode: error instanceof Error ? error.name : "UNKNOWN" });
    await tryStore(() => logOperation({ request, sessionId: session.id, event: "reading", outcome: "rejected", durationMs: Date.now() - started, errorCode: error instanceof Error ? error.name : "UNKNOWN" }));
    return withCookie(errorResponse(error), session.cookie);
  }
}
