import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

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

export async function POST(request: Request) {
  // Identify the logged-in user via the anon-key cookie client. This client
  // reads the Supabase auth cookies that the browser sent with the request and
  // validates the access token. If no valid session exists, we reject the
  // request before doing any DB work — an unauthenticated request must never
  // create a brands row.
  const authClient = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be logged in to save a brand." },
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

  const name = pickString(b, "name").trim();
  if (!name) {
    return NextResponse.json({ error: "Brand name is required." }, { status: 400 });
  }
  if (name.length > 200) {
    return NextResponse.json({ error: "Brand name is too long (max 200 characters)." }, { status: 400 });
  }

  const category = pickString(b, "category").trim();
  if (!category) {
    return NextResponse.json({ error: "Category is required." }, { status: 400 });
  }
  if (!BRAND_CATEGORIES.includes(category as (typeof BRAND_CATEGORIES)[number])) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }

  const description = clampText(pickString(b, "description"), MAX_TEXT_FIELD);
  const commissionContext = clampText(pickString(b, "commission_context"), MAX_TEXT_FIELD);
  const exclusionList = clampText(pickString(b, "exclusion_list"), MAX_TEXT_FIELD);
  const approvedClaims = clampText(pickString(b, "approved_claims"), MAX_TEXT_FIELD);

  // SECURITY: user_id is set from the server-validated session above — never
  // from the request body. That keeps the row's owner authoritative; a client
  // cannot forge a user_id for someone else, even by manipulating the JSON.
  const supabase = getSupabaseServerClient();
  const { data, error: dbError } = await supabase
    .from("brands")
    .insert({
      user_id: user.id,
      name,
      category,
      description: description || null,
      commission_context: commissionContext || null,
      exclusion_list: exclusionList || null,
      approved_claims: approvedClaims || null,
    })
    .select("id, name")
    .single();

  if (dbError) {
    console.error("[brands] Supabase insert failed:", dbError);
    return NextResponse.json(
      { error: "Failed to save brand. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: data.id, name: data.name }, { status: 201 });
}
