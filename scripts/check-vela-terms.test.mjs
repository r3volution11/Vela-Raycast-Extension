// Tests for check-vela-terms.mjs, with Node's own test runner. They never
// download anything: the dictionaries are made up here.
//
// vela-alfred-workflow and vela-raycast-extension have the same copy of this
// test and the script: change both.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkTerms,
  jxaName,
  localSdef,
  manifestErrors,
  parseSdef,
  readManifest,
  sdefURL,
  termFromJXA,
  termsInJXA,
  unlistedTerms,
  unusedTerms,
} from "./check-vela-terms.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "check-vela-terms.mjs");

const SDEF = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE dictionary SYSTEM "file://localhost/System/Library/DTDs/sdef.dtd">
<!-- <property name="commented out" code="NoNo"/> -->
<dictionary title="Test">
  <suite name="Standard Suite" code="????">
    <class name="item" code="cobj" description="Anything.">
      <property name="id" code="ID  " type="text" access="r"/>
    </class>
    <class name="application" code="capp" description="The app.">
      <property name="name" code="pnam" type="text" access="r"/>
    </class>
  </suite>
  <suite name="Test Suite" code="Test">
    <class-extension extends="application">
      <element type="conversation" access="r"><cocoa key="conversations"/></element>
      <element type="person" access="r"/>
      <property name="scripting version" code="TsVr" type="integer" access="r"/>
    </class-extension>
    <class name="conversation" code="TCnv" plural="conversations" inherits="item">
      <property name="network name" code="TNtN" type="text" access="r">
        <cocoa key="networkName"/>
      </property>
      <property name="a &amp; b" code="TAnB" type="text" access="r"/>
      <responds-to command="show"><cocoa method="show:"/></responds-to>
      <responds-to name="mark read"/>
    </class>
    <class name="person" code="TPrs" plural="people"/>
    <enumeration name="conversation kind" code="TCkd">
      <enumerator name="channel" code="TKch"/>
      <enumerator name="private conversation" code="TKpv"/>
    </enumeration>
    <command name="show" code="Testshow"><direct-parameter type="conversation"/></command>
    <command name="mark read" code="TestMkRd"/>
    <command name="send message" code="TestSend">
      <documentation><html><![CDATA[<parameter name="in documentation"/>]]></html></documentation>
      <direct-parameter type="text"/>
      <parameter name="to" code="TsTo" type="conversation"/>
      <parameter name="allowing multiple lines" code="TsMl" type="boolean" optional="yes"/>
    </command>
  </suite>
</dictionary>
`;

describe("reading an sdef", () => {
  const dictionary = parseSdef(SDEF);

  test("classes, with what class-extensions add", () => {
    const application = dictionary.classes.get("application");
    assert.deepEqual([...application.properties], ["name", "scripting version"]);
    assert.deepEqual([...application.elements], ["conversation", "person"]);
    const conversation = dictionary.classes.get("conversation");
    assert.equal(conversation.plural, "conversations");
    assert.equal(conversation.inherits, "item");
    assert.deepEqual([...conversation.properties], ["network name", "a & b"]);
    assert.deepEqual([...conversation.respondsTo], ["show", "mark read"]);
  });

  test("commands and their parameters, enumerations and their enumerators", () => {
    assert.deepEqual([...dictionary.commands.keys()], ["show", "mark read", "send message"]);
    assert.deepEqual([...dictionary.commands.get("send message")], ["to", "allowing multiple lines"]);
    assert.deepEqual([...dictionary.enumerations.get("conversation kind")], ["channel", "private conversation"]);
  });

  test("comments and CDATA aren't terms", () => {
    const everything = JSON.stringify(dictionary, (_, value) =>
      value instanceof Set || value instanceof Map ? [...value] : value,
    );
    assert.ok(!everything.includes("commented out"));
    assert.ok(!everything.includes("in documentation"));
  });
});

describe("checking terms", () => {
  const dictionary = parseSdef(SDEF);
  const missing = (manifest) => checkTerms(manifest, dictionary).filter((result) => !result.found);

  test("everything there", () => {
    const manifest = {
      classes: {
        application: { properties: ["scripting version", "name"], elements: ["conversation"] },
        conversation: { properties: ["network name", "id"], respondsTo: ["show", "mark read"] },
      },
      commands: { show: [], "send message": ["to", "allowing multiple lines"] },
      enumerations: { "conversation kind": ["private conversation"] },
    };
    const results = checkTerms(manifest, dictionary);
    assert.equal(results.length, 12);
    assert.deepEqual(missing(manifest), []);
  });

  test("what's missing, and why when the term doesn't say", () => {
    const manifest = {
      classes: {
        application: { properties: ["frontmost"], elements: ["person", "network"] },
        conversation: { properties: ["topic"], respondsTo: ["catch up"] },
        channel: { properties: ["name"] },
      },
      commands: { "send message": ["via"], "catch up": [], join: ["key"] },
      enumerations: { "conversation kind": ["query"], "recap span": ["today"] },
    };
    assert.deepEqual(
      missing(manifest).map(({ term, note }) => [term, note]),
      [
        ['property "frontmost" of application', ""],
        ['element "person" of application', 'its plural is now "people", not "persons"'],
        ['element "network" of application', ""],
        ['property "topic" of conversation', ""],
        ['conversation responds to "catch up"', ""],
        ['property "name" of channel', `there's no class "channel"`],
        ['parameter "via" of "send message"', ""],
        ['command "catch up"', ""],
        ['command "join"', ""],
        ['parameter "key" of "join"', `there's no command "join"`],
        ['enumerator "query" of "conversation kind"', ""],
        ['enumerator "today" of "recap span"', `there's no enumeration "recap span"`],
      ],
    );
  });
});

