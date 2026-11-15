// InternalPolicy 라벨.

export const POLICY_TYPE_VALUES = [
  "REGULATION",
  "GUIDELINE",
  "MANUAL",
  "SOP",
  "TERMS",
  "PRIVACY_POLICY",
  "CONTRACT_TEMPLATE",
  "SAFETY_PROCEDURE",
  "OTHER",
] as const;
export type PolicyType = (typeof POLICY_TYPE_VALUES)[number];

export const POLICY_TYPE_LABEL: Record<PolicyType, string> = {
  REGULATION: "사규",
  GUIDELINE: "지침",
  MANUAL: "매뉴얼",
  SOP: "SOP",
  TERMS: "이용약관",
  PRIVACY_POLICY: "개인정보처리방침",
  CONTRACT_TEMPLATE: "계약서 양식",
  SAFETY_PROCEDURE: "안전 절차",
  OTHER: "기타",
};
