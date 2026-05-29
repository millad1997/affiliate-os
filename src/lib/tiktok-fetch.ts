import type { SignedRequest } from "./tiktok-marketplace-request";

export interface TikTokEnvelope<T = unknown> {
  code: number;
  message: string;
  request_id?: string;
  data?: T;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; text(): Promise<string> }>;

export type TikTokFetchResult<T = unknown> =
  | { ok: true; status: number; envelope: TikTokEnvelope<T> }
  | { ok: false; kind: "network"; message: string }
  | { ok: false; kind: "http"; status: number; bodyText: string }
  | { ok: false; kind: "invalid_json"; status: number; bodyText: string };

const MAX_BODY_SNIPPET = 500;
function snippet(s: string): string {
  return s.length > MAX_BODY_SNIPPET ? s.slice(0, MAX_BODY_SNIPPET) : s;
}

function isEnvelope(v: unknown): v is TikTokEnvelope {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { code?: unknown }).code === "number" &&
    typeof (v as { message?: unknown }).message === "string"
  );
}

function isOk2xx(status: number): boolean {
  return status >= 200 && status < 300;
}

export async function executeSignedRequest<T = unknown>(
  req: SignedRequest,
  fetchImpl: FetchLike = fetch,
): Promise<TikTokFetchResult<T>> {
  let status: number;
  let bodyText: string;
  try {
    const res = await fetchImpl(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body, // exact pre-signed bytes; undefined for GET. NEVER re-serialize.
    });
    status = res.status;
    bodyText = await res.text();
  } catch (e) {
    return { ok: false, kind: "network", message: e instanceof Error ? e.message : "network error" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return isOk2xx(status)
      ? { ok: false, kind: "invalid_json", status, bodyText: snippet(bodyText) }
      : { ok: false, kind: "http", status, bodyText: snippet(bodyText) };
  }

  if (!isEnvelope(parsed)) {
    return isOk2xx(status)
      ? { ok: false, kind: "invalid_json", status, bodyText: snippet(bodyText) }
      : { ok: false, kind: "http", status, bodyText: snippet(bodyText) };
  }

  return { ok: true, status, envelope: parsed as TikTokEnvelope<T> };
}
