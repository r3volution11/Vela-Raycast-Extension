// What Vela accepts from `send message` and `draft message`, checked before
// asking it, so the form can say what's wrong in its own words. No Raycast
// imports here, so `npm test` can run this with plain Node.

/** `send message` needs `allowing multiple lines` for more lines than this, as the message box asks first. */
export const LINE_CONFIRMATION_THRESHOLD = 3;

/** `draft message` and `vela://draft` take at most this many characters. */
export const MAXIMUM_DRAFT_LENGTH = 4000;

/** What Swift's `Character.isNewline` matches, which Vela splits lines on. */
const NEWLINES = /\r\n|[\n\v\f\r\x85\u2028\u2029]/;

/** Lines as Vela counts them: of the trimmed text, leaving out blank ones. */
export function countLines(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(NEWLINES).filter((line) => line.trim().length > 0).length;
}

/** Whether sending `text` needs `allowing multiple lines true`. */
export function needsMultipleLines(text: string): boolean {
  return countLines(text) > LINE_CONFIRMATION_THRESHOLD;
}

/** Characters as Swift counts them (grapheme clusters), so 4,000 means what it means to Vela. */
export function characterCount(text: string): number {
  let count = 0;
  for (const segment of new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)) {
    if (segment.segment) count += 1;
  }
  return count;
}

/** The checkbox's label for sending `lines` lines. */
export function multipleLinesLabel(lines: number): string {
  return `Send all ${lines} lines`;
}

/** Why `send message` would refuse `text`, or undefined if it's fine to ask. */
export function sendProblem(text: string, allowMultipleLines: boolean): string | undefined {
  const lines = countLines(text);
  if (lines === 0) return "Write a message first.";
  if (lines > LINE_CONFIRMATION_THRESHOLD && !allowMultipleLines) {
    return `That's ${lines} lines. Tick “${multipleLinesLabel(lines)}” to send them.`;
  }
  return undefined;
}

/** Why `draft message` would refuse `text`, or undefined if it's fine to ask. */
export function draftProblem(text: string): string | undefined {
  if (!text.trim()) return "Write something to put in the message box.";
  const length = characterCount(text);
  if (length > MAXIMUM_DRAFT_LENGTH) {
    return `That's ${length.toLocaleString("en-US")} characters. Vela's message box takes up to ${MAXIMUM_DRAFT_LENGTH.toLocaleString("en-US")} at once.`;
  }
  return undefined;
}
