// Conversations as Vela's AppleScript dictionary reports them, and how the
// extension sorts, groups and describes them. No Raycast imports here, so
// `npm test` can run this with plain Node.

export type ConversationKind = "channel" | "private";

export interface Conversation {
  /** `<network uuid>/<name in lowercase>`. Never changes; `conversation id "…"` and `vela://open?id=` take it. */
  id: string;
  /** "#vela", or the other person's nick. */
  name: string;
  networkName: string;
  kind: ConversationKind;
  unreadCount: number;
  mentionCount: number;
  muted: boolean;
  /** Whether you're in the channel. Private conversations always are. */
  joined: boolean;
  /** Position in Vela's sidebar order (networks, then their conversations). */
  order: number;
}

/** The properties the list script reads, one Apple event each, as columns of the same length. */
export const COLUMNS = ["id", "name", "networkName", "kind", "unreadCount", "mentionCount", "muted", "joined"] as const;

export type Columns = Record<(typeof COLUMNS)[number], unknown[]>;

/**
 * `kind` as JXA reports the enumeration ("channel", "private conversation";
 * camel-cased or as the raw code on some systems): anything private is a
 * private conversation, everything else a channel.
 */
export function normalizeKind(raw: unknown): ConversationKind {
  const text = String(raw ?? "").toLowerCase();
  return text.includes("private") || text === "vkpv" ? "private" : "channel";
}

