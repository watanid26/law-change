// Excel Export 헬퍼 — exceljs 로 워크북 스트리밍.
// 각 exporter 는 workspace scope 로 실 데이터를 조회하여 스트림 반환.

import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { formatExportDate as fmtDate } from "./exportDate";
import { APPLICABILITY_LABEL, IMPORTANCE_LABEL, WATCH_STATUS_LABEL } from "@/lib/watches/labels";
import { INBOX_STATUS_LABEL, INBOX_APPLICABILITY_LABEL, IMPACT_LEVEL_LABEL } from "@/lib/inbox/labels";
import { TASK_STATUS_LABEL, TASK_PRIORITY_LABEL } from "@/lib/tasks/labels";

// 공통 헤더 스타일
function styleHeaderRow(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
}

// ─────────────────────────────────────────────────────────────
// 관심 법령
// ─────────────────────────────────────────────────────────────
export async function buildWatchesWorkbook(workspaceId: string): Promise<ExcelJS.Workbook> {
  const rows = await prisma.watch.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: [{ createdAt: "desc" }],
    include: {
      document: { select: { currentTitle: true, documentType: true, currentAgencyName: true } },
      ownerMember: { select: { user: { select: { displayName: true, email: true } } } },
      ownerDepartment: { select: { name: true } },
    },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "LawCheck";
  wb.created = new Date();
  const ws = wb.addWorksheet("관심 법령");
  ws.columns = [
    { header: "법령명", key: "title", width: 40 },
    { header: "법령 종류", key: "type", width: 12 },
    { header: "소관기관", key: "ministry", width: 16 },
    { header: "상태", key: "status", width: 10 },
    { header: "적용 여부", key: "applicability", width: 12 },
    { header: "중요도", key: "importance", width: 10 },
    { header: "판단 사유", key: "reason", width: 40 },
    { header: "담당 부서", key: "dept", width: 16 },
    { header: "담당자", key: "owner", width: 16 },
    { header: "검토 주기(월)", key: "freq", width: 12 },
    { header: "최근 검토", key: "last", width: 12 },
    { header: "다음 검토", key: "next", width: 12 },
    // "인앱 알림" 컬럼이 있었는데 두 가지가 틀렸다. 인앱 알림은 화면에서
    // 없앤 기능이고(알림을 볼 인앱 화면이 없어 켜두면 조용히 사라졌다),
    // 값으로 읽던 notifyOnChange 는 "변경이 생기면 알릴지" 라는 다른 뜻이다.
    // 헤더를 값에 맞춘다.
    { header: "변경 알림", key: "notifyOnChange", width: 10 },
    { header: "이메일 알림", key: "notifyEmail", width: 12 },
    { header: "등록일", key: "created", width: 12 },
  ];
  styleHeaderRow(ws);
  for (const r of rows) {
    ws.addRow({
      title: r.document.currentTitle,
      type: r.document.documentType,
      ministry: r.document.currentAgencyName ?? "",
      status: WATCH_STATUS_LABEL[r.status] ?? r.status,
      applicability: APPLICABILITY_LABEL[r.applicabilityStatus] ?? r.applicabilityStatus,
      importance: IMPORTANCE_LABEL[r.importance] ?? r.importance,
      reason: r.applicabilityReason ?? "",
      dept: r.ownerDepartment?.name ?? "",
      owner: r.ownerMember?.user.displayName ?? r.ownerMember?.user.email ?? "",
      freq: r.reviewFrequencyMonths ?? "",
      last: fmtDate(r.lastReviewedAt),
      next: fmtDate(r.nextReviewAt),
      notifyOnChange: r.notifyOnChange ? "Y" : "N",
      notifyEmail: r.notifyEmail ? "Y" : "N",
      created: fmtDate(r.createdAt),
    });
  }
  return wb;
}

