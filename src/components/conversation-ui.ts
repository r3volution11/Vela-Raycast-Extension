// Conversations in Raycast's terms: icons and List.Item accessories, from
// the plain descriptions in ../lib/conversations.

import { Color, Icon, Image, List } from "@raycast/api";
import { accessoriesFor, type Conversation } from "../lib/conversations";

/** A person for a private conversation, "#" for a channel. */
export function conversationIcon(conversation: Conversation): Image.ImageLike {
  return conversation.kind === "private" ? Icon.Person : Icon.Hashtag;
}

export function conversationIconWithTooltip(conversation: Conversation): { value: Image.ImageLike; tooltip: string } {
  return {
    value: conversationIcon(conversation),
    tooltip: conversation.kind === "private" ? "Private conversation" : "Channel",
  };
}

export function listAccessories(conversation: Conversation): List.Item.Accessory[] {
  return accessoriesFor(conversation).map((accessory): List.Item.Accessory => {
    switch (accessory.kind) {
      case "mentions":
        return { tag: { value: accessory.text, color: Color.Red }, tooltip: accessory.tooltip };
      case "unread":
        return {
          text: { value: accessory.text, color: accessory.dimmed ? Color.SecondaryText : Color.PrimaryText },
          tooltip: accessory.tooltip,
        };
      case "muted":
        return {
          icon: { source: Icon.SpeakerOff, tintColor: Color.SecondaryText },
          tooltip: accessory.tooltip,
        };
      case "notJoined":
        return { text: { value: accessory.text, color: Color.SecondaryText }, tooltip: accessory.tooltip };
    }
  });
}
