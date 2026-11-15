// 조각 일러스트 — 랜딩 hero 우측.
//
// 1차 버전은 아이소메트릭 큐브였는데, 사용성 평가에서 "격자 위에 초록 큐브
// 두 개가 떠 있는 추상 도형으로만 보이고 법령·조문과의 연관성을 유추할 수
// 없다"는 결과가 나왔다. 못 알아보는 은유는 장식이지 정체성이 아니다.
//
// 2차: 추상 도형을 버리고 **조문처럼 생긴 것**을 그린다.
//   · 각 블록에 조문 번호(제N조)와 본문 줄이 들어간다 → "이건 법 조문이다"
//   · 그중 하나에 수정(~), 하나에 신설(+) 글리프가 붙는다 → "이게 바뀌었다"
//   · 바뀐 조각만 올리브로 채워지고 오른쪽으로 당겨져 나온다 → "검토 대상"
// 3D 라이브러리 없이 정적 SVG. 회전·부유 애니메이션 없음(업무 앱이다).

import { cx } from "./ui/styles";

interface Row {
  label: string;
  /** 본문 줄 길이(0~1). 조문마다 길이가 다른 게 자연스럽다. */
  lines: number[];
  state: "base" | "modified" | "added";
}

const ROWS: Row[] = [
  { label: "제26조", lines: [1, 0.72], state: "base" },
  { label: "제27조", lines: [0.9, 0.55], state: "base" },
  { label: "제28조", lines: [1, 0.8, 0.45], state: "modified" },
  { label: "제29조", lines: [0.85], state: "base" },
  { label: "제29조의2", lines: [0.95, 0.6], state: "added" },
  { label: "제30조", lines: [0.8, 0.5], state: "base" },
];

const W = 250; // 블록 기본 너비
const PAD = 12;
const LINE_H = 7;
const GAP = 12;

export function FragmentIllustration({ className }: { className?: string }) {
  // 각 블록 높이를 줄 수에 맞춰 계산해서 세로로 쌓는다.
  let y = 0;
  const placed = ROWS.map((r) => {
    const h = PAD * 2 + 14 + r.lines.length * LINE_H + (r.lines.length - 1) * 4;
    const top = y;
    y += h + GAP;
    return { ...r, top, h };
  });

  return (
    <svg
      viewBox={`-16 -10 ${W + 70} ${y + 10}`}
      className={cx("h-auto w-full", className)}
      role="img"
      aria-label="법령의 조문 목록. 제28조가 수정되고 제29조의2가 신설되어 검토 대상으로 표시된 모습."
    >
      {placed.map((r) => {
        const changed = r.state !== "base";
        // 바뀐 조각만 오른쪽으로 당겨 나온다 — "이게 지금 볼 것".
        const x = changed ? 26 : 0;
        const stroke = changed
          ? "rgb(var(--primary))"
          : "rgb(var(--line-strong))";
        const fill = changed ? "rgb(var(--primary-subtle))" : "rgb(var(--surface))";
        const labelFill = changed
          ? "rgb(var(--primary-text))"
          : "rgb(var(--fg-muted))";
        const lineFill = changed
          ? "rgb(var(--primary))"
          : "rgb(var(--line-strong))";

        return (
          <g key={r.label} transform={`translate(${x} ${r.top})`}>
            {/* 조문 블록 */}
            <rect
              width={W}
              height={r.h}
              fill={fill}
              stroke={stroke}
              strokeWidth={changed ? 1.5 : 1}
              rx={2}
            />
            {/* 좌측 형태 단서 — 바뀐 조각에만 */}
            {changed ? (
              <rect width={3} height={r.h} fill="rgb(var(--primary))" />
            ) : null}

            {/* 조문 번호 */}
            <text
              x={PAD}
              y={PAD + 10}
              fill={labelFill}
              fontSize={11}
              fontWeight={600}
              fontFamily="var(--font-legal)"
            >
              {r.label}
            </text>

            {/* 변경 글리프 — 사각 프레임 + 기호 (ui/change 와 같은 형태 언어) */}
            {changed ? (
              <g
                transform={`translate(${W - PAD - 14} ${PAD + 1})`}
                stroke="rgb(var(--primary-text))"
                fill="none"
                strokeWidth={1.4}
              >
                <rect x={0.7} y={0.7} width={12.6} height={12.6} />
                {r.state === "added" ? (
                  <path d="M7 3.5v7M3.5 7h7" strokeWidth={1.6} />
                ) : (
                  <path d="M3 8c1.2-2.4 2.4 2.4 3.6 0S9 10.4 10.6 7" strokeWidth={1.6} />
                )}
              </g>
            ) : null}

            {/* 본문 줄 */}
            {r.lines.map((w, i) => (
              <rect
                key={i}
                x={PAD}
                y={PAD + 18 + i * (LINE_H + 4)}
                width={(W - PAD * 2) * w}
                height={3}
                fill={lineFill}
                opacity={changed ? 0.45 : 0.3}
                rx={1.5}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
