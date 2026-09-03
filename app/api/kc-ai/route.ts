import { NextResponse } from "next/server";
import {
  getKcAiBoundaryReply,
  KC_AI_SYSTEM_KNOWLEDGE,
} from "@/lib/kc-ai-knowledge";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 800;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CHARACTERS = 4_000;
const MAX_OUTPUT_TOKENS = 800;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 20;
const MODEL = "gpt-5-mini";

type SafeMessage = { role: "user" | "assistant"; content: string };
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

function jsonError(status: number, error: string, message: string, retryAfterSeconds?: number) {
  return NextResponse.json(
    { error, message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) },
    {
      status,
      headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined,
    },
  );
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function getRateLimit(request: Request) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const bucket = requestBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return 0;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_REQUESTS
    ? Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000))
    : 0;
}

function sanitizeHistory(value: unknown): SafeMessage[] | null {
  if (!Array.isArray(value)) return null;
  const history: SafeMessage[] = [];
  let remainingCharacters = MAX_HISTORY_CHARACTERS;
  for (const item of value.slice(-MAX_HISTORY_MESSAGES).reverse()) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    if ((record.role !== "user" && record.role !== "assistant") || typeof record.content !== "string") return null;
    const content = record.content.trim();
    if (!content) return null;
    if (remainingCharacters <= 0) break;
    const cropped = content.slice(0, Math.min(MAX_MESSAGE_LENGTH, remainingCharacters));
    history.unshift({ role: record.role, content: cropped });
    remainingCharacters -= cropped.length;
  }
  return history;
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text.trim();
  if (!Array.isArray(record.output)) return "";
  return record.output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const text = (part as Record<string, unknown>).text;
      return typeof text === "string" ? [text] : [];
    });
  }).join("\n").trim();
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "KC_AI_FORBIDDEN", "KC AI 請求來源不正確。");
  const retryAfterSeconds = getRateLimit(request);
  if (retryAfterSeconds) {
    return jsonError(429, "KC_AI_RATE_LIMITED", "詢問次數過多，請稍後再試。", retryAfterSeconds);
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonError(415, "KC_AI_INVALID_CONTENT_TYPE", "KC AI 目前無法處理這個請求。");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "KC_AI_INVALID_REQUEST", "請輸入要詢問的操作問題。");
  }
  if (!body || typeof body !== "object") return jsonError(400, "KC_AI_INVALID_REQUEST", "請輸入要詢問的操作問題。");
  const record = body as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return jsonError(400, "KC_AI_MESSAGE_TOO_LONG", `問題內容須介於 1 到 ${MAX_MESSAGE_LENGTH} 個字元。`);
  }
  const history = sanitizeHistory(record.history ?? []);
  if (!history) return jsonError(400, "KC_AI_HISTORY_TOO_LONG", "對話內容過長，請清除對話後再試。");

  const boundaryReply = getKcAiBoundaryReply(message);
  if (boundaryReply) return NextResponse.json({ reply: boundaryReply });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return jsonError(503, "KC_AI_NOT_CONFIGURED", "KC AI 尚未完成連線設定，請聯絡管理員。");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        store: false,
        instructions: KC_AI_SYSTEM_KNOWLEDGE,
        input: [
          ...history.map((item) => ({ role: item.role, content: item.content })),
          { role: "user", content: message },
        ],
        max_output_tokens: MAX_OUTPUT_TOKENS,
        text: { verbosity: "low" },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return jsonError(502, "KC_AI_UPSTREAM_ERROR", "KC AI 暫時無法回答，請稍後再試。");
    const payload = await response.json() as { status?: string };
    if (payload.status === "incomplete") {
      return jsonError(502, "KC_AI_INCOMPLETE_RESPONSE", "KC AI 的回答不完整，請再試一次。");
    }
    const reply = extractOutputText(payload);
    if (!reply || reply.includes("�")) {
      return jsonError(502, "KC_AI_INCOMPLETE_RESPONSE", "KC AI 的回答不完整，請再試一次。");
    }
    return NextResponse.json({ reply });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return jsonError(504, "KC_AI_TIMEOUT", "KC AI 回應時間較長，請稍後再試。");
    }
    return jsonError(502, "KC_AI_UNAVAILABLE", "KC AI 暫時無法回答，請稍後再試。");
  }
}
