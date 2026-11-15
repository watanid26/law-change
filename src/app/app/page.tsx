// 대시보드 — "오늘 무엇을 해야 하는가"를 답하는 업무 시작 화면.
//
// 제2판은 표제부 + 요약 테이블 두 개였다. 정보는 있었지만 "먼저 볼 것"이
// 무엇인지 화면이 말해 주지 않았다. 제3판은 위계를 세 층으로 고정한다.
//   1) 지표 strip — 지금 밀린 양
//   2) 확인이 필요한 변경 — 가장 먼저 손댈 것 (좌측 65%)
//   3) 다가오는 일정 · 진행 중 업무 — 언제까지인지 (우측 35%)
//
// 데이터 흐름은 제2판과 동일하다. 시행일 축 두 개(7일 이내 시행 수 · 다가오는
// 시행일)만 읽기 전용 집계로 추가했다.

import { requireUserContext } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  countInboxEffectiveWithin,
  countOpenInbox,
  listInboxItems,
  listUpcomingEffective,
  type InboxListItem,
  type UpcomingEffectiveItem,
} from "@/lib/inbox/queries";
import { countOpenTasks, listTasks, type TaskListItem } from "@/lib/tasks/queries";
import { INBOX_STATUS_LABEL, INBOX_STATUS_TONE, type InboxStatus } from "@/lib/inbox/labels";
import { TASK_STATUS_LABEL, TASK_STATUS_TONE, type TaskStatus } from "@/lib/tasks/labels";
import { Icon } from "@/components/Icon";
import {
  Badge,
  ButtonLink,
  EmptyState,
  PageHeader,
  Panel,
  SectionHeader,
  Stat,
  StatStrip,
  cx,
} from "@/components/ui";
import { formatKoreanDate } from "@/lib/format";
import { eventTypeLabel } from "@/lib/style";
import { changeSummaryLabel } from "@/lib/laws/changeSummary";
import { ACTIVE_WATCH_FILTER } from "@/lib/watches/queries";
import { DDay } from "@/components/ui/dday";

export const dynamic = "force-dynamic";

