import Link from "next/link";
import { Badge } from "./ui";
import type { LawDetail } from "@/lib/types";
import type { RelatedInterpretation } from "@/lib/queries/interpretations";
import type { RelatedDecision } from "@/lib/queries/decisions";
import { DisclosureSummary } from "./ui/DisclosureSummary";

interface Props {
  law: LawDetail;
  sourceId: string;
  interpretations?: { items: RelatedInterpretation[]; total: number };
  decisions?: { items: RelatedDecision[]; total: number };
}

export function RightPanel({ law, sourceId, interpretations, decisions }: Props) {
  return (
    <>
      {/* xl 미만에서는 우측 레일이 통째로 사라져 개정 이력을 볼 방법이 없었다.
          (조문 목차와 같은 문제.) 좁은 화면에서는 접이식 섹션으로 내린다.
          JS 없이 동작하고 키보드로도 열린다. */}
      <details className="group mb-6 rounded-md border border-line bg-surface xl:hidden print-hide">
        <DisclosureSummary label="개정 이력" count={law.history.length} />
        <div className="border-t border-line px-4 py-3">
          <HistorySection law={law} sourceId={sourceId} />
        </div>
      </details>

      {interpretations && interpretations.total > 0 ? (
        <details className="group mb-6 rounded-md border border-line bg-surface xl:hidden print-hide">
          <DisclosureSummary label="관련 해석례" count={interpretations.total} />
          <div className="border-t border-line px-4 py-3">
            <InterpretationSection data={interpretations} />
          </div>
        </details>
      ) : null}

      {decisions && decisions.total > 0 ? (
        <details className="group mb-6 rounded-md border border-line bg-surface xl:hidden print-hide">
          <DisclosureSummary label="관련 결정문" count={decisions.total} />
          <div className="border-t border-line px-4 py-3">
            <DecisionSection data={decisions} />
          </div>
        </details>
      ) : null}

      <aside className="hidden w-[264px] shrink-0 xl:block print-hide">
        <div className="sticky top-[76px] space-y-8">
          <HistorySection law={law} sourceId={sourceId} />
          {interpretations && interpretations.total > 0 ? (
            <InterpretationSection data={interpretations} />
          ) : null}
          {decisions && decisions.total > 0 ? <DecisionSection data={decisions} /> : null}
          {/* 로그인 상태에서도 "로그인 후 사용" 문구가 뜨던 혼란 → "준비 중"으로 명확화. */}
          <DisabledSection title="내 메모" body="다음 업데이트에 추가됩니다. 이 개정에 대한 메모·주석을 남길 예정." />
          <DisabledSection title="체크리스트" body="다음 업데이트에 추가됩니다. 시행일 전 조치 항목 관리." />
          <DisabledSection title="리마인더" body="다음 업데이트에 추가됩니다. 시행일 7일 전 등 커스텀 알림 예약." />
        </div>
      </aside>
    </>
  );
}

