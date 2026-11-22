// Runs the extension's script (./script.ts) against Vela and turns its
// answer into conversations, or a ``VelaError`` with a problem to show.

import { getPreferenceValues } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { conversationsFromColumns, type Conversation } from "../lib/conversations";
import { parseOsascriptError, problemFromError, type Problem, type ProblemContext } from "../lib/problems";
import { parseReply, problemFromFailure, type ScriptReply, type ScriptSuccess } from "../lib/reply";
import { targetFor, type VelaTarget } from "../lib/target";
import { encodeRequest, VELA_SCRIPT, type ScriptCommand, type ScriptRequest } from "./script";

interface ExtensionPreferences {
  app?: string;
}

/** The Vela the extension's "App" preference picks. */
export function currentTarget(): VelaTarget {
  return targetFor(getPreferenceValues<ExtensionPreferences>().app);
}

/** A problem talking to Vela, with what to say about it. */
export class VelaError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.message);
    this.name = "VelaError";
    this.problem = problem;
  }
}

/** The problem behind any error, for errors that didn't come from Vela too. */
export function problemOf(error: unknown, target: VelaTarget, context: ProblemContext): Problem {
  if (error instanceof VelaError) return error.problem;
  const message = error instanceof Error ? error.message : String(error);
  return problemFromError(null, message, target.name, context);
}

/** Long enough for macOS's "Raycast wants access to control Vela" prompt and a network that's still connecting. */
const TIMEOUT_MS: Record<ScriptCommand, number> = {
  list: 30_000,
  send: 60_000,
  draft: 15_000,
  catchUp: 30_000,
  catchUpBusiest: 30_000,
  recap: 30_000,
  markRead: 15_000,
  markAllRead: 15_000,
};

const CONTEXT: Record<ScriptCommand, ProblemContext> = {
  list: "list",
  send: "send",
  draft: "draft",
  catchUp: "catchUp",
  catchUpBusiest: "catchUp",
  recap: "recap",
  markRead: "markRead",
  markAllRead: "markAllRead",
};

async function run(target: VelaTarget, request: Omit<ScriptRequest, "bundleId">): Promise<ScriptReply> {
  return runAppleScript<ScriptReply>(VELA_SCRIPT, [encodeRequest({ ...request, bundleId: target.bundleId })], {
    language: "JavaScript",
    timeout: TIMEOUT_MS[request.command],
    parseOutput: ({ stdout, stderr, exitCode, timedOut }) => {
      if (timedOut) return { ok: false, number: -1712, message: "" };
      // The script answers even when Vela refuses; this is osascript itself failing.
      if (exitCode !== 0 && !stdout.trim()) return { ok: false, ...parseOsascriptError(stderr) };
      return parseReply(stdout);
    },
  });
}

/** Runs a command, throwing a ``VelaError`` if Vela isn't running or refuses. */
async function perform(target: VelaTarget, request: Omit<ScriptRequest, "bundleId">): Promise<ScriptSuccess> {
  const reply = await run(target, request);
  if (!reply.ok) throw new VelaError(problemFromFailure(reply, target.name, CONTEXT[request.command]));
  return reply;
}

export type ConversationsResult =
  { status: "ok"; conversations: Conversation[] } | { status: "notRunning" } | { status: "notInstalled" };

/**
 * Every conversation, in sidebar order, read in one script run (one Apple
 * event per property). Vela not running or not installed is an answer, not
 * an error: the views say so. Never launches Vela.
 */
export async function fetchConversations(target: VelaTarget): Promise<ConversationsResult> {
  const reply = await run(target, { command: "list" });
  if (!reply.ok) {
    if ("state" in reply) return { status: reply.state };
    throw new VelaError(problemFromFailure(reply, target.name, "list"));
  }
  try {
    return { status: "ok", conversations: conversationsFromColumns(reply.columns) };
  } catch (error) {
    throw new VelaError(problemFromError(null, error instanceof Error ? error.message : "", target.name, "list"));
  }
}

/** `send message … to … allowing multiple lines …` */
export async function sendMessage(
  target: VelaTarget,
  id: string,
  text: string,
  allowMultipleLines: boolean,
): Promise<void> {
  await perform(target, { command: "send", id, text, allowMultipleLines });
}

/** `draft message … to …`: shows the conversation with the text in its message box. Nothing is sent. */
export async function draftMessage(target: VelaTarget, id: string, text: string): Promise<void> {
  await perform(target, { command: "draft", id, text });
}

/** `catch up conversation id …` */
export async function catchUp(target: VelaTarget, id: string): Promise<void> {
  await perform(target, { command: "catchUp", id });
}

/**
 * `catch up` without a conversation, so Vela picks the unmuted one with the
 * most unread messages. Returns false, without asking Vela, when nothing
 * is unread (Vela would do nothing at all).
 */
export async function catchUpBusiest(target: VelaTarget): Promise<boolean> {
  const reply = await perform(target, { command: "catchUpBusiest" });
  return reply.nothingUnread !== true;
}

/** `open recap conversation id …` (since your first unread message). */
export async function openRecap(target: VelaTarget, id: string): Promise<void> {
  await perform(target, { command: "recap", id });
}

/** `mark read conversation id …` */
export async function markRead(target: VelaTarget, id: string): Promise<void> {
  await perform(target, { command: "markRead", id });
}

/** `mark all read`. Returns how many conversations had something unread. */
export async function markAllRead(target: VelaTarget): Promise<number> {
  const reply = await perform(target, { command: "markAllRead" });
  return reply.count ?? 0;
}
