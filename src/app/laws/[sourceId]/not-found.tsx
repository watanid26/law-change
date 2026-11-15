import type { Metadata } from "next";
import { PublicPageShell } from "@/components/PublicPageShell";
import { ButtonLink, EmptyState, Panel } from "@/components/ui";

// sitemap 에 법령 URL 9,000여 개를 올려 두었고 robots 가 /laws/* 색인을
// 허용한다. 그런데 없는 sourceId 로 접근하면 Next 가 이 화면을 그리면서도
// HTTP 200 을 반환한다(App Router + force-dynamic 스트리밍 특성).
// 검색엔진에는 soft 404 로 보여 색인 품질이 떨어지므로 noindex 로 막는다.
export const metadata: Metadata = {
  title: "법령을 찾을 수 없습니다",
  robots: { index: false, follow: false },
};

export default function LawNotFound() {
  return (
    <PublicPageShell>
      <div className="mx-auto max-w-lg py-10">
        <Panel>
          <EmptyState
            icon="search"
            title="문서를 찾을 수 없습니다"
            description="해당 ID에 대응하는 법령이 아직 수집되지 않았거나, 잘못된 주소일 수 있습니다."
            action={
              <ButtonLink href="/laws" variant="primary" size="sm">
                법령 탐색으로
              </ButtonLink>
            }
          />
        </Panel>
      </div>
    </PublicPageShell>
  );
}
