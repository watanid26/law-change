// 업무 — task management product 처럼. 업무 제목이 가장 중요하고,
// 관련 법령은 secondary metadata 로 내린다.
//
// 제2판은 5열 테이블이었다. 제목과 상태 배지와 우선순위 배지가 같은 크기로
// 놓여서 "무엇을 해야 하는지"보다 "배지 벽"이 먼저 보였다.
// 제3판은 리스트 + 체크 아이콘. 완료 업무는 톤을 낮춘다.
//
// 쿼리 파라미터(q / status / priority / page)와 필터 의미는 그대로다.

import { requireUserContext } from "@/lib/auth/session";
import { listTasks, type TaskListItem } from "@/lib/tasks/queries";
import { listMembers } from "@/lib/members/service";
import { computeDDay, formatKoreanDate } from "@/lib/format";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  TASK_STATUS_VALUES,
  TASK_CLOSED_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/labels";
import { CreateTaskInline } from "./CreateTaskInline";
import { Icon } from "@/components/Icon";
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  FilterBar,
  FilterSelect,
  PageHeader,
  Panel,
  Pagination,
  SearchInput,
  cx,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface Props {
  searchParams: { q?: string; status?: string; priority?: string; page?: string };
}

export default async function TasksPage({ searchParams }: Props) {
  const ctx = await requireUserContext();

  const search = searchParams.q?.trim() || undefined;
  const status = searchParams.status?.trim() || undefined;
  const priority = searchParams.priority?.trim() || undefined;
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [{ items, total }, members] = await Promise.all([
    listTasks({
      workspaceId: ctx.workspaceId,
      status,
      priority,
      search,
      limit: PAGE_SIZE,
      offset,
    }),
    listMembers(ctx.workspaceId, ctx.memberId),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 담당자 드롭다운용 축약 리스트. LEFT/SUSPENDED 제외.
  const assignableMembers = members
    .filter((m) => m.status === "ACTIVE" || m.status === "INVITED")
    .map((m) => ({
      id: m.id,
      label: m.displayName ?? m.email ?? "이름 미등록",
      isCurrentUser: m.isCurrentUser,
    }));

  const qs = (over: Record<string, string | undefined>) => {
    const usp = new URLSearchParams();
    const merged = {
      q: search,
      status,
      priority,
      page: page > 1 ? String(page) : undefined,
      ...over,
    };
    for (const [k, val] of Object.entries(merged)) if (val) usp.set(k, val);
    const str = usp.toString();
    return str ? `/app/tasks?${str}` : "/app/tasks";
  };
  const hasFilters = Boolean(search || status || priority);

  return (
    <>
      <PageHeader
        title="업무"
        description="법령 변경에 대한 조치를 업무로 관리합니다."
        meta={`${total.toLocaleString("ko-KR")}건`}
        actions={
          <>
            <a href="/api/export/tasks" className="contents">
              <Button variant="secondary" type="button">
                <Icon name="download" size={15} />
                내보내기
              </Button>
            </a>
            <CreateTaskInline members={assignableMembers} />
          </>
        }
      />

      <FilterBar action="/app/tasks">
        <SearchInput
          name="q"
          defaultValue={search ?? ""}
          placeholder="업무 제목 검색"
          aria-label="업무 제목 검색"
          wrapperClassName="max-w-sm"
        />
        <FilterSelect name="status" defaultValue={status ?? ""} aria-label="상태">
          {/* '진행 중' 문구는 IN_PROGRESS 상태와 겹쳐 오해를 부른다. 기본은 '상태 전체'. */}
          <option value="">상태 전체</option>
          {TASK_STATUS_VALUES.map((v) => (
            <option key={v} value={v}>
              {TASK_STATUS_LABEL[v]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect name="priority" defaultValue={priority ?? ""} aria-label="우선순위">
          <option value="">우선순위 전체</option>
          {TASK_PRIORITY_VALUES.map((v) => (
            <option key={v} value={v}>
              {TASK_PRIORITY_LABEL[v]}
            </option>
          ))}
        </FilterSelect>
        <Button type="submit" variant="secondary">
          필터 적용
        </Button>
        {hasFilters ? (
          <ButtonLink href="/app/tasks" variant="ghost">
            초기화
          </ButtonLink>
        ) : null}
      </FilterBar>

      <div className="mt-5">
        {items.length === 0 ? (
          <Panel>
            {hasFilters ? (
              <EmptyState
                icon="search"
                title="조건에 맞는 업무가 없습니다"
                description="검색어나 필터를 조정해 보세요."
                action={
                  <ButtonLink href="/app/tasks" variant="secondary" size="sm">
                    필터 초기화
                  </ButtonLink>
                }
                compact
              />
            ) : (
              <EmptyState
                icon="list-checks"
                title="등록된 업무가 없습니다"
                description="변경 알림에서 조치가 필요한 항목을 업무로 만들 수 있습니다."
                action={
                  <ButtonLink href="/app/inbox" variant="primary" size="sm">
                    변경 알림 보기
                  </ButtonLink>
                }
              />
            )}
          </Panel>
        ) : (
          <Panel className="divide-y divide-line overflow-hidden">
            {items.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </Panel>
        )}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        buildHref={(p) => qs({ page: p > 1 ? String(p) : undefined })}
      />
    </>
  );
}

function TaskRow({ task }: { task: TaskListItem }) {
  const st = task.status as TaskStatus;
  const closed = TASK_CLOSED_STATUSES.includes(st);
  const pr = task.priority as TaskPriority;
  const dday = task.dueAt ? computeDDay(task.dueAt) : null;
  const overdue = !closed && dday !== null && dday < 0;

  return (
    <a
      href={`/app/tasks/${task.id}`}
      className="flex items-start gap-3 px-4 py-4 transition-colors duration-swift hover:bg-hover sm:px-5"
    >
      {/* 상태 표식. 실제 토글 기능이 없으므로 체크박스가 아니라 표식으로만 둔다. */}
      <span
        aria-hidden="true"
        className={cx(
          "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border",
          closed
            ? "border-success bg-success text-primary-fg"
            : "border-line-strong",
        )}
      >
        {closed ? <Icon name="check" size={11} /> : null}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cx(
              "text-base font-medium",
              closed ? "text-fg-muted" : "text-fg",
            )}
          >
            {task.title}
          </span>
          {!closed && (pr === "HIGH" || pr === "URGENT") ? (
            <Badge tone={TASK_PRIORITY_TONE[pr]}>{TASK_PRIORITY_LABEL[pr]}</Badge>
          ) : null}
        </div>
        {task.inboxDocumentTitle ? (
          <p className="mt-1 truncate text-sm text-fg-secondary">
            {task.inboxDocumentTitle}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={TASK_STATUS_TONE[st] ?? "neutral"}>
          {TASK_STATUS_LABEL[st] ?? task.status}
        </Badge>
        {task.dueAt ? (
          <span
            className={cx(
              "text-xs tabular",
              overdue ? "text-danger" : "text-fg-muted",
            )}
          >
            {formatKoreanDate(task.dueAt)}
            {overdue ? " 지남" : " 마감"}
          </span>
        ) : null}
      </div>
    </a>
  );
}
