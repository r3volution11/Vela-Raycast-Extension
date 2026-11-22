// Unread Conversations (menu bar, off until you turn it on): your mentions
// as the menu bar's title, and the conversations with something unread in
// its menu. Raycast runs it every 5 minutes (package.json's `interval`) and
// when you open the menu. It reads Vela's counts once per run, and never
// launches Vela.

import { Icon, launchCommand, LaunchType, MenuBarExtra, open, openCommandPreferences, showHUD } from "@raycast/api";
import { useMemo } from "react";
import { conversationIcon } from "./components/conversation-ui";
import { useConversations } from "./hooks/useConversations";
import {
  isUnread,
  menuBarTitle,
  menuBarTooltip,
  menuItemSubtitle,
  sectionConversations,
  summarize,
} from "./lib/conversations";
import { notInstalledProblem, notRunningProblem, type Problem, type ProblemContext } from "./lib/problems";
import { appLink, AUTOMATION_SETTINGS_URL, openLink, VELA_WEBSITE_URL } from "./lib/target";
import { catchUpBusiest, currentTarget, markAllRead, problemOf } from "./vela/bridge";

/** How many conversations each section lists; the rest are a "more" item that opens Search Conversations. */
const SECTION_LIMIT = 12;

export default function UnreadMenuBar() {
  const target = useMemo(currentTarget, []);
  const { data, isLoading, error, revalidate } = useConversations(target);

  // After an error, show the error, not what was read before it.
  const conversations = !error && data?.status === "ok" ? data.conversations : undefined;
  const summary = conversations ? summarize(conversations) : undefined;
  const sections = conversations
    ? sectionConversations(conversations.filter(isUnread)).filter((section) => section.id !== "all")
    : [];

  let problem: Problem | undefined;
  if (error) problem = problemOf(error, target, "list");
  else if (data?.status === "notRunning") problem = notRunningProblem(target.name);
  else if (data?.status === "notInstalled") problem = notInstalledProblem(target.name);

  async function run(context: ProblemContext, action: () => Promise<string | undefined>) {
    try {
      const message = await action();
      if (message) await showHUD(message);
    } catch (failure) {
      await showHUD(problemOf(failure, target, context).title);
    }
    revalidate();
  }

  async function searchConversations() {
    try {
      await launchCommand({ name: "search-conversations", type: LaunchType.UserInitiated });
    } catch {
      await showHUD("Turn on Search Conversations in Raycast's settings");
    }
  }

  return (
    <MenuBarExtra
      icon={summary && summary.unreadConversations > 0 ? Icon.SpeechBubbleActive : Icon.SpeechBubble}
      title={menuBarTitle(summary)}
      tooltip={problem ? `${target.name}: ${problem.title}` : menuBarTooltip(summary)}
      isLoading={isLoading}
    >
      {problem && (
        <MenuBarExtra.Section>
          <MenuBarExtra.Item title={problem.title} />
          {problem.kind === "permission" && (
            <MenuBarExtra.Item title="Open Automation Settings" onAction={() => open(AUTOMATION_SETTINGS_URL)} />
          )}
          {(problem.kind === "notInstalled" || problem.kind === "outdated") && (
            <MenuBarExtra.Item title="Open Vela Website" onAction={() => open(VELA_WEBSITE_URL)} />
          )}
        </MenuBarExtra.Section>
      )}
      {!problem && conversations && sections.length === 0 && (
        <MenuBarExtra.Section>
          <MenuBarExtra.Item title="You're all caught up" />
        </MenuBarExtra.Section>
      )}
      {sections.map((section) => (
        <MenuBarExtra.Section key={section.id} title={section.title}>
          {section.conversations.slice(0, SECTION_LIMIT).map((conversation) => (
            <MenuBarExtra.Item
              key={conversation.id}
              icon={conversationIcon(conversation)}
              title={conversation.name}
              subtitle={menuItemSubtitle(conversation)}
              onAction={() => open(openLink(target, conversation.id))}
            />
          ))}
          {section.conversations.length > SECTION_LIMIT && (
            <MenuBarExtra.Item
              title={`${section.conversations.length - SECTION_LIMIT} more…`}
              onAction={searchConversations}
            />
          )}
        </MenuBarExtra.Section>
      ))}
      <MenuBarExtra.Section>
        {!problem && (
          <MenuBarExtra.Item
            title="Catch Me Up"
            icon={Icon.Stars}
            onAction={() =>
              run("catchUp", async () => ((await catchUpBusiest(target)) ? undefined : "You're all caught up"))
            }
          />
        )}
        {!problem && summary && summary.unreadConversations > 0 && (
          <MenuBarExtra.Item
            title="Mark All Read"
            icon={Icon.CheckList}
            onAction={() =>
              run("markAllRead", async () => {
                const count = await markAllRead(target);
                return count === 1 ? "Marked 1 conversation read" : `Marked ${count} conversations read`;
              })
            }
          />
        )}
        <MenuBarExtra.Item title="Search Conversations…" icon={Icon.MagnifyingGlass} onAction={searchConversations} />
        <MenuBarExtra.Item title={`Open ${target.name}`} icon={Icon.AppWindow} onAction={() => open(appLink(target))} />
      </MenuBarExtra.Section>
      <MenuBarExtra.Section>
        <MenuBarExtra.Item title="Configure Command…" icon={Icon.Gear} onAction={openCommandPreferences} />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
