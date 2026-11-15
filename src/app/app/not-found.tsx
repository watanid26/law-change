// /app/* 안에서 notFound() 가 불렸을 때 (없는 업무 id, 없는 관심 법령 등).
// 이건 세그먼트 레이아웃을 타므로 사이드바가 그대로 남는다 — 사용자는
// 화면을 잃지 않고 옆 메뉴로 바로 옮겨갈 수 있다.

import { ButtonLink, EmptyState, Panel } from "@/components/ui";

export default function AppNotFound() {
  return (
    <Panel>
      <EmptyState
        icon="search"
        title="찾을 수 없는 항목입니다"
        description="삭제되었거나 다른 워크스페이스의 항목일 수 있습니다."
        action={
          <ButtonLink href="/app" variant="secondary" size="sm">
            대시보드로
          </ButtonLink>
        }
      />
    </Panel>
  );
}
