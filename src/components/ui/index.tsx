// 공통 UI 프리미티브.
//
// 원칙: 2개 이상 화면에서 반복되는 패턴만 공통화한다.
// 추상화를 위한 추상화는 만들지 않는다.

import Link from "next/link";
import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { Icon } from "../Icon";
import { pageWindow } from "@/lib/pagination";
import {
  badgeClass,
  buttonClass,
  cx,
  DOT_TONE,
  fieldClass,
  iconButtonClass,
  type ButtonSize,
  type ButtonVariant,
  type Tone,
} from "./styles";

export {
  badgeClass,
  buttonClass,
  cx,
  fieldClass,
  iconButtonClass,
  DOT_TONE,
};
export type { ButtonSize, ButtonVariant, Tone };
export { pageWindow };

/* ── PageHeader ────────────────────────────────────────────────────
 * 모든 페이지 상단. 제목 · 한 줄 설명 · 우측 action.
 * 제목은 header bar 가 아니라 콘텐츠 영역에 둔다 (거대한 title bar 금지).
 * 모바일에서는 세로로 쌓인다. */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** 제목 옆 보조 수치. 예: "관리 법령 42개" */
  meta?: ReactNode;
  actions?: ReactNode;
  /** 상세 페이지에서만. 목록 페이지에는 넣지 않는다. */
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="mb-6 sm:mb-8">
      {breadcrumb}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl font-semibold tracking-title text-fg sm:text-4xl">
              {title}
            </h1>
            {meta ? <span className="text-sm text-fg-muted">{meta}</span> : null}
          </div>
          {description ? (
            <p className="mt-2 max-w-2xl text-base text-fg-secondary">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

/* ── SectionHeader ─────────────────────────────────────────────── */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-4 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-fg-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

/* ── Breadcrumb ────────────────────────────────────────────────── */
export function Breadcrumb({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="위치" className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 ? (
            <Icon
              name="chevron-right"
              size={13}
              className="text-fg-disabled"
              aria-hidden="true"
            />
          ) : null}
          {it.href ? (
            // 390px 실측에서 높이 18px 였다. 글자 크기는 그대로 두고 위아래
            // 여백으로 누를 수 있는 영역만 넓힌다(-my-2 로 줄 간격은 유지).
            <Link
              href={it.href}
              className="-my-2 py-2 text-fg-muted hover:text-fg"
            >
              {it.label}
            </Link>
          ) : (
            <span className="text-fg-secondary">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/* ── Button ────────────────────────────────────────────────────── */
export function Button({
  variant,
  size,
  full,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
}) {
  return (
    <button
      {...rest}
      className={buttonClass({ variant, size, full, className })}
    >
      {children}
    </button>
  );
}

/** next/link 버튼. href 가 있으면 button 대신 이걸 쓴다. */
export function ButtonLink({
  href,
  variant,
  size,
  full,
  className,
  children,
  ...rest
}: React.ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
}) {
  return (
    <Link
      href={href}
      {...rest}
      className={buttonClass({ variant, size, full, className })}
    >
      {children}
    </Link>
  );
}

/* ── Badge ─────────────────────────────────────────────────────── */
export function Badge({
  tone = "neutral",
  dot,
  className,
  title,
  children,
}: {
  tone?: Tone;
  /** 색만으로 상태를 전달하지 않도록, 점을 쓸 땐 반드시 라벨을 함께 둔다. */
  dot?: boolean;
  className?: string;
  /** 상태 이름만으로 뜻이 안 잡히는 경우의 짧은 설명. */
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className={badgeClass({ tone, className })} title={title}>
      {dot ? (
        <span
          aria-hidden="true"
          className={cx("h-1.5 w-1.5", DOT_TONE[tone])}
        />
      ) : null}
      {children}
    </span>
  );
}

/* ── Stat ──────────────────────────────────────────────────────── */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  /** 서명 색면 위에 놓일 때. StatStrip 이 내려준다. */
  onSignature = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  href?: string;
  onSignature?: boolean;
}) {
  const valueTone = onSignature
    ? tone === "danger" || tone === "warning"
      ? "text-signature-accent"
      : "text-signature-fg"
    : tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : "text-fg";
  const face = onSignature ? "bg-signature" : "bg-surface";
  const labelTone = onSignature ? "text-signature-label" : "text-fg-secondary";
  const hintTone = onSignature ? "text-signature-muted" : "text-fg-muted";
  const hoverFace = onSignature ? "hover:bg-signature/85" : "hover:bg-hover";

  const body = (
    <>
      <div className={cx("flex items-center gap-1 text-sm", labelTone)}>
        {label}
        {href ? (
          <Icon
            name="chevron-right"
            size={13}
            aria-hidden="true"
            className={cx(
              "transition-transform duration-swift group-hover:translate-x-0.5",
              onSignature ? "text-signature-muted" : "text-fg-disabled",
            )}
          />
        ) : null}
      </div>
      <div className={cx("mt-1.5 text-3xl font-semibold tabular", valueTone)}>
        {value}
      </div>
      {hint ? <div className={cx("mt-1 text-xs", hintTone)}>{hint}</div> : null}
    </>
  );

  if (!href) {
    return <div className={cx("min-w-0 px-5 py-4", face)}>{body}</div>;
  }
  // 4칸 전부 링크인데 겉모습이 통계 카드와 똑같아서, 눌러도 되는지 알 수 없다는
  // 지적을 받았다. 라벨 옆 화살표가 이 칸이 어디로 데려간다는 걸 알린다.
  return (
    <Link
      href={href}
      className={cx(
        "group min-w-0 px-5 py-4 transition-colors duration-swift",
        face,
        hoverFace,
      )}
    >
      {body}
    </Link>
  );
}

/** 대시보드 지표 묶음 — 독립 카드 4개가 아니라 하나의 격자.
 *  조각 시스템: 1px 선으로 나뉜 블록들이 하나의 구조체로 읽히게 한다.
 *
 *  signature 를 켜면 짙은 올리브 면이 된다 (화면당 한 곳만).
 *  각지게 · 그림자 없이 · 1px 격자 유지가 조건이다 — 둥글리거나 그림자를
 *  붙이는 순간 공공기관 헤더로 미끄러진다. globals.css 주석 참고. */
export function StatStrip({
  children,
  signature = false,
}: {
  children: ReactNode;
  signature?: boolean;
}) {
  return (
    <div
      className={cx(
        "grid grid-cols-2 gap-px rounded-sm sm:grid-cols-4",
        signature
          ? "border border-signature bg-signature-line"
          : "border border-line bg-line",
      )}
    >
      {/* 칸마다 onSignature 를 따로 넘기게 두면 테두리만 짙고 안은 흰
          어긋난 상태가 나올 수 있다. 여기서 한 번에 내려준다. */}
      {signature
        ? Children.map(children, (child) =>
            isValidElement<{ onSignature?: boolean }>(child)
              ? cloneElement(child, { onSignature: true })
              : child,
          )
        : children}
    </div>
  );
}

/* ── EmptyState ────────────────────────────────────────────────── */
export function EmptyState({
  icon = "search",
  title,
  description,
  action,
  compact,
}: {
  icon?: React.ComponentProps<typeof Icon>["name"];
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-6 py-10" : "px-6 py-16",
      )}
    >
      <Icon
        name={icon}
        size={22}
        className="text-fg-disabled"
        aria-hidden="true"
      />
      <p className="mt-3 text-base font-medium text-fg">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-fg-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ── Panel ─────────────────────────────────────────────────────── */
/** 흰 면이 정말 필요한 섹션에만. 섹션마다 카드를 두르지 않는다. */
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("rounded-sm border border-line bg-surface", className)}>
      {children}
    </div>
  );
}

