// 라운드 21 P2: 법령 diff → DOCX 빌더.
// 감사팀·법무자문 제출용. Word 로 열어 편집 가능한 실무 형식.
// docx v9 API 사용 (Paragraph/Table/TextRun/Document).

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  HeadingLevel,
  WidthType,
  BorderStyle,
  AlignmentType,
} from "docx";
import type { LawDetail, ArticleChange, ChangeType } from "@/lib/types";

const TYPE_LABEL: Record<ChangeType, string> = {
  added: "신설 [＋]",
  modified: "수정 [～]",
  deleted: "삭제 [－]",
  moved: "이동 [↔]",
};

// diff 배경색 (Word 셀 shading, HEX no #)
const TYPE_SHADING: Record<ChangeType, string> = {
  added: "DDE7CB",     // 그린
  modified: "F5EDDD",  // 앰버
  deleted: "E8E6E0",   // 그레이
  moved: "E3E7EF",     // 슬레이트
};

function pText(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: opts.bold ?? false,
        size: opts.size ?? 22, // half-points → 11pt
        color: opts.color,
      }),
    ],
  });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true })],
  });
}

function makeChangeTable(change: ArticleChange): Table {
  const beforeCell = new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    shading: change.changeType === "added" ? { fill: "F1F1EE" } : { fill: "F1F1EE" },
    children: [
      pText(`종전 · ${change.beforeDate ?? "이전 없음"}`, { size: 18, color: "6C6C6C" }),
      ...(change.beforeText ?? []).map((line) => pText(line)),
      ...(change.beforeText?.length ? [] : [pText("—", { color: "AAAAAA" })]),
    ],
  });
  const afterCell = new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    shading: { fill: TYPE_SHADING[change.changeType] },
    children: [
      pText(`현재 · ${change.afterDate}`, { size: 18, color: "6C6C6C" }),
      ...(change.afterText ?? []).map((line) => pText(line)),
      ...(change.afterText?.length ? [] : [pText("—", { color: "AAAAAA" })]),
    ],
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 6, color: "BEBEBE" },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "BEBEBE" },
      left:   { style: BorderStyle.SINGLE, size: 6, color: "BEBEBE" },
      right:  { style: BorderStyle.SINGLE, size: 6, color: "BEBEBE" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical:   { style: BorderStyle.SINGLE, size: 6, color: "BEBEBE" },
    },
    rows: [new TableRow({ children: [beforeCell, afterCell] })],
  });
}

export async function buildDiffDocx(law: LawDetail): Promise<Buffer> {
  // 서버 지역시간으로 찍으면 Vercel(UTC)에서 한국 시각과 9시간 어긋난다.
  // 감사 제출본에 찍히는 시각이라 서울 기준으로 맞춘다.
  const timestamp = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(new Date());

  const bodyChildren: (Paragraph | Table)[] = [
    heading(law.name, HeadingLevel.TITLE),
    pText(`${law.type} · ${law.lawNumber} · ${law.promulgationDate} ${law.revisionType}`, { color: "6C6C6C" }),
    pText(`시행일: ${law.effectiveDate}${law.effectiveDateNote ? ` (${law.effectiveDateNote})` : ""}`),
    pText(""),
    pText(`추출 시각: ${timestamp} · LawChange`, { size: 18, color: "9C9C9C" }),
    pText(""),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: `─── 조문 단위 변경 내역 (${law.changes.length}건) ───`, color: "6C6C6C" })],
    }),
    pText(""),
  ];

  if (law.changes.length === 0) {
    bodyChildren.push(pText("이 개정에는 조문 본문 변경이 없습니다. 부칙만 개정되었거나 형식적 반영일 가능성이 큽니다."));
  } else {
    for (const change of law.changes) {
      bodyChildren.push(
        heading(
          `${change.articleNumber}${change.articleTitle ? ` (${change.articleTitle})` : ""} — ${TYPE_LABEL[change.changeType]}`,
          HeadingLevel.HEADING_2,
        ),
        makeChangeTable(change),
        pText(""),
      );
    }
  }

  const doc = new Document({
    creator: "LawChange",
    title: `${law.name} 개정 diff`,
    description: "LawChange 자동 생성 리포트",
    sections: [{ children: bodyChildren }],
  });

  return await Packer.toBuffer(doc);
}
