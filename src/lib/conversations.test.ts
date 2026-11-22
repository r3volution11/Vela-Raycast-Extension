import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  accessoriesFor,
  busiestUnread,
  canSend,
  conversationsFromColumns,
  describeConversation,
  dropdownTitle,
  isUnread,
  keywordsFor,
  markedRead,
  menuBarTitle,
  menuBarTooltip,
  menuItemSubtitle,
  normalizeKind,
  orderedConversations,
  sectionConversations,
  summarize,
  type Conversation,
} from "./conversations.ts";

const LIBERA = "6F9619FF-8B86-D011-B42D-00C04FC964FF";
const OFTC = "0E984725-C51C-4BF4-9960-E1C80E27ABA0";

function conversation(overrides: Partial<Conversation> & Pick<Conversation, "name" | "order">): Conversation {
  return {
    id: `${LIBERA}/${overrides.name.toLowerCase()}`,
    networkName: "Libera.Chat",
    kind: overrides.name.startsWith("#") ? "channel" : "private",
    unreadCount: 0,
    mentionCount: 0,
    muted: false,
    joined: true,
    ...overrides,
  };
}

describe("conversationsFromColumns", () => {
  test("zips the columns into conversations in sidebar order", () => {
    const conversations = conversationsFromColumns({
      id: [`${LIBERA}/#vela`, `${LIBERA}/marisol`],
      name: ["#vela", "marisol"],
      networkName: ["Libera.Chat", "Libera.Chat"],
      kind: ["channel", "private conversation"],
      unreadCount: [12, 2],
      mentionCount: [1, 2],
      muted: [false, false],
      joined: [true, true],
    });
    assert.deepEqual(conversations, [
      {
        id: `${LIBERA}/#vela`,
        name: "#vela",
        networkName: "Libera.Chat",
        kind: "channel",
        unreadCount: 12,
        mentionCount: 1,
        muted: false,
        joined: true,
        order: 0,
      },
      {
        id: `${LIBERA}/marisol`,
        name: "marisol",
        networkName: "Libera.Chat",
        kind: "private",
        unreadCount: 2,
        mentionCount: 2,
        muted: false,
        joined: true,
        order: 1,
      },
    ]);
  });

  test("an empty Vela is an empty list", () => {
    const empty = {
      id: [],
      name: [],
      networkName: [],
      kind: [],
      unreadCount: [],
      mentionCount: [],
      muted: [],
      joined: [],
    };
    assert.deepEqual(conversationsFromColumns(empty), []);
  });

  test("columns of different lengths are refused", () => {
    assert.throws(
      () =>
        conversationsFromColumns({
          id: ["a/#a", "a/#b"],
          name: ["#a"],
          networkName: ["N", "N"],
          kind: ["channel", "channel"],
          unreadCount: [0, 0],
          mentionCount: [0, 0],
          muted: [false, false],
          joined: [true, true],
        }),
      /changed while Raycast was reading/,
    );
  });

  test("a missing column or no columns at all is refused", () => {
    assert.throws(() => conversationsFromColumns(undefined), /no conversations/);
    assert.throws(() => conversationsFromColumns({ id: [] }), /missing/);
  });

  test("odd values are made safe: counts, booleans and private conversations' joined", () => {
    const [conversation] = conversationsFromColumns({
      id: [42],
      name: [null],
      networkName: [undefined],
      kind: ["privateConversation"],
      unreadCount: ["3"],
      mentionCount: [-1],
      muted: ["true"],
      joined: [false],
    });
    assert.equal(conversation.id, "42");
    assert.equal(conversation.name, "");
    assert.equal(conversation.unreadCount, 3);
    assert.equal(conversation.mentionCount, 0);
    assert.equal(conversation.muted, false, "only true is muted");
    assert.equal(conversation.kind, "private");
    assert.equal(conversation.joined, true, "private conversations are always joined");
  });
});

