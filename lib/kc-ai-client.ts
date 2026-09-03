export type KcAiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export class KcAiRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = "KcAiRequestError";
  }
}

export async function requestKcAi(
  message: string,
  history: KcAiChatMessage[],
): Promise<string> {
  const response = await fetch("/api/kc-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  const payload = await response.json().catch(() => null) as {
    reply?: string;
    error?: string;
    retryAfterSeconds?: number;
  } | null;
  if (!response.ok || !payload?.reply) {
    throw new KcAiRequestError(
      payload?.error || "KC_AI_UNAVAILABLE",
      payload?.retryAfterSeconds,
    );
  }
  return payload.reply;
}
