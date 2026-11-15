// 라운드 22-Fix: 클라이언트 컴포넌트가 안전하게 임포트할 라벨/타입 전용 모듈.
// service.ts 는 prisma("server-only") 를 끌어들이므로 client bundle 에 넣으면
// build 실패 (실제로 R19~R21 이 프로덕션에 반영되지 못한 원인).
// 이 파일은 순수 값·타입만 노출 → client/server 양쪽 안전.

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export type MemberStatus = "ACTIVE" | "INVITED" | "SUSPENDED" | "LEFT";

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  OWNER: "소유자",
  ADMIN: "관리자",
  MEMBER: "구성원",
  VIEWER: "뷰어",
};

export const STATUS_LABEL: Record<MemberStatus, string> = {
  ACTIVE: "활성",
  INVITED: "초대됨",
  SUSPENDED: "정지",
  LEFT: "탈퇴",
};
