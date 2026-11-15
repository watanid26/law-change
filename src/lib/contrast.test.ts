import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 텍스트 대비 회귀 방지 (WCAG 2.1 AA · 일반 텍스트 4.5:1).
//
// R33 감사에서 다크 fg-muted 가 4.28:1 로 미달인 게 실측으로 잡혔다.
// 같은 방법으로 라이트도 재보니 2.76:1 로 더 나빴다 — 눈으로 훑는 검수로는
// 계속 놓치는 축이라, globals.css 의 값에서 직접 계산해 CI 에서 막는다.

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** `--name: R G B;` 형태의 토큰을 블록에서 읽는다. */
function tokens(selector: string): Record<string, [number, number, number]> {
  const start = CSS.indexOf(selector);
  const open = CSS.indexOf("{", start);
  const end = CSS.indexOf("\n}", open);
  const block = CSS.slice(open, end);
  const out: Record<string, [number, number, number]> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/gi)) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// 텍스트 토큰 × 그 위에 실제로 얹히는 배경 토큰.
// fg-disabled 는 WCAG 상 비활성 UI 라 대비 기준 면제 대상이므로 제외한다.
const TEXT = ["fg", "fg-secondary", "fg-muted"];
const BACKGROUNDS = ["canvas", "surface", "subtle", "hover"];

describe.each([
  ["라이트", ":root {"],
  ["다크", ".dark {"],
])("%s 모드 텍스트 대비 (AA 4.5:1)", (_label, selector) => {
  const t = tokens(selector);

  it.each(TEXT)("%s 는 모든 배경 위에서 4.5:1 이상", (fg) => {
    const fails: string[] = [];
    for (const bg of BACKGROUNDS) {
      if (!t[fg] || !t[bg]) continue;
      const r = ratio(t[fg], t[bg]);
      if (r < 4.5) fails.push(`${fg} on ${bg} = ${r.toFixed(2)}:1`);
    }
    expect(fails, `\n  ${fails.join("\n  ")}\n`).toEqual([]);
  });
});

describe("semantic 색 텍스트 대비", () => {
  it.each([
    ["라이트", ":root {"],
    ["다크", ".dark {"],
  ])("%s: success/warning/danger/info 는 각자 subtle 배경 위에서 4.5:1 이상", (_l, selector) => {
    const t = tokens(selector);
    const fails: string[] = [];
    for (const name of ["success", "warning", "danger", "info"]) {
      const fg = t[name];
      const bg = t[`${name}-subtle`];
      if (!fg || !bg) continue;
      const r = ratio(fg, bg);
      if (r < 4.5) fails.push(`${name} on ${name}-subtle = ${r.toFixed(2)}:1`);
    }
    expect(fails, `\n  ${fails.join("\n  ")}\n`).toEqual([]);
  });
});

describe("서명 색면 위 글자", () => {
  // 화면당 한 곳뿐이라 눈으로 훑다 놓치기 쉽다. 짙은 면 위 네 가지 글자색을
  // 전부 계산해서 막는다. 인쇄 블록은 흰 면으로 뒤집히므로 같이 검사한다.
  it.each([
    ["라이트", ":root {"],
    ["다크", ".dark {"],
    ["인쇄", "@media print"],
  ])("%s: 라벨·숫자·힌트·강조가 서명 면 위에서 4.5:1 이상", (_l, selector) => {
    const t = tokens(selector);
    const bg = t["signature"];
    expect(bg, `${selector} 에 --signature 토큰이 없다`).toBeDefined();
    const fails: string[] = [];
    for (const name of ["signature-fg", "signature-label", "signature-muted", "signature-accent"]) {
      const fg = t[name];
      if (!fg) { fails.push(`${name} 토큰 없음`); continue; }
      const r = ratio(fg, bg);
      if (r < 4.5) fails.push(`${name} on signature = ${r.toFixed(2)}:1`);
    }
    expect(fails, `\n  ${fails.join("\n  ")}\n`).toEqual([]);
  });

  it("서명 면은 캔버스와 구별된다 — 얹힌 면으로 읽혀야 한다", () => {
    for (const [label, selector] of [["라이트", ":root {"], ["다크", ".dark {"]] as const) {
      const t = tokens(selector);
      const r = ratio(t["signature"], t["canvas"]);
      // 현재 surface/canvas 대비가 약 1.2 다. 그보다는 뚜렷해야 한다.
      expect(r, `${label}: signature/canvas = ${r.toFixed(2)}`).toBeGreaterThan(1.3);
    }
  });
});

describe("primary 면 위 글자", () => {
  it("primary-fg 는 primary 배경 위에서 4.5:1 이상 (라이트·다크 공통)", () => {
    const fails: string[] = [];
    for (const [label, selector] of [
      ["라이트", ":root {"],
      ["다크", ".dark {"],
    ] as const) {
      const root = tokens(":root {");
      const t = tokens(selector);
      // primary-fg 는 다크에서 재정의될 수도, :root 값을 상속할 수도 있다.
      const fg = t["primary-fg"] ?? root["primary-fg"];
      const bg = t["primary"] ?? root["primary"];
      const r = ratio(fg, bg);
      if (r < 4.5) fails.push(`${label}: primary-fg on primary = ${r.toFixed(2)}:1`);
    }
    expect(fails, `\n  ${fails.join("\n  ")}\n`).toEqual([]);
  });
});
