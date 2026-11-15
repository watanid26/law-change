import { z } from "zod";
import { POLICY_TYPE_VALUES } from "./labels";

export const createPolicyInput = z.object({
  type: z.enum(POLICY_TYPE_VALUES),
  title: z.string().min(1).max(200),
  externalUrl: z.string().url().max(2000).optional(),
});
export type CreatePolicyInput = z.infer<typeof createPolicyInput>;

export const createMappingInput = z.object({
  watchId: z.string().min(1), // Watch 로부터 documentId + workspaceId 유도
  policyId: z.string().min(1),
});
export type CreateMappingInput = z.infer<typeof createMappingInput>;

// 라운드 19-B2: 사규 벌크 등록. 최대 200건 이하로 제한 (초과 시 여러 배치로).
export const bulkCreatePoliciesInput = z.object({
  items: z.array(createPolicyInput).min(1).max(200),
});
export type BulkCreatePoliciesInput = z.infer<typeof bulkCreatePoliciesInput>;
