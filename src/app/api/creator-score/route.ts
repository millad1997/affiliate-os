import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { computeComposite } from "@/lib/composite-score";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

const BRAND_CATEGORIES = [
  "Supplements & Wellness",
  "Beauty & Skincare",
  "Men's Grooming",
  "Sports Nutrition",
  "Food & Beverage",
  "Apparel",
  "Other",
] as const;

const MAX_TEXT_FIELD = 6000;

const SYSTEM_PROMPT = `You are an affiliate marketing scoring assistant for TikTok Shop–style affiliate programs. Operators use you to judge how well a TikTok creator fits **a specific brand's** positioning and target customer—not generic popularity.

You receive labeled inputs: brand category, optional brand description, creator username, optional creator bio, optional follower count, and optional recent post captions (often pasted with blank lines between captions). Any field that was not supplied will appear exactly as the words: not provided.

**Ground rules**
- Do not invent metrics, audience demographics, verified performance, or post content that the user did not supply.
- When important inputs are "not provided", say what is missing and how that limits confidence. Do not fill gaps with made-up TikTok data.
- When richer inputs exist (bio, captions, follower scale, brand description), use them as evidence for audience match, niche or category alignment, and content style or messaging fit for the brand.
- The username alone is a weak signal; use it lightly unless little else is available.

**Output**
- Produce a single **match score** from 1 through 100 for this brand–creator pair.
- The rationale is for an **internal operator** (not the creator). Reference concrete signals when present (e.g. caption themes, tone, bio keywords, category fit, coarse reach from follower count). Explicitly note limitations when data is sparse.`;

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

function pickString(body: Record<string, unknown>, key: string): string {
  if (!(key in body)) return "";
  const v = body[key];
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function clampText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

function labelOrNotProvided(value: string): string {
  const t = value.trim();
  return t.length > 0 ? t : "not provided";
}

function parseOptionalDecimal(
  b: Record<string, unknown>,
  key: string,
  label: string,
): { value: number | null; error: NextResponse | null } {
  if (!(key in b) || b[key] === null || b[key] === undefined || String(b[key]).trim() === "") {
    return { value: null, error: null };
  }
  const raw = b[key];
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) {
    return {
      value: null,
      error: NextResponse.json(
        { error: `${label} must be a non-negative number, or leave it empty.` },
        { status: 400 },
      ),
    };
  }
  return { value: n, error: null };
}

