#!/usr/bin/env node
// Checks that Vela's AppleScript dictionary still has every term this
// extension uses. The terms are listed in vela-terms.json; the dictionary is
// Vela/Vela.sdef in r3volution11/Vela-IRC. Needs Node 20 or later, and
// nothing else.
//
//   node scripts/check-vela-terms.mjs                       # the Vela.sdef below
//   node scripts/check-vela-terms.mjs --branch next         # a branch of Vela, from GitHub
//   node scripts/check-vela-terms.mjs --branch main --soft  # report only
//
// Which Vela.sdef it checks, the first that applies:
//   1. --branch <name>: Vela.sdef on that branch, downloaded from GitHub.
//   2. VELA_SDEF: a path to a Vela.sdef.
//   3. A Vela checkout beside this one: ../Vela IRC or ../Vela-IRC.
//   4. Vela.sdef on Vela's next branch, downloaded from GitHub.
//
// Options:
//   --branch <name>  Check Vela.sdef on that branch of r3volution11/Vela-IRC.
//   --soft           Report missing terms as warnings and exit 0: for Vela's
//                    main, whose released dictionary can predate terms the
//                    extension already uses (or not exist yet).
//
// Exit status: 0 when every term is there (or with --soft), 1 when one is
// missing or there's no Vela.sdef to check, 2 for a wrong option.
//
// The tests import its functions too: what vela-terms.json may hold, reading
// a dictionary, and guessing the terms a JXA script uses (termsInJXA, for
// the test that keeps vela-terms.json honest).
//
// vela-alfred-workflow and vela-raycast-extension have the same copy of this
// script and its test: change both.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPOSITORY = "r3volution11/Vela-IRC";
export const SDEF_IN_REPOSITORY = "Vela/Vela.sdef";
/** Names a Vela checkout beside this one may have: Doug's, and git clone's. */
const SIBLINGS = ["Vela IRC", "Vela-IRC"];

/** This repository's folder. */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST = join(root, "vela-terms.json");

// ---------------------------------------------------------------- vela-terms.json

const CLASS_KEYS = ["properties", "elements", "respondsTo"];

/** What's wrong with a vela-terms.json, if anything. Keys starting with "$" are comments. */
export function manifestErrors(manifest) {
  const errors = [];
  const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  const terms = (value, where) => {
    if (!Array.isArray(value) || !value.every((term) => typeof term === "string" && term && term.trim() === term)) {
      errors.push(`${where} should be a list of terms`);
    }
  };
  const keys = (object, allowed, where) => {
    for (const key of Object.keys(object)) {
      if (!key.startsWith("$") && !allowed.includes(key)) errors.push(`${where} has an unknown key "${key}"`);
    }
  };
  if (!isObject(manifest)) return ["it should be an object"];
  keys(manifest, ["classes", "commands", "enumerations"], "vela-terms.json");
  for (const section of ["classes", "commands", "enumerations"]) {
    if (manifest[section] !== undefined && !isObject(manifest[section])) errors.push(`${section} should be an object`);
  }
  for (const [name, uses] of entries(manifest.classes)) {
    if (!isObject(uses)) {
      errors.push(`classes["${name}"] should be an object`);
      continue;
    }
    keys(uses, CLASS_KEYS, `classes["${name}"]`);
    for (const key of CLASS_KEYS) if (uses[key] !== undefined) terms(uses[key], `classes["${name}"].${key}`);
  }
  for (const [name, parameters] of entries(manifest.commands)) terms(parameters, `commands["${name}"]`);
  for (const [name, enumerators] of entries(manifest.enumerations)) terms(enumerators, `enumerations["${name}"]`);
  return errors;
}

/** A section's entries, without "$" comments. */
function entries(section) {
  return section && typeof section === "object" ? Object.entries(section).filter(([key]) => !key.startsWith("$")) : [];
}

/** vela-terms.json, checked. Throws if it isn't what this script expects. */
export function readManifest(path = MANIFEST) {
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  const errors = manifestErrors(manifest);
  if (errors.length) throw new Error(`${relative(process.cwd(), path)}: ${errors.join("; ")}.`);
  return manifest;
}

// ---------------------------------------------------------------- reading Vela.sdef

const TAG = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTRIBUTE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function decode(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[entity.toLowerCase()];
    if (named) return named;
    return String.fromCodePoint(
      entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)),
    );
  });
}

/**
 * The terms in an sdef: its classes (with what class-extensions add), their
 * properties, elements and responds-to commands; its commands and their
 * parameters; its enumerations and their enumerators. Only what the check
 * needs, without an XML library: comments and CDATA are skipped.
 */
