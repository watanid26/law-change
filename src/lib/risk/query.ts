// 개정 이벤트의 위험 신호를 낸다.
//
// 화면이 이미 로드한 diff 로 계산하지 않는 이유: 상세 화면은 diff 를 20개만
// 가져온다(take: 20). 25번째에 벌칙 조문이 있으면 놓친다. "확인 필요" 를
// 내걸면서 일부만 보고 판정하면 안 된다.
//
// 대신 판정에 필요한 세 값만 뽑는다 — 이벤트당 평균 12행, p90 31행이라
// 본문을 빼면 가볍다. 신설 조문의 본문만 앞 400자를 가져온다(새 의무 표현
// 탐지용).

import { prisma } from "@/lib/prisma";
import { assessChangeRisk, type RiskVerdict } from "./changeRisk";

interface Row {
  change_event_id: string;
  change_type: string;
  label: string | null;
  title: string | null;
  text: string | null;
}

async function fetchRows(eventIds: string[]): Promise<Row[]> {
  if (eventIds.length === 0) return [];
  return prisma.$queryRaw<Row[]>`
    SELECT d.change_event_id,
           d.change_type,
           COALESCE(d.new_label, d.old_label) AS label,
           cu.current_title AS title,
           CASE WHEN d.change_type = 'ADDED' THEN left(d.new_text, 400) END AS text
    FROM legal_diff d
    LEFT JOIN legal_content_unit cu ON cu.id = d.content_unit_id
    WHERE d.change_event_id = ANY(${eventIds})`;
}

function toVerdicts(eventIds: string[], rows: Row[]): Map<string, RiskVerdict> {
  const grouped = new Map<string, Row[]>();
  for (const r of rows) {
    const list = grouped.get(r.change_event_id);
    if (list) list.push(r);
    else grouped.set(r.change_event_id, [r]);
  }
  const out = new Map<string, RiskVerdict>();
  for (const id of eventIds) {
    out.set(
      id,
      assessChangeRisk(
        (grouped.get(id) ?? []).map((r) => ({
          changeType: r.change_type,
          label: r.label,
          title: r.title,
          text: r.text,
        })),
      ),
    );
  }
  return out;
}

/** 이벤트 하나. */
export async function assessEventRisk(eventId: string): Promise<RiskVerdict> {
  const rows = await fetchRows([eventId]);
  return toVerdicts([eventId], rows).get(eventId)!;
}

/** 목록용 — 한 번의 조회로 여러 이벤트를 판정한다. */
export async function assessEventRisks(eventIds: string[]): Promise<Map<string, RiskVerdict>> {
  const unique = [...new Set(eventIds)];
  return toVerdicts(unique, await fetchRows(unique));
}
