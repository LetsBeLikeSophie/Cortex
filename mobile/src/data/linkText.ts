// "가게 이름 + https://…": text carrying exactly one http(s) link is saved
// as that link (so it gets a title, thumbnail and a link that opens), with
// the rest of the words kept as the item's note. More than one link, or a
// rest too long for a note, stays a plain text memo.
export const LINK_NOTE_MAX = 200;

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export function splitLinkText(raw: string): { url: string; note: string } | null {
  const matches = raw.match(URL_RE) ?? [];
  if (matches.length !== 1) return null;
  // Sentence punctuation stuck to the end of a pasted link isn't part of it.
  const url = matches[0].replace(/[.,!?)\]}。、]+$/, '');
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  const note = raw.replace(matches[0], ' ').replace(/\s+/g, ' ').trim();
  if (note.length > LINK_NOTE_MAX) return null;
  return { url, note };
}
