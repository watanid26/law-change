// 법령번호 표기. "법률 제21065호" / "고시 제2026-10호".
//
// 상세 헤더에서만 쓰다가 목록으로도 뺐다. 제목만으로는 구분이 안 되는 문서가
// 실제로 있기 때문이다 — 전수점검에서 제목+종류가 겹치는 그룹이 27개
// (여분 58건) 나왔는데, 전부 고시였다. 예를 들어 행정안전부 "안전기준 등록"
// 은 8건이 있고 제목·종류·소관부처가 모두 같다. 발령번호(2017-6, 2018-17,
// 2018-39 …)만 다르다. 목록에 번호가 없으면 같은 줄이 여덟 개 보인다.

export function formatDocumentNumber(
  sourceType: string,
  documentType: string,
  promulgationNumber: string | null,
  issuanceNumber: string | null,
): string {
  if (sourceType === "ADMIN_RULE" && issuanceNumber) {
    return `${documentType} 제${issuanceNumber}호`;
  }
  if (promulgationNumber) return `${documentType} 제${promulgationNumber}호`;
  if (issuanceNumber) return `${documentType} 제${issuanceNumber}호`;
  return "-";
}
