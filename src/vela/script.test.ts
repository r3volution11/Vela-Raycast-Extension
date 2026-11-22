// Runs the extension's JXA script in Node, against a stand-in for Vela and
// for the ObjC bridge, so its logic is tested without sending any Apple
// event. A second test compiles it with osacompile (syntax only).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import vm from "node:vm";
import { conversationsFromColumns } from "../lib/conversations.ts";
import { parseReply } from "../lib/reply.ts";
import { encodeRequest, VELA_SCRIPT, type ScriptRequest } from "./script.ts";

const BUNDLE_ID = "io.github.r3volution11.Vela";

interface FakeConversation {
  id: string;
  name: string;
  networkName: string;
  kind: string;
  unreadCount: number;
  mentionCount: number;
  muted: boolean;
  joined: boolean;
}

interface FakeOptions {
  running?: boolean;
  installed?: boolean;
  /** Every Apple event fails with this (as JXA throws them). */
  error?: { errorNumber: number; message: string };
  /** How many full reads come back inconsistent: their first column is one conversation short (one closing mid-read). */
  inconsistentReads?: number;
}

const COLUMN_COUNT = 8;

/** The script's answers, made plain: objects from the script's context aren't this realm's objects. */
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function fakeVela(conversations: FakeConversation[], options: FakeOptions = {}) {
  const calls: unknown[][] = [];
  const applications: string[] = [];
  let reads = 0;

  function event<T>(record: unknown[], answer: () => T): T {
    calls.push(record);
    if (options.error)
      throw Object.assign(new Error(options.error.message), { errorNumber: options.error.errorNumber });
    return answer();
  }

  const elements: Record<string, unknown> = {
    byId: (id: string) => ({ conversationId: id }),
  };
  for (const key of ["id", "name", "networkName", "kind", "unreadCount", "mentionCount", "muted", "joined"]) {
    elements[key] = () =>
      event(["get", key], () => {
        const attempt = Math.floor(reads / COLUMN_COUNT);
        const isFirstColumn = reads % COLUMN_COUNT === 0;
        reads += 1;
        const values = conversations.map((conversation) => conversation[key as keyof FakeConversation]);
        return isFirstColumn && attempt < (options.inconsistentReads ?? 0) ? values.slice(1) : values;
      });
  }

  const vela = {
    conversations: elements,
    sendMessage: (text: string, parameters: unknown) => event(["sendMessage", text, parameters], () => undefined),
    draftMessage: (text: string, parameters: unknown) => event(["draftMessage", text, parameters], () => undefined),
    catchUp: (...args: unknown[]) => event(["catchUp", ...args], () => undefined),
    openRecap: (conversation: unknown) => event(["openRecap", conversation], () => undefined),
    markRead: (conversation: unknown) => event(["markRead", conversation], () => undefined),
    markAllRead: () => event(["markAllRead"], () => 4),
  };

  const context = vm.createContext({
    JSON,
    ObjC: { import: () => undefined },
    $: {
      NSRunningApplication: {
        runningApplicationsWithBundleIdentifier: (id: string) => ({
          count: id === BUNDLE_ID && (options.running ?? true) ? 1 : 0,
        }),
      },
      NSWorkspace: {
        sharedWorkspace: {
          URLForApplicationWithBundleIdentifier: (id: string) => ({
            isNil: () => !(id === BUNDLE_ID && (options.installed ?? true)),
          }),
        },
      },
    },
    Application: (id: string) => {
      applications.push(id);
      return vela;
    },
  });
  vm.runInContext(VELA_SCRIPT, context);

  return {
    calls,
    applications,
    run(request: Omit<ScriptRequest, "bundleId"> & { bundleId?: string }) {
      const output = (context.run as (argv: string[]) => string)([encodeRequest({ bundleId: BUNDLE_ID, ...request })]);
      return { output, reply: JSON.parse(output) };
    },
    runRaw(argv: string[]) {
      return JSON.parse((context.run as (argv: string[]) => string)(argv));
    },
  };
}