export function parseSdef(xml) {
  const dictionary = { classes: new Map(), commands: new Map(), enumerations: new Map() };
  const classNamed = (name) => {
    if (!dictionary.classes.has(name)) {
      dictionary.classes.set(name, {
        name,
        plural: null,
        inherits: null,
        properties: new Set(),
        elements: new Set(),
        respondsTo: new Set(),
      });
    }
    return dictionary.classes.get(name);
  };
  const stack = [];
  const owner = (kind) => stack.findLast((frame) => frame.kind === kind)?.entry;
  const text = xml.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  for (const [, closing, tag, attributeText, selfClosing] of text.matchAll(TAG)) {
    if (closing) {
      while (stack.length && stack.pop().tag !== tag);
      continue;
    }
    const attributes = {};
    for (const [, name, double, single] of attributeText.matchAll(ATTRIBUTE))
      attributes[name] = decode(double ?? single);
    let frame = { tag, kind: null, entry: null };
    switch (tag) {
      case "class":
      case "record-type": {
        const entry = classNamed(attributes.name);
        if (attributes.plural) entry.plural = attributes.plural;
        if (attributes.inherits) entry.inherits = attributes.inherits;
        frame = { tag, kind: "class", entry };
        break;
      }
      case "class-extension":
        frame = { tag, kind: "class", entry: classNamed(attributes.extends) };
        break;
      case "command": {
        if (!dictionary.commands.has(attributes.name)) dictionary.commands.set(attributes.name, new Set());
        frame = { tag, kind: "command", entry: dictionary.commands.get(attributes.name) };
        break;
      }
      case "enumeration": {
        if (!dictionary.enumerations.has(attributes.name)) dictionary.enumerations.set(attributes.name, new Set());
        frame = { tag, kind: "enumeration", entry: dictionary.enumerations.get(attributes.name) };
        break;
      }
      case "property":
        owner("class")?.properties.add(attributes.name);
        break;
      case "element":
        owner("class")?.elements.add(attributes.type);
        break;
      case "responds-to":
        owner("class")?.respondsTo.add(attributes.command ?? attributes.name);
        break;
      case "parameter":
        owner("command")?.add(attributes.name);
        break;
      case "enumerator":
        owner("enumeration")?.add(attributes.name);
        break;
      default:
        break;
    }
    if (!selfClosing) stack.push(frame);
  }
  return dictionary;
}

/** Whether a class, or one it inherits from, has `term` among its `kind` (properties, elements or respondsTo). */
function classHas(dictionary, className, kind, term) {
  const seen = new Set();
  for (let entry = dictionary.classes.get(className); entry && !seen.has(entry);) {
    if (entry[kind].has(term)) return true;
    seen.add(entry);
    entry = entry.inherits ? dictionary.classes.get(entry.inherits) : null;
  }
  return false;
}

/** How AppleScript and JXA name a class's elements: its plural, or its name and "s". */
function pluralOf(dictionary, className) {
  return dictionary.classes.get(className)?.plural ?? `${className}s`;
}

/**
 * Every term in the manifest, and whether the dictionary has it where the
 * extension uses it: [{ term, found, note }], `note` saying more when the
 * term's description doesn't.
 */
export function checkTerms(manifest, dictionary) {
  const results = [];
  const result = (term, found, note = "") => results.push({ term, found, note });
  const noClass = (name) => (dictionary.classes.has(name) ? "" : `there's no class "${name}"`);
  for (const [className, uses] of entries(manifest.classes)) {
    for (const property of uses.properties ?? []) {
      result(
        `property "${property}" of ${className}`,
        classHas(dictionary, className, "properties", property),
        noClass(className),
      );
    }
    for (const element of uses.elements ?? []) {
      const term = `element "${element}" of ${className}`;
      if (!classHas(dictionary, className, "elements", element)) {
        result(term, false, noClass(className));
      } else if (pluralOf(dictionary, element) !== `${element}s`) {
        result(term, false, `its plural is now "${pluralOf(dictionary, element)}", not "${element}s"`);
      } else {
        result(term, true);
      }
    }
    for (const command of uses.respondsTo ?? []) {
      result(
        `${className} responds to "${command}"`,
        classHas(dictionary, className, "respondsTo", command),
        noClass(className),
      );
    }
  }
  for (const [command, parameters] of entries(manifest.commands)) {
    const known = dictionary.commands.get(command);
    result(`command "${command}"`, Boolean(known));
    for (const parameter of parameters) {
      result(
        `parameter "${parameter}" of "${command}"`,
        Boolean(known?.has(parameter)),
        known ? "" : `there's no command "${command}"`,
      );
    }
  }
  for (const [enumeration, enumerators] of entries(manifest.enumerations)) {
    const known = dictionary.enumerations.get(enumeration);
    for (const enumerator of enumerators) {
      result(
        `enumerator "${enumerator}" of "${enumeration}"`,
        Boolean(known?.has(enumerator)),
        known ? "" : `there's no enumeration "${enumeration}"`,
      );
    }
  }
  return results;
}

