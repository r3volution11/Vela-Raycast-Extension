import assert from "node:assert/strict";
import { test } from "node:test";
import {
  characterCount,
  countLines,
  draftProblem,
  MAXIMUM_DRAFT_LENGTH,
  multipleLinesLabel,
  needsMultipleLines,
  sendProblem,
} from "./message.ts";

test("countLines counts as Vela does: trimmed, blank lines left out, every kind of newline", () => {
  assert.equal(countLines(""), 0);
  assert.equal(countLines("   \n \n"), 0);
  assert.equal(countLines("hello"), 1);
  assert.equal(countLines("\n\nhello\n\n"), 1);
  assert.equal(countLines("a\nb\r\nc\rd"), 4);
  assert.equal(countLines("a\n\n   \nb"), 2);
  assert.equal(countLines("a\u2028b\u2029c\u0085d"), 4);
});

test("more than 3 lines needs allowing multiple lines", () => {
  assert.equal(needsMultipleLines("1\n2\n3"), false);
  assert.equal(needsMultipleLines("1\n2\n3\n4"), true);
});

test("sendProblem: empty text, and too many lines without the box ticked", () => {
  assert.equal(sendProblem("  ", false), "Write a message first.");
  assert.equal(sendProblem("hi", false), undefined);
  assert.equal(sendProblem("1\n2\n3\n4\n5", false), "That's 5 lines. Tick “Send all 5 lines” to send them.");
  assert.equal(sendProblem("1\n2\n3\n4\n5", true), undefined);
  assert.equal(multipleLinesLabel(5), "Send all 5 lines");
});

test("characterCount counts grapheme clusters, as Swift does", () => {
  assert.equal(characterCount("abc"), 3);
  assert.equal(characterCount("👍🏽"), 1);
  assert.equal(characterCount("👨‍👩‍👧"), 1);
  assert.equal(characterCount("é"), 1);
});

test("draftProblem: empty text and more than 4,000 characters", () => {
  assert.equal(draftProblem("\n "), "Write something to put in the message box.");
  assert.equal(draftProblem("a".repeat(MAXIMUM_DRAFT_LENGTH)), undefined);
  assert.equal(
    draftProblem("a".repeat(MAXIMUM_DRAFT_LENGTH + 1)),
    "That's 4,001 characters. Vela's message box takes up to 4,000 at once.",
  );
  assert.equal(draftProblem("👍🏽".repeat(MAXIMUM_DRAFT_LENGTH)), undefined, "emoji count once each");
});
