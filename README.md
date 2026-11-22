# Vela for Raycast

Search your IRC channels and private conversations in [Vela](https://velairc.app), see where you're mentioned and what's unread, send a message, and open Catch me up, without leaving Raycast.

The extension talks to Vela through Vela's [AppleScript dictionary](https://velairc.app/guide/automation#applescript) and its [`vela://` links](https://velairc.app/guide/automation#links). It needs a version of Vela that has them (Vela 1.5 or later).

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

Every command runs one small JavaScript for Automation script (`src/vela/script.ts`) with `osascript`. It first checks whether Vela is running without launching it, then sends what's below. Reading your conversations takes one Apple event per property, however many conversations you have, and Vela answers from what it has open, never its database. Nothing polls: lists read once when they open, and the menu bar command every 5 minutes.

| What | AppleScript equivalent |
| --- | --- |
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
- **"Update Vela."** Your Vela doesn't have the AppleScript dictionary yet. Get the latest from [velairc.app](https://velairc.app).
- **"Vela is still starting."** Vela was just opened and is restoring your networks. Try again in a moment.
- **"Not in the channel" or no Write Message.** You've left that channel: rejoin it in Vela. **Draft in Vela** still works.
- **Catch Me Up says Apple Intelligence isn't available or is turned off.** Catch me up needs Apple Intelligence or one of your own AI models in Vela's **Settings → Intelligence**, and it must be turned on there.
- **Counts look out of date.** Press ⌘R. The list shows what Raycast saw last time at once, then refreshes.
- **The wrong Vela answers.** Check the **App** preference (Vela or Vela Dev).

## Development

```sh
npm install
npm run dev        # ray develop: opens the extension in Raycast
npm test           # unit tests, with Node's own test runner
npm run lint       # ray lint: manifest, icons, ESLint, Prettier
npm run build      # ray build: a distribution build into dist/
npx tsc --noEmit   # type-check, tests included
```

- `src/lib/`: everything that isn't Raycast (sorting and sections, accessories, line counting, error messages, links, reading the script's answers), tested by `src/lib/*.test.ts`. Imports between these files name their `.ts` extension so Node can run them directly.
- `src/vela/script.ts`: the JXA script. `src/vela/script.test.ts` runs it in Node against a stand-in Vela, so the tests never send an Apple event, and compiles it with `osacompile` to check its syntax.
- `src/vela/bridge.ts`: runs the script with `runAppleScript` and turns its answer into conversations or a problem to show.
- `src/components/`, `src/hooks/` and the four command files: the views.

The tests never talk to Vela. To try the extension against a real Vela, use Vela Dev (the **App** preference) and `npm run dev`.

## Store submission

What's left before `npm run publish`:

1. **Author.** Replace `REPLACE_WITH_RAYCAST_USERNAME` in `package.json` with your Raycast username. `ray lint` looks it up on raycast.com and fails until it's a real one.
2. **Screenshots.** Take 3 to 6 with Raycast's **Capture Window** command (2000 × 1250 PNG, light or dark but all the same, one wallpaper), with **Save to Metadata** ticked so they land in `metadata/` as `vela-irc-1.png` and so on. Run Vela with demo data (`--demo`) so no real networks or nicks show. Suggested views:
   1. Search Conversations with Mentions, Unread and All sections.
   2. The action panel (⌘K) on a conversation.
   3. Write Message with a few lines typed and **Send all N lines** showing.
   4. Send Message with the conversation dropdown open.
   5. Optionally, the Unread Conversations menu bar menu (Capture Window doesn't capture menus: use a screenshot cropped and scaled to 2000 × 1250).
3. **Check.** `npm run lint` and `npm run build` pass; `CI=true npx ray lint` also checks `package-lock.json`.
4. **Publish.** Commit, then run `npm run publish` in this folder. It asks you to sign in with GitHub, forks [raycast/extensions](https://github.com/raycast/extensions) into your account (as `raycast-extensions`) if you haven't yet, copies this folder in as `extensions/vela-irc` and opens the pull request; running it again adds to the same pull request. To do it by hand instead, copy the folder (with `package-lock.json`, without `node_modules` and `dist`) into your own fork of raycast/extensions as `extensions/vela-irc` and open the pull request yourself. Either way, Raycast's team reviews it before it's in the Store.

The extension is MIT-licensed, as the Raycast Store requires. Vela itself is licensed under the MPL-2.0; the extension contains none of Vela's code, only the names of its AppleScript terms and its bundle ids.

## License

MIT
