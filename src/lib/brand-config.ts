// src/lib/brand-config.ts
// Maps a brand's stored configuration into the three pipeline config objects the
// discovery pipeline consumes. Pure module: no DB access, no server-only imports.
// The read layer is responsible for mapping snake_case DB columns into BrandConfigInput;
// validation belongs to the write layer — this module only performs straight mapping.

import type { BrandFitConfig } from "./fit-score";
import type { OutreachPolicyConfig } from "./outreach-plan";
import type { GmvFloorConfig } from "./gmv-floor";

// Operator default gate set: region is the only hard gate for health/wellness;
// category and followers are soft signals by default.
export const DEFAULT_GATES = { region: true, followers: false, category: false } as const;

// Camelcase input shape the read layer hydrates from DB rows.
export type BrandConfigInput = {
  targetCategoryIds: string[];
  targetRegions: string[];
  minFollowers: number | null;
  gateRegion: boolean;
  gateFollowers: boolean;
  gateCategory: boolean;
  maxInvites: number;
  commissionRate: number;
  minGmvFloor: number | null; // null => no floor
};

export type PipelineConfigs = {
  fitConfig: BrandFitConfig;
  policy: OutreachPolicyConfig;
  gmvFloorConfig?: GmvFloorConfig;
};

export function brandConfigToPipelineConfigs(input: BrandConfigInput): PipelineConfigs {
  const fitConfig: BrandFitConfig = {
    targetCategoryIds: input.targetCategoryIds,
    targetRegions: input.targetRegions,
    minFollowers: input.minFollowers,
    gates: {
      region: input.gateRegion,
      followers: input.gateFollowers,
      category: input.gateCategory,
    },
  };

  const policy: OutreachPolicyConfig = {
    maxInvites: input.maxInvites,
    commissionRate: input.commissionRate,
  };

  const gmvFloorConfig: GmvFloorConfig | undefined =
    input.minGmvFloor === null ? undefined : { minGmvFloor: input.minGmvFloor };

  return { fitConfig, policy, gmvFloorConfig };
}
