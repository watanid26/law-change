// PII 마스킹 헬퍼.
//
// 라운드 17 T3 에서 알림 설정 화면에만 로컬 함수로 들어갔던 것을,
// 라운드 31 감사 지적("같은 이메일을 팀 구성원 화면은 평문, 알림 화면은
// 마스킹 — 같은 정보에 정책이 두 개")에 따라 공용 모듈로 승격.
//
// 새 화면에서 이메일을 그리게 되면 반드시 이 함수를 거칠 것.

/** 로컬파트 앞 3자만 남기고 마스킹. `hong.gildong@example.com` → `hon*********@example.com` */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "이 계정";
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const keep = Math.min(3, local.length);
  const visible = local.slice(0, keep);
  const hidden = "*".repeat(Math.max(1, local.length - keep));
  return `${visible}${hidden}@${domain}`;
}
