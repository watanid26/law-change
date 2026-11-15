import type { Metadata } from "next";
import Link from "next/link";
import { getCoverageSummary } from "@/lib/queries/coverage";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "데이터 안내 · LawChange",
  description:
    "LawChange가 어떤 데이터를 어디까지 담고 있는지, 어디서 가져오는지, 어떤 한계가 있는지 밝힙니다.",
};

// 담당자가 이 화면으로 판단하려면 "무엇이 안 들어 있는지" 를 알아야 한다.
// 잘 되는 것만 적으면 안 되는 것을 사고로 발견하게 된다.
export default async function AboutPage() {
  const c = await getCoverageSummary();
  const n = (v: number) => v.toLocaleString("ko-KR");

  return (
    <main className="mx-auto max-w-reading px-5 py-10">
      <h1 className="font-legal text-2xl font-bold text-fg">데이터 안내</h1>
      <p className="mt-3 text-sm leading-relaxed text-fg-secondary">
        LawChange는 법제처 국가법령정보 공개 API를 원본으로 합니다. 원문을 그대로
        보여주고, 판과 판을 조문 단위로 비교합니다. 해석이나 자문을 제공하지
        않습니다. 실제 의사결정 전에는 각 화면의 법제처 원문 링크로 확인해
        주십시오.
      </p>

      <h2 className="mt-9 text-base font-semibold text-fg">담고 있는 범위</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-fg-muted">
              <th className="py-2 pr-4 font-medium">구분</th>
              <th className="py-2 pr-4 font-medium tabular">문서</th>
              <th className="py-2 pr-4 font-medium tabular">개정 이력</th>
              <th className="py-2 font-medium">시작</th>
            </tr>
          </thead>
          <tbody className="text-fg">
            <tr className="border-b border-line">
              <td className="py-2.5 pr-4">법률·시행령·시행규칙</td>
              <td className="py-2.5 pr-4 tabular">{n(c.law.documents)}</td>
              <td className="py-2.5 pr-4 tabular">{n(c.law.changes)}</td>
              <td className="py-2.5">{c.law.since ?? "—"}</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2.5 pr-4">행정규칙(고시·훈령·예규 등)</td>
              <td className="py-2.5 pr-4 tabular">{n(c.adminRule.documents)}</td>
              <td className="py-2.5 pr-4 tabular">{n(c.adminRule.changes)}</td>
              <td className="py-2.5">{c.adminRule.since ?? "—"}</td>
            </tr>
            <tr className="border-b border-line">
              <td className="py-2.5 pr-4">법령해석례</td>
              <td className="py-2.5 pr-4 tabular">{n(c.interpretations)}</td>
              <td className="py-2.5 pr-4 tabular">—</td>
              <td className="py-2.5">—</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4">개인정보위·공정위 결정문</td>
              <td className="py-2.5 pr-4 tabular">{n(c.decisions)}</td>
              <td className="py-2.5 pr-4 tabular">—</td>
              <td className="py-2.5">—</td>
            </tr>
          </tbody>
        </table>
      </div>
      {c.lastSyncedAt ? (
        <p className="mt-3 text-sm text-fg-muted">
          마지막 수집 <span className="tabular">{c.lastSyncedAt}</span>
        </p>
      ) : null}

      <h2 className="mt-9 text-base font-semibold text-fg">알아두실 한계</h2>
      <ul className="mt-3 space-y-3 text-sm leading-relaxed text-fg-secondary">
        <li>
          <span className="font-medium text-fg">본문이 첨부 파일로만 오는 문서가 있습니다.</span>{" "}
          고시·공고 약 700건은 법제처가 본문을 조문 형태로 제공하지 않습니다. 이런
          문서는 조문 전문 대신 첨부 파일 링크를 보여드립니다.
        </li>
        <li>
          <span className="font-medium text-fg">시행일이 정해지지 않은 개정이 있습니다.</span>{" "}
          &ldquo;협정이 발효되는 날부터 시행&rdquo; 처럼 날짜를 특정할 수 없는
          경우입니다. 이때는 D-day 대신 &ldquo;시행일 미정&rdquo; 으로 표시하고
          시행 임박 목록에서 제외합니다.
        </li>
        <li>
          <span className="font-medium text-fg">오래된 판의 조문 전문은 보관하지 않습니다.</span>{" "}
          개정 내역(어떤 조문이 어떻게 바뀌었는지)은 처음부터 지금까지 모두 보관합니다.
          다만 &ldquo;특정 과거 시점의 전문을 통째로 보기&rdquo; 는 최근 판에 한합니다.
        </li>
        <li>
          <span className="font-medium text-fg">결정문은 소스에 따라 본문이 없을 수 있습니다.</span>{" "}
          개인정보보호위원회 의결서는 본문이 이미지 별지로 제공되는 경우가 있어
          텍스트로 가져오지 못합니다. 원문 링크로 확인해 주십시오.
        </li>
      </ul>

      <h2 className="mt-9 text-base font-semibold text-fg">갱신 주기</h2>
      <p className="mt-3 text-sm leading-relaxed text-fg-secondary">
        매일 아침 한 차례 새로 공포·발령된 개정을 수집합니다. 정부 API 는 지연
        등록이 있어, 날짜로 끊지 않고 이미 수집한 자료가 연속으로 나올 때까지
        최신순으로 거슬러 확인합니다.
      </p>

      <p className="mt-10 text-sm">
        <Link href="/laws" className="text-primary-text underline underline-offset-2 hover:no-underline">
          법령 목록으로
        </Link>
      </p>
    </main>
  );
}
