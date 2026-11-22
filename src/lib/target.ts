// Which Vela the extension talks to, and the links it opens. No Raycast
// imports here, so `npm test` can run this with plain Node.

/** The values of the extension's "App" preference (package.json). */
export type AppChoice = "vela" | "vela-dev";

export interface VelaTarget {
  choice: AppChoice;
  /** What to call it in messages: "Vela" or "Vela Dev". */
  name: string;
  bundleId: string;
  /** The link scheme it answers: Vela Dev answers `vela-dev://`, so a `vela://` link always opens the Vela you use every day. */
  scheme: string;
}

export const VELA: VelaTarget = {
  choice: "vela",
  name: "Vela",
  bundleId: "io.github.r3volution11.Vela",
  scheme: "vela",
};

export const VELA_DEV: VelaTarget = {
  choice: "vela-dev",
  name: "Vela Dev",
  bundleId: "io.github.r3volution11.Vela.dev",
  scheme: "vela-dev",
};

/** The target for the preference's value: Vela unless it says Vela Dev. */
export function targetFor(preference: string | undefined | null): VelaTarget {
  return preference === VELA_DEV.choice ? VELA_DEV : VELA;
}

/** Where macOS lists the apps allowed to control others (System Settings → Privacy & Security → Automation). */
export const AUTOMATION_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation";

/** Vela's website, for people who don't have it yet or need a newer version. */
export const VELA_WEBSITE_URL = "https://velairc.app";

/**
 * A query value as Vela writes its own links: percent-encoded, with "#",
 * "&" and "+" encoded, but "/" kept as it is, so an id reads
 * `<network id>/%23vela`.
 */
export function encodeQueryValue(value: string): string {
  return encodeURIComponent(value).replace(/%2F/gi, "/");
}

/** `vela://open?id=…`: shows the conversation in Vela. Needs no permission. */
export function openLink(target: VelaTarget, conversationId: string): string {
  return `${target.scheme}://open?id=${encodeQueryValue(conversationId)}`;
}

/** `vela://`: brings Vela to the front, opening it if it isn't running. */
export function appLink(target: VelaTarget): string {
  return `${target.scheme}://`;
}
