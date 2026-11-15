// 평가에서 반복해서 되돌아온 것들을 소스 수준에서 못박는다.
//
// 같은 지적이 회차마다 다시 올라오고, 그때마다 실제 브라우저를 띄워
// 반증하는 데 시간이 든다. 눈으로만 확인 가능한 것(대비·인쇄·반응형)은
// 어쩔 수 없지만, 마크업과 문구는 여기서 잡을 수 있다.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INDUSTRY_PRESETS } from "./laws/industryPresets";
import { normalizeQuery } from "./queries/titleNormalize";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}
/** 주석을 지운 소스. 주석에 남긴 "예전에 이렇게 적혀 있었다" 설명이
 *  검사에 걸리면 안 된다. */
function stripComments(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "") // JSX 주석
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}
const FILES = walk(SRC).map((f) => ({
  path: f,
  text: stripComments(readFileSync(f, "utf8")),
}));

describe("키보드 접근성", () => {
  const shell = readFileSync(join(SRC, "components/shell/AppShell.tsx"), "utf8");
  const frame = readFileSync(join(SRC, "components/shell/AppShellFrame.tsx"), "utf8");

  it("본문 바로가기 링크가 있다", () => {
    // 라우트를 옮길 때마다 포커스가 <body> 로 돌아가서, 이게 없으면 매번
    // 사이드바 항목 전부를 Tab 으로 지나야 한다.
    expect(shell).toContain('href="#main-content"');
    expect(shell).toMatch(/sr-only[^"]*focus:not-sr-only/);
  });

  it("스킵 링크가 사이드바보다 먼저 온다 — 첫 Tab 에 잡혀야 한다", () => {
    // import 문이 아니라 실제 렌더 위치와 비교한다.
    expect(shell.indexOf('href="#main-content"')).toBeLessThan(shell.indexOf("<SidebarNav"));
  });

  it("착지점이 실제로 포커스를 받는다", () => {
    // 앵커만 두면 스크롤만 되고 포커스는 안 옮겨간다.
    expect(frame).toContain('id="main-content"');
    expect(frame).toMatch(/tabIndex=\{-1\}/);
  });
});

describe("변경 요약 문구", () => {
  it("목록에서 '개 조항 변경' 문자열을 직접 만들지 않는다", () => {
    // 최초 수집은 비교 대상이 없어 변경 카드가 0개다. 그런데도 "12개 조항
    // 변경" 이라고 쓰면 눌렀을 때 빈 화면을 만난다(실측 15,402건).
    // 판정을 한 곳에 모아 뒀으니 화면에서 직접 조립하면 안 된다.
    const offenders = FILES.filter(
      (f) =>
        !f.path.endsWith("changeSummary.ts") &&
        /개 조항 변경/.test(f.text) &&
        /\$\{[^}]*\}개 조항 변경|개 조항 변경`/.test(f.text),
    );
    expect(offenders.map((f) => f.path.replace(SRC, "src"))).toEqual([]);
  });
});

describe("산업별 프리셋", () => {
  it("key 가 겹치지 않는다", () => {
    const keys = INDUSTRY_PRESETS.map((p) => p.key);
    expect(keys).toEqual([...new Set(keys)]);
  });

  it("빈 프리셋이 없다", () => {
    for (const p of INDUSTRY_PRESETS) {
      expect(p.laws.length, p.key).toBeGreaterThan(0);
      expect(p.label.trim(), p.key).not.toBe("");
    }
  });

  it("한 프리셋 안에 같은 법령이 두 번 들어가지 않는다", () => {
    for (const p of INDUSTRY_PRESETS) {
      // 표기만 다른 중복도 잡는다 (가운뎃점 · vs ㆍ)
      const norm = p.laws.map(normalizeQuery);
      expect(norm.length, `${p.key}: ${p.laws.join(", ")}`).toBe(new Set(norm).size);
    }
  });

  it("법령명에 앞뒤 공백이 없다", () => {
    for (const p of INDUSTRY_PRESETS) {
      for (const law of p.laws) expect(law, p.key).toBe(law.trim());
    }
  });
});

describe("사실과 다른 문구가 되살아나지 않는다", () => {
  it("조문 없는 문서를 '수집되지 않았다' 고 하지 않는다", () => {
    // 실측 628건은 수집 실패가 아니라 애초에 조·항 구조가 없는 문서다.
    // 기다려도 생기지 않으므로 "잠시 뒤 다시" 는 거짓말이다.
    const offenders = FILES.filter((f) => /조문 본문이 수집되지 않았습니다/.test(f.text));
    expect(offenders.map((f) => f.path.replace(SRC, "src"))).toEqual([]);
  });

  it("요약 발송을 '지원하지 않는다' 고 하지 않는다", () => {
    // runDigestBatch 가 매일 크론에서 실제로 돌고 있다.
    const offenders = FILES.filter((f) => /즉시 발송만 지원/.test(f.text));
    expect(offenders.map((f) => f.path.replace(SRC, "src"))).toEqual([]);
  });
});
