// 라운드 28-D: 산업 프리셋 상세 페이지.
// 프리셋 이름 목록 → DB 매칭 → 사용자에 노출.

import { notFound } from "next/navigation";
import { PublicPageShell } from "@/components/PublicPageShell";
import { findIndustryPreset } from "@/lib/laws/industryPresets";
import { prisma } from "@/lib/prisma";
import { findDocumentsByTitles } from "@/lib/queries/lawSearch";
import { tryGetUserContext } from "@/lib/auth/session";
import { BulkWatchList } from "./BulkWatchList";
import { Breadcrumb } from "@/components/ui";

export const dynamic = "force-dynamic";

interface Props {
  params: { key: string };
}

export default async function IndustryDetailPage({ params }: Props) {
  const preset = findIndustryPreset(params.key);
  if (!preset) notFound();

  const ctx = await tryGetUserContext();

  // 프리셋 이름을 DB 에서 찾는다. 예전에는 currentTitle 완전일치였는데,
  // 프리셋은 가운뎃점을 라틴 中點(·)으로 적고 법제처는 한글 가운뎃점(ㆍ)을
  // 쓴다. 눈으로는 같은 글자라 아무도 못 알아챈 채로 9건이 "확인 불가" 로
  // 나오고 있었다. 검색과 같은 정규화 매칭을 쓴다.
  const rowByTitle = await findDocumentsByTitles(preset.laws);
  const rows = [...rowByTitle.values()];

  // 사용자의 기존 Watch 목록 (선택 상태 계산에 필요)
  let watchedDocIds: Set<string> = new Set();
  if (ctx) {
    const watches = await prisma.watch.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        status: "ACTIVE",
        archivedAt: null,
        documentId: { in: rows.map((r) => r.id) },
      },
      select: { documentId: true },
    });
    watchedDocIds = new Set(watches.map((w) => w.documentId));
  }

  const items = preset.laws.map((presetTitle) => {
    const row = rowByTitle.get(presetTitle);
    return {
      documentId: row?.id ?? null,
      sourceId: row?.externalDocumentId ?? null,
      title: row?.currentTitle ?? presetTitle,
      presetTitle,
      documentType: row?.documentType ?? null,
      agencyName: row?.currentAgencyName ?? null,
      matched: !!row,
      alreadyWatched: row ? watchedDocIds.has(row.id) : false,
    };
  });

  const matchedCount = items.filter((it) => it.matched).length;
  const alreadyCount = items.filter((it) => it.alreadyWatched).length;

  return (
    <PublicPageShell>
      <div className="flex flex-col">
        <header className="border-b border-line bg-surface px-8 pt-8 pb-6">
          {/* breadcrumb 을 여기서 따로 만들어 쓰다 보니 공용 컴포넌트에 넣은
              모바일 탭 영역 보정이 이 화면에는 안 먹었다(390px 실측 31×18).
              구현을 하나로 합친다. */}
          <Breadcrumb
            items={[
              { label: "법령 탐색", href: "/laws" },
              { label: "산업별", href: "/laws/industries" },
              { label: preset.label },
            ]}
          />
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-3xl font-semibold text-fg">{preset.label}</h1>
            <span className="border border-line bg-subtle px-2.5 py-1 text-xs font-semibold text-fg-secondary">
              {preset.category}
            </span>
          </div>
          <p className="mt-3 text-base text-fg">{preset.description}</p>
          <p className="mt-2 text-xs text-fg-secondary">
            관련 법령 {preset.laws.length}개 · 지금 확인 가능 {matchedCount}개
            {ctx ? ` · 이미 등록됨 ${alreadyCount}개` : ""}
          </p>
        </header>

        <section className="py-2">
          <BulkWatchList
            items={items}
            isAuthed={!!ctx}
            loginHref={`/login?next=${encodeURIComponent(`/laws/industries/${preset.key}`)}`}
          />
          <p className="mt-6 text-xs text-fg-secondary">
            시행령·시행규칙 등 파생 법령은 이 목록에 포함되지 않습니다. 필요한 파생본은 각 법령 상세 페이지에서 개별 관심 등록하세요.
          </p>
        </section>
      </div>
    </PublicPageShell>
  );
}
