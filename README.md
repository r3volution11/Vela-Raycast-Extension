# Vela for Raycast

Search your IRC channels and private conversations in [Vela](https://velairc.app), see where you're mentioned and what's unread, send a message, and open Catch me up, without leaving Raycast.

The extension talks to Vela through Vela's [AppleScript dictionary](https://velairc.app/guide/automation#applescript) and its [`vela://` links](https://velairc.app/guide/automation#links). It needs a version of Vela that has them (Vela 1.5 or later); with an older Vela, it says so.

## Install

From the [Raycast Store](https://www.raycast.com/r3volution11/vela-irc), once it's published there: search for **Vela** in Raycast's Store command and install it. Or install it from Vela, in **Settings → Integrations**.

Until it's in the Store, you can install it from its source, with Node.js 22.22 or later:

```sh
git clone https://github.com/r3volution11/vela-raycast-extension.git
cd vela-raycast-extension
npm install
npm run dev   # imports it into Raycast; it stays after you stop this
```

## Commands

| Command | What it does |
| --- | --- |
| **Search Conversations** | Every channel and private conversation, in three sections: **Mentions** (most first), **Unread** (most first) and **All** (the rest, in Vela's sidebar order). Each row shows its network, the unread count, mentions as a red `@` tag, and whether it's muted or a channel you've left. Type to filter by name or network. |
| **Send Message** | Pick a channel you're in or a private conversation (mentions and unread ones first) and send a message. |
| **Catch Me Up** | Opens Catch me up in Vela for the unmuted conversation with the most unread messages, as Vela's own Catch Me Up does. If nothing is unread, it says you're all caught up. |
| **Unread Conversations** (menu bar) | Off until you turn it on in Raycast's settings (Extensions → Vela). Shows your mentions in the menu bar, with the conversations that have something unread in its menu. It refreshes every 5 minutes and when you open the menu. |

None of them ever opens Vela by themselves: if Vela isn't running, they say so and offer to open it.

### Search Conversations: actions and shortcuts

| Action | Shortcut | What it does |
| --- | --- | --- |
| Open in Vela | ↩ | Shows the conversation in Vela (a `vela://open?id=…` link). |
| Write Message | ⌘↩ | A form to write and send a message to it. Not offered for channels you've left. |
| Catch Me Up | ⌘U | Opens the conversation in Vela with its Catch me up card. |
| Open Recap | ⌘⇧R | Opens a Recap of the conversation since your first unread message. |
| Draft in Vela | ⌘⇧D | A form whose text goes into Vela's message box; you press Return in Vela to send it. |
| Mark Read | ⌘⇧U | Marks the conversation read (shown only when something is unread). |
| Mark All Read | ⌥⇧⌘U | Marks every channel and conversation read. |
| Copy Link | ⌘⇧C | Copies the conversation's `vela://open?id=…` link, for your notes or a Raycast quicklink. |
| Reload | ⌘R | Reads your conversations again. |

In the **Write Message** and **Send Message** forms, ⌘↩ sends and ⌘⇧↩ puts the text in Vela's message box instead (in the **Draft in Vela** form it's the other way round).

Messages are sent as plain text, as Vela's message box sends them: a message starting with `/` is sent as it is, never run as a command, and long text is split and paced as Vela does. More than 3 lines asks first: tick **Send all N lines** to send them. Vela sends at most 50 IRC messages at once.

## The first time: allow Raycast to control Vela

The first time the extension asks Vela for something, macOS asks: "“Raycast” wants access to control “Vela”." Click **Allow**.

If you clicked **Don't Allow**, the extension says so and offers **Open Automation Settings**: turn on **Vela** under **Raycast** in **System Settings → Privacy & Security → Automation**.

**Open in Vela** and **Copy Link** use `vela://` links, which need no permission.

## Preferences

| Preference | Default | What it does |
| --- | --- | --- |
| App | Vela | **Vela Dev** talks to Vela's development build (bundle id `io.github.r3volution11.Vela.dev`, `vela-dev://` links) instead, for working on Vela itself. Raycast keeps each one's conversations apart. |

## What the extension asks Vela

Every command runs one small JavaScript for Automation script (`src/vela/script.ts`) with `osascript`. It first checks whether Vela is running without launching it, then asks for Vela's `scripting version`, then sends what's below. Reading your conversations takes one Apple event per property, however many conversations you have, and Vela answers from what it has open, never its database. Nothing polls: lists read once when they open, and the menu bar command every 5 minutes.

Vela raises its `scripting version` only for changes that could break extensions. A Vela without one (older than 1.5), or with a lower one than the extension needs (`REQUIRED_SCRIPTING_VERSION` in `src/lib/scripting-version.ts`, now 1), is asked nothing else, and the extension says “This extension needs Vela 1.5 or later”. `vela-terms.json` lists every term of Vela's dictionary the extension uses.

| What | AppleScript equivalent |
| --- | --- |
| Every command, first | `get scripting version` |
| List | `get {id, name, network name, kind, unread count, mention count, muted, joined} of every conversation` |
| Open in Vela | none: the link `vela://open?id=<id>` |
| Send | `send message "…" to conversation id "<id>" allowing multiple lines true/false` |
| Draft | `draft message "…" to conversation id "<id>"` |
| Catch Me Up (one) | `catch up conversation id "<id>"` |
| Catch Me Up (command) | `catch up`, after checking that an unmuted conversation has something unread |
| Open Recap | `open recap conversation id "<id>"` |
| Mark Read | `mark read conversation id "<id>"` |
| Mark All Read | `mark all read` |

## Privacy

The extension has no analytics or tracking of any kind. Everything stays on your Mac between Raycast and Vela; the only thing that leaves it is a message you send, which Vela sends to your IRC network.

## Troubleshooting

- **"Vela isn't running."** Open Vela (the empty view and the toast have **Open Vela**), then reopen the command or press ⌘R.
- **"Raycast isn't allowed to control Vela."** See [above](#the-first-time-allow-raycast-to-control-vela).
- **"Vela didn't answer in time."** macOS may be waiting for you to answer its permission prompt: click **Allow**, then try again.
- **"This extension needs Vela 1.5 or later."** Your Vela is older than that. Get the latest from [velairc.app](https://velairc.app).
- **"Vela is still starting."** Vela was just opened and is restoring your networks. Try again in a moment.
- **"Not in the channel" or no Write Message.** You've left that channel: rejoin it in Vela. **Draft in Vela** still works.
- **Catch Me Up says Apple Intelligence isn't available or is turned off.** Catch me up needs Apple Intelligence or one of your own AI models in Vela's **Settings → Intelligence**, and it must be turned on there.
- **Counts look out of date.** Press ⌘R. The list shows what Raycast saw last time at once, then refreshes.
- **The wrong Vela answers.** Check the **App** preference (Vela or Vela Dev).

## Development

You need macOS, Node.js 22.22 or later and Raycast.

```sh
npm install
npm run dev                # ray develop: opens the extension in Raycast
npm test                   # unit tests, with Node's own test runner
npm run lint               # ray lint: manifest, icons, ESLint, Prettier
npm run build              # ray build: a distribution build into dist/
npx tsc --noEmit           # type-check, tests included
npm run check-vela-terms   # the terms the extension uses, against Vela's dictionary
```

- `src/lib/`: everything that isn't Raycast (sorting and sections, accessories, line counting, error messages, links, reading the script's answers, the scripting version it needs), tested by `src/lib/*.test.ts`. Imports between these files name their `.ts` extension so Node can run them directly.
- `src/vela/script.ts`: the JXA script. `src/vela/script.test.ts` runs it in Node against a stand-in Vela, so the tests never send an Apple event, and compiles it with `osacompile` to check its syntax.
- `src/vela/bridge.ts`: runs the script with `runAppleScript` and turns its answer into conversations or a problem to show.
- `src/components/`, `src/hooks/` and the four command files: the views.
- `vela-terms.json`: every term of Vela's AppleScript dictionary the script uses. `scripts/check-vela-terms.mjs` checks them against Vela's dictionary; the same script is in [vela-alfred-workflow](https://github.com/r3volution11/vela-alfred-workflow).
- `.github/workflows/`: CI, and the nightly check against Vela's dictionary.

The tests never talk to Vela. To try the extension against a real Vela, use Vela Dev (the **App** preference) and `npm run dev`.

### Testing

`npm test` runs the extension's tests and those of `scripts/check-vela-terms.mjs`.

`src/vela/terms.test.ts` keeps `vela-terms.json` honest: it reads the script for the terms it uses (`app.sendMessage(…, { to: … })`, `app.conversations.unreadCount()`, the `COLUMNS` it reads, and so on) and fails if one isn't in `vela-terms.json`, or if `vela-terms.json` lists one the extension no longer mentions. That's a heuristic, not a parser: it only sees terms used on a variable named `app`, and the comments in `termsInJXA` (in `scripts/check-vela-terms.mjs`) list what it misses. Add a term to `vela-terms.json` by hand when you use it some other way.

When there's a Vela.sdef on your Mac, one more test checks every term in `vela-terms.json` against it. It finds it like `scripts/check-vela-terms.mjs` does: `VELA_SDEF`, or Vela's repository checked out beside this one (`../Vela IRC` or `../Vela-IRC`). Without one it's skipped, and CI checks the terms against Vela's `next` instead.

## Store submission

What's left before `npm run publish`:

1. **Screenshots.** Take 3 to 6 with Raycast's **Capture Window** command (2000 × 1250 PNG, light or dark but all the same, one wallpaper), with **Save to Metadata** ticked so they land in `metadata/` as `vela-irc-1.png` and so on. Run Vela with demo data (`--demo`) so no real networks or nicks show. Suggested views:
   1. Search Conversations with Mentions, Unread and All sections.
   2. The action panel (⌘K) on a conversation.
   3. Write Message with a few lines typed and **Send all N lines** showing.
   4. Send Message with the conversation dropdown open.
   5. Optionally, the Unread Conversations menu bar menu (Capture Window doesn't capture menus: use a screenshot cropped and scaled to 2000 × 1250).
2. **Check.** `npm run lint` and `npm run build` pass; `CI=true npx ray lint` also checks `package-lock.json`.
3. **Publish.** Commit, then run `npm run publish` in this folder. It asks you to sign in with GitHub, forks [raycast/extensions](https://github.com/raycast/extensions) into your account (as `raycast-extensions`) if you haven't yet, copies this folder in as `extensions/vela-irc` and opens the pull request; running it again adds to the same pull request. To do it by hand instead, copy the folder (with `package-lock.json`, without `node_modules` and `dist`) into your own fork of raycast/extensions as `extensions/vela-irc` and open the pull request yourself. Either way, Raycast's team reviews it before it's in the Store.

Once it's in the Store, see [Releasing](#releasing) for updates.

The extension is MIT-licensed, as the Raycast Store requires. Vela itself is licensed under the MPL-2.0; the extension contains none of Vela's code, only the names of its AppleScript terms and its bundle ids.

## Releasing

The Raycast Store builds the extension from [raycast/extensions](https://github.com/raycast/extensions), so a release is a pull request there:

1. Add what changed to the top of `CHANGELOG.md`, under a `## [What changed] - {PR_MERGE_DATE}` heading (Raycast fills in the date), and commit.
2. Check that `npm run lint`, `npm test` and `npm run build` pass (CI runs them too).
3. Run `npm run publish`. It copies this folder to `extensions/vela-irc` in your fork of raycast/extensions (`raycast-extensions` in your GitHub account) and opens the pull request, or adds to an open one. Raycast's team reviews it, and once it's merged, Raycast updates the installed extensions.

## Working across Vela and this extension

The extension talks to Vela only through Vela's AppleScript dictionary ([`Vela/Vela.sdef`](https://github.com/r3volution11/Vela-IRC/blob/next/Vela/Vela.sdef) in Vela's repository) and its `vela://` links. `vela-terms.json` lists every term it uses.

- **Change Vela's dictionary first.** A term has to be in Vela before the extension can use it.
- **Adding a term is safe**: nothing uses it yet. Use it here once a Vela that has it is released, and say which Vela the extension then needs (`REQUIRED_VELA` in `src/lib/scripting-version.ts`).
- **Removing or renaming a term breaks released extensions.** Do it only after this extension and the Alfred workflow no longer use it (it's out of their `vela-terms.json`, and they're released), and raise Vela's `scripting version` in the same change. An extension that needs the new dictionary raises `REQUIRED_SCRIPTING_VERSION` to match, so an older Vela says which Vela it needs instead of failing.
- **Use the same branch name in both repositories** for a change on both sides. Locally, check out that branch in Vela beside this repository: the tests and `npm run check-vela-terms` use its Vela.sdef. On GitHub, the dictionary check on a push here uses Vela's branch of the same name when there is one, instead of `next`.
- **The dictionary check** (`.github/workflows/vela-terms.yml`, **Vela's dictionary** in the Actions tab) runs on every push and every night. It checks `vela-terms.json` against Vela.sdef on Vela's `next`, which must pass, and on `main`, which only reports (`--soft`), since the released Vela can predate terms the extension already uses. So when a change to Vela's dictionary would break the extension, the check here fails within a day. When a scheduled run fails, GitHub emails whoever last changed its schedule. GitHub turns scheduled runs off after 60 days without commits; turn it back on in the Actions tab.

## License

[MIT](LICENSE).

---

<sub>Vela and this extension were made with the help of AI. The source code is open, so anyone can read exactly what it does.</sub>