describe("vela-terms.json", () => {
  test("this repository's is valid", () => {
    assert.doesNotThrow(() => readManifest());
  });

  test("what's wrong with one", () => {
    assert.deepEqual(
      manifestErrors({ $comment: "x", classes: { $comment: "y", application: { properties: [] } } }),
      [],
    );
    assert.deepEqual(manifestErrors([]), ["it should be an object"]);
    assert.deepEqual(
      manifestErrors({
        class: {},
        classes: { conversation: { property: ["id"], elements: "conversation" }, network: [] },
        commands: { show: {}, "mark read": [" padded"] },
        enumerations: [],
      }),
      [
        'vela-terms.json has an unknown key "class"',
        "enumerations should be an object",
        'classes["conversation"] has an unknown key "property"',
        'classes["conversation"].elements should be a list of terms',
        'classes["network"] should be an object',
        'commands["show"] should be a list of terms',
        'commands["mark read"] should be a list of terms',
      ],
    );
  });
});

describe("the terms a JXA script uses", () => {
  const SCRIPT = `
    // app.commentedOut() is in a comment, and so is /* app.thisToo() */
    var COLUMNS = ["id", "networkName", ["unreadCount", "unread count"]];
    function run() {
      var app = Application("io.github.r3volution11.Vela");
      app.includeStandardAdditions = true;
      if (app.scriptingVersion() < 1) return "https://velairc.app/guide/updates";
      var conversation = app.conversations.byId("x/#vela");
      var unread = app.conversations.unreadCount();
      app.sendMessage("hi, (there)", { to: conversation, allowingMultipleLines: false });
      app.draftMessage(text, { to });
      app.markRead(conversation);
      app.catchUp();
      return app.markAllRead();
    }`;
  const uses = termsInJXA(SCRIPT);
  const of = (kind) =>
    uses.filter((use) => use.kind === kind).map((use) => (use.of ? `${use.term} of ${use.of}` : use.term));

  test("on the application: commands, properties and elements", () => {
    assert.deepEqual(of("application"), [
      "scripting version",
      "conversations",
      "send message",
      "draft message",
      "mark read",
      "catch up",
      "mark all read",
    ]);
  });

  test("properties, parameters and commands sent to a conversation", () => {
    assert.deepEqual(of("property"), [
      "unread count of conversation",
      "id of conversation",
      "network name of conversation",
    ]);
    assert.deepEqual(of("parameter"), [
      "to of send message",
      "allowing multiple lines of send message",
      "to of draft message",
    ]);
    assert.deepEqual(of("respondsTo"), ["mark read of conversation"]);
  });

  test("terms the manifest doesn't list where they're used", () => {
    const manifest = {
      classes: {
        application: { properties: ["scripting version"], elements: ["conversation"] },
        conversation: { properties: ["id", "network name", "unread count"], respondsTo: [] },
      },
      commands: { "send message": ["to"], "draft message": ["to"], "mark read": [], "catch up": [] },
    };
    assert.deepEqual(unlistedTerms(manifest, uses), [
      'parameter "allowing multiple lines" of "send message" (allowingMultipleLines)',
      'conversation responds to "mark read" (app.markRead(…))',
      `app.markAllRead: "mark all read" isn't a command, an application property or element`,
    ]);
  });

  test("terms the manifest lists that the source never mentions", () => {
    const manifest = {
      classes: { conversation: { properties: ["network name", "topic"] } },
      commands: { "mark read": [], join: ["key"] },
      enumerations: { "conversation kind": ["private conversation"] },
    };
    const text = `${SCRIPT}\nif (kind.replace(/ /g, "").toLowerCase() === "privateconversation") {}`;
    assert.deepEqual(unusedTerms(manifest, text), [
      'property "topic" of conversation',
      'command "join"',
      'parameter "key" of "join"',
    ]);
  });

  test("JXA names and terms", () => {
    assert.equal(termFromJXA("networkName"), "network name");
    assert.equal(termFromJXA("markAllRead"), "mark all read");
    assert.equal(termFromJXA("id"), "id");
    assert.equal(termFromJXA("network name"), "network name");
    assert.equal(jxaName("allowing multiple lines"), "allowingMultipleLines");
    assert.equal(jxaName("show"), "show");
  });
});

