// What you can do with a conversation in Search Conversations.
//
//   Open in Vela      ↩      vela://open?id=… (a link: no permission needed)
//   Write Message     ⌘↩     pushes the form; sends with `send message`
//   Catch Me Up       ⌘U     `catch up conversation id …`
//   Open Recap        ⌘⇧R    `open recap conversation id …`
//   Draft in Vela     ⌘⇧D    pushes the form; `draft message … to …`
//   Mark Read         ⌘⇧U    `mark read conversation id …`
//   Mark All Read     ⌥⇧⌘U   `mark all read`
//   Copy Link         ⌘⇧C    copies vela://open?id=…
//   Reload            ⌘R     reads the conversations again

import { Action, ActionPanel, closeMainWindow, Icon, Keyboard, showToast, Toast, useNavigation } from "@raycast/api";
import { canSend, describeConversation, type Conversation } from "../lib/conversations";
import type { ProblemContext } from "../lib/problems";
import { openLink, type VelaTarget } from "../lib/target";
import { catchUp, openRecap, problemOf } from "../vela/bridge";
import { MessageForm } from "./MessageForm";
import { showProblemToast } from "./problem";

export interface ConversationActionsProps {
  target: VelaTarget;
  conversation: Conversation;
  onMarkRead: (conversation: Conversation) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onReload: () => void;
}

/** Runs a command that brings Vela to the front: says it's working, then closes Raycast, or shows why not. */
async function inVela(
  target: VelaTarget,
  title: string,
  context: ProblemContext,
  command: () => Promise<void>,
): Promise<void> {
  const toast = await showToast({ style: Toast.Style.Animated, title });
  try {
    await command();
    await toast.hide();
    await closeMainWindow();
  } catch (error) {
    await showProblemToast(problemOf(error, target, context), target, toast);
  }
}

export function ConversationActions(props: ConversationActionsProps) {
  const { target, conversation, onMarkRead, onMarkAllRead, onReload } = props;
  const { pop } = useNavigation();
  const link = openLink(target, conversation.id);
  const hasUnread = conversation.unreadCount > 0 || conversation.mentionCount > 0;

  return (
    <ActionPanel title={describeConversation(conversation)}>
      <ActionPanel.Section>
        <Action.Open title={`Open in ${target.name}`} icon={Icon.AppWindow} target={link} />
        {canSend(conversation) && (
          <Action.Push
            title="Write Message"
            icon={Icon.Envelope}
            target={
              <MessageForm
                target={target}
                primary="send"
                conversation={conversation}
                onSent={() => {
                  pop();
                  onReload();
                }}
              />
            }
          />
        )}
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action
          title="Catch Me Up"
          icon={Icon.Stars}
          shortcut={{ modifiers: ["cmd"], key: "u" }}
          onAction={() => inVela(target, "Opening Catch me up…", "catchUp", () => catchUp(target, conversation.id))}
        />
        <Action
          title="Open Recap"
          icon={Icon.BulletPoints}
          shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
          onAction={() => inVela(target, "Opening Recap…", "recap", () => openRecap(target, conversation.id))}
        />
        <Action.Push
          title={`Draft in ${target.name}`}
          icon={Icon.Pencil}
          shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
          target={<MessageForm target={target} primary="draft" conversation={conversation} onSent={pop} />}
        />
      </ActionPanel.Section>
      <ActionPanel.Section>
        {hasUnread && (
          <Action
            title="Mark Read"
            icon={Icon.Checkmark}
            shortcut={{ modifiers: ["cmd", "shift"], key: "u" }}
            onAction={() => onMarkRead(conversation)}
          />
        )}
        <Action
          title="Mark All Read"
          icon={Icon.CheckList}
          shortcut={{ modifiers: ["opt", "shift", "cmd"], key: "u" }}
          onAction={onMarkAllRead}
        />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action.CopyToClipboard title="Copy Link" content={link} shortcut={Keyboard.Shortcut.Common.CopyDeeplink} />
        <Action
          title="Reload"
          icon={Icon.ArrowClockwise}
          shortcut={Keyboard.Shortcut.Common.Refresh}
          onAction={onReload}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}
