// 라운드 28-D: 산업별 진입 페이지.
// 사용자 지적: "산업별·부처별 법령 메뉴 이런것도 없고"
// 이미 seed 스크립트에 산업 매핑이 있는데 UI 로 노출 안 됐음. 이제 첫 진입 경험 개선.

import Link from "next/link";
import { IndustryIcon, industryIconFor } from "@/components/IndustryIcon";
import { PublicPageShell } from "@/components/PublicPageShell";
import { INDUSTRY_PRESETS } from "@/lib/laws/industryPresets";
import { Breadcrumb } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function IndustriesPage() {
  const industryList = INDUSTRY_PRESETS.filter((p) => p.category === "산업");
  const commonList = INDUSTRY_PRESETS.filter((p) => p.category === "공통");

  return (
    <PublicPageShell>
      <div className="flex flex-col">
        <header className="border-b border-line bg-surface px-8 pt-8 pb-6">
          {/* 공용 Breadcrumb 으로 합친다 — 따로 만들어 쓰는 바람에 모바일
              탭 영역 보정이 이 화면에만 안 먹었다. */}
          <Breadcrumb
            items={[
              { label: "홈", href: "/" },
              { label: "법령 탐색", href: "/laws" },
              { label: "산업별" },
            ]}
          />
          <div className="flex items-baseline gap-4">
            <h1 className="font-legal text-4xl font-bold tracking-title text-fg">
              산업별 관심 법령
            </h1>
            <span className="text-sm text-fg-secondary">{INDUSTRY_PRESETS.length}개 세트</span>
          </div>
          <p className="mt-3 text-base text-fg">
            우리 산업에 필요한 법령을 한 번에 시작하세요. 산업을 고르면 핵심 법령이
            목록으로 나오고, 원하는 것만 골라 한 번에 관심 등록할 수 있습니다.
          </p>
        </header>

        <section className="py-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-fg-muted">산업</h2>
          <div className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {industryList.map((preset) => (
              <IndustryCard key={preset.key} preset={preset} />
            ))}
          </div>

          <h2 className="mt-10 mb-4 text-sm font-semibold uppercase tracking-wider text-fg-muted">
            공통 (전 산업 공용)
          </h2>
          <div className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {commonList.map((preset) => (
              <IndustryCard key={preset.key} preset={preset} />
            ))}
          </div>

          <p className="mt-8 text-xs text-fg-secondary">
            산업별 목록은 실제 시행 중인 법령 이름을 기준으로 연결됩니다. 빠진 법령이 있으면 알려주시면 보완합니다.
          </p>
        </section>
      </div>
    </PublicPageShell>
  );
}

function IndustryCard({ preset }: { preset: (typeof INDUSTRY_PRESETS)[number] }) {
  return (
    <Link
      href={`/laws/industries/${preset.key}`}
      className="group flex flex-col justify-between bg-surface px-5 py-5 hover:bg-hover transition-colors duration-swift ease-swift"
    >
      <div>
        <div className="flex items-start gap-2.5">
          <IndustryIcon
            name={industryIconFor(preset.key)}
            size={20}
            className="mt-0.5 text-fg-muted group-hover:text-primary-text"
          />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h3 className="text-base font-medium text-fg">{preset.label}</h3>
              <span className="tabular text-sm text-fg-muted">
                {preset.laws.length}
              </span>
            </div>
            <p className="mt-1 text-sm text-fg-secondary">{preset.description}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 text-sm text-primary-text">관련 법령 보기 →</div>
    </Link>
  );
}
