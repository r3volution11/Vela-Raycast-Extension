// Writing a message: Send Message (Vela's `send message`) or Draft in Vela
// (`draft message`: the text goes in Vela's message box, and you press
// Return there). Send Message picks the conversation from a dropdown; the
// list's Write Message and Draft in Vela actions push it for one conversation.

import { Action, ActionPanel, closeMainWindow, Form, Icon, PopToRootType, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import {
  canSend,
  describeConversation,
  dropdownTitle,
  keywordsFor,
  sectionConversations,
  type Conversation,
} from "../lib/conversations";
import { countLines, draftProblem, LINE_CONFIRMATION_THRESHOLD, multipleLinesLabel, sendProblem } from "../lib/message";
import type { VelaTarget } from "../lib/target";
import { draftMessage, problemOf, sendMessage } from "../vela/bridge";
import { conversationIcon } from "./conversation-ui";
import { showProblemToast } from "./problem";

export interface MessageFormProps {
  target: VelaTarget;
  /** Send or draft: which one ⌘↩ does. The other is ⌘⇧↩. */
  primary: "send" | "draft";
  /** One conversation to write to (the list's actions)… */
  conversation?: Conversation;
  /** …or the conversations to choose from (Send Message). */
  conversations?: Conversation[];
  isLoading?: boolean;
  /** Send Message keeps unsent text if you close Raycast (Raycast's drafts). */
  enableDrafts?: boolean;
  draftValues?: Form.Values;
  /** After sending: the pushed form goes back to the list. Without it, the form clears for the next message. */
  onSent?: () => void;
}

export function MessageForm(props: MessageFormProps) {
  const { target, primary, conversation: fixed, conversations = [], isLoading, enableDrafts, draftValues } = props;
  const sendable = conversations.filter(canSend);
  const sections = sectionConversations(sendable);
  const first = sections[0]?.conversations[0];

  const [conversationId, setConversationId] = useState<string | undefined>(
    fixed?.id ?? (typeof draftValues?.conversation === "string" ? draftValues.conversation : undefined),
  );
  const [text, setText] = useState<string>(typeof draftValues?.text === "string" ? draftValues.text : "");
  const [allowMultipleLines, setAllowMultipleLines] = useState(draftValues?.allowMultipleLines === true);
  const [textError, setTextError] = useState<string | undefined>();
  const [isWorking, setIsWorking] = useState(false);

  // Send Message: start on the first conversation (mentions first) once they've loaded,
  // and move off one that's gone.
  useEffect(() => {
    if (fixed) return;
    if (!sendable.some((conversation) => conversation.id === conversationId) && first) {
      setConversationId(first.id);
    }
  }, [fixed, first?.id, sendable.length]);

  const selected = fixed ?? sendable.find((conversation) => conversation.id === conversationId);
  const lines = countLines(text);
  const canSendHere = selected ? canSend(selected) : false;
  const showsLinesBox = canSendHere && lines > LINE_CONFIRMATION_THRESHOLD;

  async function send() {
    if (!selected || isWorking) return;
    const problem = sendProblem(text, allowMultipleLines);
    if (problem) {
      setTextError(problem);
      return;
    }
    setIsWorking(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: `Sending to ${selected.name}…` });
    try {
      await sendMessage(target, selected.id, text, allowMultipleLines && lines > LINE_CONFIRMATION_THRESHOLD);
      toast.style = Toast.Style.Success;
      toast.title = `Sent to ${selected.name}`;
      toast.message = selected.networkName;
      setText("");
      setAllowMultipleLines(false);
      props.onSent?.();
    } catch (error) {
      await showProblemToast(problemOf(error, target, "send"), target, toast);
    } finally {
      setIsWorking(false);
    }
  }

  async function draft() {
    if (!selected || isWorking) return;
    const problem = draftProblem(text);
    if (problem) {
      setTextError(problem);
      return;
    }
    setIsWorking(true);
    try {
      await draftMessage(target, selected.id, text);
      setText("");
      // Vela is in front with the text in its message box; start fresh next time.
      await closeMainWindow({ popToRootType: PopToRootType.Immediate });
    } catch (error) {
      await showProblemToast(problemOf(error, target, "draft"), target);
    } finally {
      setIsWorking(false);
    }
  }

  const sendAction = canSendHere ? (
    <Action.SubmitForm title="Send Message" icon={Icon.Envelope} onSubmit={send} />
  ) : null;
  const draftAction = selected ? (
    <Action.SubmitForm title={`Draft in ${target.name}`} icon={Icon.Pencil} onSubmit={draft} />
  ) : null;

  return (
    <Form
      isLoading={isLoading || isWorking}
      enableDrafts={enableDrafts}
      navigationTitle={fixed ? (primary === "send" ? "Write Message" : `Draft in ${target.name}`) : undefined}
      actions={
        <ActionPanel>
          {primary === "send" ? sendAction : draftAction}
          {primary === "send" ? draftAction : sendAction}
        </ActionPanel>
      }
    >
      {fixed ? (
        <Form.Description title="To" text={describeConversation(fixed)} />
      ) : (
        <Form.Dropdown
          id="conversation"
          title="To"
          placeholder="Choose a channel or conversation"
          value={conversationId ?? ""}
          onChange={setConversationId}
          info="Channels you're in and your private conversations, mentions and unread first."
        >
          {sections.map((section) => (
            <Form.Dropdown.Section key={section.id} title={section.title}>
              {section.conversations.map((conversation) => (
                <Form.Dropdown.Item
                  key={conversation.id}
                  value={conversation.id}
                  title={dropdownTitle(conversation)}
                  icon={conversationIcon(conversation)}
                  keywords={keywordsFor(conversation)}
                />
              ))}
            </Form.Dropdown.Section>
          ))}
        </Form.Dropdown>
      )}
      <Form.TextArea
        id="text"
        title="Message"
        placeholder={selected ? `Message ${selected.name}` : "Message"}
        value={text}
        error={textError}
        info="Sent as plain text: a message starting with “/” is sent as it is, never run as a command."
        onChange={(value) => {
          setText(value);
          if (textError) setTextError(undefined);
        }}
      />
      {showsLinesBox && (
        <Form.Checkbox
          id="allowMultipleLines"
          label={multipleLinesLabel(lines)}
          value={allowMultipleLines}
          info={`Vela's message box asks before sending more than ${LINE_CONFIRMATION_THRESHOLD} lines. Each line goes out as its own message.`}
          onChange={(value) => {
            setAllowMultipleLines(value);
            if (textError) setTextError(undefined);
          }}
        />
      )}
    </Form>
  );
}
