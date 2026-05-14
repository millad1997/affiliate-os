import { NextResponse } from "next/server";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

const SYSTEM_PROMPT = `You help DTC brands evaluate TikTok creators for affiliate partnerships.

You do NOT have access to real TikTok data, analytics, or the internet. You only see a TikTok username string.

Your job is to produce a **hypothetical "creator score" from 1–100** that would be plausible for a recruiting screen, based only on gut feel from the handle: memorability, professionalism, niche hints in the name, length, and whether it looks like a brand vs personal account. This is explicitly a placeholder until real metrics exist—make reasonable assumptions and say so in the rationale.

Rules:
- score must be an integer from 1 through 100 inclusive.
- Be concise. The rationale is for an internal operator, not the creator.`;

type AnthropicContentBlock = { type: string; text?: string };

type AnthropicMessageResponse = {
  content?: AnthropicContentBlock[];
  error?: { type?: string; message?: string };
};

function getModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

function extractAssistantText(data: AnthropicMessageResponse): string {
  const blocks = data.content ?? [];
  const texts = blocks
    .filter((b): b is AnthropicContentBlock & { text: string } => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text);
  return texts.join("\n").trim();
}

function parseScorePayload(raw: string): { score: number; rationale: string } | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonSlice = jsonMatch ? jsonMatch[0] : trimmed;
  try {
    const parsed = JSON.parse(jsonSlice) as { score?: unknown; rationale?: unknown };
    const score = typeof parsed.score === "number" ? Math.round(parsed.score) : Number(parsed.score);
    const rationale = typeof parsed.rationale === "string" ? parsed.rationale.trim() : "";
    if (!Number.isFinite(score) || score < 1 || score > 100 || !rationale) return null;
    return { score, rationale };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server misconfiguration: ANTHROPIC_API_KEY is not set." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const rawUsername =
    typeof body === "object" && body !== null && "username" in body
      ? String((body as { username: unknown }).username)
      : "";

  const normalized = rawUsername.trim().replace(/^@+/, "").replace(/\s+/g, "");
  if (!normalized) {
    return NextResponse.json({ error: "Please enter a TikTok username." }, { status: 400 });
  }
  if (normalized.length > 64) {
    return NextResponse.json({ error: "Username is too long." }, { status: 400 });
  }

  const userMessage = `TikTok username: @${normalized}

Return **only** a single JSON object (no markdown fences, no commentary) with exactly these keys:
- "score": integer from 1 to 100
- "rationale": string, 2 short sentences explaining your placeholder judgment and that data was not available.`;

  const anthropicRes = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: getModel(),
      max_tokens: 512,
      temperature: 0.4,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  const anthropicJson = (await anthropicRes.json()) as AnthropicMessageResponse;

  if (!anthropicRes.ok) {
    const msg = anthropicJson.error?.message ?? `Anthropic request failed (${anthropicRes.status}).`;
    return NextResponse.json(
      { error: msg },
      { status: anthropicRes.status >= 400 && anthropicRes.status < 600 ? anthropicRes.status : 502 },
    );
  }

  const assistantText = extractAssistantText(anthropicJson);
  const parsed = parseScorePayload(assistantText);
  if (!parsed) {
    return NextResponse.json(
      {
        error: "Could not read a valid score from the model response. Try again or switch ANTHROPIC_MODEL.",
        debugRaw: assistantText.slice(0, 500),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    username: normalized,
    score: parsed.score,
    rationale: parsed.rationale,
  });
}
