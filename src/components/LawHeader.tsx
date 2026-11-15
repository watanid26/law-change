import type { LawDetail } from "@/lib/types";
import { Icon } from "./Icon";
import { Breadcrumb, cx } from "./ui";

interface Props {
  law: LawDetail;
  /** 관심 등록 토글 등 primary action. 한 화면에 강한 action 은 하나만. */
  actions?: React.ReactNode;
}

// 법령 상세 헤더.
//
// 제2판은 제목 아래 3px 겹선 + 4칸 메타 카드 그리드였다. 카드 네 개가 제목과
// 비슷한 크기의 숫자를 달고 있어서 무엇이 주인공인지 흐려졌다.
// 제3판은 제목이 압도적으로 크고, 메타는 divider 로 구분한 한 줄 plain text.
// 모든 값을 배지로 만들지 않는다 — 강조는 시행일 D-day 하나뿐이다.
export function LawHeader({ law, actions }: Props) {
  const imminent = law.dDay !== null && law.dDay >= 0 && law.dDay <= 7;
  const soon = law.dDay !== null && law.dDay > 7 && law.dDay <= 14;

  return (
    <header className="mb-6">
      <Breadcrumb
        items={[
          { label: "법령 탐색", href: "/laws" },
          { label: law.type, href: `/laws?type=${encodeURIComponent(law.type)}` },
          { label: law.name },
        ]}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        {/* 법령명은 법령의 목소리(명조). 옆의 action·메타는 도구(고딕). */}
        <h1 className="min-w-0 font-legal text-3xl font-bold tracking-title text-fg sm:text-4xl">
          {law.name}
        </h1>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {/* 메타 — 점(·)으로 일곱 개를 한 줄에 이어붙였더니 "어디서 끊어 읽어야
          하는지" 가 안 보인다는 지적을 받았다. 라벨을 붙여 두 줄로 나눈다.
          여전히 배지가 아니라 plain text — 모든 값을 배지로 만들지 않는다. */}
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <MetaField label="종류" value={law.type} />
        {law.ministry ? <MetaField label="소관" value={law.ministry} /> : null}
        {law.lawNumber ? (
          <MetaField label="법령번호" value={law.lawNumber} mono />
        ) : null}
        {law.revisionType ? (
          <MetaField label="개정 형태" value={law.revisionType} />
        ) : null}
      </dl>
      <dl className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
        <MetaField label="공포일" value={law.promulgationDate} mono />
        <div className="flex items-baseline gap-1.5">
          {/* 그냥 "시행일" 이라고 두면 이 법의 시행일로 읽힌다. 실제로는 지금
              보고 있는 개정 한 건의 시행일이다. 식품위생법처럼 3년 뒤 시행인
              개정이 가장 최근 공포건이면 "시행까지 D-857" 이 법령의 얼굴이
              되어버린다 — 정작 다음에 닥치는 건 훨씬 가깝다. */}
          <dt className="text-fg-muted">이 개정 시행일</dt>
          <dd
            className="tabular text-fg"
            title={law.effectiveDateFull}
          >
            {/* 시행일을 모르면 날짜 자리에 "—" 를 찍고 그 옆에 "시행일 미정"
                을 또 붙여 "—시행일 미정" 으로 읽혔다. 미정일 때는 라벨 하나만
                남긴다. */}
            {law.dDay === null ? null : law.effectiveDate}
            {law.dDay !== null && law.effectiveDateNote ? (
              <span className="ml-1 text-fg-muted">({law.effectiveDateNote})</span>
            ) : null}
            {/* D-day 는 무엇을 세는 숫자인지 설명이 없어 유추해야 했다.
                라벨을 붙이고, 시행 전/후를 문구로 구분한다. */}
            <span
              className={cx(
                law.dDay === null ? "font-medium tabular" : "ml-2 font-medium tabular",
                imminent ? "text-danger" : soon ? "text-warning" : "text-fg-muted",
              )}
            >
              {law.dDay === null
                ? "시행일 미정"
                : law.dDay === 0
                  ? "오늘 시행"
                  : law.dDay > 0
                    ? `시행까지 D-${law.dDay}`
                    : `시행 후 ${Math.abs(law.dDay)}일`}
            </span>
          </dd>
        </div>
        <a
          href={`https://www.law.go.kr/lsSc.do?menuId=1&subMenuId=15&tabMenuId=81&query=${encodeURIComponent(law.name)}`}
          target="_blank"
          rel="noopener external"
          className="inline-flex items-center gap-1 text-fg-muted hover:text-primary-text"
        >
          법제처 원문
          <Icon name="external-link" size={12} />
        </a>
      </dl>

      <EnforcementLine enforcement={law.enforcement} />
    </header>
  );
}

/* 지금 지켜야 하는 판과 앞으로 닥칠 판.
 *
 * 헤더 위쪽은 "지금 보고 있는 개정" 을 말한다. 그런데 실무에서 먼저 알아야
 * 하는 건 "오늘 기준 무엇이 시행 중이고, 다음에 뭐가 언제 닥치는가" 다.
 * 공포는 됐지만 시행이 남은 개정이 여러 건 쌓여 있는 법이 흔하다
 * (식품위생법 5건). 그 사실과 가장 이른 시행일을 한 줄로 못박는다. */
function EnforcementLine({
  enforcement,
}: {
  enforcement: LawDetail["enforcement"];
}) {
  const { current, pendingCount, next } = enforcement;
  if (!current && pendingCount === 0) return null;
  const urgent = next !== null && next.dDay !== null && next.dDay <= 30;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-md border border-line bg-subtle px-3.5 py-2.5 text-sm">
      {current ? (
        <span className="flex items-baseline gap-1.5">
          <span className="text-fg-muted">현재 시행 중</span>
          <span className="tabular text-fg">
            {current.lawNumber} · {current.effectiveDate} 시행
          </span>
        </span>
      ) : (
        <span className="text-fg-muted">아직 시행된 판이 없습니다</span>
      )}
      {pendingCount > 0 && next ? (
        <span className="flex items-baseline gap-1.5">
          <span className="text-fg-muted">
            시행 예정 {pendingCount}건 · 가장 이른 시행
          </span>
          <span
            className={cx(
              "tabular font-medium",
              urgent ? "text-warning" : "text-fg",
            )}
          >
            {next.effectiveDate}
            <span className="ml-1.5">
              {next.dDay === 0 ? "오늘" : `D-${next.dDay}`}
            </span>
          </span>
        </span>
      ) : (
        <span className="text-fg-muted">시행 예정 없음</span>
      )}
    </div>
  );
}

/** 라벨 + 값 한 쌍. 라벨이 있어야 "이 숫자가 뭔지" 를 유추하지 않아도 된다. */
function MetaField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  /** 법령번호·날짜처럼 자리가 흔들리면 안 되는 값. */
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={cx("text-fg", mono && "tabular legal-token")}>{value}</dd>
    </div>
  );
}
