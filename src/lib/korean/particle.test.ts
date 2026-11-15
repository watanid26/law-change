import { describe, expect, it } from "vitest";
import { euro, iga, eunneun } from "./particle";

describe("으로 / 로", () => {
  it("받침이 있으면 으로", () => {
    expect(euro("벌칙")).toBe("벌칙으로");
    expect(euro("벌금")).toBe("벌금으로");
    expect(euro("행정처분")).toBe("행정처분으로");
  });

  it("받침이 없으면 로", () => {
    // 실제로 화면에 "과태료으로" 가 나갔던 사례.
    expect(euro("과태료")).toBe("과태료로");
    expect(euro("영업정지")).toBe("영업정지로");
    expect(euro("허가취소")).toBe("허가취소로");
  });

  it("ㄹ 받침은 로", () => {
    expect(euro("서울")).toBe("서울로");
  });

  it("한글이 아니면 단정하지 않는다", () => {
    expect(euro("AI")).toBe("AI(으)로");
  });
});

describe("이 / 가", () => {
  it("받침 유무로 갈린다", () => {
    expect(iga("벌칙")).toBe("벌칙이");
    expect(iga("과태료")).toBe("과태료가");
    expect(iga("서울")).toBe("서울이");
  });
});

describe("은 / 는", () => {
  it("받침 유무로 갈린다", () => {
    expect(eunneun("벌칙")).toBe("벌칙은");
    expect(eunneun("과태료")).toBe("과태료는");
  });
});
