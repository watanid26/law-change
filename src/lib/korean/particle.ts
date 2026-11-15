// 한국어 조사 자동 선택.
//
// "과태료으로" 처럼 조사가 틀리면 문장이 기계가 쓴 티가 난다. 개정 신호의
// 근거 문장은 화면에 그대로 나가므로 여기서 맞춘다.
//
// 규칙: 앞 글자에 받침이 있으면 "으로", 없으면 "로".
//       단 ㄹ 받침은 "로" 를 쓴다 (물로 · 서울로).

/** 마지막 글자의 받침 코드. 완성형 한글이 아니면 null. */
function finalConsonant(word: string): number | null {
  const ch = word.trim().slice(-1);
  if (!ch) return null;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;
  return (code - 0xac00) % 28; // 0 = 받침 없음, 8 = ㄹ
}

/** "벌칙" → "벌칙으로" · "과태료" → "과태료로" · "서울" → "서울로" */
export function euro(word: string): string {
  const f = finalConsonant(word);
  if (f === null) return `${word}(으)로`; // 한글이 아니면 단정하지 않는다
  return f === 0 || f === 8 ? `${word}로` : `${word}으로`;
}

/** "벌칙" → "벌칙이" · "과태료" → "과태료가" */
export function iga(word: string): string {
  const f = finalConsonant(word);
  if (f === null) return `${word}(이)가`;
  return f === 0 ? `${word}가` : `${word}이`;
}

/** "벌칙" → "벌칙은" · "과태료" → "과태료는" */
export function eunneun(word: string): string {
  const f = finalConsonant(word);
  if (f === null) return `${word}(은)는`;
  return f === 0 ? `${word}는` : `${word}은`;
}
