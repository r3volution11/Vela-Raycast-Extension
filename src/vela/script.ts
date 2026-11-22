// The one JavaScript for Automation (JXA) script the extension runs with
// osascript, and the requests it takes. It's here, apart from Raycast, so
// `npm test` can run it in Node against a stand-in for Vela.
//
// What it does, in order:
// 1. Checks that Vela is running without launching it (NSRunningApplication,
//    no Apple event), and whether it's installed if not.
// 2. Sends Vela the Apple events the request needs, through its AppleScript
//    dictionary (Vela/Vela.sdef; website/guide/automation.md).
// 3. Catches any error there and prints JSON either way:
//    {ok:true, …}, {ok:false, state:"notRunning"|"notInstalled"} or
//    {ok:false, number, message}. src/lib/reply.ts reads it.

export type ScriptCommand =
  /** Every conversation's details: one Apple event per property, not per conversation. */
  | "list"
  | "send"
  | "draft"
  /** `catch up` one conversation. */
  | "catchUp"
  /** `catch up` without a conversation: Vela picks the unmuted one with the most unread. */
  | "catchUpBusiest"
  | "recap"
  | "markRead"
  | "markAllRead";

export interface ScriptRequest {
  bundleId: string;
  command: ScriptCommand;
  /** The conversation's id, for commands on one conversation. */
  id?: string;
  /** The message, for `send` and `draft`. */
  text?: string;
  /** `send`: more than 3 lines. */
  allowMultipleLines?: boolean;
}

/** The request as the script's one argument (osascript passes it to `run(argv)`). */
export function encodeRequest(request: ScriptRequest): string {
  return JSON.stringify(request);
}

export const VELA_SCRIPT = String.raw`
ObjC.import("AppKit");

// The conversation properties "list" reads, as JXA names them.
var COLUMNS = ["id", "name", "networkName", "kind", "unreadCount", "mentionCount", "muted", "joined"];

function run(argv) {
  var request;
  try {
    request = JSON.parse(argv[0]);
  } catch (e) {
    return JSON.stringify({ ok: false, number: null, message: "Raycast sent a request Vela couldn't read." });
  }
  return JSON.stringify(handle(request));
}

function handle(request) {
  // Never launch Vela: ask macOS whether it's running, which sends no Apple event.
  var state = appState(request.bundleId);
  if (state !== "running") return { ok: false, state: state };
  try {
    return perform(Application(request.bundleId), request);
  } catch (e) {
    return failure(e);
  }
}

function appState(bundleId) {
  if ($.NSRunningApplication.runningApplicationsWithBundleIdentifier(bundleId).count > 0) return "running";
  var url = $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier(bundleId);
  return url.isNil() ? "notInstalled" : "notRunning";
}

function failure(e) {
  return {
    ok: false,
    number: e && typeof e.errorNumber === "number" ? e.errorNumber : null,
    message: e && e.message ? String(e.message) : String(e),
  };
}

function conversation(app, id) {
  return app.conversations.byId(id);
}

// Every conversation's properties, one Apple event per property. A
// conversation opened or closed between two of them makes the columns'
// lengths differ: read them again.
function readColumns(app) {
  for (var attempt = 0; attempt < 3; attempt++) {
    var conversations = app.conversations;
    var columns = {};
    var length = -1;
    var same = true;
    for (var i = 0; i < COLUMNS.length; i++) {
      var values = conversations[COLUMNS[i]]();
      columns[COLUMNS[i]] = values;
      if (length === -1) length = values.length;
      else if (values.length !== length) same = false;
    }
    if (same) return columns;
  }
  return null;
}

function perform(app, request) {
  switch (request.command) {
    case "list": {
      var columns = readColumns(app);
      if (!columns) {
        return { ok: false, number: null, message: "Your conversations changed while Raycast was reading them. Try again." };
      }
      return { ok: true, columns: columns };
    }
    case "send":
      app.sendMessage(request.text, {
        to: conversation(app, request.id),
        allowingMultipleLines: request.allowMultipleLines === true,
      });
      return { ok: true };
    case "draft":
      app.draftMessage(request.text, { to: conversation(app, request.id) });
      return { ok: true };
    case "catchUp":
      app.catchUp(conversation(app, request.id));
      return { ok: true };
    case "catchUpBusiest": {
      // Without a conversation, catch up does nothing when nothing's
      // unread; check first (as Vela picks: unmuted, something unread) so
      // Raycast can say so.
      var unread = app.conversations.unreadCount();
      var muted = app.conversations.muted();
      var any = false;
      for (var j = 0; j < unread.length; j++) {
        if (unread[j] > 0 && muted[j] !== true) any = true;
      }
      if (!any) return { ok: true, nothingUnread: true };
      app.catchUp();
      return { ok: true };
    }
    case "recap":
      app.openRecap(conversation(app, request.id));
      return { ok: true };
    case "markRead":
      app.markRead(conversation(app, request.id));
      return { ok: true };
    case "markAllRead":
      return { ok: true, count: app.markAllRead() };
  }
  return { ok: false, number: null, message: "Raycast asked Vela for something it doesn't know: " + request.command };
}
`;
