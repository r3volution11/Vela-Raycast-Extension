// Showing a problem: as a toast (with the one action that fixes it), an
// empty view, or a form's description.

import { Action, ActionPanel, Form, Icon, Image, Keyboard, List, open, showToast, Toast } from "@raycast/api";
import type { Problem } from "../lib/problems";
import { appLink, AUTOMATION_SETTINGS_URL, VELA_WEBSITE_URL, type VelaTarget } from "../lib/target";

export function problemIcon(problem: Problem): Image.ImageLike {
  switch (problem.kind) {
    case "permission":
      return Icon.Lock;
    case "notRunning":
      return Icon.Power;
    case "notInstalled":
    case "outdated":
      return Icon.Download;
    case "timeout":
    case "notReady":
      return Icon.Clock;
    default:
      return Icon.Warning;
  }
}

/** The action that fixes a problem, if there is one: as a toast's primary action. */
function fix(problem: Problem, target: VelaTarget): Toast.ActionOptions | undefined {
  switch (problem.kind) {
    case "permission":
      return { title: "Open Automation Settings", onAction: () => open(AUTOMATION_SETTINGS_URL) };
    case "notRunning":
      return { title: `Open ${target.name}`, onAction: () => open(appLink(target)) };
    case "notInstalled":
    case "outdated":
      return { title: "Open Vela Website", onAction: () => open(VELA_WEBSITE_URL) };
    default:
      return undefined;
  }
}

/** Shows `problem` as a failure toast, or turns an existing (in-progress) toast into one. */
export async function showProblemToast(problem: Problem, target: VelaTarget, toast?: Toast): Promise<Toast> {
  const primaryAction = fix(problem, target);
  if (toast) {
    toast.style = Toast.Style.Failure;
    toast.title = problem.title;
    toast.message = problem.message;
    toast.primaryAction = primaryAction;
    return toast;
  }
  return showToast({ style: Toast.Style.Failure, title: problem.title, message: problem.message, primaryAction });
}

/** The actions that fix a problem, then Try Again (⌘R). */
export function ProblemActions(props: { problem: Problem; target: VelaTarget; onRetry: () => void }) {
  const { problem, target, onRetry } = props;
  return (
    <ActionPanel>
      {problem.kind === "permission" && (
        <Action.Open title="Open Automation Settings" icon={Icon.Lock} target={AUTOMATION_SETTINGS_URL} />
      )}
      {problem.kind === "notRunning" && (
        <Action.Open title={`Open ${target.name}`} icon={Icon.AppWindow} target={appLink(target)} />
      )}
      {(problem.kind === "notInstalled" || problem.kind === "outdated") && (
        <Action.OpenInBrowser title="Open Vela Website" icon={Icon.Download} url={VELA_WEBSITE_URL} />
      )}
      <Action
        title="Try Again"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={onRetry}
      />
    </ActionPanel>
  );
}

export function ProblemEmptyView(props: { problem: Problem; target: VelaTarget; onRetry: () => void }) {
  return (
    <List.EmptyView
      icon={problemIcon(props.problem)}
      title={props.problem.title}
      description={props.problem.message}
      actions={<ProblemActions {...props} />}
    />
  );
}

/** A form that only says what's wrong, for commands whose view is a form. */
export function ProblemForm(props: { problem: Problem; target: VelaTarget; onRetry: () => void }) {
  return (
    <Form actions={<ProblemActions {...props} />}>
      <Form.Description title={props.problem.title} text={props.problem.message} />
    </Form>
  );
}
