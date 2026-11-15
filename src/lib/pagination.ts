// 페이지 번호 창 계산. UI 컴포넌트에서 분리해 둔 이유는 순수 계산이라
// 테스트에서 바로 부를 수 있어야 하기 때문이다.

/** 현재 쪽 주변 ±2 와 양 끝. 사이가 벌어지면 null(…)을 끼운다. */
export function pageWindow(page: number, totalPages: number): (number | null)[] {
  const around = 2;
  const wanted = new Set<number>([1, totalPages]);
  for (let p = page - around; p <= page + around; p++) {
    if (p >= 1 && p <= totalPages) wanted.add(p);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const p of sorted) {
    // 딱 한 쪽이 비면 "…" 대신 그 번호를 넣는다. 한 칸 아끼자고 5쪽짜리
    // 목록에 1 2 3 … 5 를 그리면 4쪽만 갈 수 없는 것처럼 보인다.
    if (prev && p - prev === 2) out.push(prev + 1);
    else if (prev && p - prev > 2) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}
