// Catch Me Up: Vela's `catch up` without a conversation, so Vela opens
// Catch me up for the unmuted conversation with the most unread messages.
// Never launches Vela.

import { closeMainWindow, showHUD } from "@raycast/api";
import { showProblemToast } from "./components/problem";
import { catchUpBusiest, currentTarget, problemOf } from "./vela/bridge";

export default async function CatchMeUp() {
  const target = currentTarget();
  try {
    if (await catchUpBusiest(target)) {
      // Vela is in front with the card.
      await closeMainWindow();
    } else {
      await showHUD("You're all caught up");
    }
  } catch (error) {
    await showProblemToast(problemOf(error, target, "catchUp"), target);
  }
}
