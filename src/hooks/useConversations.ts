import { useCachedPromise } from "@raycast/utils";
import { targetFor, type AppChoice, type VelaTarget } from "../lib/target";
import { fetchConversations, type ConversationsResult } from "../vela/bridge";

async function load(choice: AppChoice): Promise<ConversationsResult> {
  return fetchConversations(targetFor(choice));
}

/**
 * Every conversation, read once per view: shown at once from Raycast's
 * cache (kept per app, so Vela and Vela Dev don't mix), then refreshed.
 * Nothing polls; Reload (⌘R) and the actions that change counts refresh it.
 * Views show errors themselves, so there's no automatic failure toast.
 */
export function useConversations(target: VelaTarget) {
  return useCachedPromise(load, [target.choice], {
    keepPreviousData: true,
    onError: () => undefined,
  });
}
