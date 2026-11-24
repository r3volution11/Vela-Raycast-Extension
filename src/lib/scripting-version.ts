// Which Vela the extension works with. Vela raises its `scripting version`
// (an application property in its AppleScript dictionary) only for changes
// that could break extensions, and Vela 1.5 is the first to have one. Every
// script run reads it before anything else (src/vela/script.ts); a Vela
// without one, or with a lower one, gets a problem saying which Vela the
// extension needs. No Raycast imports here, so `npm test` can run this with
// plain Node.

/** The `scripting version` this extension needs. Raise it with REQUIRED_VELA. */
export const REQUIRED_SCRIPTING_VERSION = 1;

/** The first Vela with that scripting version, for messages. */
export const REQUIRED_VELA = "Vela 1.5";
