import type { ArticleChange } from "@/lib/types";
import { changeLabel } from "@/lib/style";
import { ChangeBadge, CHANGE_EDGE } from "./ui/change";
import {
  diffForBeforePanel,
  diffForAfterPanel,
  opsByLines,
  type WordDiffOp,
} from "@/lib/diff/wordDiff";
import { CopyAnchorButton } from "@/components/CopyAnchorButton";

interface Props {
  change: ArticleChange;
}

// 라운드 18 T2: 조문 앵커 — URL 공유 가능성 확보. slug 는 kebab-case ASCII 만 사용.
// 라운드 20: DiffTreeNav 와 공유하기 위해 export.
export function articleAnchor(articleKey: string): string {
  return `article-${articleKey.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase()}`;
}

// 4 변경타입: 신설(＋) · 수정(～) · 삭제(－) · 이동(↔). 배지는 색+기호+낱말.
export function DiffCard({ change }: Props) {
  // 이동인데 본문도 함께 바뀐 케이스: 배지 라벨을 헤더에서도 명시.
  const movedBodyChanged =
    change.changeType === "moved" && !textsEqual(change.beforeText, change.afterText);
  const badgeLabel = movedBodyChanged ? "이동 + 본문 변경" : changeLabel[change.changeType];
  const anchorId = articleAnchor(change.articleKey);

  // 라운드 18 T1: 단어 단위 diff 를 MODIFIED 및 MOVED(본문변경) 케이스에 적용.
  // beforeText, afterText 를 join 해 diff 한 뒤 라인별로 재구성.
  const shouldWordDiff =
    change.changeType === "modified" ||
    (change.changeType === "moved" && movedBodyChanged);
  const beforeAll = (change.beforeText ?? []).join("\n");
  const afterAll = (change.afterText ?? []).join("\n");
  const beforePanelLines: WordDiffOp[][] | undefined = shouldWordDiff
    ? opsByLines(diffForBeforePanel(beforeAll, afterAll))
    : undefined;
  const afterPanelLines: WordDiffOp[][] | undefined = shouldWordDiff
    ? opsByLines(diffForAfterPanel(beforeAll, afterAll))
    : undefined;

  return (
    <section
      id={anchorId}
      className="scroll-mt-24 overflow-hidden rounded-md border border-line bg-surface"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        {/* 조문 번호·제목은 법령의 목소리(명조). 옆의 배지·버튼은 도구(고딕). */}
        <h3 className="font-legal text-xl font-bold text-fg">
          <span className="legal-token">{change.articleNumber}</span>
          {change.articleTitle ? (
            <span className="ml-1.5 font-normal text-fg-secondary">
              ({change.articleTitle})
            </span>
          ) : null}
        </h3>
        <ChangeBadge type={change.changeType} label={badgeLabel} />
        <CopyAnchorButton anchorId={anchorId} className="ml-auto" />
      </header>

      {change.changeType === "added" ? (
        <div className="grid grid-cols-1 md:grid-cols-2">
          <ArticlePanel
            variant="before"
            date={change.beforeDate ?? "이전 없음"}
            lines={[]}
            emptyText="해당 조문 없음"
          />
          <ArticlePanel
            variant="added"
            date={change.afterDate}
            lines={change.afterText ?? []}
          />
        </div>
      ) : change.changeType === "deleted" ? (
        <div className="grid grid-cols-1 md:grid-cols-2">
          <ArticlePanel
            variant="before"
            date={change.beforeDate ?? ""}
            lines={change.beforeText ?? []}
            trailingNote={change.removedTail}
          />
          <ArticlePanel
            variant="deleted"
            date={change.afterDate}
            lines={[]}
            emptyText="이 조문은 삭제되었습니다"
          />
        </div>
      ) : change.changeType === "moved" ? (
        (() => {
          // 이동 조문이라도 본문이 함께 바뀐 경우가 있다. 텍스트 동일성 실측으로 노트 결정.
          const bodyChanged = !textsEqual(change.beforeText, change.afterText);

          // 본문이 그대로인 이동은 좌우에 똑같은 글을 두 번 그리게 된다.
          // 사용자는 바뀐 게 없는 두 패널을 눈으로 대조하게 되고, 이동 48건짜리
          // 개정에서는 조문 본문이 96번 렌더돼 페이지가 1.2MB / 2초가 된다.
          // 실제로 바뀐 건 조번호 하나뿐이므로 그것만 보여주고 본문은 한 번만.
          if (!bodyChanged) {
            return (
              <div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line bg-change-movedPanel px-4 py-2.5 text-sm sm:px-5">
                  <span className="text-change-movedText">조번호만 이동</span>
                  {change.previousNumber ? (
                    <span className="legal-token font-medium text-fg">
                      {change.previousNumber} → {change.articleNumber}
                    </span>
                  ) : null}
                  <span className="text-fg-muted">· 본문은 그대로입니다</span>
                </div>
                <ArticlePanel
                  variant="moved"
                  date={change.afterDate}
                  lines={change.afterText ?? []}
                />
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1 md:grid-cols-2">
              <ArticlePanel
                variant="before"
                date={change.beforeDate ?? ""}
                lines={change.beforeText ?? []}
                highlightedLines={beforePanelLines}
              />
              <ArticlePanel
                variant="moved"
                date={change.afterDate}
                lines={change.afterText ?? []}
                highlightedLines={afterPanelLines}
                trailingNote="조번호 이동 + 본문 변경"
                highlightAll
              />
            </div>
          );
        })()
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2">
          <ArticlePanel
            variant="before"
            date={change.beforeDate ?? ""}
            lines={change.beforeText ?? []}
            highlightedLines={beforePanelLines}
            trailingNote={change.removedTail}
          />
          <ArticlePanel
            variant="modified"
            date={change.afterDate}
            lines={change.afterText ?? []}
            highlightedLines={afterPanelLines}
            addedLines={change.addedLines}
          />
        </div>
      )}
    </section>
  );
}

// 두 문단 배열의 실제 텍스트 동일성 (공백만 다른 것은 같다고 본다).
function textsEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const norm = (arr: string[] | undefined) =>
    (arr ?? []).map((l) => l.replace(/\s+/g, "")).join("\n");
  return norm(a) === norm(b);
}

