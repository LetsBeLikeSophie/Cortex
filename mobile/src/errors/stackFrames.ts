// A stack as text starts with the error's message, which can quote a memo, and
// a message can run over several lines. Only real code positions pass.
const FRAME = /^\s*at [\w$.<>[\] ]*\(?(address at )?[^\s()]+:\d+:\d+\)?\s*$/;
const MAX_FRAMES = 30;

export function onlyStackFrames(stack: string): string {
  return stack
    .split('\n')
    .filter((line) => FRAME.test(line))
    .slice(0, MAX_FRAMES)
    .map((line) => line.trim())
    .join('\n');
}
