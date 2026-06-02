// src/lib/fit-score.ts
// Profile-fit sub-score: the "does this creator match the brand" half of the composite
// (the other half, performance, lives in composite-score.ts and is GMV-dominated).
// Runs on the CHEAP search-candidate signals (category, region, follower count) so it can
// gate/rank a discovery list BEFORE paying for per-creator detail lookups.
//
// Design (founder-set):
//   - Each brand flags which of {region, followers, category} are HARD GATES; a creator
//     failing any active gate is rejected before any detail call.
//   - The soft fit score (0-100) is a weighted blend of ONLY the signals the brand did NOT
//     gate (a gated signal carries no extra info — every survivor already passes it).
//     Weights: category 0.40, region 0.40, followers 0.20, renormalized over the active soft
//     signals. If no soft signals remain (all gated / inactive), fit = 100 (every survivor is
//     a perfect structural match).
//   - Shapes (tunable): category = overlaps a target category -> 100 else 0; region = in a
//     target region -> 100 else 0; followers = diminishing-returns curve.
// Pure module; fully fixture-testable.

const FOLLOWER_ANCHORS: Array<[number, number]> = [
  [0, 0], [10000, 40], [50000, 70], [250000, 100],
];

const CATEGORY_WEIGHT = 0.40;
const REGION_WEIGHT = 0.40;
const FOLLOWER_WEIGHT = 0.20;

// Mirrors composite-score.ts piecewiseLinear/clamp; kept local to avoid coupling this
// module to the scoring module. Trivial and independently covered by this file's fixtures.
function piecewiseLinear(anchors: Array<[number, number]>, x: number): number {
  if (x <= anchors[0][0]) return anchors[0][1];
  if (x >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (x >= x0 && x <= x1) {
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return anchors[anchors.length - 1][1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export type BrandFitConfig = {
  targetCategoryIds: string[];
  targetRegions: string[];
  minFollowers: number | null;
  gates: { region: boolean; followers: boolean; category: boolean };
};

export type CreatorFitInput = {
  categoryIds: string[];
  selectionRegion: string | null;
  followerCount: number | null;
};

export type FitResult =
  | { ok: false; rejectedBy: "region" | "followers" | "category" }
  | {
      ok: true;
      fitSubScore: number;
      components: { category: number | null; region: number | null; followers: number | null };
    };

function regionMatches(region: string | null, targets: string[]): boolean {
  if (region === null) return false;
  const r = region.toUpperCase();
  return targets.some((t) => t.toUpperCase() === r);
}

function categoryOverlaps(ids: string[], targets: string[]): boolean {
  if (ids.length === 0 || targets.length === 0) return false;
  const set = new Set(targets);
  return ids.some((id) => set.has(id));
}

export function computeFit(config: BrandFitConfig, creator: CreatorFitInput): FitResult {
  const regionActive = config.targetRegions.length > 0;
  const categoryActive = config.targetCategoryIds.length > 0;
  const followersGateActive = config.gates.followers && config.minFollowers !== null;

  // --- Hard gates (fixed order: region, followers, category) ---
  if (config.gates.region && regionActive) {
    if (!regionMatches(creator.selectionRegion, config.targetRegions)) {
      return { ok: false, rejectedBy: "region" };
    }
  }
  if (followersGateActive) {
    // fail-closed: an unknown follower count cannot satisfy a follower gate.
    if (creator.followerCount === null || creator.followerCount < (config.minFollowers as number)) {
      return { ok: false, rejectedBy: "followers" };
    }
  }
  if (config.gates.category && categoryActive) {
    if (!categoryOverlaps(creator.categoryIds, config.targetCategoryIds)) {
      return { ok: false, rejectedBy: "category" };
    }
  }

  // --- Soft score over only the NON-gated, active signals ---
  const components: { category: number | null; region: number | null; followers: number | null } = {
    category: null,
    region: null,
    followers: null,
  };
  const active: Array<{ value: number; weight: number }> = [];

  if (!config.gates.category && categoryActive) {
    const v = categoryOverlaps(creator.categoryIds, config.targetCategoryIds) ? 100 : 0;
    components.category = v;
    active.push({ value: v, weight: CATEGORY_WEIGHT });
  }
  if (!config.gates.region && regionActive) {
    const v = regionMatches(creator.selectionRegion, config.targetRegions) ? 100 : 0;
    components.region = v;
    active.push({ value: v, weight: REGION_WEIGHT });
  }
  if (!config.gates.followers && creator.followerCount !== null) {
    const v = piecewiseLinear(FOLLOWER_ANCHORS, creator.followerCount);
    components.followers = v;
    active.push({ value: v, weight: FOLLOWER_WEIGHT });
  }

  if (active.length === 0) {
    return { ok: true, fitSubScore: 100, components };
  }

  const totalWeight = active.reduce((s, c) => s + c.weight, 0);
  const weightedSum = active.reduce((s, c) => s + c.value * (c.weight / totalWeight), 0);
  const fitSubScore = clamp(Math.round(weightedSum), 0, 100);

  return { ok: true, fitSubScore, components };
}
