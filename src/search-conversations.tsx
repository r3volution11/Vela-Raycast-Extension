// Search Conversations: every channel and private conversation in Vela,
// mentions first, then unread, then the rest in sidebar order.

import { List, showToast, Toast } from "@raycast/api";
import { useMemo, type ReactNode } from "react";
import { ConversationActions } from "./components/ConversationActions";
import { conversationIconWithTooltip, listAccessories } from "./components/conversation-ui";
import { ProblemEmptyView, showProblemToast } from "./components/problem";
import { useConversations } from "./hooks/useConversations";
import { keywordsFor, markedRead, sectionConversations, type Conversation } from "./lib/conversations";
import { notInstalledProblem, notRunningProblem } from "./lib/problems";
import { currentTarget, markAllRead, markRead, problemOf, type ConversationsResult } from "./vela/bridge";

/** Marks one conversation (or all of them) read in what's shown, while Vela does it. */
function markLocally(id?: string) {
  return (current: ConversationsResult | undefined): ConversationsResult =>
    current?.status === "ok"
      ? { ...current, conversations: markedRead(current.conversations, id) }
      : (current ?? { status: "ok", conversations: [] });
}

export default function SearchConversations() {
  const target = useMemo(currentTarget, []);
  const { data, isLoading, error, revalidate, mutate } = useConversations(target);

  const conversations = data?.status === "ok" ? data.conversations : undefined;
  const sections = useMemo(() => (conversations ? sectionConversations(conversations) : []), [conversations]);

  async function onMarkRead(conversation: Conversation) {
    try {
      await mutate(markRead(target, conversation.id), { optimisticUpdate: markLocally(conversation.id) });
      await showToast({ style: Toast.Style.Success, title: `Marked ${conversation.name} read` });
    } catch (failure) {
      await showProblemToast(problemOf(failure, target, "markRead"), target);
    }
  }

  async function onMarkAllRead() {
    try {
      const marked = markAllRead(target);
      await mutate(marked, { optimisticUpdate: markLocally() });
      const count = await marked;
      await showToast({
        style: Toast.Style.Success,
        title: count === 1 ? "Marked 1 conversation read" : `Marked ${count} conversations read`,
      });
    } catch (failure) {
      await showProblemToast(problemOf(failure, target, "markAllRead"), target);
    }
  }

  let content: ReactNode = null;
  if (error) {
    content = <ProblemEmptyView problem={problemOf(error, target, "list")} target={target} onRetry={revalidate} />;
  } else if (data?.status === "notRunning") {
    content = <ProblemEmptyView problem={notRunningProblem(target.name)} target={target} onRetry={revalidate} />;
  } else if (data?.status === "notInstalled") {
    content = <ProblemEmptyView problem={notInstalledProblem(target.name)} target={target} onRetry={revalidate} />;
  } else if (conversations?.length === 0) {
    content = (
      <List.EmptyView
        title="No conversations yet"
        description={`Join a channel in ${target.name} and it shows up here.`}
      />
    );
  } else {
    content = sections.map((section) => (
      <List.Section key={section.id} title={section.title} subtitle={String(section.conversations.length)}>
        {section.conversations.map((conversation) => (
          <List.Item
            key={conversation.id}
            id={conversation.id}
            icon={conversationIconWithTooltip(conversation)}
            title={conversation.name}
            subtitle={conversation.networkName}
            keywords={keywordsFor(conversation)}
            accessories={listAccessories(conversation)}
            actions={
              <ConversationActions
                target={target}
                conversation={conversation}
                onMarkRead={onMarkRead}
                onMarkAllRead={onMarkAllRead}
                onReload={revalidate}
              />
            }
          />
        ))}
      </List.Section>
    ));
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search channels, people and networks">
      {content}
    </List>
  );
}
