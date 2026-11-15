// main 영역 규격. 페이지 outer padding 과 최대 폭을 한 곳에서만 정한다.
// mobile 16 / tablet 24 / desktop 32 / large 40.
export function AppShellFrame({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main-content"
      // 스킵 링크의 착지점. tabIndex -1 이라야 링크로 이동했을 때 실제로
      // 포커스를 받는다(그냥 앵커만 두면 스크롤만 되고 포커스는 안 옮겨간다).
      tabIndex={-1}
      className="mx-auto w-full max-w-content px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8 xl:px-10"
    >
      {children}
    </main>
  );
}