export default async function AppHomePage() {
  const ctx = await requireUserContext();

  const [
    watchCount,
    inboxOpenCount,
    taskOpenCount,
    policyCount,
    effectiveSoon,
    upcomingEffective,
    openTasks,
    recentInbox,
  ] = await Promise.all([
    // 목록과 같은 정의로 센다. 예전에는 여기만 archivedAt 을 봐서, 상태가
    // ARCHIVED 인데 archivedAt 이 안 찍힌 행이 생기면 "관리 법령 N" 과
    // 실제 목록 길이가 갈라졌다.
    prisma.watch.count({ where: { workspaceId: ctx.workspaceId, ...ACTIVE_WATCH_FILTER } }),
    countOpenInbox(ctx.workspaceId),
    countOpenTasks(ctx.workspaceId),
    prisma.internalPolicy.count({
      where: { workspaceId: ctx.workspaceId, status: "ACTIVE" },
    }),
    countInboxEffectiveWithin(ctx.workspaceId, 7),
    listUpcomingEffective(ctx.workspaceId, 5),
    listTasks({ workspaceId: ctx.workspaceId, limit: 5 }),
    listInboxItems({ workspaceId: ctx.workspaceId, limit: 5 }),
  ]);

  const setup = [
    { done: watchCount > 0, title: "관심 법령 등록", href: "/laws", cta: "법령 탐색" },
    { done: watchCount > 0, title: "관심 법령 확인", href: "/app/watches", cta: "관심 법령" },
    {
      done: watchCount > 0,
      title: "변경 감지 흐름 확인",
      href: "/app/inbox",
      cta: "변경 알림",
    },
    { done: openTasks.total > 0, title: "첫 업무 만들기", href: "/app/tasks", cta: "업무" },
    { done: policyCount > 0, title: "내부 사규 등록 (선택)", href: "/app/policies", cta: "사규" },
  ];
  const doneCount = setup.filter((s) => s.done).length;
  const name = ctx.displayName ?? null;

  return (
    <>
      <PageHeader
        title="오늘의 요약"
        description={
          name
            ? `${name} 님, 확인이 필요한 조문 변경과 예정된 검토 일정입니다.`
            : "확인이 필요한 조문 변경과 예정된 검토 일정입니다."
        }
        actions={
          <>
            <ButtonLink href="/laws" variant="secondary">
              <Icon name="search" size={15} />
              법령 탐색
            </ButtonLink>
          </>
        }
      />

      {/* 1) 지금 밀린 양 — 독립 카드 4개가 아니라 하나의 strip */}
      {/* 서명 색면 — 이 앱에서 짙은 면은 여기 하나뿐이다.
          "포인트 컬러가 없다 · 심심하다" 가 평가에서 세 번 반복됐는데,
          색을 새로 늘리면 4가지 변경 유형의 신호가 묻힌다. 대신 면적을
          다르게 해서 눈이 다른 층위로 읽게 한다. globals.css 주석 참고. */}
      <StatStrip signature>
        <Stat
          label="검토 필요"
          value={inboxOpenCount}
          tone={inboxOpenCount > 0 ? "warning" : "neutral"}
          href="/app/inbox"
        />
        <Stat
          label="7일 이내 시행"
          value={effectiveSoon}
          tone={effectiveSoon > 0 ? "danger" : "neutral"}
          href="/app/inbox"
        />
        <Stat label="진행 중 업무" value={taskOpenCount} href="/app/tasks" />
        <Stat label="관리 법령" value={watchCount} href="/app/watches" />
      </StatStrip>

      {doneCount < setup.length ? (
        <SetupChecklist steps={setup} done={doneCount} />
      ) : null}

      {/* 2) + 3) — 좌 65% / 우 35% */}
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <section>
          <SectionHeader
            title="확인이 필요한 변경"
            /* 정렬 기준을 적어둔다. 옆의 "다가오는 시행일" 은 날짜순인데 이
               목록만 도착순이라 같은 화면에서 기준이 달랐다. */
            description="시행일이 가까운 것부터"
            actions={
              recentInbox.total > 0 ? (
                <ButtonLink href="/app/inbox" variant="ghost" size="sm">
                  전체 {recentInbox.total.toLocaleString("ko-KR")}건
                  <Icon name="chevron-right" size={14} />
                </ButtonLink>
              ) : null
            }
          />
          {recentInbox.items.length === 0 ? (
            <Panel>
              <EmptyState
                icon="bell"
                title="아직 감지된 변경이 없습니다"
                description="관심 법령을 등록하면 개정이 감지될 때 여기에 모입니다."
                action={<ButtonLink href="/laws" variant="primary" size="sm">법령 탐색</ButtonLink>}
                compact
              />
            </Panel>
          ) : (
            <Panel className="divide-y divide-line overflow-hidden">
              {recentInbox.items.map((r) => (
                <ChangeRow key={r.id} item={r} />
              ))}
            </Panel>
          )}
        </section>

        <div className="space-y-8">
          <UpcomingSection items={upcomingEffective} />
          <OpenTasksSection items={openTasks.items} total={openTasks.total} />
        </div>
      </div>
    </>
  );
}

/* ── 확인이 필요한 변경: 한 행 ─────────────────────────────────────
 * 행 전체를 카드로 감싸지 않는다. 구분은 divider 하나로 충분하다.
 * 좌측에 "무엇이 바뀌었나", 우측에 "언제까지인가". */
