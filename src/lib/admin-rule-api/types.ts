// 법제처 행정규칙 Open API 응답 타입
// - target=admrul (목록·상세)
// - 법령 계열과 달리 조문내용이 문자열 배열, 별도 조문단위 구조는 없음

export interface AdminRuleListItem {
  행정규칙ID: string;
  행정규칙일련번호: string;
  행정규칙명: string;
  행정규칙종류: string; // 고시 | 훈령 | 예규 | 지침 | 기타 ...
  소관부처명: string;
  제개정구분명: string;
  제개정구분코드?: string;
  발령일자: string; // YYYYMMDD
  발령번호: string;
  시행일자: string; // YYYYMMDD
  생성일자?: string;
  현행연혁구분: string; // 현행 | 연혁 | 시행예정
  행정규칙상세링크: string;
  id: string;
}

export interface AdminRuleSearchResponse {
  AdmRulSearch: {
    target: string;
    totalCnt: string;
    page?: string;
    numOfRows?: string;
    resultCode?: string;
    resultMsg?: string;
    admrul?: AdminRuleListItem[] | AdminRuleListItem;
    키워드?: string;
    section?: string;
  };
}

export interface AdminRuleBasicInfo {
  행정규칙ID: string;
  행정규칙일련번호: string;
  행정규칙명: string;
  행정규칙종류: string;
  행정규칙종류코드?: string;
  현행여부?: string;
  발령일자: string;
  발령번호: string;
  시행일자: string;
  제개정구분명: string;
  제개정구분코드?: string;
  소관부처명: string;
  소관부처코드?: string;
  상위부처명?: string;
  담당부서기관명?: string;
  담당부서기관코드?: string;
  담당자명?: string;
  전화번호?: string;
  조문형식여부?: string;
  생성일자?: string;
}

export interface AdminRuleAddendum {
  부칙공포일자?: string;
  부칙공포번호?: string;
  부칙내용?: string | string[];
}

// 실제 응답은 파일명/파일링크가 아니라 첨부파일명/첨부파일링크 병렬 배열이다.
// 파일이 하나뿐이면 배열이 아니라 문자열로 온다.
export interface AdminRuleAttachment {
  첨부파일명?: string | string[];
  첨부파일링크?: string | string[];
}

// 국무총리훈령·대통령훈령은 본문이 최상위 조문내용이 아니라 조문 블록 안에
// 병렬 배열로 들어온다. 조문번호[i] / 조문내용[i] / 조문제목[i] 가 같은 조문이다.
export interface AdminRuleArticleBlock {
  조문번호?: string | string[];
  조문내용?: string | string[];
  조문제목?: string | string[];
}

export interface AdminRuleDetailResponse {
  AdmRulService: {
    행정규칙기본정보: AdminRuleBasicInfo;
    조문내용?: string | string[]; // 각 원소가 하나의 조문 텍스트
    조문?: AdminRuleArticleBlock | AdminRuleArticleBlock[];
    부칙?: AdminRuleAddendum | AdminRuleAddendum[];
    별표?: unknown;
    첨부파일?: AdminRuleAttachment | AdminRuleAttachment[];
    제개정이유?: string;
  };
}
