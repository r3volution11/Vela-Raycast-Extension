// Send Message: choose a channel you're in or a private conversation
// (mentions and unread first) and send with Vela's `send message`.

import { Form, type LaunchProps } from "@raycast/api";
import { useMemo } from "react";
import { MessageForm } from "./components/MessageForm";
import { ProblemForm } from "./components/problem";
import { useConversations } from "./hooks/useConversations";
import { notInstalledProblem, notRunningProblem } from "./lib/problems";
import { currentTarget, problemOf } from "./vela/bridge";

export default function SendMessage(props: LaunchProps<{ draftValues: Form.Values }>) {
  const target = useMemo(currentTarget, []);
  const { data, isLoading, error, revalidate } = useConversations(target);

  if (error) {
    return <ProblemForm problem={problemOf(error, target, "list")} target={target} onRetry={revalidate} />;
  }
  if (data?.status === "notRunning") {
    return <ProblemForm problem={notRunningProblem(target.name)} target={target} onRetry={revalidate} />;
  }
  if (data?.status === "notInstalled") {
    return <ProblemForm problem={notInstalledProblem(target.name)} target={target} onRetry={revalidate} />;
  }
  return (
    <MessageForm
      target={target}
      primary="send"
      conversations={data?.status === "ok" ? data.conversations : []}
      isLoading={isLoading}
      enableDrafts
      draftValues={props.draftValues}
    />
  );
}
