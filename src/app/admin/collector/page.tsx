import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Icon } from "@/components/Icon";
import { getCollectorStatus } from "@/lib/queries/collectorStatus";
import { formatKoreanDate } from "@/lib/format";
import { checkAdminSession } from "@/lib/security/auth";
import { redirect } from "next/navigation";
import { AdminActions } from "./AdminActions";

export const dynamic = "force-dynamic";

export default async function AdminCollectorPage() {
  // 미들웨어가 쿠키 유무를 검사, 여기서 서명까지 재검사 (defense in depth)
  const session = checkAdminSession();
  if (!session.ok) {
    redirect(`/admin/login?next=/admin/collector`);
  }

  const status = await getCollectorStatus();

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />

      <main className="flex-1 min-w-0 flex flex-col">
        <header className="border-b border-line bg-surface px-8 pt-8 pb-6">
          <nav className="mb-3 flex items-center gap-2 text-xs text-fg-muted">
            <Link href="/laws" className="hover:text-fg">홈</Link>
            <Icon name="chevron-right" size={11} className="text-fg-muted" />
            <span className="text-fg-secondary">관리자 · 수집 현황</span>
          </nav>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-title text-fg">
                수집 현황
              </h1>
              <p className="mt-2 tabular text-xs font-medium text-fg-secondary">
                마지막 성공 {status.lastSuccessAt ? formatTimestamp(status.lastSuccessAt) : "없음"}
                {status.lastFailureAt ? ` · 마지막 실패 ${formatTimestamp(status.lastFailureAt)}` : ""}
              </p>
            </div>
            <form action="/admin/logout" method="get">
              <button
                type="submit"
                className="border border-line bg-surface px-4 py-2 text-sm text-fg-secondary hover:bg-hover"
              >
                로그아웃
              </button>
            </form>
          </div>
        </header>

        <div className="flex-1 py-2 space-y-8">
          {/* 문서 지표 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line border border-line">
            <MetricCard label="수집 문서 (전체)" value={status.documentCount} unit="개" />
            <MetricCard
              label="법령"
              value={status.documentCountByType.find((d) => d.sourceType === "LAW")?.count ?? 0}
              unit="개"
            />
            <MetricCard
              label="고시·행정규칙"
              value={status.documentCountByType.find((d) => d.sourceType === "ADMIN_RULE")?.count ?? 0}
              unit="개"
            />
            <MetricCard label="누적 버전" value={status.versionCount} unit="개" />
          </div>

          {/* 잡 상태 */}
          <section>
            <p className="text-xs text-fg-muted mb-3">잡 큐 상태</p>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-line border border-line">
              <JobCountCard label="PENDING" value={status.jobsByStatus.PENDING} tone="neutral" />
              <JobCountCard label="RUNNING" value={status.jobsByStatus.RUNNING} tone="info" />
              <JobCountCard label="RETRY" value={status.jobsByStatus.RETRY} tone="warn" />
              <JobCountCard label="DONE" value={status.jobsByStatus.DONE} tone="success" />
              <JobCountCard label="FAILED" value={status.jobsByStatus.FAILED} tone={status.jobsByStatus.FAILED > 0 ? "warn" : "neutral"} />
              <JobCountCard label="DEAD" value={status.jobsByStatus.DEAD} tone={status.jobsByStatus.DEAD > 0 ? "danger" : "neutral"} />
            </div>
          </section>

          {/* 관리자 액션 */}
          <AdminActions
            pendingCount={status.jobsByStatus.PENDING + status.jobsByStatus.RETRY}
          />

          {/* 실행 이력 */}
          <section className="border border-line bg-surface overflow-hidden">
            <header className="border-b border-line bg-subtle px-5 py-3">
              <p className="text-xs text-fg-muted">최근 실행 이력 (20건)</p>
            </header>
            {status.runs.length === 0 ? (
              <div className="p-10 text-center text-sm text-fg-secondary">
                아직 실행 이력이 없습니다. 위 액션 버튼으로 수동 실행하세요.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-subtle text-xs text-fg-muted">
                    <th className="px-4 py-2.5 text-left font-normal">시작</th>
                    <th className="px-4 py-2.5 text-left font-normal">유형</th>
                    <th className="px-4 py-2.5 text-left font-normal">상태</th>
                    <th className="px-4 py-2.5 text-right font-normal">소요</th>
                    <th className="px-4 py-2.5 text-right font-normal">스캔</th>
                    <th className="px-4 py-2.5 text-right font-normal">신규</th>
                    <th className="px-4 py-2.5 text-right font-normal">변경</th>
                    <th className="px-4 py-2.5 text-right font-normal">성공</th>
                    <th className="px-4 py-2.5 text-right font-normal">실패</th>
                    <th className="px-4 py-2.5 text-right font-normal">Stale</th>
                  </tr>
                </thead>
                <tbody>
                  {status.runs.map((r) => (
                    <tr key={r.id} className="border-b border-line bg-surface last:border-0">
                      <td className="px-4 py-2.5 tabular text-xs text-fg whitespace-nowrap">{formatTimestamp(r.startedAt)}</td>
                      <td className="px-4 py-2.5 text-fg whitespace-nowrap">{r.jobType}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <StatusBadge status={r.status} />
                        {r.errorMessage && (
                          <span title={r.errorMessage} className="ml-1 text-xs text-danger cursor-help">⚠</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-fg-secondary whitespace-nowrap text-right">
                        {r.elapsedMs !== null ? `${(r.elapsedMs / 1000).toFixed(1)}s` : "-"}
                      </td>
                      <td className="px-4 py-2.5 tabular text-xs text-fg whitespace-nowrap text-right">{r.scannedCount}</td>
                      <td className="px-4 py-2.5 tabular text-xs text-fg whitespace-nowrap text-right">{r.newCount}</td>
                      <td className="px-4 py-2.5 tabular text-xs text-fg whitespace-nowrap text-right">{r.changedCount}</td>
                      <td className="px-4 py-2.5 tabular text-xs text-fg whitespace-nowrap text-right">{r.successCount}</td>
                      <td className={`px-4 py-2.5 tabular text-xs whitespace-nowrap text-right ${r.failCount > 0 ? "text-danger font-semibold" : "text-fg-muted"}`}>
                        {r.failCount}
                      </td>
                      <td className="px-4 py-2.5 tabular text-xs whitespace-nowrap text-right text-fg-secondary">
                        {r.staleRecoveredCount || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {status.bootstrapProgress.length > 0 && (
            <section className="border border-line bg-surface overflow-hidden">
              <header className="border-b border-line bg-subtle px-5 py-3">
                <p className="text-xs text-fg-muted">부트스트랩 진행 상황</p>
              </header>
              <ul>
                {status.bootstrapProgress.map((b) => (
                  <li key={b.id} className="border-b border-line bg-surface px-5 py-4 last:border-b-0">
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium text-fg">{b.sourceType}</span>
                        <span className="ml-2 text-fg-secondary">scope={b.scope}</span>
                        <span className="ml-2"><StatusBadge status={b.status} /></span>
                      </div>
                      <span className="tabular text-xs font-medium text-fg-secondary">
                        커서 {b.cursorPage} · 스캔 {b.scannedCount}/{b.totalCount || "?"} · 큐잉 {b.enqueuedCount}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 bg-subtle">
                      <div
                        className={`h-full ${b.status === "FAILED" ? "bg-danger" : b.status === "COMPLETED" ? "bg-primary" : "bg-primary/50"}`}
                        style={{ width: `${b.progressPercent}%` }}
                      />
                    </div>
                    {b.lastError && (
                      <p className="mt-2 text-xs text-danger truncate" title={b.lastError}>
                        ⚠ {b.lastError}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {status.auditLog.length > 0 && (
            <section className="border border-line bg-surface overflow-hidden">
              <header className="border-b border-line bg-subtle px-5 py-3">
                <p className="text-xs text-fg-muted">감사 로그 (최근 10건)</p>
              </header>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line bg-subtle tabular text-xs text-fg-secondary">
                    <th className="px-4 py-2.5 text-left font-normal">시각</th>
                    <th className="px-4 py-2.5 text-left font-normal">actor</th>
                    <th className="px-4 py-2.5 text-left font-normal">action</th>
                    <th className="px-4 py-2.5 text-left font-normal">target</th>
                    <th className="px-4 py-2.5 text-left font-normal">결과</th>
                  </tr>
                </thead>
                <tbody>
                  {status.auditLog.map((a) => (
                    <tr key={a.id} className="border-b border-line bg-surface last:border-0">
                      <td className="px-4 py-2.5 tabular text-xs whitespace-nowrap text-fg-secondary">{formatTimestamp(a.createdAt)}</td>
                      <td className="px-4 py-2.5 text-fg">{a.actor}</td>
                      <td className="px-4 py-2.5 tabular text-fg">{a.action}</td>
                      <td className="px-4 py-2.5 tabular text-fg-secondary truncate max-w-[220px]">{a.target ?? "-"}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-[3px] text-xs font-medium ${
                            a.outcome === "success"
                              ? "border border-change-addedMark bg-change-addedPanel text-success"
                              : a.outcome === "conflict"
                                ? "border border-change-modifiedMark bg-change-modifiedPanel text-warning"
                                : "border border-danger bg-danger-subtle text-danger"
                          }`}
                        >
                          {a.outcome}
                        </span>
                        {a.errorMessage && (
                          <span title={a.errorMessage} className="ml-1 text-danger cursor-help">⚠</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {status.latestFailedJobs.length > 0 && (
            <section className="border border-danger bg-danger-subtle/40 overflow-hidden">
              <header className="border-b border-danger/40 bg-danger-subtle px-5 py-3 flex items-center justify-between">
                <p className="tabular text-xs text-danger">실패·재시도 대기 잡 (최근 10건)</p>
              </header>
              <ul>
                {status.latestFailedJobs.map((j) => (
                  <li key={j.id} className="border-b border-danger/20 px-5 py-4 last:border-b-0">
                    <div className="flex items-center justify-between text-xs text-fg-secondary">
                      <span>
                        <StatusBadge status={j.status} /> {j.jobType} · {j.sourceType}:{j.sourceId} · 시도 {j.attemptCount}회
                      </span>
                      <span className="tabular">{formatTimestamp(j.updatedAt)}</span>
                    </div>
                    {j.lastError && (
                      <pre className="mt-1.5 text-xs whitespace-pre-wrap break-all text-danger bg-surface p-2 max-h-32 overflow-y-auto border border-danger/30">
                        {j.lastError}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string;
  unit?: string;
}) {
  return (
    <div className="bg-surface p-5">
      <p className="text-xs text-fg-secondary">{label}</p>
      <p className="mt-2 tabular text-2xl tracking-subtitle text-fg">
        {typeof value === "number" ? value.toLocaleString() : value}
        {unit ? <span className="ml-1 text-sm text-fg-secondary">{unit}</span> : null}
      </p>
    </div>
  );
}

function JobCountCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "info" | "success" | "warn" | "danger";
}) {
  const toneCls: Record<typeof tone, string> = {
    neutral: "bg-surface text-fg",
    info: "bg-surface text-primary-text",
    success: "bg-change-addedPanel text-success",
    warn: "bg-change-modifiedPanel text-warning",
    danger: "bg-danger-subtle text-danger",
  } as Record<string, string>;
  return (
    <div className={`p-4 ${toneCls[tone]}`}>
      <p className="tabular text-xs opacity-70">{label}</p>
      <p className="mt-1 tabular text-xl">{value.toLocaleString()}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: "border-change-addedMark bg-change-addedPanel text-success",
    partial_success: "border-change-modifiedMark bg-change-modifiedPanel text-warning",
    failed: "border-danger bg-danger-subtle text-danger",
    running: "border-primary bg-change-addedPanel text-primary-text",
    PENDING: "border-line bg-subtle text-fg-secondary",
    RUNNING: "border-primary bg-change-addedPanel text-primary-text",
    RETRY: "border-change-modifiedMark bg-change-modifiedPanel text-warning",
    DONE: "border-change-addedMark bg-change-addedPanel text-success",
    FAILED: "border-danger bg-danger-subtle text-danger",
    DEAD: "border-danger bg-danger-subtle text-danger",
  };
  const cls = map[status] ?? "border-line bg-subtle text-fg";
  return (
    <span className={`inline-flex items-center border text-xs font-medium px-2 py-[2px] ${cls}`}>
      {status}
    </span>
  );
}

function formatTimestamp(d: Date): string {
  const date = new Date(d);
  // 서버 렌더라 지역시간(UTC)으로 찍힌다. 수집기 실행 시각을 볼 때
  // 9시간 어긋나면 "언제 돌았나" 를 잘못 읽는다. 서울 기준으로 고정.
  const seoul = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = seoul.getFullYear();
  const mo = String(seoul.getMonth() + 1).padStart(2, "0");
  const day = String(seoul.getDate()).padStart(2, "0");
  const h = String(seoul.getHours()).padStart(2, "0");
  const mi = String(seoul.getMinutes()).padStart(2, "0");
  return `${y}.${mo}.${day} ${h}:${mi}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unusedFormatKorean = formatKoreanDate;
