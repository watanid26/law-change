// 규칙 기반 위험 신호.
//
// 이 값은 화면에 근거와 함께 나간다. 등급이 흔들리면 근거도 같이 흔들리고,
// 그러면 "왜 높음인지" 를 설명할 수 없게 된다. 경계를 여기서 고정한다.

import { describe, expect, it } from "vitest";
import { assessChangeRisk, RISK_LABEL } from "./changeRisk";

const d = (changeType: string, label: string, title: string | null, text?: string) => ({
  changeType, label, title, text,
});

describe("처벌 조문", () => {
  it("벌칙이 수정되면 높음, 근거에 조문 이름이 들어간다", () => {
    const r = assessChangeRisk([d("MODIFIED", "제98조", "벌칙")]);
    expect(r.level).toBe("high");
    expect(r.reasons[0]).toContain("제98조(벌칙)");
    expect(r.reasons[0]).toContain("수정");
  });

  it("과태료가 신설되면 높음", () => {
    expect(assessChangeRisk([d("ADDED", "제101조", "과태료")]).level).toBe("high");
  });

  it("처벌 조문이 삭제되면 중간 — 완화일 수 있지만 기준이 바뀐 건 맞다", () => {
    const r = assessChangeRisk([d("DELETED", "제98조", "벌칙")]);
    expect(r.level).toBe("medium");
    expect(r.reasons[0]).toContain("처벌 기준");
  });
});

describe("의무 조문", () => {
  it("신고 조문이 신설되면 높음 — 새로 지켜야 할 것이 생긴다", () => {
    expect(assessChangeRisk([d("ADDED", "제12조의2", "신고")]).level).toBe("high");
  });

  it("의무 조문 수정은 중간", () => {
    expect(assessChangeRisk([d("MODIFIED", "제12조", "기록 및 보존")]).level).toBe("medium");
  });

  it("제목이 없어도 신설 조문 본문의 의무 표현을 잡는다", () => {
    const r = assessChangeRisk([
      d("ADDED", "제7조의3", null, "영업자는 매년 위생교육을 받아야 한다."),
    ]);
    expect(r.level).toBe("high");
  });

  it("수정 조문의 본문 표현은 보지 않는다 — 오탐이 너무 많다", () => {
    // 기존 조문 본문에는 "하여야 한다" 가 널려 있다. 신설일 때만 본다.
    const r = assessChangeRisk([
      d("MODIFIED", "제7조", "서식", "영업자는 매년 위생교육을 받아야 한다."),
    ]);
    expect(r.level).toBe("low");
  });
});

describe("등급 결정", () => {
  it("가장 급한 것이 등급을 정한다", () => {
    const r = assessChangeRisk([
      d("MOVED", "제3조", "정의"),
      d("MODIFIED", "제12조", "신고"),      // medium
      d("MODIFIED", "제98조", "벌칙"),      // high
    ]);
    expect(r.level).toBe("high");
    expect(r.reasons[0]).toContain("벌칙");
  });

  it("근거는 최대 3개, 나머지는 개수로 알린다", () => {
    const r = assessChangeRisk([
      d("MODIFIED", "제1조", "벌칙"), d("MODIFIED", "제2조", "과태료"),
      d("MODIFIED", "제3조", "벌금"), d("MODIFIED", "제4조", "징역"),
      d("MODIFIED", "제5조", "과징금"),
    ]);
    expect(r.reasons).toHaveLength(3);
    expect(r.more).toBe(2);
  });

  it("변경이 없으면 none — 낮음과 구분한다", () => {
    expect(assessChangeRisk([]).level).toBe("none");
  });

  it("신호가 없는 변경만 있으면 낮음", () => {
    const r = assessChangeRisk([d("MOVED", "제3조", "정의"), d("MODIFIED", "제4조", "목적")]);
    expect(r.level).toBe("low");
    expect(r.reasons).toEqual([]);
  });
});

describe("조문 이름 표기", () => {
  it("제목이 있으면 괄호로 붙인다", () => {
    expect(assessChangeRisk([d("MODIFIED", "제98조", "벌칙")]).reasons[0]).toContain("제98조(벌칙)");
  });

  it("제목이 없으면 번호만", () => {
    const r = assessChangeRisk([d("ADDED", "제7조", null, "…받아야 한다.")]);
    expect(r.reasons[0]).toContain("제7조");
    expect(r.reasons[0]).not.toContain("(");
  });

  it("번호도 없으면 '조문' 으로 부른다 — 빈 괄호를 내지 않는다", () => {
    const r = assessChangeRisk([d("MODIFIED", "", "벌칙")]);
    expect(r.reasons[0]).toContain("조문(벌칙)");
  });
});

describe("근거 순서와 조사", () => {
  it("같은 높음이면 처벌 조문이 의무 조문보다 먼저", () => {
    // 실물에서 행정처분 수정이 신설 조문 21건에 묻혔다.
    const r = assessChangeRisk([
      d("ADDED", "제1조의2", "설치 기준"),
      d("ADDED", "제6조의2", "승인 절차"),
      d("ADDED", "제6조의3", "자격"),
      d("MODIFIED", "제30조", "행정처분의 기준"),
    ]);
    expect(r.level).toBe("high");
    expect(r.reasons[0]).toContain("행정처분");
  });

  it("조사가 받침에 맞는다", () => {
    // "과태료으로" 가 실제로 화면에 나갔다.
    expect(assessChangeRisk([d("ADDED", "제22조", "과태료")]).reasons[0]).toContain("과태료로");
    expect(assessChangeRisk([d("MODIFIED", "제98조", "벌칙")]).reasons[0]).toContain("벌칙으로");
  });
});

describe("배지 문구", () => {
  it("대시보드 섹션 제목과 겹치지 않는다", () => {
    // 섹션이 "확인이 필요한 변경" 인데 배지도 "확인 필요" 면 같은 말이
    // 두 번 나와 신호가 소음이 된다.
    for (const label of Object.values(RISK_LABEL)) {
      expect(label).not.toContain("확인이 필요");
      expect(label).not.toBe("확인 필요");
    }
  });

  it("등급마다 다른 말을 쓴다", () => {
    const labels = Object.values(RISK_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
