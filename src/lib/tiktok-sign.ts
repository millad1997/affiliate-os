// SERVER-ONLY: this module uses node:crypto and must never be imported into a client component.
import { createHmac } from "crypto";

export interface SignRequestArgs {
  path: string;
  queryParams: Record<string, string | number>;
  body?: string;
  contentType?: string;
  appSecret: string;
}

export function signRequest(args: SignRequestArgs): string {
  const {
    path,
    queryParams,
    body = "",
    contentType = "application/json",
    appSecret,
  } = args;

  const filtered = Object.entries(queryParams).filter(
    ([key]) => key !== "sign" && key !== "access_token"
  );

  filtered.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const concatenated = filtered
    .map(([key, value]) => `${key}${String(value)}`)
    .join("");

  let input = path + concatenated;

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    input += body;
  }

  input = appSecret + input + appSecret;

  return createHmac("sha256", appSecret).update(input).digest("hex");
}