/* ── Skeleton ──────────────────────────────────────────────────── */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("skeleton rounded", className)} />;
}

/* ── Avatar ────────────────────────────────────────────────────── */
export function Avatar({
  name,
  size = 24,
}: {
  name: string | null | undefined;
  size?: number;
}) {
  const initial = (name ?? "").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-subtle font-medium text-fg-secondary"
    >
      {initial}
    </span>
  );
}

/* ── Tabs (URL 기반) ───────────────────────────────────────────── */
/** 라우트/쿼리로 상태가 결정되는 탭. 카운트는 실제 값이 있을 때만 넘긴다. */
export function LinkTabs({
  items,
  className,
}: {
  items: { href: string; label: string; count?: number; active: boolean }[];
  className?: string;
}) {
  return (
    <div className={cx("border-b border-line", className)}>
      <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="보기 전환">
        {items.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cx(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-base font-medium transition-colors duration-swift",
              t.active
                ? "border-primary text-fg"
                : "border-transparent text-fg-secondary hover:border-line-strong hover:text-fg",
            )}
          >
            {t.label}
            {typeof t.count === "number" ? (
              <span
                className={cx(
                  "ml-1.5 tabular text-sm",
                  t.active ? "text-fg-secondary" : "text-fg-muted",
                )}
              >
                {t.count.toLocaleString("ko-KR")}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** 좁은 선택지(전체/법률/시행령…)용 세그먼트. 링크 기반. */
export function SegmentedLinks({
  items,
  className,
}: {
  items: { href: string; label: string; active: boolean }[];
  className?: string;
}) {
  return (
    <div
      className={cx(
        "inline-flex items-center gap-0.5 rounded-sm border border-line bg-subtle p-0.5",
        className,
      )}
    >
      {items.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          aria-current={s.active ? "true" : undefined}
          className={cx(
            "rounded px-3 py-1.5 text-sm font-medium transition-colors duration-swift",
            s.active
              ? "bg-surface text-fg"
              : "text-fg-secondary hover:text-fg",
          )}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}

/* ── FilterBar ─────────────────────────────────────────────────── */
/** 검색 + 필터 한 줄. 거대한 bordered panel 로 만들지 않는다. */
export function FilterBar({
  children,
  className,
  ...rest
}: React.FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form
      method="get"
      {...rest}
      className={cx("flex flex-wrap items-center gap-2", className)}
    >
      {children}
    </form>
  );
}

/** 왼쪽에 돋보기가 붙은 검색 입력. */
export function SearchInput({
  className,
  wrapperClassName,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { wrapperClassName?: string }) {
  return (
    <div className={cx("relative min-w-[200px] flex-1", wrapperClassName)}>
      <Icon
        name="search"
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
      />
      <input
        // FilterSelect 와 같은 이유 — 초기화 후에도 옛 검색어가 남는다.
        key={String(rest.defaultValue ?? "")}
        type="search"
        {...rest}
        className={fieldClass({ className: cx("pl-9", className) })}
      />
    </div>
  );
}

/** 라벨 없이 쓰는 필터 select. aria-label 은 호출부 책임. */
/** 고르면 바로 적용된다. 구현은 AutoSubmitSelect (client component). */
export { AutoSubmitSelect as FilterSelect } from "./AutoSubmitSelect";

/* ── Pagination ────────────────────────────────────────────────── */
/** 목록 3곳(변경 알림·관심 법령·업무)이 같은 표기를 쓰도록 공통화. */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  buildHref,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav
      className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      aria-label="페이지 이동"
    >
      <p className="text-sm tabular text-fg-muted">
        {from.toLocaleString("ko-KR")}–{to.toLocaleString("ko-KR")} /{" "}
        {total.toLocaleString("ko-KR")}
        <span className="ml-2 text-fg-disabled">
          {page.toLocaleString("ko-KR")} / {totalPages.toLocaleString("ko-KR")}쪽
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <PageStep href={page > 1 ? buildHref(1) : null} label="처음" />
        <PageStep href={page > 1 ? buildHref(page - 1) : null} label="이전" />
        {pageWindow(page, totalPages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-fg-disabled">
              …
            </span>
          ) : p === page ? (
            <span
              key={p}
              aria-current="page"
              className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-primary px-2 text-sm font-medium tabular text-primary-fg"
            >
              {p.toLocaleString("ko-KR")}
            </span>
          ) : (
            <Link
              key={p}
              href={buildHref(p)}
              className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-line px-2 text-sm tabular text-fg-secondary transition-colors duration-swift hover:border-line-strong hover:text-fg"
            >
              {p.toLocaleString("ko-KR")}
            </Link>
          ),
        )}
        <PageStep href={page < totalPages ? buildHref(page + 1) : null} label="다음" />
        <PageStep
          href={page < totalPages ? buildHref(totalPages) : null}
          label="마지막"
        />
      </div>
    </nav>
  );
}

/* 이전/다음만 있으면 112,290건짜리 목록에서 뒤쪽으로 가는 방법이 없다
 * (30건씩이면 3,743번 눌러야 한다). 번호로 바로 뛰게 하고, 양 끝으로 가는
 * 처음/마지막도 둔다. 갈 수 없는 방향은 링크를 지운다 — 눌러도 아무 일이
 * 없는 버튼을 남기지 않는다. */
function PageStep({ href, label }: { href: string | null; label: string }) {
  if (!href) {
    return (
      <span className="hidden h-8 items-center rounded-md px-2 text-sm text-fg-disabled sm:inline-flex">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center rounded-md border border-line px-2.5 text-sm text-fg-secondary transition-colors duration-swift hover:border-line-strong hover:text-fg"
    >
      {label}
    </Link>
  );
}

/* ── 값 없음 ───────────────────────────────────────────────────── */
export function EmptyCell() {
  return (
    <span className="text-fg-disabled" title="아직 값이 없습니다">
      —
    </span>
  );
}
