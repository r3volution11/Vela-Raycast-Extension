// The JSON the extension's scripts print (src/vela/script.ts), read back. No
// Raycast imports here, so `npm test` can run this with plain Node.

import {
  notInstalledProblem,
  notRunningProblem,
  problemFromError,
  type Problem,
  type ProblemContext,
} from "./problems.ts";

export type AppState = "notRunning" | "notInstalled";

export type ScriptSuccess = { ok: true; columns?: unknown; count?: number; nothingUnread?: boolean };

export type ScriptFailure = { ok: false; state: AppState } | { ok: false; number: number | null; message: string };

export type ScriptReply = ScriptSuccess | ScriptFailure;

/** Reads a script's output. Anything that isn't one of its answers becomes a failure saying so. */
export function parseReply(stdout: string): ScriptReply {
  let value: unknown;
  try {
    value = JSON.parse(stdout.trim());
  } catch {
    return { ok: false, number: null, message: "Raycast couldn't read Vela's answer." };
  }
  if (typeof value !== "object" || value === null || typeof (value as { ok?: unknown }).ok !== "boolean") {
    return { ok: false, number: null, message: "Raycast couldn't read Vela's answer." };
  }
  const reply = value as Record<string, unknown>;
  if (reply.ok === true) {
    return {
      ok: true,
      ...(reply.columns !== undefined ? { columns: reply.columns } : {}),
      ...(typeof reply.count === "number" ? { count: reply.count } : {}),
      ...(reply.nothingUnread === true ? { nothingUnread: true } : {}),
    };
  }
  if (reply.state === "notRunning" || reply.state === "notInstalled") {
    return { ok: false, state: reply.state };
  }
  return {
    ok: false,
    number: typeof reply.number === "number" ? reply.number : null,
    message: typeof reply.message === "string" ? reply.message : "",
  };
}

/** The problem a failed reply describes. */
export function problemFromFailure(reply: ScriptFailure, appName: string, context: ProblemContext): Problem {
  if ("state" in reply) {
    return reply.state === "notInstalled" ? notInstalledProblem(appName) : notRunningProblem(appName);
  }
  return problemFromError(reply.number, reply.message, appName, context);
}