interface PanelProps {
  variant: "before" | "added" | "modified" | "deleted" | "moved";
  date: string;
  lines: string[];
  highlightedLines?: WordDiffOp[][];
  addedLines?: number[];
  trailingNote?: string;
  emptyText?: string;
  highlightAll?: boolean;
}

function ArticlePanel({
  variant,
  date,
  lines,
  highlightedLines,
  addedLines,
  trailingNote,
  emptyText,
  highlightAll,
}: PanelProps) {
  const isBefore = variant === "before";

  // 배경/왼쪽 띠 — 종전은 흐린 미색, 신설/수정/이동은 각자 톤. 삭제 우측은 옅게.
  // 좌측 형태 단서는 타입마다 선 굵기·종류가 다르다 (실선 3px / 얇은 실선 /
  // 점선). 색을 못 보는 상황에서도 네 종류가 구분되도록 한 것.
  const containerCls = isBefore
    ? "bg-subtle border-l-[3px] border-l-line-strong"
    : variant === "added"
      ? `bg-change-addedPanel ${CHANGE_EDGE.added}`
      : variant === "modified"
        ? `bg-change-modifiedPanel ${CHANGE_EDGE.modified}`
        : variant === "moved"
          ? `bg-change-movedPanel ${CHANGE_EDGE.moved}`
          : `bg-change-deletedPanel ${CHANGE_EDGE.deleted}`;

  const labelColor = isBefore
    ? "text-fg-muted"
    : variant === "added"
      ? "text-change-addedText"
      : variant === "modified"
        ? "text-change-modifiedText"
        : variant === "moved"
          ? "text-change-movedText"
          : "text-change-deletedText";

  const label = isBefore
    ? "종전"
    : variant === "added"
      ? "현재 · 신설"
      : variant === "modified"
        ? "현재 · 개정"
        : variant === "moved"
          ? "현재 · 이동"
          : "현재 · 삭제";

  return (
    <div
      className={`border-b border-line p-4 last:border-b-0 sm:p-5 md:border-b-0 md:[&:nth-child(1)]:border-r md:[&:nth-child(1)]:border-line ${containerCls}`}
    >
      <p className={`mb-2.5 text-xs font-medium ${labelColor}`}>
        {label} · {date}
      </p>
      {lines.length === 0 ? (
        <p className="text-sm text-fg-disabled">
          {emptyText ?? "—"}
        </p>
      ) : highlightedLines ? (
        // 라운드 18 T1: 단어 단위 diff 렌더. before 패널은 del 하이라이트,
        // after(modified/moved) 패널은 add 하이라이트. eq 는 평문.
        <div className="space-y-2 font-legal text-legal text-fg">
          {highlightedLines.map((lineOps, idx) => (
            <p key={idx}>
              {lineOps.length === 0 ? " " : lineOps.map((op, i) => renderWordDiffSpan(op, i, variant))}
            </p>
          ))}
          {trailingNote ? (
            <p className="mt-3 border-t border-line pt-2 text-xs text-fg-muted">
              {trailingNote}
            </p>
          ) : null}
        </div>
      ) : (
        <div className={variant === "deleted" ? "space-y-2 font-legal text-legal text-fg-muted line-through" : "space-y-2 font-legal text-legal text-fg"}>
          {lines.map((line, idx) => {
            const isModifiedAdd = variant === "modified" && addedLines?.includes(idx);
            const isMovedChanged = variant === "moved" && highlightAll;
            return (
              <p
                key={idx}
                className={
                  isModifiedAdd
                    ? "bg-change-modifiedPanel border-b-2 border-change-modifiedMark -mx-1 px-1 py-0.5 text-warning"
                    : isMovedChanged
                      // 이전 라운드 QA: 옅은 점선 하이라이트(대비 1.15:1)는 눈에 안 띔.
                      // 왼쪽 굵은 회색 띠 + 조밀한 점선 하단선으로 시각적 무게 강화.
                      ? "border-l-[3px] border-l-change-movedMark border-b-2 border-b-dashed border-b-change-movedMark bg-change-movedPanel -mx-1 pl-2 pr-1 py-0.5 text-info"
                      : ""
                }
              >
                {line}
              </p>
            );
          })}
          {trailingNote ? (
            <p className="mt-3 border-t border-line pt-2 text-xs text-fg-muted">
              {trailingNote}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

// 라운드 18 T1: 단어 단위 diff 스팬 렌더러. before 패널은 del 하이라이트 (취소선+배경),
// modified/moved 패널은 add 하이라이트 (배지 밑줄 배경).
function renderWordDiffSpan(op: WordDiffOp, key: number, variant: PanelProps["variant"]) {
  if (op.type === "eq") {
    return <span key={key}>{op.text}</span>;
  }
  if (op.type === "del") {
    return (
      <span
        key={key}
        className="bg-change-deletedPanel px-0.5 text-change-deletedText line-through decoration-[1.5px] decoration-change-deletedMark"
      >
        {op.text}
      </span>
    );
  }
  // add — modified vs moved 각기 다른 브랜드 톤으로 표시
  if (variant === "moved") {
    return (
      <span
        key={key}
        className="border-b-2 border-dashed border-change-movedMark bg-change-movedPanel px-0.5 text-change-movedText"
      >
        {op.text}
      </span>
    );
  }
  return (
    <span
      key={key}
      className="border-b-2 border-change-modifiedMark bg-change-modifiedPanel px-0.5 text-change-modifiedText"
    >
      {op.text}
    </span>
  );
}