function parseOptionalCount(
  b: Record<string, unknown>,
  key: string,
  label: string,
): { value: number | null; error: NextResponse | null } {
  if (!(key in b) || b[key] === null || b[key] === undefined || String(b[key]).trim() === "") {
    return { value: null, error: null };
  }
  const raw = b[key];
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    return {
      value: null,
      error: NextResponse.json(
        { error: `${label} must be a non-negative whole number, or leave it empty.` },
        { status: 400 },
      ),
    };
  }
  return { value: n, error: null };
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server misconfiguration: ANTHROPIC_API_KEY is not set." },
      { status: 500 },
    );
  }

  // Identify the logged-in user via the anon-key cookie client. This client
  // reads the Supabase auth cookies that the browser sent with the request and
  // validates the access token. If no valid session exists, we reject the
  // request before doing any paid Anthropic work or touching the DB — an
  // unauthenticated request must never create a scored_creators row.
  const authClient = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be logged in to score a creator." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  const rawUsername = pickString(b, "username");
  const normalized = rawUsername.trim().replace(/^@+/, "").replace(/\s+/g, "");
  if (!normalized) {
    return NextResponse.json({ error: "Please enter a TikTok username." }, { status: 400 });
  }
  if (normalized.length > 64) {
    return NextResponse.json({ error: "Username is too long." }, { status: 400 });
  }

  const brandId = pickString(b, "brand_id").trim();

  let brandCategory: string;
  let brandDescription: string;

  if (brandId) {
    // Saved-brand path: fetch the row server-side, constrained to BOTH the
    // supplied id AND the authenticated user's id. If the row does not exist
    // or belongs to another user the query returns nothing and we reject —
    // we never use any brand content from the request body in this path.
    const supabase = getSupabaseServerClient();
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("id, name, category, description")
      .eq("id", brandId)
      .eq("user_id", user.id)
      .single();

    if (brandError || !brand) {
      return NextResponse.json(
        { error: "Brand not found or does not belong to your account." },
        { status: 400 },
      );
    }

    const row = brand as { name: string; category: string; description: string | null };
    brandCategory = row.category;
    const composed = row.description ? `${row.name}: ${row.description}` : row.name;
    brandDescription = clampText(composed, MAX_TEXT_FIELD);
  } else {
    // Manual path — validate exactly as before.
    const rawCategory = pickString(b, "brandCategory").trim();
    if (!rawCategory) {
      return NextResponse.json({ error: "Brand category is required." }, { status: 400 });
    }
    if (!BRAND_CATEGORIES.includes(rawCategory as (typeof BRAND_CATEGORIES)[number])) {
      return NextResponse.json({ error: "Invalid brand category." }, { status: 400 });
    }
    brandCategory = rawCategory;
    brandDescription = clampText(pickString(b, "brandDescription"), MAX_TEXT_FIELD);
  }

  const creatorBio = clampText(pickString(b, "creatorBio"), MAX_TEXT_FIELD);
  const recentCaptions = clampText(pickString(b, "recentCaptions"), MAX_TEXT_FIELD);

  let followerDisplay = "not provided";
  let followerForDb: number | null = null;
  if ("followerCount" in b && b.followerCount !== null && b.followerCount !== undefined && String(b.followerCount).trim() !== "") {
    const raw = b.followerCount;
    const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return NextResponse.json(
        { error: "Follower count must be a non-negative whole number, or leave it empty." },
        { status: 400 },
      );
    }
    followerDisplay = String(n);
    followerForDb = n;
  }

  // Decimal fields (allow fractional values)
  const totalGmvResult = parseOptionalDecimal(b, "totalGmv", "Total GMV");
  if (totalGmvResult.error) return totalGmvResult.error;

  const gmvLast30dResult = parseOptionalDecimal(b, "gmvLast30d", "Last-30-day GMV");
  if (gmvLast30dResult.error) return gmvLast30dResult.error;

  const avgPostsPerWeek12wResult = parseOptionalDecimal(b, "avgPostsPerWeek12w", "Avg posts/week (last 12 weeks)");
  if (avgPostsPerWeek12wResult.error) return avgPostsPerWeek12wResult.error;

  // Count fields (must be non-negative integers)
  const postsLast30dResult = parseOptionalCount(b, "postsLast30d", "Posts (last 30 days)");
  if (postsLast30dResult.error) return postsLast30dResult.error;

  const postsLast7dResult = parseOptionalCount(b, "postsLast7d", "Posts (last 7 days)");
  if (postsLast7dResult.error) return postsLast7dResult.error;

  const likesLast30dResult = parseOptionalCount(b, "likesLast30d", "Likes (last 30d)");
  if (likesLast30dResult.error) return likesLast30dResult.error;

  const likesLast7dResult = parseOptionalCount(b, "likesLast7d", "Likes (last 7d)");
  if (likesLast7dResult.error) return likesLast7dResult.error;

  const viewsLast30dResult = parseOptionalCount(b, "viewsLast30d", "Views (last 30d)");
  if (viewsLast30dResult.error) return viewsLast30dResult.error;

  const viewsLast7dResult = parseOptionalCount(b, "viewsLast7d", "Views (last 7d)");
  if (viewsLast7dResult.error) return viewsLast7dResult.error;

  const commentsLast30dResult = parseOptionalCount(b, "commentsLast30d", "Comments (last 30d)");
  if (commentsLast30dResult.error) return commentsLast30dResult.error;

  const commentsLast7dResult = parseOptionalCount(b, "commentsLast7d", "Comments (last 7d)");
  if (commentsLast7dResult.error) return commentsLast7dResult.error;

  const userMessage = `Produce a brand–creator match assessment using only the fields below. Treat the literal phrase "not provided" as missing data—do not invent details beyond what is written.

BRAND CATEGORY:
${brandCategory}

BRAND DESCRIPTION:
${labelOrNotProvided(brandDescription)}

CREATOR USERNAME:
@${normalized}

CREATOR BIO:
${labelOrNotProvided(creatorBio)}

FOLLOWER COUNT:
${followerDisplay}

RECENT POST CAPTIONS (entries may be separated by blank lines in the original paste):
${labelOrNotProvided(recentCaptions)}

---

Return **only** a single JSON object (no markdown fences, no commentary) with exactly these keys:
- "score": integer from 1 to 100 (brand–creator match for affiliate partnership potential)
- "rationale": string, 2–5 sentences. When data exists, cite specific signals (e.g. audience or customer alignment, niche/category fit, content style vs brand positioning). When fields were "not provided", explicitly state what was missing and how that caps confidence. Never claim to have seen analytics or posts that were not supplied.`;

  const anthropicRes = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: getModel(),
      max_tokens: 1024,
      temperature: 0.35,
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

  const compositeResult = computeComposite({
    fitSubScore: parsed.score,
    gmvLast30d: gmvLast30dResult.value,
    totalGmv: totalGmvResult.value,
    avgPostsPerWeek12w: avgPostsPerWeek12wResult.value,
    postsLast30d: postsLast30dResult.value,
    likesLast30d: likesLast30dResult.value,
    commentsLast30d: commentsLast30dResult.value,
    viewsLast30d: viewsLast30dResult.value,
  });

  // Persist to Supabase. This runs after the score is ready, so a DB failure
  // can never block or alter the response the user receives.
  //
  // SECURITY: user_id is set from the server-validated session above — never
  // from the request body. That keeps the row's owner authoritative; a client
  // cannot forge a user_id for someone else, even by manipulating the JSON.
  try {
    const supabase = getSupabaseServerClient();
    const { error: dbError } = await supabase.from("scored_creators").insert({
      user_id: user.id,
      username: normalized,
      brand_category: brandCategory,
      brand_description: brandDescription || null,
      creator_bio: creatorBio || null,
      follower_count: followerForDb,
      recent_captions: recentCaptions || null,
      score: parsed.score,
      rationale: parsed.rationale,
      brand_id: brandId || null,
      composite_score: compositeResult.composite,
      performance_subscore: compositeResult.performanceSubScore,
      score_basis: compositeResult.scoreBasis,
      total_gmv: totalGmvResult.value,
      gmv_last_30d: gmvLast30dResult.value,
      posts_last_30d: postsLast30dResult.value,
      posts_last_7d: postsLast7dResult.value,
      likes_last_30d: likesLast30dResult.value,
      likes_last_7d: likesLast7dResult.value,
      views_last_30d: viewsLast30dResult.value,
      views_last_7d: viewsLast7dResult.value,
      comments_last_30d: commentsLast30dResult.value,
      comments_last_7d: commentsLast7dResult.value,
      avg_posts_per_week_12w: avgPostsPerWeek12wResult.value,
    });
    if (dbError) {
      console.error("[creator-score] Supabase insert failed:", dbError);
    }
  } catch (err) {
    console.error("[creator-score] Unexpected error saving to Supabase:", err);
  }

  return NextResponse.json({
    username: normalized,
    score: parsed.score,
    rationale: parsed.rationale,
  });
}