// 법제처 유권해석. 조문만 봐서는 "우리 경우에 적용되나" 를 알 수 없는데,
// 해석례는 바로 그 질문에 답한 문서다. 법령 상세에서 한 번에 보이게 둔다.
function InterpretationSection({
  data,
}: {
  data: { items: RelatedInterpretation[]; total: number };
}) {
  return (
    <section>
      <SectionHeader title={`관련 해석례 ${data.total}`} />
      <ul className="space-y-3">
        {data.items.map((it) => (
          <li key={it.id}>
            <a
              href={it.officialUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-sm hover:bg-subtle"
            >
              {/* 안건명이 질문 전문이라 길다(80자 넘는 것이 흔하다). 264px
                  레일에서 그대로 풀면 한 건이 화면을 다 먹는다. 두 줄로 자르고
                  전문은 title 속성으로 남긴다. */}
              <p className="line-clamp-2 text-sm font-medium leading-snug text-fg" title={it.title}>
                {it.title}
              </p>
              {it.answerPreview ? (
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-fg-secondary">
                  {it.answerPreview}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-fg-muted tabular">
                {it.date}
                {it.agency ? ` · ${it.agency}` : ""}
              </p>
            </a>
          </li>
        ))}
      </ul>
      {data.total > data.items.length ? (
        <p className="mt-3 text-xs text-fg-muted">
          외 {data.total - data.items.length}건
        </p>
      ) : null}
    </section>
  );
}

// 개인정보위·공정위가 이 법령을 근거로 내린 결정. 해석례가 "어떻게 읽나" 라면
// 결정문은 "안 지키면 어떻게 되나" 에 해당한다.
function DecisionSection({
  data,
}: {
  data: { items: RelatedDecision[]; total: number };
}) {
  return (
    <section>
      <SectionHeader title={`관련 결정문 ${data.total}`} />
      <ul className="space-y-3">
        {data.items.map((it) => (
          <li key={it.id}>
            <a
              href={it.officialUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-sm hover:bg-subtle"
            >
              <p className="text-xs font-medium text-fg-muted">{it.sourceLabel}</p>
              <p className="line-clamp-2 text-sm font-medium leading-snug text-fg" title={it.title}>
                {it.title}
              </p>
              {it.preview ? (
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-fg-secondary">
                  {it.preview}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-fg-muted tabular">{it.date}</p>
            </a>
          </li>
        ))}
      </ul>
      {data.total > data.items.length ? (
        <p className="mt-3 text-xs text-fg-muted">외 {data.total - data.items.length}건</p>
      ) : null}
    </section>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <p className="mb-3 text-sm font-medium text-fg-secondary">{title}</p>;
}

function HistorySection({ law, sourceId }: { law: LawDetail; sourceId: string }) {
  if (law.history.length === 0) {
    return (
      <section>
        <SectionHeader title="개정 이력" />
        <p className="text-xs text-fg-secondary">이력 정보가 없습니다.</p>
      </section>
    );
  }
  return (
    <section>
      <SectionHeader title="개정 이력" />
      {/* 라운드 28-C: 사용자 지적 "■/□ 무슨 뜻인지 모름". 12px 원형 + 텍스트 라벨(현재/과거)
           + 다크 대비 개선(border 강화). isCurrent 는 채운 원 + 라벨. 다른 항목은 얇은 원. */}
      <ol className="flex flex-col">
        {law.history.map((item) => {
          const canLink = !!item.changeEventId;
          return (
            <li key={item.id} className="grid grid-cols-[16px_1fr] gap-3.5">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className={
                    item.isCurrent
                      ? "mt-[5px] h-[12px] w-[12px] rounded-full bg-primary ring-2 ring-primary/30"
                      : canLink
                        ? "mt-[6px] h-[10px] w-[10px] rounded-full border-2 border-line-strong bg-surface"
                        : "mt-[6px] h-[10px] w-[10px] rounded-full border border-line opacity-60"
                  }
                />
                <span className="flex-1 w-px bg-line" />
              </div>
              <div
                className={
                  "pb-5 " +
                  (item.isCurrent
                    ? "border-l-2 border-primary -ml-[14px] pl-3"
                    : canLink
                      ? ""
                      : "opacity-55")
                }
              >
                {canLink ? (
                  <Link
                    href={`/laws/${sourceId}?event=${item.changeEventId}`}
                    className="block hover:underline"
                  >
                    <div className="flex items-center gap-2">
                      <p className={`text-xs ${item.isCurrent ? "font-semibold text-fg" : "text-fg"}`}>
                        {item.date}
                      </p>
                      {item.isCurrent && (
                        <Badge tone="primary">현재</Badge>
                      )}
                    </div>
                    <p className={`mt-0.5 text-xs ${item.isCurrent ? "text-fg" : "text-fg-secondary"}`}>
                      {item.lawNumber} · {item.revisionType}
                    </p>
                  </Link>
                ) : (
                  <>
                    <p className="text-xs text-fg">{item.date}</p>
                    <p className="mt-0.5 text-xs text-fg-secondary">
                      {item.lawNumber} · {item.revisionType}
                    </p>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs text-fg-muted">위로 갈수록 최근입니다.</p>
    </section>
  );
}

function DisabledSection({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-sm font-medium text-fg-secondary">{title}</p>
        <Badge tone="neutral">준비 중</Badge>
      </div>
      <div className="rounded-md bg-subtle px-3 py-2.5">
        <p className="text-sm leading-relaxed text-fg-muted">{body}</p>
      </div>
    </section>
  );
}