test("normalizeKind reads JXA's enumerator names, camel-cased or not", () => {
  assert.equal(normalizeKind("channel"), "channel");
  assert.equal(normalizeKind("private conversation"), "private");
  assert.equal(normalizeKind("privateConversation"), "private");
  assert.equal(normalizeKind("VKpv"), "private");
  assert.equal(normalizeKind(undefined), "channel");
});

test("isUnread mirrors Vela's `unread conversations`: muted ones only with mentions", () => {
  assert.equal(isUnread(conversation({ name: "#a", order: 0, unreadCount: 4 })), true);
  assert.equal(isUnread(conversation({ name: "#a", order: 0 })), false);
  assert.equal(isUnread(conversation({ name: "#a", order: 0, unreadCount: 4, muted: true })), false);
  assert.equal(isUnread(conversation({ name: "#a", order: 0, unreadCount: 4, mentionCount: 1, muted: true })), true);
});

describe("sectionConversations", () => {
  const list = [
    conversation({ name: "#quiet", order: 0 }),
    conversation({ name: "#busy", order: 1, unreadCount: 40 }),
    conversation({ name: "#ping", order: 2, unreadCount: 5, mentionCount: 1 }),
    conversation({ name: "marisol", order: 3, unreadCount: 3, mentionCount: 3 }),
    conversation({ name: "#muted", order: 4, unreadCount: 99, muted: true }),
    conversation({ name: "#mutedping", order: 5, unreadCount: 7, mentionCount: 1, muted: true }),
    conversation({ name: "#some", order: 6, unreadCount: 2 }),
    conversation({ name: "#alpha", order: 7 }),
  ];

  test("mentions (most first, then most unread), unread (most first), then the rest in sidebar order", () => {
    const sections = sectionConversations(list);
    assert.deepEqual(
      sections.map((section) => [section.title, section.conversations.map((c) => c.name)]),
      [
        ["Mentions", ["marisol", "#mutedping", "#ping"]],
        ["Unread", ["#busy", "#some"]],
        ["All", ["#quiet", "#muted", "#alpha"]],
      ],
    );
  });

  test("ties keep sidebar order", () => {
    const sections = sectionConversations([
      conversation({ name: "#b", order: 1, unreadCount: 2 }),
      conversation({ name: "#a", order: 0, unreadCount: 2 }),
    ]);
    assert.deepEqual(
      sections[0].conversations.map((c) => c.name),
      ["#a", "#b"],
    );
  });

  test("empty sections are left out; with nothing unread the one section is called Conversations", () => {
    const sections = sectionConversations([conversation({ name: "#a", order: 0 })]);
    assert.deepEqual(
      sections.map((section) => section.title),
      ["Conversations"],
    );
    assert.deepEqual(sectionConversations([]), []);
  });

  test("orderedConversations flattens the sections for a dropdown", () => {
    assert.deepEqual(
      orderedConversations(list).map((c) => c.name),
      ["marisol", "#mutedping", "#ping", "#busy", "#some", "#quiet", "#muted", "#alpha"],
    );
  });

  test("busiestUnread picks as Vela does: unmuted, most unread, then more mentions, then sidebar order", () => {
    assert.equal(busiestUnread(list)?.name, "#busy");
    assert.equal(
      busiestUnread([
        conversation({ name: "#a", order: 0, unreadCount: 5 }),
        conversation({ name: "#b", order: 1, unreadCount: 5, mentionCount: 1 }),
        conversation({ name: "#c", order: 2, unreadCount: 5, mentionCount: 1 }),
      ])?.name,
      "#b",
    );
    assert.equal(busiestUnread([conversation({ name: "#m", order: 0, unreadCount: 9, muted: true })]), undefined);
  });

  test("summarize counts mentions everywhere and unread as Vela does", () => {
    assert.deepEqual(summarize(list), { mentions: 5, mentionConversations: 3, unreadConversations: 5 });
  });
});

