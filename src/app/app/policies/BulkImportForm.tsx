"use client";

// 라운드 19-B2: 사규 CSV 벌크 임포트. 심사 지적 [FRICTION]: 15건 등록 = 모달 15번.
// 형식: title, type, url  (한 줄에 한 사규, 콤마 구분. url 은 선택)
// type 은 한글 라벨(사규/지침/…) 또는 영문 코드(REGULATION/GUIDELINE/…) 모두 허용.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  POLICY_TYPE_LABEL,
  POLICY_TYPE_VALUES,
  type PolicyType,
} from "@/lib/policies/labels";
import { bulkCreatePoliciesAction } from "@/lib/policies/actions";

// 한글 라벨 → PolicyType 역매핑 (사용자가 한글로 CSV 붙여도 파싱)
const LABEL_TO_TYPE: Record<string, PolicyType> = Object.fromEntries(
  POLICY_TYPE_VALUES.map((v) => [POLICY_TYPE_LABEL[v], v]),
) as Record<string, PolicyType>;

interface ParsedRow {
  title: string;
  type: PolicyType;
  externalUrl?: string;
}

interface ParseResult {
  items: ParsedRow[];
  errors: string[];
}

function parseCsv(raw: string): ParseResult {
  const items: ParsedRow[] = [];
  const errors: string[] = [];
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, idx) => {
    // 헤더 스킵 (title,type,url 등)
    if (idx === 0 && /^title[,\t]/i.test(line)) return;
    const cols = line.split(/[,\t]/).map((c) => c.trim());
    if (cols.length < 2) {
      errors.push(`L${idx + 1}: 최소 2개 컬럼 필요 (title, type[, url])`);
      return;
    }
    const title = cols[0].replace(/^"|"$/g, "");
    if (!title) {
      errors.push(`L${idx + 1}: title 이 비어있음`);
      return;
    }
    if (title.length > 200) {
      errors.push(`L${idx + 1}: title 이 200자 초과`);
      return;
    }
    const typeRaw = cols[1].replace(/^"|"$/g, "");
    const type =
      (LABEL_TO_TYPE[typeRaw] as PolicyType | undefined) ??
      (POLICY_TYPE_VALUES.includes(typeRaw as PolicyType) ? (typeRaw as PolicyType) : undefined);
    if (!type) {
      errors.push(
        `L${idx + 1}: type "${typeRaw}" 알 수 없음. ` +
          `(${Object.keys(LABEL_TO_TYPE).slice(0, 4).join("/")} … 중 하나)`,
      );
      return;
    }
    const urlRaw = cols[2]?.replace(/^"|"$/g, "");
    let externalUrl: string | undefined;
    if (urlRaw) {
      try {
        // eslint-disable-next-line no-new
        new URL(urlRaw);
        externalUrl = urlRaw;
      } catch {
        errors.push(`L${idx + 1}: URL 형식 오류 "${urlRaw}"`);
        return;
      }
    }
    items.push({ title, type, externalUrl });
  });
  if (items.length > 200) {
    errors.push(`200건 초과 (현재 ${items.length}건). 여러 배치로 나누세요.`);
  }
  return { items, errors };
}

export function BulkImportForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = parseCsv(raw);

  function submit() {
    if (parsed.errors.length > 0 || parsed.items.length === 0) {
      setMsg({ kind: "error", text: "파싱 오류를 먼저 해결하세요." });
      return;
    }
    startTransition(async () => {
      const result = await bulkCreatePoliciesAction({ items: parsed.items });
      if (result.ok) {
        setMsg({ kind: "ok", text: `${result.data?.createdCount ?? 0}건 등록 완료` });
        setRaw("");
        router.refresh();
        setTimeout(() => setOpen(false), 1200);
      } else {
        setMsg({ kind: "error", text: result.error });
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-base font-medium text-fg transition-colors duration-swift hover:bg-hover"
      >
        CSV 벌크 등록
      </button>
    );
  }

  return (
    <div className="w-full border border-line border-l-[3px] border-l-primary bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-fg">사규 벌크 등록 (최대 200건)</h3>
        <button
          type="button"
          onClick={() => { setOpen(false); setRaw(""); setMsg(null); }}
          disabled={pending}
          className="text-xs text-fg-secondary hover:text-fg"
        >
          닫기
        </button>
      </div>
      <p className="mb-2 text-xs text-fg-secondary">
        형식: <code className="border border-line bg-canvas px-1">title, type, url</code>
        {" "}(한 줄에 한 사규, 콤마 또는 탭 구분. url은 선택. 첫 줄이 헤더면 자동 스킵.)
      </p>
      <p className="mb-2 text-xs text-fg-secondary">
        type 값: {POLICY_TYPE_VALUES.map((v) => POLICY_TYPE_LABEL[v]).join(" · ")}
      </p>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={10}
        placeholder={`개인정보처리방침,개인정보처리방침,https://intranet.company.com/policy/privacy
정보보안 규정,사규
전자결재 SOP,SOP,https://intranet.company.com/sop/erp`}
        className="block w-full border border-line-strong bg-canvas px-3 py-2 text-sm tabular text-fg placeholder:text-fg-muted focus:border-primary focus:outline-none"
      />
      <div className="mt-3 flex items-center justify-between text-xs">
        <div>
          <span className={parsed.items.length > 0 ? "text-primary-text" : "text-fg-secondary"}>
            해석: {parsed.items.length}건
          </span>
          {parsed.errors.length > 0 && (
            <span className="ml-3 text-danger">오류: {parsed.errors.length}건</span>
          )}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={pending || parsed.items.length === 0 || parsed.errors.length > 0}
          className="h-9 box-border inline-flex items-center justify-center border border-primary bg-primary px-5 text-sm font-semibold text-primary-fg hover:bg-primary-hover hover:border-primary-hover transition-colors duration-swift ease-swift disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? "등록 중…" : `${parsed.items.length}건 등록`}
        </button>
      </div>
      {parsed.errors.length > 0 && (
        <div className="mt-3 max-h-40 overflow-y-auto border border-danger/30 bg-danger-subtle/40 p-3 text-xs text-danger">
          {parsed.errors.slice(0, 15).map((e, i) => (
            <div key={i}>{e}</div>
          ))}
          {parsed.errors.length > 15 && <div>... 외 {parsed.errors.length - 15}건</div>}
        </div>
      )}
      {msg && (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={`mt-3 text-xs ${msg.kind === "ok" ? "text-primary-text" : "text-danger"}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
