import assert from "node:assert/strict";
import { test } from "node:test";
import { appLink, encodeQueryValue, openLink, targetFor, VELA, VELA_DEV } from "./target.ts";

const ID = "6F9619FF-8B86-D011-B42D-00C04FC964FF/#vela";

test("the preference picks Vela or Vela Dev, Vela by default", () => {
  assert.equal(targetFor(undefined), VELA);
  assert.equal(targetFor("vela"), VELA);
  assert.equal(targetFor("something else"), VELA);
  assert.equal(targetFor("vela-dev"), VELA_DEV);
  assert.equal(VELA.bundleId, "io.github.r3volution11.Vela");
  assert.equal(VELA_DEV.bundleId, "io.github.r3volution11.Vela.dev");
});

test("open links take the id, encoded as Vela writes them", () => {
  assert.equal(openLink(VELA, ID), "vela://open?id=6F9619FF-8B86-D011-B42D-00C04FC964FF/%23vela");
  assert.equal(openLink(VELA_DEV, ID), "vela-dev://open?id=6F9619FF-8B86-D011-B42D-00C04FC964FF/%23vela");
  assert.equal(encodeQueryValue("a&b+c d#e/f"), "a%26b%2Bc%20d%23e/f");
  assert.equal(new URL(openLink(VELA, "x/&&chan")).searchParams.get("id"), "x/&&chan");
});

test("app links bring the right Vela forward", () => {
  assert.equal(appLink(VELA), "vela://");
  assert.equal(appLink(VELA_DEV), "vela-dev://");
});