function count(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/**
 * Zips the list script's columns into conversations, in sidebar order.
 * Throws if a column is missing or the columns' lengths differ (a
 * conversation opened or closed between two Apple events).
 */
export function conversationsFromColumns(columns: unknown): Conversation[] {
  if (typeof columns !== "object" || columns === null) {
    throw new Error("Vela's answer had no conversations in it.");
  }
  const table = columns as Partial<Record<string, unknown>>;
  const lists = COLUMNS.map((key) => table[key]);
  if (!lists.every(Array.isArray)) {
    throw new Error("Vela's answer was missing some of its conversations' details.");
  }
  const [ids, names, networks, kinds, unread, mentions, muted, joined] = lists as unknown[][];
  if (!lists.every((list) => (list as unknown[]).length === ids.length)) {
    throw new Error("Your conversations changed while Raycast was reading them. Try again.");
  }
  return ids.map((id, index) => {
    const kind = normalizeKind(kinds[index]);
    return {
      id: String(id),
      name: String(names[index] ?? ""),
      networkName: String(networks[index] ?? ""),
      kind,
      unreadCount: count(unread[index]),
      mentionCount: count(mentions[index]),
      muted: muted[index] === true,
      joined: kind === "private" || joined[index] === true,
      order: index,
    };
  });
}

/**
 * Whether Vela counts it among `unread conversations`: something unread,
 * or for a muted one, mentions of you.
 */
export function isUnread(conversation: Conversation): boolean {
  return conversation.muted ? conversation.mentionCount > 0 : conversation.unreadCount > 0;
}

export type SectionId = "mentions" | "unread" | "all";

export interface ConversationSection {
  id: SectionId;
  title: string;
  conversations: Conversation[];
}

const byMentions = (a: Conversation, b: Conversation) =>
  b.mentionCount - a.mentionCount || b.unreadCount - a.unreadCount || a.order - b.order;

const byUnread = (a: Conversation, b: Conversation) => b.unreadCount - a.unreadCount || a.order - b.order;

const bySidebar = (a: Conversation, b: Conversation) => a.order - b.order;

/**
 * The list's sections, empty ones left out: Mentions (most first), then
 * Unread (most first, muted ones only with mentions, as Vela counts them),
 * then everything else in sidebar order.
 */
export function sectionConversations(conversations: Conversation[]): ConversationSection[] {
  const mentions: Conversation[] = [];
  const unread: Conversation[] = [];
  const rest: Conversation[] = [];
  for (const conversation of conversations) {
    if (conversation.mentionCount > 0) mentions.push(conversation);
    else if (isUnread(conversation)) unread.push(conversation);
    else rest.push(conversation);
  }
  const sections: ConversationSection[] = [
    { id: "mentions", title: "Mentions", conversations: mentions.sort(byMentions) },
    { id: "unread", title: "Unread", conversations: unread.sort(byUnread) },
    {
      id: "all",
      title: mentions.length || unread.length ? "All" : "Conversations",
      conversations: rest.sort(bySidebar),
    },
  ];
  return sections.filter((section) => section.conversations.length > 0);
}

/** Every conversation in the sections' order: what a dropdown lists. */
export function orderedConversations(conversations: Conversation[]): Conversation[] {
  return sectionConversations(conversations).flatMap((section) => section.conversations);
}

/** Where `send message` can go: channels you're in and private conversations. */
export function canSend(conversation: Conversation): boolean {
  return conversation.joined;
}

/**
 * The conversation `catch up` picks without one, as Vela picks it: the
 * unmuted one with the most unread messages, ties going to more mentions,
 * then sidebar order.
 */
export function busiestUnread(conversations: Conversation[]): Conversation | undefined {
  let best: Conversation | undefined;
  for (const conversation of [...conversations].sort(bySidebar)) {
    if (conversation.muted || conversation.unreadCount <= 0) continue;
    if (
      !best ||
      conversation.unreadCount > best.unreadCount ||
      (conversation.unreadCount === best.unreadCount && conversation.mentionCount > best.mentionCount)
    ) {
      best = conversation;
    }
  }
  return best;
}

export interface UnreadSummary {
  /** Mentions of you, across every conversation (muted ones too). */
  mentions: number;
  /** Conversations with mentions. */
  mentionConversations: number;
  /** Conversations Vela counts as unread (see ``isUnread``). */
  unreadConversations: number;
}

export function summarize(conversations: Conversation[]): UnreadSummary {
  let mentions = 0;
  let mentionConversations = 0;
  let unreadConversations = 0;
  for (const conversation of conversations) {
    mentions += conversation.mentionCount;
    if (conversation.mentionCount > 0) mentionConversations += 1;
    if (isUnread(conversation)) unreadConversations += 1;
  }
  return { mentions, mentionConversations, unreadConversations };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The menu bar's title: your mentions, or nothing (just the icon) when there are none. */
export function menuBarTitle(summary: UnreadSummary | undefined): string | undefined {
  return summary && summary.mentions > 0 ? String(summary.mentions) : undefined;
}

/** The menu bar's tooltip: "2 mentions · 5 unread conversations". */
export function menuBarTooltip(summary: UnreadSummary | undefined): string {
  if (!summary) return "Vela";
  if (summary.mentions === 0 && summary.unreadConversations === 0) return "Vela: you're all caught up";
  const parts: string[] = [];
  if (summary.mentions > 0) parts.push(plural(summary.mentions, "mention", "mentions"));
  if (summary.unreadConversations > 0) {
    parts.push(plural(summary.unreadConversations, "unread conversation", "unread conversations"));
  }
  return `Vela: ${parts.join(" · ")}`;
}

/** An accessory, described without Raycast's types; the view turns these into List.Item accessories. */
export type AccessoryDescriptor =
  | { kind: "mentions"; text: string; tooltip: string }
  | { kind: "unread"; text: string; tooltip: string; dimmed: boolean }
  | { kind: "muted"; tooltip: string }
  | { kind: "notJoined"; text: string; tooltip: string };

/**
 * A row's accessories, left to right: not joined, muted, unread, mentions
 * (rightmost, as the most urgent). The unread count is left out when
 * every unread message is a mention, as in a private conversation.
 */
export function accessoriesFor(conversation: Conversation): AccessoryDescriptor[] {
  const accessories: AccessoryDescriptor[] = [];
  if (!conversation.joined) {
    accessories.push({ kind: "notJoined", text: "Not joined", tooltip: `You're not in ${conversation.name}` });
  }
  if (conversation.muted) {
    accessories.push({ kind: "muted", tooltip: "Muted" });
  }
  if (conversation.unreadCount > conversation.mentionCount) {
    accessories.push({
      kind: "unread",
      text: String(conversation.unreadCount),
      tooltip: plural(conversation.unreadCount, "unread message", "unread messages"),
      dimmed: conversation.muted,
    });
  }
  if (conversation.mentionCount > 0) {
    accessories.push({
      kind: "mentions",
      text: `@${conversation.mentionCount}`,
      tooltip:
        conversation.kind === "private"
          ? plural(conversation.mentionCount, "new message", "new messages")
          : plural(conversation.mentionCount, "mention", "mentions"),
    });
  }
  return accessories;
}

/**
 * Extra words the search bar matches besides the title: the network (and
 * its parts, "Libera" in "Libera.Chat") and the name without its "#".
 */
export function keywordsFor(conversation: Conversation): string[] {
  const words = new Set<string>();
  const bare = conversation.name.replace(/^[#&+!]+/, "");
  if (bare && bare !== conversation.name) words.add(bare);
  if (conversation.networkName) {
    words.add(conversation.networkName);
    for (const part of conversation.networkName.split(/[^\p{L}\p{N}]+/u)) {
      if (part && part !== conversation.networkName) words.add(part);
    }
  }
  words.add(conversation.kind === "private" ? "private" : "channel");
  return [...words];
}

/** A menu item's subtitle: "Libera.Chat · @2" for mentions, "Libera.Chat · 14" for unread. */
export function menuItemSubtitle(conversation: Conversation): string {
  const count = conversation.mentionCount > 0 ? `@${conversation.mentionCount}` : String(conversation.unreadCount);
  return conversation.networkName ? `${conversation.networkName} · ${count}` : count;
}

/** "#vela on Libera.Chat", for toasts. */
export function describeConversation(conversation: Pick<Conversation, "name" | "networkName">): string {
  return conversation.networkName ? `${conversation.name} on ${conversation.networkName}` : conversation.name;
}

/** A dropdown item's title: "#vela · Libera.Chat", since a dropdown has no subtitles. */
export function dropdownTitle(conversation: Pick<Conversation, "name" | "networkName">): string {
  return conversation.networkName ? `${conversation.name} · ${conversation.networkName}` : conversation.name;
}

/** Marks conversations read locally, for an optimistic update while Vela does it. */
export function markedRead(conversations: Conversation[], id?: string): Conversation[] {
  return conversations.map((conversation) =>
    id === undefined || conversation.id === id ? { ...conversation, unreadCount: 0, mentionCount: 0 } : conversation,
  );
}
