// 법제처 국가법령정보 Open API 응답 타입
// https://open.law.go.kr/LSO/openApi/guideList.do

// ────────── 검색 (lawSearch.do) ──────────
export interface LawListItem {
  법령일련번호: string; // MST — 특정 개정 시점 unique
  법령ID: string; // 법령의 안정적 ID
  법령명한글: string;
  법령약칭명?: string;
  법령구분명: string; // 법률 | 대통령령 | 부령 | ...
  소관부처명: string;
  소관부처코드: string;
  공포번호: string;
  공포일자: string; // YYYYMMDD
  시행일자: string; // YYYYMMDD
  제개정구분명: string; // 제정 | 일부개정 | 전부개정 | ...
  현행연혁코드: string; // 현행 | 연혁 | 시행예정
  법령상세링크: string;
  자법타법여부?: string;
  공동부령정보?: string;
  id: string;
}

export interface LawSearchResponse {
  LawSearch: {
    target: string;
    totalCnt: string;
    page?: string;
    numOfRows?: string;
    resultCode?: string;
    resultMsg?: string;
    law?: LawListItem[] | LawListItem;
  };
}

// ────────── 상세 (lawService.do) ──────────
export interface LawDetailResponse {
  법령: {
    기본정보: LawBasicInfo;
    조문: {
      조문단위: ArticleUnit[] | ArticleUnit;
    };
    부칙?: {
      부칙단위: AddendumUnit[] | AddendumUnit;
    };
  };
}

export interface LawBasicInfo {
  법령ID: string;
  법령명_한글: string;
  법령명약칭?: string;
  공포일자: string;
  공포번호: string;
  시행일자: string;
  제개정구분: string;
  소관부처: {
    content: string;
    소관부처코드: string;
  };
  법종구분: {
    content: string;
    법종구분코드: string;
  };
  공포법령여부?: string;
  제명변경여부?: string;
  별표편집여부?: string;
  언어?: string;
  전화번호?: string;
  연락부서?: unknown;
  공동부령정보?: string;
}

export interface ArticleUnit {
  조문키: string;
  조문번호: string;
  조문가지번호?: string;
  조문제목?: string;
  조문내용: string;
  조문여부: "조문" | "전문" | string;
  조문시행일자?: string;
  조문변경여부?: string;
  조문이동이전?: string;
  조문이동이후?: string;
  // 법제처 API 는 항이 여러 개면 배열, 하나면 단일 객체.
  // 각 항은 항내용을 갖고 하위 호/목을 가질 수 있다.
  항?: ClauseUnit[] | ClauseUnit;
}

export interface ClauseUnit {
  항번호?: string;
  항내용?: string;
  호?: SubClauseUnit[] | SubClauseUnit;
  목?: SubSubClauseUnit[] | SubSubClauseUnit;
}

export interface SubClauseUnit {
  호번호?: string;
  호내용?: string;
  목?: SubSubClauseUnit[] | SubSubClauseUnit;
}

export interface SubSubClauseUnit {
  목번호?: string;
  목내용?: string;
}

export interface AddendumUnit {
  부칙공포일자?: string;
  부칙공포번호?: string;
  부칙내용?: string | string[];
}
