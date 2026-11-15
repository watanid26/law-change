"use client";

// 고르면 바로 적용되는 <select>.
//
// 지금까지 정렬·필터 드롭다운은 옵션을 골라도 목록이 그대로였고, 옆의 "검색" ·
// "필터 적용" 버튼을 따로 눌러야 반영됐다. 화면 어디에도 그렇게 하라는 안내가
// 없어서 "선택이 안 먹힌다" 로 읽혔다. JS 가 없으면 예전처럼 버튼으로 제출된다.

import { fieldClass, cx } from "./styles";

export function AutoSubmitSelect({
  className,
  children,
  onChange,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      // "필터 초기화" 를 눌러 목록과 URL 은 전체로 돌아왔는데 드롭다운만
      // "낮음" 인 채 남는 문제. defaultValue 는 uncontrolled 라 클라이언트
      // 내비게이션으로 같은 DOM 노드가 재사용되면 다시 적용되지 않는다.
      // 기본값이 바뀌면 key 를 바꿔 새로 마운트시킨다.
      key={String(rest.defaultValue ?? "")}
      {...rest}
      onChange={(e) => {
        onChange?.(e);
        if (!e.defaultPrevented) e.currentTarget.form?.requestSubmit();
      }}
      className={fieldClass({ className: cx("select-field w-auto", className) })}
    >
      {children}
    </select>
  );
}