// ---------------------------------------------------------------- the terms a JXA script uses

/** Names JXA gives application objects and element lists itself: not Vela's terms. */
const JXA_OWN = new Set([
  "activate",
  "launch",
  "running",
  "includeStandardAdditions",
  "strictPropertyScope",
  "strictCommandScope",
  "strictParameterType",
  "byId",
  "byName",
  "byRange",
  "at",
  "whose",
  "where",
  "length",
]);

/** "networkName" → "network name": a JXA name as the term it stands for. Terms with spaces stay as they are. */
export function termFromJXA(name) {
  return name.includes(" ") ? name : name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

/** "network name" → "networkName": how JXA spells a term. */
export function jxaName(term) {
  return term.replace(/ +([a-z0-9])/gi, (_, letter) => letter.toUpperCase());
}

/** The script without its comments (a "//" after a ":" is a URL's, and stays). */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Where the string starting at `start` ends. */
function endOfString(text, start) {
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === text[start]) return i;
  }
  return text.length;
}

/** The bracket that closes the one at `open`, skipping strings; -1 if none. */
function closingBracket(text, open) {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const expected = [];
  for (let i = open; i < text.length; i++) {
    const character = text[i];
    if (character === '"' || character === "'" || character === "`") i = endOfString(text, i);
    else if (pairs[character]) expected.push(pairs[character]);
    else if (character === expected.at(-1) && (expected.pop(), expected.length === 0)) return i;
  }
  return -1;
}

