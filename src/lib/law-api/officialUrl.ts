// 사용자 화면에 노출되는 국가법령정보센터 "공식 원문" URL 빌더.
// 반드시 OC(우리 API 시크릿)를 포함하지 않은 공개 URL이어야 함.
// 법제처 상세 API 응답의 링크는 OC를 포함하므로 그대로 저장하지 말고 이 함수로 재생성.

export type SourceType = "LAW" | "ADMIN_RULE";

const PUBLIC_BASE = "https://www.law.go.kr";

// 법령: https://www.law.go.kr/법령/법령ID/(공포일자)
// 실무에서는 /LSW/lsInfoP.do?lsiSeq= 도 쓰이지만 짧은 URL을 우선.
// 유효성이 100% 보장되진 않으므로 fallback으로 검색 URL도 준비.
export function buildPublicOfficialUrl(sourceType: SourceType, sourceId: string, title?: string): string {
  if (sourceType === "LAW") {
    // 안정적으로 접근 가능한 형태: 법령 상세 검색 (법령ID)
    return `${PUBLIC_BASE}/LSW/lsInfoP.do?lsId=${encodeURIComponent(sourceId)}`;
  }
  if (sourceType === "ADMIN_RULE") {
    // 행정규칙: 행정규칙 상세 (행정규칙ID)
    return `${PUBLIC_BASE}/LSW/admRulInfoP.do?admRulSeq=${encodeURIComponent(sourceId)}`;
  }
  // Fallback: 검색
  const q = title ?? sourceId;
  return `${PUBLIC_BASE}/LSW/lsScListR.do?query=${encodeURIComponent(q)}`;
}
