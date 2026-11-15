"use client";

// 캘린더 구독 URL 복사 UI.
//
// 이 URL 하나를 구글 캘린더·아웃룩에 등록하면 관심 법령의 시행일이 자동으로
// 들어간다. 앱을 열지 않아도 되는 게 핵심이라, 안내 문구도 그 점을 말한다.

import { useState } from "react";
import { Icon } from "./Icon";
import { Button } from "./ui";

export function CalendarSubscribe({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한이 없으면 사용자가 직접 선택해 복사할 수 있게 둔다.
      setCopied(false);
    }
  }

  return (
    <div className="rounded-md border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Icon name="calendar" size={18} className="mt-0.5 text-fg-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-fg">캘린더에 구독하기</p>
          <p className="mt-1 text-sm text-fg-secondary">
            아래 주소를 구글 캘린더 <span className="text-fg">URL로 추가</span> 또는
            아웃룩 <span className="text-fg">인터넷 캘린더 구독</span>에 넣으면,
            관심 법령의 시행일과 검토 예정일이 자동으로 들어옵니다. 관심을 해제하면
            일정도 사라집니다.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="캘린더 구독 주소"
              className="h-10 w-full min-w-0 flex-1 rounded-md border border-line-strong bg-subtle px-3 text-sm text-fg-secondary focus:border-primary focus:outline-none"
            />
            <Button type="button" variant="secondary" onClick={copy}>
              {copied ? (
                <>
                  <Icon name="check" size={15} />
                  복사됨
                </>
              ) : (
                "주소 복사"
              )}
            </Button>
          </div>

          <p className="mt-2 text-xs text-fg-muted">
            이 주소를 가진 사람은 워크스페이스 일정을 볼 수 있습니다. 팀 공용
            캘린더에 등록하는 용도로는 편하지만, 외부에 공유하지 마세요.
          </p>
        </div>
      </div>
    </div>
  );
}
