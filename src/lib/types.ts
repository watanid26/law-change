export type ChangeType = "added" | "modified" | "deleted" | "moved";

export type ReviewStatus = "unchecked" | "checked" | "review_needed" | "in_progress" | "done" | "not_applicable";

export interface DiffLine {
  type: "context" | "added" | "removed";
  text: string;
}

export interface ArticleChange {
  articleKey: string;
  articleNumber: string;
  /** 이동 전 조번호. 조번호가 바뀐 경우에만 채워진다("제6조의4" → "제6조의5"). */
  previousNumber?: string;
  articleTitle: string;
  changeType: ChangeType;
  beforeDate?: string;
  afterDate: string;
  beforeText?: string[];
  afterText?: string[];
  addedLines?: number[];
  removedTail?: string;
}

export interface LawHistoryItem {
  id: string;
  date: string;
  revisionType: string;
  lawNumber: string;
  isCurrent?: boolean;
  /** 이 버전에 연결된 change event ID. null이면 이벤트 없음(첫 저장 등) */
  changeEventId?: string | null;
}

export interface Memo {
  id: string;
  content: string[];
  updatedAt: string;
  author: string;
}

export interface ChecklistItem {
  id: string;
  content: string;
  isCompleted: boolean;
  completedAt?: string;
}

export interface Folder {
  id: string;
  name: string;
  isActive?: boolean;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
  isActive?: boolean;
}

export interface Reminder {
  id: string;
  date: string;
  label: string;
  dDay: string;
}

export interface LawDetail {
  id: string;
  name: string;
  type: string;
  ministry: string;
  lawNumber: string;
  revisionType: string;
  promulgationDate: string;
  effectiveDate: string;
  effectiveDateNote?: string;
  /** 시행일을 모르는 판이 있다(조건부 시행). 그때는 null. */
  dDay: number | null;
  effectiveDateFull: string;
  changes: ArticleChange[];
  counts: {
    total: number;
    added: number;
    modified: number;
    deleted: number;
    moved: number;
  };
  history: LawHistoryItem[];
  /**
   * 지금 지켜야 하는 판과, 앞으로 닥칠 판.
   *
   * 헤더는 "가장 최근에 공포된 개정" 하나만 보여주고 있었다. 식품위생법은
   * 2026.6.9 공포·2029.1.1 시행 건이 그 자리를 차지해 "시행까지 D-857" 이
   * 떴는데, 정작 현행은 제21065호(2025.10.1 시행)이고 다음에 닥치는 건
   * 2026.10.8 이다. 3년 뒤 날짜를 보고 "한참 남았다" 고 읽게 만든다.
   */
  /**
   * 지금 보고 있는 이벤트가 "최초 수집" 인지. 비교할 이전 판이 없어서
   * 변경 카드가 만들어지지 않는 경우다. 화면에서 "본문 변경 없음" 과
   * 구분해야 한다 — 없는 게 아니라 아직 비교할 게 없는 것이다.
   */
  isFirstIssue: boolean;
  enforcement: {
    /** 오늘 기준 시행 중인 판. 없으면(전부 시행 예정) null. */
    current: { lawNumber: string; effectiveDate: string } | null;
    /** 공포됐지만 아직 시행 전인 판의 수. */
    pendingCount: number;
    /** 그중 가장 먼저 닥치는 것. */
    next: { lawNumber: string; effectiveDate: string; dDay: number | null } | null;
  };
  memo: Memo;
  checklist: ChecklistItem[];
  status: ReviewStatus;
  reminder: Reminder;
  /** UI 힌트: "고시" 등. 표시 문구/뱃지에 사용 */
  __hint?: string;
}
