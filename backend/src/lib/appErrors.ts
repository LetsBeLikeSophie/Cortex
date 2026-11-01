// Where the app broke, for the app_errors table. Code positions only: an error's
// message can quote what the person wrote, so anything that isn't a stack frame
// is dropped here, even though the app already leaves it out.
const FRAME = /^\s*at [\w$.<>[\] ]*\(?(address at )?[^\s()]+:\d+:\d+\)?\s*$/;
const MAX_FRAMES = 30;

export function onlyStackFrames(stack: string): string {
  return stack
    .split("\n")
    .filter((line) => FRAME.test(line))
    .slice(0, MAX_FRAMES)
    .map((line) => line.trim())
    .join("\n");
}

export function safeErrorName(name: string): string {
  return /^[A-Za-z]{1,40}$/.test(name) ? name : "Error";
}