test("menu bar title and tooltip", () => {
  assert.equal(menuBarTitle(undefined), undefined);
  assert.equal(menuBarTitle({ mentions: 0, mentionConversations: 0, unreadConversations: 4 }), undefined);
  assert.equal(menuBarTitle({ mentions: 3, mentionConversations: 2, unreadConversations: 4 }), "3");
  assert.equal(
    menuBarTooltip({ mentions: 1, mentionConversations: 1, unreadConversations: 1 }),
    "Vela: 1 mention · 1 unread conversation",
  );
  assert.equal(
    menuBarTooltip({ mentions: 0, mentionConversations: 0, unreadConversations: 0 }),
    "Vela: you're all caught up",
  );
});

describe("accessoriesFor", () => {
  test("a channel with unread and mentions shows both, mentions last", () => {
    assert.deepEqual(accessoriesFor(conversation({ name: "#vela", order: 0, unreadCount: 12, mentionCount: 2 })), [
      { kind: "unread", text: "12", tooltip: "12 unread messages", dimmed: false },
      { kind: "mentions", text: "@2", tooltip: "2 mentions" },
    ]);
  });

  test("a private conversation's messages are all mentions: no separate unread count", () => {
    assert.deepEqual(accessoriesFor(conversation({ name: "marisol", order: 0, unreadCount: 1, mentionCount: 1 })), [
      { kind: "mentions", text: "@1", tooltip: "1 new message" },
    ]);
  });

  test("muted and not-joined channels say so; a muted count is dimmed", () => {
    assert.deepEqual(
      accessoriesFor(conversation({ name: "#old", order: 0, unreadCount: 1, muted: true, joined: false })),
      [
        { kind: "notJoined", text: "Not joined", tooltip: "You're not in #old" },
        { kind: "muted", tooltip: "Muted" },
        { kind: "unread", text: "1", tooltip: "1 unread message", dimmed: true },
      ],
    );
  });

  test("nothing unread, nothing shown", () => {
    assert.deepEqual(accessoriesFor(conversation({ name: "#a", order: 0 })), []);
  });
});

test("keywords match the network, its parts, the bare name and the kind", () => {
  assert.deepEqual(keywordsFor(conversation({ name: "#vela", order: 0 })), [
    "vela",
    "Libera.Chat",
    "Libera",
    "Chat",
    "channel",
  ]);
  assert.deepEqual(
    keywordsFor(conversation({ name: "marisol", order: 0, networkName: "OFTC", id: `${OFTC}/marisol` })),
    ["OFTC", "private"],
  );
});

test("only joined channels and private conversations can be sent to", () => {
  assert.equal(canSend(conversation({ name: "#in", order: 0 })), true);
  assert.equal(canSend(conversation({ name: "#out", order: 0, joined: false })), false);
  assert.equal(canSend(conversation({ name: "marisol", order: 0 })), true);
});

test("descriptions for toasts, dropdowns and menus", () => {
  const vela = conversation({ name: "#vela", order: 0, unreadCount: 14 });
  assert.equal(describeConversation(vela), "#vela on Libera.Chat");
  assert.equal(dropdownTitle(vela), "#vela · Libera.Chat");
  assert.equal(menuItemSubtitle(vela), "Libera.Chat · 14");
  assert.equal(menuItemSubtitle({ ...vela, mentionCount: 2 }), "Libera.Chat · @2");
  assert.equal(describeConversation({ name: "#x", networkName: "" }), "#x");
});

test("markedRead clears one conversation's counts, or every one's", () => {
  const list = [
    conversation({ name: "#a", order: 0, unreadCount: 3, mentionCount: 1 }),
    conversation({ name: "#b", order: 1, unreadCount: 2 }),
  ];
  const one = markedRead(list, list[0].id);
  assert.deepEqual(
    one.map((c) => [c.unreadCount, c.mentionCount]),
    [
      [0, 0],
      [2, 0],
    ],
  );
  assert.deepEqual(
    markedRead(list).map((c) => c.unreadCount),
    [0, 0],
  );
  assert.equal(list[0].unreadCount, 3, "the original is untouched");
});
