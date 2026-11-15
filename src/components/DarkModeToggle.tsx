"use client";

// 라운드 21: 다크 모드 스위치.
// - localStorage.theme = "dark" | "light" 우선
// - 없으면 prefers-color-scheme 시스템 설정
// - 클릭 시 <html class="dark"> 토글 + localStorage 저장

import { useEffect, useState } from "react";

type Mode = "light" | "dark";

function getInitialMode(): Mode {
  if (typeof window === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function DarkModeToggle() {
  const [mode, setMode] = useState<Mode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setMode(getInitialMode());
  }, []);

  function toggle() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    setMode(next);
    const el = document.documentElement;
    if (next === "dark") {
      el.classList.add("dark");
    } else {
      el.classList.remove("dark");
    }
    // 최초 페인트용 인라인 배경도 함께 갱신한다. 안 하면 다음 라우트 전환 때
    // 이전 테마 색이 잠깐 비친다.
    el.style.colorScheme = next;
    el.style.backgroundColor = next === "dark" ? "#111316" : "#F7F7F0";
    try {
      localStorage.setItem("theme", next);
    } catch { /* private mode 등 무시 */ }
  }

  // SSR 미스매치 방지 — 마운트 전에는 placeholder 로 자리만 잡음.
  if (!mounted) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-8 w-8 items-center justify-center border border-transparent"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mode === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={mode === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className="inline-flex h-8 w-8 items-center justify-center border border-transparent text-fg-secondary hover:text-fg hover:border-line transition-colors duration-swift ease-swift"
    >
      {mode === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

// Icon.tsx 확장 대신 인라인 (2개만 있고 다크모드 스위치 전용).
function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
