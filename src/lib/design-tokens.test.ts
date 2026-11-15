import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { eventTypeLabel } from "./style";
import { maskEmail } from "./pii";

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const TW = readFileSync(join(process.cwd(), "tailwind.config.ts"), "utf8");

function varsIn(block: string): Set<string> {
  return new Set([...block.matchAll(/^\s*(--[a-z0-9-]+):/gim)].map((m) => m[1]));
}

function blockAfter(selector: string): string {
  const start = CSS.indexOf(selector);
  expect(start, `${selector} 블록을 찾지 못함`).toBeGreaterThan(-1);
  const open = CSS.indexOf("{", start);
  const end = CSS.indexOf("\n}", open);
  return CSS.slice(open, end);
}

describe("다크모드 토큰 이식 누락 방지", () => {
  // 라운드 31 회귀 방지. 캘린더 오늘 셀 · 관심등록 배너 · 드롭다운 선택행이
  // 다크에서 크림색으로 남았던 원인은 전부 "라이트에만 정의된 변수".
  it(":root 에 정의된 팔레트 변수는 .dark 에도 정의돼 있다", () => {
    const light = varsIn(blockAfter(":root {"));
    const dark = varsIn(blockAfter(".dark {"));

    // 의도적으로 flip 하지 않는 변수는 여기 등록하고 이유를 남긴다.
    const INTENTIONALLY_SHARED = new Set([
      // 폰트 스택은 테마와 무관하다. 다크에서 다른 서체를 쓰지 않는다.
      "--font-legal",
    ]);

    const missing = [...light].filter(
      (v) => !dark.has(v) && !INTENTIONALLY_SHARED.has(v),
    );
    expect(missing, `다크 정의 누락: ${missing.join(", ")}`).toEqual([]);
  });

  it("팔레트 색상은 tailwind.config 에 hex 로 박혀 있지 않다", () => {
    // 제3판: 모든 색은 CSS 변수 참조여야 한다. 고정 hex 가 하나라도 돌아오면
    // 다크모드에서 그 자리만 밝은 사각형으로 남는다 (제2판의 반복 실패 지점).
    // colors 블록 안에 raw hex 가 남아 있으면 안 된다.
    // (tailwind.config 는 v("canvas") 헬퍼로 rgb(var(--canvas)) 를 만든다.)
    const colorsBlock = TW.slice(TW.indexOf("colors: {"), TW.indexOf("borderRadius: {"));
    const hexes = colorsBlock.match(/#[0-9A-Fa-f]{3,8}/g) ?? [];
    expect(hexes, `colors 에 남은 raw hex: ${hexes.join(", ")}`).toEqual([]);

    // 화면에서 실제로 쓰는 핵심 토큰이 :root 에 정의돼 있어야 한다.
    const light = varsIn(blockAfter(":root {"));
    for (const token of [
      "--canvas",
      "--surface",
      "--hover",
      "--selected",
      "--primary",
      "--danger",
      // 4 변경타입은 mark/text/panel 세 축이 모두 있어야 한다.
      // 하나라도 빠지면 "색만으로 구분" 으로 되돌아간다.
      "--change-added-mark",
      "--change-added-text",
      "--change-added-panel",
      "--change-moved-mark",
    ]) {
      expect(light.has(token), `${token} 이 :root 에 없음`).toBe(true);
    }
  });

  it("인쇄 팔레트가 현행 토큰 이름을 따라간다", () => {
    // @media print 는 다크모드에서도 라이트 값을 강제하는데, 토큰 이름이
    // 바뀔 때 이 블록만 갱신을 놓치기 쉽다. 실제로 제4판 전환 때 이 블록이
    // 제3판의 --diff-* 를 들고 있어서, 다크모드로 인쇄하면 조문 패널이
    // 검게 나오고 있었다 (감사 제출용 출력물이라 치명적).
    const start = CSS.indexOf("@media print");
    expect(start, "@media print 블록이 없음").toBeGreaterThan(-1);
    const block = CSS.slice(start);

    for (const t of [
      "--change-added-panel",
      "--change-modified-panel",
      "--change-deleted-panel",
      "--change-moved-panel",
    ]) {
      expect(block, `인쇄 블록에 ${t} 가 없음`).toContain(t);
    }
    // 존재하지 않는 토큰을 재정의하고 있으면 그건 갱신 누락이다.
    const declared = [...block.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]);
    const known = new Set(
      [...CSS.slice(0, start).matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]),
    );
    const orphans = declared.filter((d) => !known.has(d));
    expect(orphans, `인쇄 블록이 없는 토큰을 재정의함: ${orphans.join(", ")}`).toEqual([]);
  });

  it("shade 번호 팔레트가 되살아나지 않는다", () => {
    // 제4판은 명조와 올리브를 되살렸지만 "역할" 로만 노출한다.
    // olive-50 / accent-500 처럼 컴포넌트가 shade 번호를 직접 고르던 방식이
    // 다크모드 이식 누락과 화면별 색 불일치의 원인이었으므로 그건 막는다.
    for (const dead of ["--paper-", "--ink-", "--olive-", "--accent-50", "--seal-"]) {
      expect(CSS, `globals.css 에 "${dead}" 가 남아 있음`).not.toContain(dead);
      expect(TW, `tailwind.config 에 "${dead}" 가 남아 있음`).not.toContain(dead);
    }
  });

  it("두 목소리 타이포가 살아 있다", () => {
    // 제3판은 명조를 폐기하고 serif 를 sans 로 강제했다. 제4판은 그 규칙을
    // 폐기하고 명조를 "법령의 목소리" 로 되살렸다. 다시 지워지면 실패.
    const LAYOUT = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(LAYOUT, "명조가 next/font 로 로드되지 않음").toContain("Nanum_Myeongjo");
    expect(LAYOUT, "폰트 CSS 변수가 <html> 에 붙지 않음").toContain(
      "--font-nanum-myeongjo",
    );
    expect(CSS, "--font-legal 이 정의되지 않음").toContain("--font-legal");
    expect(TW, "tailwind 에 legal 폰트 패밀리가 없음").toContain("legal:");
    expect(
      TW.includes("var(--font-nanum-myeongjo)"),
      "tailwind 가 next/font 변수를 참조하지 않음",
    ).toBe(true);
  });

  it("법령 서체가 숫자까지 덮는다", () => {
    // 조문 번호는 전부 숫자다("제101조", "제28조의4제3항"). latin 서브셋을
    // 빼면 숫자에 매칭되는 @font-face 가 없어 번호만 폴백 고딕으로 빠진다.
    // 법령 도메인에서는 본문의 핵심이 통째로 다른 서체가 되는 것이라 치명적.
    const LAYOUT = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    const block = LAYOUT.slice(
      LAYOUT.indexOf("Nanum_Myeongjo({"),
      LAYOUT.indexOf("});", LAYOUT.indexOf("Nanum_Myeongjo({")),
    );
    expect(block, "latin 서브셋이 빠져 숫자가 폴백된다").toContain('"latin"');
    // preload:true 는 한글 서브셋 92개까지 eager 로 받아 링크 93개가 나간다
    // (실측). 대역폭을 다투느라 정작 필요한 조각이 늦어진다.
    expect(block, "preload 를 켜면 폰트 93개가 eager 로 나간다").toContain(
      "preload: false",
    );
  });

  it("웹폰트를 CSS @import 로 부르지 않는다", () => {
    // Google Fonts CSS2 URL 은 `wght@400;700;800` 처럼 세미콜론을 담는데,
    // CSS 파서가 그 세미콜론을 @import 문의 종결로 읽어 URL 이 잘린다.
    // 실제로 이 버그로 명조가 한 번도 로드되지 않은 채 배포됐다
    // (사용성 평가에서 document.fonts 로 발견). next/font 를 쓴다.
    expect(
      CSS.includes("fonts.googleapis.com"),
      "globals.css 가 Google Fonts 를 @import 하고 있다 — URL 이 잘릴 수 있다",
    ).toBe(false);
  });
});

describe("eventTypeLabel", () => {
  it("DB enum 을 한글로 옮긴다", () => {
    expect(eventTypeLabel("REVISION")).toBe("개정");
    expect(eventTypeLabel("FIRST_ISSUE")).toBe("제정");
    expect(eventTypeLabel("REPEAL")).toBe("폐지");
  });

  it("모르는 값은 원문 그대로 (화면이 비지 않게)", () => {
    expect(eventTypeLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(eventTypeLabel(null)).toBe("");
  });
});

describe("maskEmail", () => {
  it("로컬파트 앞 3자만 남긴다", () => {
    expect(maskEmail("hong.gildong@example.com")).toBe("hon*********@example.com");
  });

  it("짧은 로컬파트도 최소 1자는 가린다", () => {
    expect(maskEmail("ab@x.com")).toBe("ab*@x.com");
  });

  it("빈 값은 대체 문구", () => {
    expect(maskEmail(null)).toBe("이 계정");
  });
});
