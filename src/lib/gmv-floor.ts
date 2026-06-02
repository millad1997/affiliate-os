// src/lib/gmv-floor.ts
// Late GMV floor: an outreach-stage filter applied AFTER scoring to drop weak sellers.
// Founder rule: only floor when GMV is present — a creator with no GMV data is NEVER
// dropped on GMV grounds (can't judge); it passes through to be decided on other signals.
// For a banded (range) GMV, the floor uses the range MIDPOINT, mirroring how the composite
// scores a range. The threshold (minGmvFloor) is operator-set config, not baked in.
// Pure module; fully fixture-testable. Not yet wired into the orchestrator (its own slice).

export type GmvFloorConfig = { minGmvFloor: number };

// Structurally a subset of TransformedCreatorMetrics, so a metrics object is assignable here.
export type GmvFloorInput = {
  gmvLast30d: number | null;
  gmvSource: "precise" | "range" | "none";
  gmvRange: { min: number; max: number } | null;
};

export type GmvFloorResult =
  | { pass: true; reason: "above_floor"; effectiveGmv: number }
  | { pass: true; reason: "no_gmv_no_floor"; effectiveGmv: null }
  | { pass: false; reason: "below_floor"; effectiveGmv: number };

function effectiveGmv(input: GmvFloorInput): number | null {
  if (input.gmvSource === "precise" && input.gmvLast30d !== null) {
    return input.gmvLast30d;
  }
  if (input.gmvSource === "range" && input.gmvRange !== null) {
    return (input.gmvRange.min + input.gmvRange.max) / 2;
  }
  return null;
}

export function applyGmvFloor(config: GmvFloorConfig, input: GmvFloorInput): GmvFloorResult {
  const eff = effectiveGmv(input);
  if (eff === null) {
    // No GMV came back -> do NOT floor; pass through (decided on other signals).
    return { pass: true, reason: "no_gmv_no_floor", effectiveGmv: null };
  }
  if (eff >= config.minGmvFloor) {
    return { pass: true, reason: "above_floor", effectiveGmv: eff };
  }
  return { pass: false, reason: "below_floor", effectiveGmv: eff };
}