/** "a, f(b, c), { d: e }" → ["a", "f(b, c)", "{ d: e }"]. */
function splitArguments(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '"' || character === "'" || character === "`") i = endOfString(text, i);
    else if ("([{".includes(character)) depth++;
    else if (")]}".includes(character)) depth--;
    else if (character === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * The dictionary terms a JXA script seems to use, guessed from how it's
 * written. The guesses, and what they miss:
 *
 * - `app.<name>`, where `app` is what Application(…) returned: a command,
 *   an application property (JXA reads those with a call too), or an
 *   element list ("conversations"). The application must be in a variable
 *   or parameter named `app`.
 * - `app.<elements>.<name>`: a property of those elements' class, named by
 *   taking the "s" off ("conversations" → conversation).
 * - The strings in an array named COLUMNS: conversation properties the
 *   script reads by name (`conversations[key]()`).
 * - `app.<command>(…, { <name>: … })`: the command's parameters.
 * - `app.<command>(<x>)` where <x> mentions `conversation`, `target` or
 *   `byId`: a command sent to a conversation, so conversations must
 *   respond to it.
 *
 * It doesn't see terms used any other way: names built at run time, other
 * objects that hold an element (`target().name()`), records, enumerators
 * (the script compares `kind` to strings), or AppleScript. Comments are
 * skipped. Returns [{ kind, term, of }]: kind "application" (of nothing),
 * "property" (of a class), "parameter" (of a command) or "respondsTo" (of a
 * class).
 */
export function termsInJXA(source) {
  const code = withoutComments(source);
  const uses = [];
  const use = (kind, term, of = "") => {
    if (!uses.some((u) => u.kind === kind && u.term === term && u.of === of)) uses.push({ kind, term, of });
  };
  for (const match of code.matchAll(/\bapp\.([A-Za-z_$][\w$]*)(\.[A-Za-z_$][\w$]*)?\s*(\()?/g)) {
    const [, name, member, call] = match;
    if (JXA_OWN.has(name)) continue;
    use("application", termFromJXA(name));
    if (member && !JXA_OWN.has(member.slice(1))) {
      use("property", termFromJXA(member.slice(1)), termFromJXA(name).replace(/s$/, ""));
    }
    if (member || !call) continue;
    const open = match.index + match[0].length - 1;
    const close = closingBracket(code, open);
    if (close < 0) continue;
    const command = termFromJXA(name);
    const parts = splitArguments(code.slice(open + 1, close));
    if (parts.length && /conversation|target|byId/i.test(parts[0]) && !parts[0].startsWith("{")) {
      use("respondsTo", command, "conversation");
    }
    const last = parts.at(-1);
    if (last?.startsWith("{") && last.endsWith("}")) {
      for (const entry of splitArguments(last.slice(1, -1))) {
        const key = entry.match(/^([A-Za-z_$][\w$]*)\s*(?::|$)/)?.[1];
        if (key) use("parameter", termFromJXA(key), command);
      }
    }
  }
  for (const match of code.matchAll(/\bCOLUMNS\s*=\s*\[/g)) {
    const open = match.index + match[0].length - 1;
    const list = code.slice(open, closingBracket(code, open) + 1);
    for (const [, value] of list.matchAll(/["']([^"']+)["']/g)) use("property", termFromJXA(value), "conversation");
  }
  return uses;
}

/**
 * The terms in `uses` (from termsInJXA) that the manifest doesn't list where
 * they're used, as sentences.
 */
export function unlistedTerms(manifest, uses) {
  const commands = manifest.commands ?? {};
  const listed = (className, kind, term) => (manifest.classes?.[className]?.[kind] ?? []).includes(term);
  const missing = [];
  for (const { kind, term, of } of uses) {
    switch (kind) {
      case "application": {
        const element = term.replace(/s$/, "");
        const known =
          Object.hasOwn(commands, term) ||
          listed("application", "properties", term) ||
          (term !== element && listed("application", "elements", element));
        if (!known) missing.push(`app.${jxaName(term)}: "${term}" isn't a command, an application property or element`);
        break;
      }
      case "property":
        if (!listed(of, "properties", term)) missing.push(`property "${term}" of ${of} (${jxaName(term)})`);
        break;
      case "parameter":
        if (!(commands[of] ?? []).includes(term)) missing.push(`parameter "${term}" of "${of}" (${jxaName(term)})`);
        break;
      case "respondsTo":
        if (!listed(of, "respondsTo", term)) missing.push(`${of} responds to "${term}" (app.${jxaName(term)}(…))`);
        break;
      default:
        break;
    }
  }
  return missing;
}

/** Every term the manifest lists, each with how a source would spell it. */
function listedTerms(manifest) {
  const terms = [];
  for (const [className, uses] of entries(manifest.classes)) {
    for (const term of uses.properties ?? []) terms.push([`property "${term}" of ${className}`, term]);
    for (const term of uses.elements ?? []) terms.push([`element "${term}" of ${className}`, term]);
    for (const term of uses.respondsTo ?? []) terms.push([`${className} responds to "${term}"`, term]);
  }
  for (const [command, parameters] of entries(manifest.commands)) {
    terms.push([`command "${command}"`, command]);
    for (const term of parameters) terms.push([`parameter "${term}" of "${command}"`, term]);
  }
  for (const [enumeration, enumerators] of entries(manifest.enumerations)) {
    for (const term of enumerators) terms.push([`enumerator "${term}" of "${enumeration}"`, term]);
  }
  return terms;
}

/**
 * The terms the manifest lists that `text` never mentions: not as words
 * ("network name"), as JXA spells them (networkName), or run together in
 * any case ("privateconversation"). A weak check (comments count), to catch
 * terms left in the manifest after the code stopped using them.
 */
export function unusedTerms(manifest, text) {
  const squashed = text.toLowerCase().replace(/\s+/g, "");
  const word = (value) => new RegExp(`(^|[^\\w$])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\w$])`, "i");
  return listedTerms(manifest)
    .filter(
      ([, term]) =>
        !word(term).test(text) &&
        !word(jxaName(term)).test(text) &&
        !squashed.includes(term.replace(/\s+/g, "").toLowerCase()),
    )
    .map(([description]) => description);
}

// ---------------------------------------------------------------- finding Vela.sdef

/** Vela.sdef on a branch of Vela's repository, as GitHub serves it. */
export function sdefURL(branch) {
  const ref = branch.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${REPOSITORY}/refs/heads/${ref}/${SDEF_IN_REPOSITORY}`;
}

/** The branch a checkout is on, for saying which Vela.sdef was checked; "" if git can't say. */
function checkoutBranch(folder) {
  try {
    return execFileSync("git", ["-C", folder, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

/**
 * The Vela.sdef on this Mac to check against: VELA_SDEF, else Vela.sdef in a
 * Vela checkout beside this repository. { path, label }, or null if there's
 * neither. VELA_SDEF is taken as it is, even if there's no such file.
 */
export function localSdef(env = process.env, base = root) {
  if (env.VELA_SDEF) {
    const path = resolve(env.VELA_SDEF);
    return { path, label: `${path} (VELA_SDEF)` };
  }
  for (const name of SIBLINGS) {
    const checkout = join(base, "..", name);
    const path = join(checkout, SDEF_IN_REPOSITORY);
    if (existsSync(path)) {
      const branch = checkoutBranch(checkout);
      return {
        path,
        label: `${relative(process.cwd(), path)} (the Vela checkout beside this one${branch ? `, on ${branch}` : ""})`,
      };
    }
  }
  return null;
}

/** Vela.sdef on a branch, from GitHub, trying three times if the network fails. */
export async function downloadSdef(branch) {
  const url = sdefURL(branch);
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      if (attempt === 3) throw new Error(`Couldn't download ${url}: ${error.message}`);
      await new Promise((done) => setTimeout(done, attempt * 2000));
      continue;
    }
    if (response.ok) return response.text();
    if (response.status === 404) {
      throw new Error(`${REPOSITORY} has no ${SDEF_IN_REPOSITORY} on ${branch} (or no branch ${branch}).`);
    }
    if (attempt === 3 || response.status < 500) throw new Error(`Couldn't download ${url}: HTTP ${response.status}.`);
    await new Promise((done) => setTimeout(done, attempt * 2000));
  }
}

// ---------------------------------------------------------------- running it

const USAGE = `Usage: node scripts/check-vela-terms.mjs [--branch <name>] [--soft]

Checks that every term in vela-terms.json is in Vela's AppleScript dictionary.
Vela.sdef: --branch <name> (from GitHub), else VELA_SDEF, else ../Vela IRC or
../Vela-IRC, else Vela's next branch on GitHub. --soft reports what's missing
as warnings and exits 0.`;

/** A GitHub Actions workflow command's text, escaped. */
function escapeData(text) {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeProperty(text) {
  return escapeData(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

async function main(argv) {
  let branch = null;
  let soft = false;
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--branch" && argv[i + 1] && !argv[i + 1].startsWith("-")) branch = argv[++i];
    else if (argument === "--soft") soft = true;
    else if (argument === "-h" || argument === "--help") {
      console.log(USAGE);
      return 0;
    } else {
      console.error(argument === "--branch" ? "--branch needs a branch name." : `Unknown option: ${argument}`);
      console.error(USAGE);
      return 2;
    }
  }

  const actions = process.env.GITHUB_ACTIONS === "true";
  const level = soft ? "warning" : "error";
  const where = branch ? `Vela.sdef on ${branch}` : "Vela.sdef";
  const summary = (lines) => {
    if (actions && process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n\n`);
  };
  const fail = (message) => {
    console.error(`${soft ? "warning" : "error"}: ${message}`);
    if (actions) console.log(`::${level} title=${escapeProperty(where)}::${escapeData(message)}`);
    summary([`### ${where}`, "", message]);
    return soft ? 0 : 1;
  };

  let manifest;
  try {
    manifest = readManifest();
  } catch (error) {
    return fail(error.message);
  }

  let sdef;
  let label;
  try {
    const local = branch ? null : localSdef();
    if (local) {
      if (!existsSync(local.path)) return fail(`VELA_SDEF is ${local.path}, and there's no such file.`);
      sdef = readFileSync(local.path, "utf8");
      label = local.label;
    } else {
      const name = branch ?? "next";
      sdef = await downloadSdef(name);
      label = `${REPOSITORY}, branch ${name} (${sdefURL(name)})`;
    }
  } catch (error) {
    return fail(error.message);
  }

  console.log(`Vela.sdef: ${label}`);
  const results = checkTerms(manifest, parseSdef(sdef));
  const missing = results.filter((result) => !result.found);
  const described = missing.map(({ term, note }) => (note ? `${term}: ${note}` : term));
  if (missing.length) {
    console.log("Not in Vela.sdef:");
    for (const line of described) console.log(`  ${line}`);
    for (const line of described) {
      if (actions)
        console.log(
          `::${level} file=vela-terms.json,title=${escapeProperty(where)}::${escapeData(`Not in Vela.sdef: ${line}`)}`,
        );
    }
  }
  const verdict = missing.length
    ? `${results.length - missing.length} of ${results.length} terms in vela-terms.json are in Vela.sdef.${soft ? " (--soft: reported, not failed)" : ""}`
    : `All ${results.length} terms in vela-terms.json are in Vela.sdef.`;
  console.log(verdict);
  summary([
    `### ${where}`,
    "",
    `Checked ${label}.`,
    "",
    ...described.map((line) => `- Not in Vela.sdef: ${line}`),
    "",
    verdict,
  ]);
  return missing.length && !soft ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