const VELA_CHANNEL: FakeConversation = {
  id: "6F9619FF-8B86-D011-B42D-00C04FC964FF/#vela",
  name: "#vela",
  networkName: "Libera.Chat",
  kind: "channel",
  unreadCount: 12,
  mentionCount: 1,
  muted: false,
  joined: true,
};

const MARISOL: FakeConversation = {
  id: "6F9619FF-8B86-D011-B42D-00C04FC964FF/marisol",
  name: "marisol",
  networkName: "Libera.Chat",
  kind: "private conversation",
  unreadCount: 0,
  mentionCount: 0,
  muted: false,
  joined: true,
};

describe("never launches Vela", () => {
  test("not running: says so without making an Application object or sending anything", () => {
    const vela = fakeVela([VELA_CHANNEL], { running: false });
    for (const command of ["list", "send", "catchUpBusiest", "markAllRead"] as const) {
      assert.deepEqual(vela.run({ command, id: VELA_CHANNEL.id, text: "hi" }).reply, {
        ok: false,
        state: "notRunning",
      });
    }
    assert.deepEqual(vela.applications, []);
    assert.deepEqual(vela.calls, []);
  });

  test("not installed: says so", () => {
    const vela = fakeVela([], { running: false, installed: false });
    assert.deepEqual(vela.run({ command: "list" }).reply, { ok: false, state: "notInstalled" });
    assert.deepEqual(vela.applications, []);
  });

  test("talks to the bundle id it's given (Vela Dev)", () => {
    const vela = fakeVela([], { running: false });
    assert.deepEqual(vela.run({ command: "list", bundleId: "io.github.r3volution11.Vela.dev" }).reply, {
      ok: false,
      state: "notInstalled",
    });
  });
});

describe("list", () => {
  test("reads each property once for every conversation, and the extension reads the answer back", () => {
    const vela = fakeVela([VELA_CHANNEL, MARISOL]);
    const { output, reply } = vela.run({ command: "list" });
    assert.equal(reply.ok, true);
    assert.deepEqual(
      vela.calls.map((call) => call[1]),
      ["id", "name", "networkName", "kind", "unreadCount", "mentionCount", "muted", "joined"],
    );
    assert.deepEqual(vela.applications, [BUNDLE_ID]);

    const parsed = parseReply(output);
    assert.ok(parsed.ok);
    const conversations = conversationsFromColumns(parsed.columns);
    assert.deepEqual(
      conversations.map((c) => [c.name, c.kind, c.unreadCount, c.mentionCount]),
      [
        ["#vela", "channel", 12, 1],
        ["marisol", "private", 0, 0],
      ],
    );
  });

  test("reads again when a conversation opens or closes between two properties", () => {
    const vela = fakeVela([VELA_CHANNEL, MARISOL], { inconsistentReads: 1 });
    const { reply } = vela.run({ command: "list" });
    assert.equal(reply.ok, true);
    assert.equal(vela.calls.length, 16, "two full reads");
  });

  test("gives up after three reads that don't agree", () => {
    const vela = fakeVela([VELA_CHANNEL, MARISOL], { inconsistentReads: 3 });
    const { reply } = vela.run({ command: "list" });
    assert.equal(reply.ok, false);
    assert.equal(reply.number, null);
    assert.match(reply.message, /changed while Raycast was reading/);
  });
});