// ─────────────────────────────────────────────────────────────
// 변경 내역 Inbox
// ─────────────────────────────────────────────────────────────
export async function buildInboxWorkbook(workspaceId: string): Promise<ExcelJS.Workbook> {
  const rows = await prisma.changeInboxItem.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: [{ createdAt: "desc" }],
    include: {
      changeEvent: {
        select: {
          eventType: true,
          effectiveDate: true,
          promulgationDate: true,
          detectedAt: true,
          totalDiffCount: true,
          document: { select: { currentTitle: true, currentAgencyName: true } },
        },
      },
      assignedToMember: { select: { user: { select: { displayName: true, email: true } } } },
      ownerDepartment: { select: { name: true } },
    },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "LawCheck";
  wb.created = new Date();
  const ws = wb.addWorksheet("변경 내역");
  ws.columns = [
    { header: "법령명", key: "title", width: 40 },
    { header: "소관기관", key: "ministry", width: 16 },
    { header: "개정 유형", key: "eventType", width: 12 },
    { header: "변경 조문 수", key: "diffs", width: 12 },
    { header: "상태", key: "status", width: 12 },
    { header: "적용 여부", key: "applicability", width: 12 },
    { header: "영향도", key: "impact", width: 10 },
    { header: "담당 부서", key: "dept", width: 16 },
    { header: "담당자", key: "assignee", width: 16 },
    { header: "판단 사유", key: "reason", width: 40 },
    { header: "검토 메모", key: "assessment", width: 60 },
    { header: "공포일", key: "promulgation", width: 12 },
    { header: "시행일", key: "effective", width: 12 },
    { header: "감지일", key: "detected", width: 12 },
  ];
  styleHeaderRow(ws);
  for (const r of rows) {
    ws.addRow({
      title: r.changeEvent.document.currentTitle,
      ministry: r.changeEvent.document.currentAgencyName ?? "",
      eventType: r.changeEvent.eventType,
      diffs: r.changeEvent.totalDiffCount,
      status: INBOX_STATUS_LABEL[r.status as keyof typeof INBOX_STATUS_LABEL] ?? r.status,
      applicability: INBOX_APPLICABILITY_LABEL[r.applicability] ?? r.applicability,
      impact: r.impactLevel ? IMPACT_LEVEL_LABEL[r.impactLevel] ?? r.impactLevel : "",
      dept: r.ownerDepartment?.name ?? "",
      assignee: r.assignedToMember?.user.displayName ?? r.assignedToMember?.user.email ?? "",
      reason: r.applicabilityReason ?? "",
      assessment: r.assessmentText ?? "",
      promulgation: fmtDate(r.changeEvent.promulgationDate),
      effective: fmtDate(r.changeEvent.effectiveDate),
      detected: fmtDate(r.changeEvent.detectedAt),
    });
  }
  return wb;
}

// ─────────────────────────────────────────────────────────────
// 업무
// ─────────────────────────────────────────────────────────────
export async function buildTasksWorkbook(workspaceId: string): Promise<ExcelJS.Workbook> {
  const rows = await prisma.task.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: [{ createdAt: "desc" }],
    include: {
      inboxItem: {
        select: {
          changeEvent: { select: { document: { select: { currentTitle: true } } } },
        },
      },
      assigneeMember: { select: { user: { select: { displayName: true, email: true } } } },
      ownerDepartment: { select: { name: true } },
      evidence: { where: { deletedAt: null }, select: { id: true } },
    },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "LawCheck";
  wb.created = new Date();
  const ws = wb.addWorksheet("업무");
  ws.columns = [
    { header: "제목", key: "title", width: 40 },
    { header: "상태", key: "status", width: 10 },
    { header: "우선순위", key: "priority", width: 10 },
    { header: "담당자", key: "assignee", width: 16 },
    { header: "담당 부서", key: "dept", width: 16 },
    { header: "마감일", key: "due", width: 12 },
    { header: "시작일", key: "started", width: 12 },
    { header: "완료일", key: "completed", width: 12 },
    { header: "증빙 수", key: "evidence", width: 10 },
    { header: "연결 법령", key: "law", width: 40 },
    { header: "설명", key: "description", width: 60 },
  ];
  styleHeaderRow(ws);
  for (const r of rows) {
    ws.addRow({
      title: r.title,
      status: TASK_STATUS_LABEL[r.status as keyof typeof TASK_STATUS_LABEL] ?? r.status,
      priority: TASK_PRIORITY_LABEL[r.priority as keyof typeof TASK_PRIORITY_LABEL] ?? r.priority,
      assignee: r.assigneeMember?.user.displayName ?? r.assigneeMember?.user.email ?? "",
      dept: r.ownerDepartment?.name ?? "",
      due: fmtDate(r.dueAt),
      started: fmtDate(r.startedAt),
      completed: fmtDate(r.completedAt),
      evidence: r.evidence.length,
      law: r.inboxItem?.changeEvent.document.currentTitle ?? "",
      description: r.description ?? "",
    });
  }
  return wb;
}
