import type { Config } from "tailwindcss";

// LawChange 디자인 시스템 제4판 — 조각 시스템 (C안).
//
// 색은 전부 semantic 이름으로만 노출한다. shade 번호(olive-50, accent-500 …)를
// 컴포넌트가 직접 고르던 방식이 다크모드 이식 누락과 화면별 색 불일치의 원인이라
// 여기서는 "역할"만 제공한다. 실제 값은 globals.css 의 CSS 변수.
//
// 제3판과의 차이: 명조(font-legal)를 되살리고, primary 를 올리브로,
// radius 상한을 6px 로 내렸다. 4 변경타입은 mark/text/panel 세 축으로 나눴다 —
// C안이 준 원색은 마커로는 좋지만 라이트에서 글자로 쓰면 AA 미달이기 때문.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // 12 / 13 / 14 / 16 / 18 / 20 / 24 / 28 로 제한한 스케일.
      // 10px·11px·11.5px·12.5px 같은 값은 더 이상 만들지 않는다.
      fontSize: {
        xs: ["12px", { lineHeight: "1.5" }],       // 캡션 · 메타 · 표 헤더
        sm: ["13px", { lineHeight: "1.55" }],      // 보조 텍스트
        base: ["14px", { lineHeight: "1.6" }],     // 본문 (기본)
        // 법령의 목소리 전용 크기. 법문·법령명은 고딕 본문보다 크게 잡아야
        // 명조가 눌리지 않는다. 15px 였는데 그 크기에서는 세리프가 1~2px 라
        // "다른 목소리"로 안 읽힌다는 지적을 받아 16px 로 올렸다.
        legal: ["16px", { lineHeight: "1.95" }],
        lg: ["16px", { lineHeight: "1.5" }],       // 섹션 제목
        xl: ["18px", { lineHeight: "1.45", letterSpacing: "-0.005em" }],  // 큰 섹션 제목
        "2xl": ["20px", { lineHeight: "1.4", letterSpacing: "-0.01em" }],
        "3xl": ["24px", { lineHeight: "1.3", letterSpacing: "-0.015em" }],
        "4xl": ["28px", { lineHeight: "1.25", letterSpacing: "-0.018em" }], // 페이지 제목
      },
      fontFamily: {
        // 도구의 목소리 — 내비·버튼·필터·상태·메타·표·날짜·카운트.
        sans: [
          '"Pretendard Variable"',
          "Pretendard",
          '"Nanum Gothic"',
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          "sans-serif",
        ],
        // 법령의 목소리 — 법령명·조문 제목·법문·인용·랜딩 표제.
        // `font-legal` 로 쓴다. serif 는 하위호환 별칭.
        legal: [
          "var(--font-nanum-myeongjo)",
          '"Nanum Myeongjo"',
          '"Noto Serif KR"',
          "ui-serif",
          "Georgia",
          "serif",
        ],
        serif: [
          "var(--font-nanum-myeongjo)",
          '"Nanum Myeongjo"',
          '"Noto Serif KR"',
          "ui-serif",
          "Georgia",
          "serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          '"SF Mono"',
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        subtle: v("subtle"),
        hover: v("hover"),
        selected: v("selected"),

        fg: {
          DEFAULT: v("fg"),
          secondary: v("fg-secondary"),
          muted: v("fg-muted"),
          disabled: v("fg-disabled"),
        },

        // border-line / border-line-strong. "border-border" 보다 읽기 쉽다.
        line: {
          DEFAULT: v("line"),
          strong: v("line-strong"),
        },

        primary: {
          DEFAULT: v("primary"),
          hover: v("primary-hover"),
          active: v("primary-active"),
          subtle: v("primary-subtle"),
          fg: v("primary-fg"),
          text: v("primary-text"),
        },

        // 서명 색면 — 화면당 한 곳만. globals.css 주석 참고.
        signature: {
          DEFAULT: v("signature"),
          line: v("signature-line"),
          fg: v("signature-fg"),
          label: v("signature-label"),
          muted: v("signature-muted"),
          accent: v("signature-accent"),
        },

        success: { DEFAULT: v("success"), subtle: v("success-subtle") },
        warning: { DEFAULT: v("warning"), subtle: v("warning-subtle") },
        danger: { DEFAULT: v("danger"), subtle: v("danger-subtle") },
        info: { DEFAULT: v("info"), subtle: v("info-subtle") },

        // 브랜드 액센트 — 마커·테두리·일러스트 전용. 본문 글자로 쓰지 않는다.
        amber: v("amber"),
        terracotta: v("terracotta"),

        // 4 변경타입 — 축을 셋으로 나눈다.
        //   mark  : 글리프 · 좌측 바 · 테두리 (비텍스트라 3:1 기준)
        //   text  : 글자 (AA 4.5:1 이상. C안 원색은 여기 쓸 수 없다)
        //   panel : 블록 배경
        // 색만으로 구분하지 않는다 — 기호(+ ~ − ↔)와 형태 단서를 항상 함께 쓴다.
        change: {
          addedMark: v("change-added-mark"),
          addedText: v("change-added-text"),
          addedPanel: v("change-added-panel"),
          modifiedMark: v("change-modified-mark"),
          modifiedText: v("change-modified-text"),
          modifiedPanel: v("change-modified-panel"),
          deletedMark: v("change-deleted-mark"),
          deletedText: v("change-deleted-text"),
          deletedPanel: v("change-deleted-panel"),
          movedMark: v("change-moved-mark"),
          movedText: v("change-moved-text"),
          movedPanel: v("change-moved-panel"),
        },
      },
      // 조각은 블록이지 카드가 아니다. 상한 6px.
      // pill(full)은 아바타·점 같은 원형에만 남긴다 — 배지는 pill 금지.
      borderRadius: {
        none: "0",
        sm: "2px",
        DEFAULT: "3px",
        md: "4px",
        lg: "6px",
        xl: "6px",
        "2xl": "6px",
        full: "9999px",
      },
      boxShadow: {
        // 떠 있는 것에만. 일반 패널은 border 또는 배경 차이로만 구분한다.
        dropdown: "0 4px 12px -2px rgb(16 18 22 / 0.10), 0 0 0 1px rgb(16 18 22 / 0.04)",
        popover: "0 8px 24px -4px rgb(16 18 22 / 0.12), 0 0 0 1px rgb(16 18 22 / 0.05)",
        modal: "0 16px 48px -8px rgb(16 18 22 / 0.20), 0 0 0 1px rgb(16 18 22 / 0.06)",
        none: "none",
      },
      transitionDuration: {
        swift: "140ms",
        base: "180ms",
        slow: "220ms",
      },
      transitionTimingFunction: {
        swift: "cubic-bezier(0.4, 0, 0.2, 1)",
        gentle: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      spacing: {
        // shell 치수. 여러 파일에서 반복되므로 토큰화.
        sidebar: "240px",
        header: "60px",
      },
      maxWidth: {
        content: "1440px",  // main content 상한
        reading: "60rem",   // 조문 본문 읽기 폭
      },
      letterSpacing: {
        title: "-0.018em",
        subtitle: "-0.01em",
      },
    },
  },
  plugins: [],
};
export default config;