describe("finding Vela.sdef", () => {
  test("VELA_SDEF first, then a Vela checkout beside this one", () => {
    const folder = mkdtempSync(join(tmpdir(), "vela-terms-"));
    try {
      const repository = join(folder, "this");
      mkdirSync(repository);
      assert.equal(localSdef({}, repository), null);
      mkdirSync(join(folder, "Vela-IRC", "Vela"), { recursive: true });
      writeFileSync(join(folder, "Vela-IRC", "Vela", "Vela.sdef"), SDEF);
      assert.equal(localSdef({}, repository).path, join(folder, "Vela-IRC", "Vela", "Vela.sdef"));
      mkdirSync(join(folder, "Vela IRC", "Vela"), { recursive: true });
      writeFileSync(join(folder, "Vela IRC", "Vela", "Vela.sdef"), SDEF);
      assert.equal(localSdef({}, repository).path, join(folder, "Vela IRC", "Vela", "Vela.sdef"));
      assert.equal(localSdef({ VELA_SDEF: "/somewhere/Vela.sdef" }, repository).path, "/somewhere/Vela.sdef");
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test("on GitHub, by branch", () => {
    assert.equal(
      sdefURL("next"),
      "https://raw.githubusercontent.com/r3volution11/Vela-IRC/refs/heads/next/Vela/Vela.sdef",
    );
    assert.equal(
      sdefURL("feature/a b"),
      "https://raw.githubusercontent.com/r3volution11/Vela-IRC/refs/heads/feature/a%20b/Vela/Vela.sdef",
    );
  });
});

describe("running it", () => {
  // A Vela.sdef with exactly the terms in this repository's vela-terms.json.
  const manifest = readManifest();
  const sdefFor = ({ without = "" } = {}) => {
    const keep = (term) => term !== without;
    const lines = ['<dictionary title="Made up">', '<suite name="Made up" code="MkUp">'];
    for (const [name, uses] of Object.entries(manifest.classes ?? {})) {
      if (name.startsWith("$")) continue;
      lines.push(`<class name="${name}" code="Xxxx">`);
      for (const term of (uses.properties ?? []).filter(keep)) lines.push(`<property name="${term}" code="Xxxx"/>`);
      for (const term of (uses.elements ?? []).filter(keep)) lines.push(`<element type="${term}"/>`);
      for (const term of (uses.respondsTo ?? []).filter(keep)) lines.push(`<responds-to command="${term}"/>`);
      lines.push("</class>");
    }
    for (const [name, parameters] of Object.entries(manifest.commands ?? {})) {
      if (name.startsWith("$") || !keep(name)) continue;
      lines.push(`<command name="${name}" code="Xxxxxxxx">`);
      for (const term of parameters.filter(keep)) lines.push(`<parameter name="${term}" code="Xxxx"/>`);
      lines.push("</command>");
    }
    for (const [name, enumerators] of Object.entries(manifest.enumerations ?? {})) {
      if (name.startsWith("$")) continue;
      lines.push(`<enumeration name="${name}" code="Xxxx">`);
      for (const term of enumerators.filter(keep)) lines.push(`<enumerator name="${term}" code="Xxxx"/>`);
      lines.push("</enumeration>");
    }
    return [...lines, "</suite>", "</dictionary>"].join("\n");
  };
  const run = (sdef, args = [], env = {}) => {
    const folder = mkdtempSync(join(tmpdir(), "vela-terms-"));
    try {
      writeFileSync(join(folder, "Vela.sdef"), sdef);
      const summary = join(folder, "summary.md");
      const result = spawnSync(process.execPath, [script, ...args], {
        encoding: "utf8",
        env: {
          ...process.env,
          VELA_SDEF: join(folder, "Vela.sdef"),
          GITHUB_ACTIONS: "",
          GITHUB_STEP_SUMMARY: summary,
          ...env,
        },
      });
      let written = "";
      try {
        written = readFileSync(summary, "utf8");
      } catch {
        // No summary: not in GitHub Actions.
      }
      return { status: result.status, output: result.stdout + result.stderr, summary: written };
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  };
  const total = checkTerms(manifest, parseSdef(sdefFor())).length;
  const someProperty = Object.values(manifest.classes).find((uses) => uses.properties?.length).properties[0];

  test("every term there: exit 0", () => {
    const { status, output } = run(sdefFor());
    assert.equal(status, 0, output);
    assert.match(output, /^Vela\.sdef: .*\(VELA_SDEF\)$/m);
    assert.match(output, new RegExp(`^All ${total} terms in vela-terms\\.json are in Vela\\.sdef\\.$`, "m"));
  });

  test("a term missing: exit 1, saying which", () => {
    const { status, output } = run(sdefFor({ without: someProperty }));
    assert.equal(status, 1, output);
    assert.match(output, new RegExp(`^Not in Vela\\.sdef:\\n  property "${someProperty}" of `, "m"));
    assert.match(
      output,
      new RegExp(`^${total - 1} of ${total} terms in vela-terms\\.json are in Vela\\.sdef\\.$`, "m"),
    );
  });

  test("--soft: reported, exit 0", () => {
    const { status, output } = run(sdefFor({ without: someProperty }), ["--soft"]);
    assert.equal(status, 0, output);
    assert.match(output, /--soft: reported, not failed/);
  });

  test("in GitHub Actions: annotations and the run's summary", () => {
    const failed = run(sdefFor({ without: someProperty }), [], { GITHUB_ACTIONS: "true" });
    assert.match(
      failed.output,
      new RegExp(
        `^::error file=vela-terms\\.json,title=Vela\\.sdef::Not in Vela\\.sdef: property "${someProperty}" of `,
        "m",
      ),
    );
    assert.match(failed.summary, /^### Vela\.sdef$/m);
    assert.match(failed.summary, new RegExp(`^- Not in Vela\\.sdef: property "${someProperty}" of `, "m"));
    const soft = run(sdefFor({ without: someProperty }), ["--soft"], { GITHUB_ACTIONS: "true" });
    assert.match(soft.output, /^::warning file=vela-terms\.json,/m);
  });

  test("VELA_SDEF that isn't there: exit 1", () => {
    const { status, output } = run("", [], { VELA_SDEF: "/nowhere/Vela.sdef" });
    assert.equal(status, 1);
    assert.match(output, /VELA_SDEF is \/nowhere\/Vela\.sdef, and there's no such file\./);
  });

  test("a wrong option: exit 2", () => {
    assert.equal(run(sdefFor(), ["--brunch", "next"]).status, 2);
    assert.equal(run(sdefFor(), ["--branch"]).status, 2);
  });
});
