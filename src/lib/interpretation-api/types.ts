// 법제처 법령해석례(expc) 응답 타입.
// 실측(2026-09-01 전수 8,823건)으로 확인한 구조만 적는다.

export interface InterpretationListItem {
  법령해석례일련번호: string;
  안건명: string;
  안건번호?: string;
  회신기관명?: string;
  회신기관코드?: string;
  질의기관명?: string;
  질의기관코드?: string;
  /** "2005.12.23" 형식. 법령 API 의 8자리와 다르다. 1.0% 가 빈 값이다. */
  회신일자?: string;
  법령해석례상세링크?: string;
}

export interface InterpretationSearchResponse {
  Expc?: {
    totalCnt?: string;
    page?: string;
    expc?: InterpretationListItem | InterpretationListItem[];
  };
}

export interface InterpretationDetail {
  법령해석례일련번호: string;
  안건명: string;
  안건번호?: string;
  질의요지?: string;
  회답?: string;
  이유?: string;
  /** 8자리. 목록의 회신일자와 형식이 다르다. 6% 가 빈 값이다. */
  해석일자?: string;
  /** 8자리. 해석일자와 최대 12년까지 벌어진다 — 지연 등록이 실재한다. */
  등록일시?: string;
  해석기관명?: string;
  해석기관코드?: string;
  질의기관명?: string;
  질의기관코드?: string;
}

export interface InterpretationDetailResponse {
  ExpcService?: InterpretationDetail;
}
