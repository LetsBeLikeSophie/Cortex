// Decides, one typed word at a time, whether the search box is getting a
// keyword list ("제주 카페") or a half-remembered sentence ("지난달 인스타에서
// 본 카페"). Runs on-device at every space -- no LLM call just to decide
// whether to make an LLM call. Deliberately conservative: a bare noun is
// always a keyword, and endings that are also common noun endings (부산's
// 산, 일본's 본, 강남대로's 로) are left out, since a false "sentence" costs
// an LLM round trip while a missed one is caught by the next word or the
// manual "문장으로" switch.

const TIME_WORD =
  /^(지난달|지난주|지난번|지난해|저번달|저번주|저번|이번달|이번주|작년|올해|재작년|어제|그제|그저께|오늘|최근|요즘|예전|옛날|아까|며칠|몇일|한참|얼마)(에|에는|쯤|에서|부터|까지|전|전에)?$/;
const MONTH_OR_AGO = /^(\d{1,2}월(에|쯤|달|초|말)?|\d+(일|주|달|개월|년)\s?전(에)?)$/;
const VAGUE_WORD = /^(그거|그것|그|그때|그런|그런거|뭐|뭔가|뭐였지|뭐더라|뭐였더라|어떤|무슨|어디|어디서|언제|누가)$/;
const SENTENCE_ENDING =
  /(에서|에서의|던|했|봤|한거|본거|산거|간거|같은|같은거|같던|인데|더라|였지|었지|려고|싶은|싶던|이랑|하고|때)$/;

export function looksLikeSentenceWord(raw: string): boolean {
  const word = raw.trim().replace(/[.,!~]+$/, '');
  if (!word) return false;
  if (word.includes('?')) return true;
  if (TIME_WORD.test(word) || MONTH_OR_AGO.test(word) || VAGUE_WORD.test(word)) return true;
  if (word.length < 2) return false;
  if (SENTENCE_ENDING.test(word)) return true;
  // 에/한 alone are frequent enough as noun endings at length 2 (대한, 무한)
  // that they only count on a longer word (카페에, 저장한).
  if (word.length >= 3 && /(에|한)$/.test(word)) return true;
  return false;
}
