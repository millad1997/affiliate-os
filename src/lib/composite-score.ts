const NO_PERF_DATA_PENALTY = 8;

type Anchor = [number, number];

function piecewiseLinear(anchors: Anchor[], x: number): number {
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

const GMV_30D_ANCHORS: Anchor[] = [
  [0, 0], [1000, 10], [5000, 45], [10000, 65], [15000, 78], [20000, 86], [30000, 100],
];

const TOTAL_GMV_ANCHORS: Anchor[] = [
  [0, 0], [10000, 40], [50000, 75], [150000, 100],
];

const CONSISTENCY_ANCHORS: Anchor[] = [
  [0, 0], [3, 60], [7, 90], [10, 100],
];

const ENGAGEMENT_RAW_ANCHORS: Anchor[] = [
  [0, 0], [1000, 30], [10000, 70], [50000, 100],
];

const ENGAGEMENT_RATE_ANCHORS: Anchor[] = [
  [0, 0], [0.02, 40], [0.05, 70], [0.10, 100],
];

export type CompositeScoreArgs = {
  fitSubScore: number;
  gmvLast30d: number | null;
  totalGmv: number | null;
  avgPostsPerWeek12w: number | null;
  postsLast30d: number | null;
  likesLast30d: number | null;
  commentsLast30d: number | null;
  viewsLast30d: number | null;
};

export type CompositeScoreResult = {
  composite: number;
  performanceSubScore: number | null;
  fitSubScore: number;
  scoreBasis: "composite" | "fit_only_no_perf_data";
};

export function computeComposite(args: CompositeScoreArgs): CompositeScoreResult {
  const {
    fitSubScore,
    gmvLast30d,
    totalGmv,
    avgPostsPerWeek12w,
    postsLast30d,
    likesLast30d,
    commentsLast30d,
    viewsLast30d,
  } = args;

  if (gmvLast30d === null) {
    return {
      composite: clamp(fitSubScore - NO_PERF_DATA_PENALTY, 1, 100),
      performanceSubScore: null,
      fitSubScore,
      scoreBasis: "fit_only_no_perf_data",
    };
  }

  // Component 1: last-30-day GMV (always present when gmvLast30d is non-null)
  const comp1 = piecewiseLinear(GMV_30D_ANCHORS, gmvLast30d);

  // Component 2: total GMV (drop if null)
  const comp2 = totalGmv !== null ? piecewiseLinear(TOTAL_GMV_ANCHORS, totalGmv) : null;

  // Component 3: consistency (drop if avgPostsPerWeek12w is null)
  let comp3: number | null = null;
  if (avgPostsPerWeek12w !== null) {
    comp3 = piecewiseLinear(CONSISTENCY_ANCHORS, avgPostsPerWeek12w);
    if (postsLast30d !== null && postsLast30d === 0) {
      comp3 *= 0.5;
    }
  }

  // Component 4: engagement (drop if BOTH likesLast30d and commentsLast30d are null)
  let comp4: number | null = null;
  if (likesLast30d !== null || commentsLast30d !== null) {
    const rawSum = (likesLast30d ?? 0) + (commentsLast30d ?? 0);
    const score4a = piecewiseLinear(ENGAGEMENT_RAW_ANCHORS, rawSum);
    if (viewsLast30d !== null && viewsLast30d > 0) {
      const rate = rawSum / viewsLast30d;
      const score4b = piecewiseLinear(ENGAGEMENT_RATE_ANCHORS, rate);
      comp4 = (score4a + score4b) / 2;
    } else {
      comp4 = score4a;
    }
  }

  // Collect active components; renormalize weights to sum to 1
  const components: Array<{ value: number; weight: number }> = [
    { value: comp1, weight: 0.50 },
  ];
  if (comp2 !== null) components.push({ value: comp2, weight: 0.20 });
  if (comp3 !== null) components.push({ value: comp3, weight: 0.15 });
  if (comp4 !== null) components.push({ value: comp4, weight: 0.15 });

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const weightedSum = components.reduce(
    (sum, c) => sum + c.value * (c.weight / totalWeight),
    0,
  );

  const performanceSubScore = clamp(Math.round(weightedSum), 0, 100);
  const composite = clamp(Math.round(0.60 * performanceSubScore + 0.40 * fitSubScore), 1, 100);

  return {
    composite,
    performanceSubScore,
    fitSubScore,
    scoreBasis: "composite",
  };
}
