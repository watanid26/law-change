// 개정 한 건이 우리 사규 어디를 건드리는지.
//
// 이 앱에서 가장 공들인 부분이다. 법제처도 "법이 바뀌었다" 는 알려주지만,
// "그래서 우리 회사 취업규칙 제18조를 고쳐야 한다" 까지는 알려주지 않는다.
//
// 판정은 조문 단위로 한다. 법령 단위로만 보면 근로기준법이 바뀔 때마다
// 근로기준법에 걸린 사규가 전부 뜬다 — 대부분 무관해서 아무도 안 보게 된다.
// 조문을 특정하지 못한 연결(법령 단위)은 "관련 있을 수 있음" 으로 낮춰
// 따로 표시한다.

import { prisma } from "@/lib/prisma";

export interface AffectedPolicy {
  policyId: string;
  policyTitle: string;
  policyType: string;
  /** 어느 조문 때문에 걸렸는지. 법령 단위 연결이면 null. */
  viaUnitLabel: string | null;
  viaUnitTitle: string | null;
  /** 그 조문이 이번 개정에서 어떻게 바뀌었는지 */
  changeType: string | null;
  ownerDepartmentName: string | null;
}

export interface AffectedPoliciesResult {
  /** 바뀐 조문에 직접 걸린 사규. 이것이 담당자가 볼 목록이다. */
  direct: AffectedPolicy[];
  /** 법령 단위로만 걸려 있어 관련 여부를 사람이 봐야 하는 것. */
  indirect: AffectedPolicy[];
  /** 이번 개정에서 바뀐 조문 수 */
  changedUnitCount: number;
  /** 그중 사규와 연결된 조문 수 */
  mappedUnitCount: number;
}

const EMPTY: AffectedPoliciesResult = {
  direct: [],
  indirect: [],
  changedUnitCount: 0,
  mappedUnitCount: 0,
};

export async function getAffectedPolicies(
  workspaceId: string,
  changeEventId: string,
): Promise<AffectedPoliciesResult> {
  const event = await prisma.legalChangeEvent.findUnique({
    where: { id: changeEventId },
    select: { id: true, documentId: true },
  });
  if (!event) return EMPTY;

  // 이번 개정에서 바뀐 조문들.
  const diffs = await prisma.legalDiff.findMany({
    where: { changeEventId: event.id, contentUnitId: { not: null } },
    select: { contentUnitId: true, changeType: true },
  });
  const changeByUnit = new Map<string, string>();
  for (const d of diffs) {
    if (d.contentUnitId && !changeByUnit.has(d.contentUnitId)) {
      changeByUnit.set(d.contentUnitId, d.changeType);
    }
  }
  const changedUnitIds = [...changeByUnit.keys()];

  const mappings = await prisma.legalPolicyMapping.findMany({
    where: {
      workspaceId,
      documentId: event.documentId,
      // 바뀐 조문에 걸린 것, 또는 조문을 특정하지 않은 법령 단위 연결.
      OR: [
        changedUnitIds.length > 0 ? { contentUnitId: { in: changedUnitIds } } : { id: "" },
        { contentUnitId: null },
      ],
    },
    select: {
      contentUnitId: true,
      contentUnit: { select: { currentLabel: true, currentTitle: true } },
      policy: {
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          ownerDepartment: { select: { name: true } },
        },
      },
    },
  });

  const direct: AffectedPolicy[] = [];
  const indirect: AffectedPolicy[] = [];
  const mappedUnits = new Set<string>();

  for (const m of mappings) {
    // 보관 처리된 사규는 더 이상 대응 대상이 아니다.
    if (m.policy.status !== "ACTIVE") continue;
    const row: AffectedPolicy = {
      policyId: m.policy.id,
      policyTitle: m.policy.title,
      policyType: m.policy.type,
      viaUnitLabel: m.contentUnit?.currentLabel ?? null,
      viaUnitTitle: m.contentUnit?.currentTitle ?? null,
      changeType: m.contentUnitId ? changeByUnit.get(m.contentUnitId) ?? null : null,
      ownerDepartmentName: m.policy.ownerDepartment?.name ?? null,
    };
    if (m.contentUnitId) {
      mappedUnits.add(m.contentUnitId);
      direct.push(row);
    } else {
      indirect.push(row);
    }
  }

  return {
    direct,
    indirect,
    changedUnitCount: changedUnitIds.length,
    mappedUnitCount: mappedUnits.size,
  };
}
