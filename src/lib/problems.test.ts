import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  cleanMessage,
  notInstalledProblem,
  notRunningProblem,
  parseOsascriptError,
  problemFromError,
} from "./problems.ts";
import { parseReply, problemFromFailure } from "./reply.ts";

describe("problemFromError", () => {
  test("-1743: not allowed, and where to allow it", () => {
    const problem = problemFromError(-1743, "Not authorized to send Apple events to Vela.", "Vela", "list");
    assert.equal(problem.kind, "permission");
    assert.equal(problem.title, "Raycast isn't allowed to control Vela");
    assert.match(problem.message, /System Settings → Privacy & Security → Automation/);
  });

  test("-1744: consent needed", () => {
    assert.equal(problemFromError(-1744, "", "Vela", "send").kind, "permission");
  });

  test("-600 and -609: not running", () => {
    for (const number of [-600, -609]) {
      const problem = problemFromError(number, "Application isn't running.", "Vela Dev", "send");
      assert.equal(problem.kind, "notRunning");
      assert.equal(problem.title, "Vela Dev isn't running");
    }
  });

  test("-1712: timed out, maybe waiting on the permission prompt", () => {
    const problem = problemFromError(-1712, "", "Vela", "list");
    assert.equal(problem.kind, "timeout");
    assert.match(problem.message, /click Allow/);
  });

  test("-1728 is a conversation that's gone, except when listing, where it's an older Vela", () => {
    const gone = problemFromError(-1728, "Vela couldn't find that conversation.", "Vela", "markRead");
    assert.equal(gone.kind, "notFound");
    assert.equal(gone.message, "Vela couldn't find that conversation.");
    const generic = problemFromError(-1728, "Can't get object.", "Vela", "markRead");
    assert.equal(generic.message, "Vela couldn't find that conversation. It may have been closed.");
    assert.equal(problemFromError(-1728, "Can't get object.", "Vela", "list").kind, "outdated");
    assert.equal(problemFromError(-1708, "Message not understood.", "Vela", "send").kind, "outdated");
  });

  test("Vela's own errors keep Vela's words, under a title for the number", () => {
    const cases: [number, string, string][] = [
      [1001, "#vela is on more than one network: say which.", "More than one match"],
      [1002, "You're not connected to Libera.Chat.", "Not connected"],
      [1003, "You're not in #vela on Libera.Chat.", "Not in the channel"],
      [1004, "There's nothing to send.", "Nothing to send"],
      [1006, "You can't send messages to the Libera.Chat console.", "That's a network console"],
      [1007, "Catch me up is turned off in Vela's settings.", "Turned off in Vela's settings"],
      [1008, "Apple Intelligence is turned off in System Settings.", "Apple Intelligence isn't available"],
      [1009, "“vela” isn't a channel name.", "Not a channel name"],
    ];
    for (const [number, message, title] of cases) {
      const problem = problemFromError(number, message, "Vela", "send");
      assert.equal(problem.kind, "vela");
      assert.equal(problem.number, number);
      assert.equal(problem.title, title);
      assert.equal(problem.message, message);
    }
  });

  test("1005 speaks of the form's checkbox, not AppleScript", () => {
    const lines = problemFromError(
      1005,
      "That's 7 lines. The message box asks before sending more than 3; add “allowing multiple lines true” to send them.",
      "Vela",
      "send",
    );
    assert.equal(lines.message, "That's 7 lines. Tick “Send all 7 lines” to send them.");
    const long = problemFromError(
      1005,
      "That would be 63 IRC messages; Vela sends at most 50 at once.",
      "Vela",
      "send",
    );
    assert.equal(long.message, "That would be 63 IRC messages; Vela sends at most 50 at once.");
    assert.equal(long.title, "Too long to send");
  });

  test("1010: still starting", () => {
    const problem = problemFromError(1010, "Vela isn't ready yet. Try again in a moment.", "Vela", "list");
    assert.equal(problem.kind, "notReady");
    assert.equal(problem.title, "Vela is still starting");
  });

  test("anything else says what was being done, and the message without osascript's wrapping", () => {
    const problem = problemFromError(-2700, "Error: Something broke. (-2700)", "Vela", "recap");
    assert.equal(problem.kind, "unexpected");
    assert.equal(problem.title, "Couldn't open Recap");
    assert.equal(problem.message, "Something broke.");
    assert.equal(problemFromError(null, "", "Vela", "send").message, "Vela didn't say why.");
    assert.equal(problemFromError(undefined, "", "Vela", "send").number, undefined);
  });

  test("not running and not installed", () => {
    assert.deepEqual(notRunningProblem("Vela"), {
      kind: "notRunning",
      title: "Vela isn't running",
      message: "Open Vela, then try again.",
    });
    assert.equal(notInstalledProblem("Vela Dev").title, "Vela Dev isn't installed");
  });
});

test("parseOsascriptError reads osascript's stderr", () => {
  assert.deepEqual(
    parseOsascriptError("execution error: Error: Not authorized to send Apple events to Vela. (-1743)"),
    { number: -1743, message: "Not authorized to send Apple events to Vela." },
  );
  assert.deepEqual(parseOsascriptError("12:30: execution error: Vela got an error: Oops. (1003)\n"), {
    number: 1003,
    message: "Vela got an error: Oops.",
  });
  assert.deepEqual(parseOsascriptError("Killed"), { number: null, message: "Killed" });
  assert.equal(cleanMessage("Error: Error: x (12)"), "x");
});

describe("parseReply", () => {
  test("successes keep what they carry", () => {
    assert.deepEqual(parseReply('{"ok":true}'), { ok: true });
    assert.deepEqual(parseReply('{"ok":true,"count":3}\n'), { ok: true, count: 3 });
    assert.deepEqual(parseReply('{"ok":true,"nothingUnread":true}'), { ok: true, nothingUnread: true });
    assert.deepEqual(parseReply('{"ok":true,"columns":{"id":[]}}'), { ok: true, columns: { id: [] } });
  });

  test("not running and not installed are states", () => {
    assert.deepEqual(parseReply('{"ok":false,"state":"notRunning"}'), { ok: false, state: "notRunning" });
    assert.deepEqual(parseReply('{"ok":false,"state":"notInstalled"}'), { ok: false, state: "notInstalled" });
  });

  test("errors carry Vela's number and message", () => {
    assert.deepEqual(parseReply('{"ok":false,"number":1003,"message":"You\'re not in #vela."}'), {
      ok: false,
      number: 1003,
      message: "You're not in #vela.",
    });
    assert.deepEqual(parseReply('{"ok":false,"number":null}'), { ok: false, number: null, message: "" });
  });

  test("anything else is a failure saying the answer couldn't be read", () => {
    for (const output of ["", "true", "null", "{}", '{"ok":"yes"}', "Vela, OFTC"]) {
      const reply = parseReply(output);
      assert.equal(reply.ok, false, output);
      assert.ok("message" in reply && /couldn't read/.test(reply.message), output);
    }
  });

  test("problemFromFailure turns failures into problems", () => {
    assert.equal(problemFromFailure({ ok: false, state: "notRunning" }, "Vela", "list").kind, "notRunning");
    assert.equal(problemFromFailure({ ok: false, state: "notInstalled" }, "Vela", "list").kind, "notInstalled");
    assert.equal(problemFromFailure({ ok: false, number: -1743, message: "" }, "Vela", "send").kind, "permission");
  });
});
