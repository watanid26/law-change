"use client";

// 같은 pathname에서 ?event=xxx 만 바꾸는 이동은 Next 14 <Link>가
// 라우터 캐시 히트로 no-op 처리하는 경우가 있다.
// router.push + router.refresh 조합으로 강제 재렌더.

import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface Props {
  href: string;
  className?: string;
  children: React.ReactNode;
}

export function EventNavLink({ href, className, children }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <a
      href={href}
      onClick={(e) => {
        // 좌클릭이 아니거나 modifier가 눌린 경우는 브라우저 기본 동작(새 탭 등)에 위임
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        startTransition(() => {
          router.push(href);
          router.refresh();
        });
      }}
      className={className}
      aria-busy={pending}
    >
      {children}
    </a>
  );
}
