"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm";

interface Props {
  pendingCount: number;
}

interface ActionDef {
  key: string;
  label: string;
  description: string;
  danger?: boolean;
  confirm?: string;
  payload: Record<string, unknown>;
}

export function AdminActions({ pendingCount }: Props) {
  const confirm = useConfirm();
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const isPending = runningKey !== null;
  const router = useRouter();

  const actions: ActionDef[] = [
    {
      key: "run_catalog_sync",
      label: "카탈로그 sync (최근 45일)",
      description: "법령 + 고시 목록 스캔 → 큐잉.",
      payload: { action: "run_catalog_sync" },
    },
    {
      key: "run_jobs",
      label: `잡 15개 처리${pendingCount > 0 ? ` (대기 ${pendingCount})` : ""}`,
      description: "큐에서 15개 원자적 pop → 상세 수집. stale 복구 포함.",
      payload: { action: "run_jobs" },
    },
    {
      key: "run_maintenance",
      label: "정비 (stale 복구 + 정리)",
      description: "RUNNING 방치 잡 재시도, 30일 지난 DONE 잡 삭제.",
      payload: { action: "run_maintenance" },
    },
    {
      key: "run_weekly_integrity",
      label: "주간 무결성 검사",
      description: "확인 안 된 지 오래된 200개 문서의 최신 버전 ID를 API로 재확인.",
      payload: { action: "run_weekly_integrity" },
    },
    {
      key: "run_monthly_reconciliation",
      label: "월간 대조 (LAW)",
      description: "법제처 목록 vs DB. 누락된 sourceId 큐잉, 사라진 문서 검출.",
      danger: true,
      confirm: "API 전체 목록을 훑습니다 (수 분 소요). 계속?",
      payload: { action: "run_monthly_reconciliation", sourceType: "LAW" },
    },
    {
      key: "bootstrap_law",
      label: "부트스트랩 (LAW · 10페이지)",
      description: "이전 커서에서 이어서 최대 10페이지 진행. 반복 실행하면 이어서 진행.",
      danger: true,
      confirm: "이 실행에서 최대 1,000건까지 스캔합니다. 진행?",
      payload: { action: "run_bootstrap", sourceType: "LAW", maxPagesPerRun: 10 },
    },
    {
      key: "bootstrap_admin_rule",
      label: "부트스트랩 (ADMIN_RULE · 10페이지)",
      description: "고시 전체 스캔. 이전 커서에서 이어서.",
      danger: true,
      confirm: "이 실행에서 최대 1,000건까지 스캔합니다. 진행?",
      payload: { action: "run_bootstrap", sourceType: "ADMIN_RULE", maxPagesPerRun: 10 },
    },
  ];

  const runAction = async (def: ActionDef) => {
    if (def.confirm) {
      const ok = await confirm({
        title: def.confirm,
        confirmLabel: "실행",
        tone: def.danger ? "danger" : "primary",
      });
      if (!ok) return;
    }
    setRunningKey(def.key);
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(def.payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setLastResult(`❌ ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
      } else {
        setLastResult(`✅ ${def.label} 완료 — ${JSON.stringify(json.report ?? json).slice(0, 600)}`);
        startTransition(() => { router.refresh(); });
      }
    } catch (err) {
      setLastResult(`❌ 예외: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunningKey(null);
    }
  };

  return (
    <section className="rounded-md border border-line bg-surface p-5">
      <p className="text-xs text-fg-muted mb-4">관리자 액션</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {actions.map((def) => (
          <div
            key={def.key}
            className={`border p-4 ${def.danger ? "border-change-modifiedMark bg-change-modifiedPanel/40" : "border-line bg-surface"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">{def.label}</p>
                <p className="mt-1 text-xs text-fg-secondary">{def.description}</p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => { void runAction(def); }}
                className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                  def.danger
                    // change-modifiedText 는 다크에서 밝은 앰버로 flip 하므로
                    // 이 버튼만은 글자색도 같이 flip 해야 한다 (accent-on 아님).
                    ? "bg-warning text-primary-fg hover:opacity-90"
                    : "bg-primary text-primary-fg hover:bg-primary-hover"
                }`}
              >
                {runningKey === def.key ? "실행 중…" : "실행"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {lastResult && (
        <pre className="mt-5 text-xs whitespace-pre-wrap break-all border border-line bg-subtle p-3 max-h-60 overflow-y-auto tabular">
          {lastResult}
        </pre>
      )}
    </section>
  );
}