function ChangeRow({ item }: { item: InboxListItem }) {
  const status = item.status as InboxStatus;
  return (
    <a
      href={`/app/inbox/${item.id}`}
      className="flex items-start gap-4 px-4 py-4 transition-colors duration-swift hover:bg-hover sm:px-5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-legal text-legal font-bold text-fg">
            {item.documentTitle}
          </span>
          <Badge tone={INBOX_STATUS_TONE[status] ?? "neutral"}>
            {INBOX_STATUS_LABEL[status] ?? item.status}
          </Badge>
        </div>
        <p className="mt-1 truncate text-sm text-fg-secondary">
          {eventTypeLabel(item.eventType)} · {changeSummaryLabel(item)}
          {item.ministry ? ` · ${item.ministry}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        <DDay date={item.effectiveDate} />
        {item.assignedMemberName ? (
          <span className="text-xs text-fg-muted">{item.assignedMemberName}</span>
        ) : null}
      </div>
    </a>
  );
}


/* ── 다가오는 일정 ────────────────────────────────────────────── */
function UpcomingSection({ items }: { items: UpcomingEffectiveItem[] }) {
  return (
    <section>
      <SectionHeader title="다가오는 시행일" />
      {items.length === 0 ? (
        <p className="text-sm text-fg-secondary">예정된 시행일이 없습니다.</p>
      ) : (
        <ol className="space-y-3">
          {items.map((it) => (
            <li key={it.id} className="flex gap-3">
              {/* 타임라인 선은 아주 옅게. 이벤트마다 강한 색을 쓰지 않는다. */}
              <div className="flex flex-col items-center pt-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
                <span className="mt-1 w-px flex-1 bg-line last:hidden" />
              </div>
              <a href={`/app/inbox/${it.id}`} className="group min-w-0 flex-1 pb-1">
                {/* 여기엔 임박도 표시가 아예 없었다. 날짜만으로는 D-13과
                    D-33이 같아 보인다 — "다가오는 시행일" 이라는 이름이
                    무색해진다. 목록과 같은 구간을 쓴다. */}
                <div className="flex items-center gap-2">
                  <DDay date={it.effectiveDate} className="text-xs" />
                  <span className="text-xs tabular text-fg-muted">
                    {formatKoreanDate(it.effectiveDate)}
                  </span>
                </div>
                <div className="mt-0.5 truncate font-legal text-legal font-bold text-fg group-hover:text-primary-text">
                  {it.documentTitle}
                </div>
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ── 진행 중 업무 ─────────────────────────────────────────────── */
function OpenTasksSection({
  items,
  total,
}: {
  items: TaskListItem[];
  total: number;
}) {
  return (
    <section>
      <SectionHeader
        title="진행 중 업무"
        actions={
          total > 0 ? (
            <ButtonLink href="/app/tasks" variant="ghost" size="sm">
              전체
              <Icon name="chevron-right" size={14} />
            </ButtonLink>
          ) : null
        }
      />
      {items.length === 0 ? (
        <p className="text-sm text-fg-secondary">
          등록된 업무가 없습니다.{" "}
          <a href="/app/tasks" className="text-primary-text hover:underline">
            업무 만들기
          </a>
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((t) => (
            <li key={t.id}>
              <a href={`/app/tasks/${t.id}`} className="group block">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-base text-fg group-hover:text-primary-text">
                    {t.title}
                  </span>
                  <Badge tone={TASK_STATUS_TONE[t.status as TaskStatus] ?? "neutral"}>
                    {TASK_STATUS_LABEL[t.status as TaskStatus] ?? t.status}
                  </Badge>
                </div>
                {t.dueAt || t.inboxDocumentTitle ? (
                  <p className="mt-0.5 truncate text-xs text-fg-muted">
                    {t.inboxDocumentTitle ?? ""}
                    {t.inboxDocumentTitle && t.dueAt ? " · " : ""}
                    {t.dueAt ? `${formatKoreanDate(t.dueAt)} 마감` : ""}
                  </p>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── 시작하기 ─────────────────────────────────────────────────── */
function SetupChecklist({
  steps,
  done,
}: {
  steps: { done: boolean; title: string; href: string; cta: string }[];
  done: number;
}) {
  return (
    <Panel className="mt-6 px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-base font-medium text-fg">시작하기</p>
        <span className="text-sm tabular text-fg-muted">
          {done} / {steps.length}
        </span>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {steps.map((s) => (
          <li key={s.title} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cx(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                s.done ? "bg-success text-primary-fg" : "border border-line-strong",
              )}
            >
              {s.done ? <Icon name="check" size={11} /> : null}
            </span>
            {s.done ? (
              <span className="text-sm text-fg-muted">{s.title}</span>
            ) : (
              <a href={s.href} className="text-sm text-fg hover:text-primary-text">
                {s.title}
              </a>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
