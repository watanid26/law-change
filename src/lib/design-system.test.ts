import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 디자인 시스템 제3판 강제 규칙.
//
// 제2판이 무너진 이유는 "규정 문서에는 있는데 코드에는 강제 장치가 없었다" 는
// 것이었다. 화면마다 다른 폰트 크기·다른 곡률·다른 색이 조금씩 새로 생기고,
// 리뷰 라운드마다 그걸 손으로 찾아냈다.
// 이 테스트는 그 잔재가 다시 들어오면 CI 에서 막는다.

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(full, acc);
    } else if (full.endsWith(".tsx") && !full.includes(".test.")) {
      acc.push(full);
    }
  }
  return acc;
}

const FILES = walk(join(process.cwd(), "src"));

function hits(pattern: RegExp): string[] {
  const out: string[] = [];
  for (const f of FILES) {
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((line, n) => {
        if (pattern.test(line)) {
          out.push(`${f.replace(process.cwd() + "/", "")}:${n + 1}  ${line.trim().slice(0, 90)}`);
        }
      });
  }
  return out;
}

describe("타이포 스케일", () => {
  it("임의 px 폰트 크기를 쓰지 않는다 (12/13/14/16/18/20/24/28 토큰만)", () => {
    const found = hits(/text-\[[\d.]+px\]/);
    expect(found, `\n${found.join("\n")}\n`).toEqual([]);
  });

  it("두 목소리를 섞어 쓰지 않는다", () => {
    // 제4판은 명조를 되살렸지만 `font-legal` 하나로만 부른다.
    // font-serif / 직접 폰트명 지정이 섞이면 화면마다 다른 서체가 나온다.
    const found = hits(/font-serif|display-serif|font-\["?Nanum/);
    expect(found, `\n${found.join("\n")}\n`).toEqual([]);
  });

  it("법령의 목소리가 실제로 쓰이고 있다", () => {
    // 명조가 코드에서 사라지면(제3판으로 되돌아가면) 제품 정체성이 무너진다.
    const used = hits(/font-legal/);
    expect(
      used.length,
      "font-legal 을 쓰는 곳이 없다 — 법령/도구 목소리 구분이 사라졌다",
    ).toBeGreaterThan(5);
  });
});

describe("색 · 토큰", () => {
  it("컴포넌트에 raw hex 색상을 쓰지 않는다", () => {
    // 예외: Google 로고 SVG 는 브랜드 규정상 지정 색을 써야 한다.
    const found = hits(/(?:bg|text|border|ring|fill|stroke)-\[#[0-9A-Fa-f]{3,8}\]/);
    expect(found, `\n${found.join("\n")}\n`).toEqual([]);
  });

  it("제2판 팔레트(paper/ink/olive/terracotta/seal)를 참조하지 않는다", () => {
    // change- 는 제4판의 공식 4변경타입 토큰이라 제외한다.
    // terracotta/amber 는 브랜드 액센트로 살아 있으나 마커 전용이므로
    // 텍스트 유틸리티(text-)로 쓰이는 것만 막는다.
    const found = hits(
      /\b(?:bg|text|border|ring|from|to|divide|accent|decoration)-(?:paper|ink|olive|seal|brand|memo|rule)-/,
    ).concat(hits(/\btext-(?:terracotta|amber)\b/));
    expect(found, `\n${found.join("\n")}\n`).toEqual([]);
  });
});

describe("금지된 흔한 AI 웹앱 스타일", () => {
  it("gradient 배경을 쓰지 않는다", () => {
    const found = hits(/bg-gradient-to-|from-\w+-\d{3}\s|blur-3xl/);
    expect(found, `\n${found.join("\n")}\n`).toEqual([]);
  });

  it("카드가 아니라 블록으로 만든다 (radius 상한 6px)", () => {
    // 조각 시스템: rounded-* 별칭은 전부 6px 이하로 재정의돼 있다.
    // 임의 radius 로 그 상한을 우회하는 것만 막으면 된다.
    const found = hits(/rounded-3xl|rounded-\[(?:[7-9]|[1-9]\d)\d*px\]/);
    expect(found, `\n${found.join("\n")}\n`).toEqual([]);
  });

  it("배지·칩·버튼을 pill 로 만들지 않는다", () => {
    // rounded-full 은 "정말 원인 것" 에만 남긴다 — 아바타, 타임라인 점,
    // 완료 체크 표식, 캘린더 오늘 표식. 그 외에 pill 이 생기면 조각 시스템이
    // 아니라 흔한 웹앱 템플릿으로 되돌아간다.
    const CIRCLE_OK = new Set([
      "src/components/ui/index.tsx",      // Avatar
      "src/components/RightPanel.tsx",    // 개정 이력 타임라인 점
      "src/app/app/page.tsx",             // 시작하기 체크 표식 · 타임라인 점
      "src/app/app/tasks/page.tsx",       // 업무 완료 표식
      "src/app/app/calendar/page.tsx",    // 오늘 표식 · 범례 점
      "src/app/app/inbox/page.tsx",       // 안 읽음 점
      "src/components/shell/SidebarUser.tsx",
      "src/app/app/calendar/loading.tsx", // 오늘 표식 skeleton
      "src/components/LastSyncedAt.tsx",  // 동기화 상태 점
    ]);
    const found = hits(/rounded-full/).filter(
      (l) => !CIRCLE_OK.has(l.split(":")[0]),
    );
    expect(found, `\n${found.join("\n")}\n`).toEqual([]);
  });

  it("강한 그림자를 쓰지 않는다 (떠 있는 요소는 dropdown/popover/modal 토큰만)", () => {
    const found = hits(/shadow-(?:sm|md|lg|xl|2xl)\b/);
    expect(found, `\n${found.join("\n")}\n`).toEqual([]);
  });
});

describe("접근성", () => {
  it("focus outline 을 제거하지 않는다", () => {
    // focus:outline-none 은 대체 링(focus:border-primary 등)이 있을 때만 허용.
    // 전역 :focus-visible 규칙이 살아 있어야 하므로 outline-none 단독 사용을 막는다.
    const found = hits(/focus-visible:outline-none/);
    expect(found, `\n${found.join("\n")}\n`).toEqual([]);
  });
});