describe("commands", () => {
  const to = { conversationId: VELA_CHANNEL.id };

  test("send message, with and without multiple lines", () => {
    const vela = fakeVela([VELA_CHANNEL]);
    assert.deepEqual(vela.run({ command: "send", id: VELA_CHANNEL.id, text: "hello\nall" }).reply, { ok: true });
    vela.run({ command: "send", id: VELA_CHANNEL.id, text: "1\n2\n3\n4", allowMultipleLines: true });
    assert.deepEqual(plain(vela.calls), [
      ["sendMessage", "hello\nall", { to, allowingMultipleLines: false }],
      ["sendMessage", "1\n2\n3\n4", { to, allowingMultipleLines: true }],
    ]);
  });

  test("text that looks like JSON or a command goes through as it is", () => {
    const vela = fakeVela([VELA_CHANNEL]);
    const text = '/quit "bye" \\ {"ok":true} ✅';
    vela.run({ command: "send", id: VELA_CHANNEL.id, text });
    assert.equal(vela.calls[0][1], text);
  });

  test("draft, catch up, recap and mark read name the conversation by id", () => {
    const vela = fakeVela([VELA_CHANNEL]);
    for (const command of ["draft", "catchUp", "recap", "markRead"] as const) {
      assert.deepEqual(vela.run({ command, id: VELA_CHANNEL.id, text: "Back in 5" }).reply, { ok: true });
    }
    assert.deepEqual(plain(vela.calls), [
      ["draftMessage", "Back in 5", { to }],
      ["catchUp", to],
      ["openRecap", to],
      ["markRead", to],
    ]);
  });

  test("mark all read returns how many had something unread", () => {
    const vela = fakeVela([VELA_CHANNEL]);
    assert.deepEqual(vela.run({ command: "markAllRead" }).reply, { ok: true, count: 4 });
  });

  test("catch up without a conversation lets Vela pick, when something unmuted is unread", () => {
    const vela = fakeVela([VELA_CHANNEL, MARISOL]);
    assert.deepEqual(vela.run({ command: "catchUpBusiest" }).reply, { ok: true });
    assert.deepEqual(vela.calls.at(-1), ["catchUp"], "no conversation: Vela picks the busiest");
  });

  test("catch up without a conversation says when there's nothing to catch up on", () => {
    const vela = fakeVela([{ ...VELA_CHANNEL, muted: true }, MARISOL]);
    assert.deepEqual(vela.run({ command: "catchUpBusiest" }).reply, { ok: true, nothingUnread: true });
    assert.ok(!vela.calls.some((call) => call[0] === "catchUp"));
  });

  test("an unknown command is refused", () => {
    const vela = fakeVela([]);
    const { reply } = vela.run({ command: "launch" as never });
    assert.equal(reply.ok, false);
    assert.match(reply.message, /doesn't know/);
  });
});

describe("errors", () => {
  test("Apple event errors come back as number and message", () => {
    const vela = fakeVela([VELA_CHANNEL], {
      error: { errorNumber: -1743, message: "Not authorized to send Apple events to Vela." },
    });
    assert.deepEqual(vela.run({ command: "list" }).reply, {
      ok: false,
      number: -1743,
      message: "Not authorized to send Apple events to Vela.",
    });
  });

  test("Vela's refusals keep its words", () => {
    const vela = fakeVela([VELA_CHANNEL], {
      error: { errorNumber: 1003, message: "You're not in #vela on Libera.Chat." },
    });
    assert.deepEqual(vela.run({ command: "send", id: VELA_CHANNEL.id, text: "hi" }).reply, {
      ok: false,
      number: 1003,
      message: "You're not in #vela on Libera.Chat.",
    });
  });

  test("a request that isn't JSON is refused", () => {
    const vela = fakeVela([]);
    assert.equal(vela.runRaw(["not json"]).ok, false);
  });
});

test(
  "osacompile accepts the script (syntax only: nothing is run or sent)",
  { skip: process.platform !== "darwin" },
  () => {
    const folder = mkdtempSync(join(tmpdir(), "vela-raycast-"));
    try {
      const source = join(folder, "vela.js");
      writeFileSync(source, VELA_SCRIPT);
      execFileSync("osacompile", ["-l", "JavaScript", "-o", join(folder, "vela.scpt"), source], {
        stdio: "pipe",
      });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  },
);
