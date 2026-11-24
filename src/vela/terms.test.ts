// The terms the extension's script (./script.ts) uses from Vela's
// AppleScript dictionary.
//
// vela-terms.json lists them, and scripts/check-vela-terms.mjs checks that
// Vela.sdef has each one (CI runs it against Vela's next and main, on every
// push and every night). The tests here keep that list honest: every term
// the script uses is in it, and it has none the extension doesn't use.
// termsInJXA, in check-vela-terms.mjs, says how the terms are found and
// what that misses.
//
// With a Vela.sdef on this Mac (VELA_SDEF, or a Vela checkout beside this
// repository, as scripts/check-vela-terms.mjs finds it), one more checks
// every listed term against it. Without one it's skipped.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { VELA_SCRIPT } from "./script.ts";

interface TermUse {
  kind: string;
  term: string;
  of: string;
}

/** What the tests use of scripts/check-vela-terms.mjs (plain JavaScript, so typed here). */
interface Checker {
  readManifest(path?: string): unknown;
  termsInJXA(source: string): TermUse[];
  unlistedTerms(manifest: unknown, uses: TermUse[]): string[];
  unusedTerms(manifest: unknown, text: string): string[];
  localSdef(): { path: string; label: string } | null;
  parseSdef(xml: string): unknown;
  checkTerms(manifest: unknown, dictionary: unknown): { term: string; found: boolean; note: string }[];
}

// `npm test` runs in the extension's folder.
const root = process.cwd();
const checkerPath: string = join(root, "scripts", "check-vela-terms.mjs");

async function checker(): Promise<Checker> {
  return (await import(pathToFileURL(checkerPath).href)) as Checker;
}

describe("vela-terms.json", () => {
  test("lists every term the script uses", async () => {
    const { readManifest, termsInJXA, unlistedTerms } = await checker();
    assert.deepEqual(unlistedTerms(readManifest(), termsInJXA(VELA_SCRIPT)), [], "add these to vela-terms.json");
  });

  test("lists only terms the extension uses", async () => {
    const { readManifest, unusedTerms } = await checker();
    // The script, and how the extension reads `kind` (normalizeKind).
    const text = `${VELA_SCRIPT}\n${readFileSync(join(root, "src", "lib", "conversations.ts"), "utf8")}`;
    assert.deepEqual(unusedTerms(readManifest(), text), [], "the extension doesn't use these: take them out");
  });

  test("the terms are found where the script uses them", async () => {
    // If the way the script is written changes so that termsInJXA no longer
    // sees these, the two tests above mean less: say so here.
    const uses = (await checker()).termsInJXA(VELA_SCRIPT);
    const has = (kind: string, term: string, of = "") =>
      uses.some((use) => use.kind === kind && use.term === term && use.of === of);
    assert.ok(has("application", "scripting version"), "app.scriptingVersion()");
    assert.ok(has("application", "conversations"), "app.conversations");
    assert.ok(
      has("parameter", "allowing multiple lines", "send message"),
      "app.sendMessage(…, { allowingMultipleLines })",
    );
    assert.ok(has("respondsTo", "catch up", "conversation"), "app.catchUp(conversation(…))");
    assert.ok(has("property", "unread count", "conversation"), "app.conversations.unreadCount()");
    assert.ok(has("property", "network name", "conversation"), "COLUMNS");
  });
});

describe("against Vela.sdef on this Mac", () => {
  test("it has every term in vela-terms.json", async (context) => {
    const { checkTerms, localSdef, parseSdef, readManifest } = await checker();
    const sdef = localSdef();
    if (!sdef) {
      context.skip("no Vela.sdef on this Mac: set VELA_SDEF, or check out Vela beside this repository");
      return;
    }
    const results = checkTerms(readManifest(), parseSdef(readFileSync(sdef.path, "utf8")));
    const missing = results
      .filter((result) => !result.found)
      .map(({ term, note }) => (note ? `${term}: ${note}` : term));
    assert.deepEqual(missing, [], `not in ${sdef.label}`);
  });
});
