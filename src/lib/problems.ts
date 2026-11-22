// What went wrong, in words for a toast or an empty view: Vela's AppleScript
// error numbers (website/guide/automation.md#errors), the macOS ones a
// script can hit, and the extension's own. No Raycast imports here, so
// `npm test` can run this with plain Node.

export type ProblemKind =
  /** Raycast isn't allowed to control Vela (Privacy & Security → Automation). */
  | "permission"
  | "notRunning"
  | "notInstalled"
  /** This Vela has no AppleScript dictionary yet, or not this part of it. */
  | "outdated"
  | "timeout"
  /** No such conversation (any more). */
  | "notFound"
  /** Still starting: try again in a moment. */
  | "notReady"
  /** One of Vela's own refusals (not connected, not in the channel, turned off…). */
  | "vela"
  | "unexpected";

export interface Problem {
  kind: ProblemKind;
  /** The AppleScript error number, if there was one. */
  number?: number;
  title: string;
  message: string;
}

/** What the extension was doing, for titles that say more than "couldn't". */
export type ProblemContext = "list" | "send" | "draft" | "catchUp" | "recap" | "markRead" | "markAllRead";

const FAILED: Record<ProblemContext, string> = {
  list: "Couldn't read your conversations",
  send: "Couldn't send",
  draft: "Couldn't put it in the message box",
  catchUp: "Couldn't open Catch me up",
  recap: "Couldn't open Recap",
  markRead: "Couldn't mark it read",
  markAllRead: "Couldn't mark everything read",
};

/** Vela's own numbers (1001–1010) and the titles that fit them. */
const VELA_TITLES: Record<number, string> = {
  1001: "More than one match",
  1002: "Not connected",
  1003: "Not in the channel",
  1004: "Nothing to send",
  1005: "Too long to send",
  1006: "That's a network console",
  1007: "Turned off in Vela's settings",
  1008: "Apple Intelligence isn't available",
  1009: "Not a channel name",
};

export function notRunningProblem(appName: string): Problem {
  return { kind: "notRunning", title: `${appName} isn't running`, message: `Open ${appName}, then try again.` };
}

export function notInstalledProblem(appName: string): Problem {
  return {
    kind: "notInstalled",
    title: `${appName} isn't installed`,
    message: `Get ${appName} from velairc.app, or choose the other app in the extension's preferences.`,
  };
}

/**
 * The problem for an AppleScript error: `number` and `message` as the
 * script caught them (or as osascript reported them).
 */
export function problemFromError(
  number: number | null | undefined,
  message: string | null | undefined,
  appName: string,
  context: ProblemContext,
): Problem {
  const said = (message ?? "").trim();
  switch (number) {
    case -1743:
      return {
        kind: "permission",
        number,
        title: `Raycast isn't allowed to control ${appName}`,
        message: `Turn on ${appName} under Raycast in System Settings → Privacy & Security → Automation, then try again.`,
      };
    case -1744:
      return {
        kind: "permission",
        number,
        title: `Raycast needs your permission to control ${appName}`,
        message: `Try again and click Allow when macOS asks, or turn it on in System Settings → Privacy & Security → Automation.`,
      };
    case -600:
    case -609:
    case -903:
      return { ...notRunningProblem(appName), number };
    case -1712:
      return {
        kind: "timeout",
        number,
        title: `${appName} didn't answer in time`,
        message: `If macOS is asking whether Raycast may control ${appName}, click Allow. Then try again.`,
      };
    case -1708:
      return outdated(appName, number);
    case -1728:
      // Reading every conversation can't miss one: an older Vela without the dictionary.
      if (context === "list") return outdated(appName, number);
      return {
        kind: "notFound",
        number,
        title: "Conversation not found",
        message:
          said && !/^can.t get /i.test(said)
            ? said
            : `${appName} couldn't find that conversation. It may have been closed.`,
      };
    case 1010:
      return {
        kind: "notReady",
        number,
        title: `${appName} is still starting`,
        message: said || "Try again in a moment.",
      };
  }
  if (typeof number === "number" && VELA_TITLES[number]) {
    return { kind: "vela", number, title: VELA_TITLES[number], message: velaMessage(number, said) };
  }
  return {
    kind: "unexpected",
    ...(typeof number === "number" ? { number } : {}),
    title: FAILED[context],
    message: said ? cleanMessage(said) : `${appName} didn't say why.`,
  };
}

function outdated(appName: string, number: number): Problem {
  return {
    kind: "outdated",
    number,
    title: `Update ${appName}`,
    message: `This version of ${appName} can't be scripted from Raycast. Update ${appName} from velairc.app, then try again.`,
  };
}

/**
 * Vela's words, except where they speak AppleScript: the form's checkbox,
 * not `allowing multiple lines true`, sends more than 3 lines.
 */
function velaMessage(number: number, said: string): string {
  if (number === 1005 && /allowing multiple lines/i.test(said)) {
    const lines = said.match(/(\d+) lines/);
    return lines
      ? `That's ${lines[1]} lines. Tick “Send all ${lines[1]} lines” to send them.`
      : "Tick the box to send more than 3 lines.";
  }
  return said || VELA_TITLES[number];
}

/** Takes osascript's "Error: " and "execution error: " prefixes and its "(-1743)" suffix off a message. */
export function cleanMessage(message: string): string {
  return message
    .replace(/^\d+:\d+:\s*/, "")
    .replace(/^execution error:\s*/i, "")
    .replace(/^(Error:\s*)+/i, "")
    .replace(/\s*\(-?\d+\)\s*$/, "")
    .trim();
}

/**
 * The number and message in osascript's stderr, when a script failed
 * before it could answer ("execution error: Error: … (-1743)").
 */
export function parseOsascriptError(stderr: string): { number: number | null; message: string } {
  const text = stderr.trim();
  const match = text.match(/\((-?\d+)\)\s*$/);
  return { number: match ? Number(match[1]) : null, message: cleanMessage(text) };
}
