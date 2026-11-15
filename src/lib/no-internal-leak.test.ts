import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 라운드 31 감사 지적: 설정 화면에 "라운드 20 이후 추가됩니다" 라는 내부
// 스프린트 번호가 사용자에게 그대로 노출됐다.
//
// 코드 주석에는 라운드 번호를 계속 써도 된다 (이력 추적에 필요).
// 다만 **화면에 그려지는 문자열**에는 들어가면 안 된다.
// 이 테스트는 주석을 걷어낸 뒤 남은 텍스트만 검사한다.

const ROOTS = ["src/app", "src/components"];

// 화면 문구에 있으면 안 되는 것들.
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /라운드\s*\d/, why: "내부 스프린트 번호" },
  { pattern: /\bR\d{1,3}\s*(테스트|test)/i, why: "라운드 태그가 붙은 테스트 데이터" },
  { pattern: /테스트\s*(업무|사규|정책|데이터)/, why: "테스트 시드 데이터" },
  { pattern: /example\.(com|org|net)/i, why: "존재하지 않는 예시 도메인" },
  { pattern: /lorem ipsum/i, why: "플레이스홀더 텍스트" },
];

/** 주석 제거. 완벽한 파서는 필요 없다 — 목적은 "화면 문구만 남기기".
 *  1) 블록 주석 / JSX 주석({(*) ... *(/)}) 제거
 *  2) 줄 전체가 // 로 시작하면 통째로 제거
 *  3) 남은 줄의 꼬리 // 주석은, 그 앞부분의 따옴표가 짝이 맞을 때만 제거
 *     (문자열 리터럴 안의 // 를 실수로 자르지 않기 위한 안전장치) */
function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlock
    .split("\n")
    .map((line) => {
      if (line.trim().startsWith("//")) return "";
      const at = line.indexOf("//");
      if (at < 0) return line;
      const head = line.slice(0, at);
      const balanced = (q: string) => (head.split(q).length - 1) % 2 === 0;
      return balanced('"') && balanced("'") && balanced("`") ? head : line;
    })
    .join("\n");
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(full, acc);
    } else if (name.endsWith(".tsx") && !name.includes(".test.")) {
      acc.push(full);
    }
  }
  return acc;
}

describe("내부 개발 흔적이 화면 문구로 새어나가지 않는다", () => {
  const files = ROOTS.flatMap((r) => walk(join(process.cwd(), r)));

  it("검사 대상 파일이 실제로 존재한다", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(FORBIDDEN)("화면 문구에 $why 가 없다", ({ pattern }) => {
    const hits: string[] = [];
    for (const f of files) {
      const body = stripComments(readFileSync(f, "utf8"));
      body.split("\n").forEach((line, n) => {
        if (pattern.test(line)) {
          hits.push(`${f.replace(process.cwd() + "/", "")}:${n + 1}  ${line.trim().slice(0, 100)}`);
        }
      });
    }
    expect(hits, `\n${hits.join("\n")}\n`).toEqual([]);
  });
});
