// 내보내기 표에 찍는 날짜.
//
// 감사에 제출하는 표라 화면과 하루라도 어긋나면 안 된다. 예전에는 서버
// 지역시간(getFullYear 등)으로 찍어서, UTC 서버에서는 한국시간 00~09시에
// 감지된 건이 하루 전 날짜로 나갔다. 화면(formatKoreanDate)과 같은 서울
// 기준으로 맞춘다.
//
// prisma 를 끌어오지 않아야 테스트에서 바로 부를 수 있어 파일을 나눴다.

export function formatExportDate(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
