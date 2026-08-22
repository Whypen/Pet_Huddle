/**
 * ChatsTwoPane — WhatsApp Web layout for `/chats` and `/chat-dialogue` at `lg`+.
 *
 * WHY THIS SHAPE (and why `Chats.tsx` is untouched)
 * ------------------------------------------------
 * `ChatDialogue` already reads its room from the URL (`useSearchParams`,
 * `ChatDialogue.tsx:117,697`), and `Chats.tsx` already navigates to
 * `/chat-dialogue?room=…` from six places.
 *
 * So instead of intercepting those six navigations, BOTH routes render this
 * shell at `lg`+. Selecting a conversation still navigates exactly as it does
 * today — but the list is part of the shell, so it stays on screen and the right
 * pane swaps. The URL remains the single source of truth, which means a refresh
 * or a shared link lands in the same place at either breakpoint.
 *
 * That is the whole reason no line of `Chats.tsx`'s selection logic changes.
 *
 * BELOW `lg`: nothing changes. `/chats` renders the list alone and
 * `/chat-dialogue` renders the conversation alone, exactly as before — this
 * component renders one child or the other, never both.
 *
 * THE WIDTH EXCEPTION: two panes need ~1,000px, so chats is the one surface that
 * opts out of `--app-max-width` at `lg`+. It is the documented exception.
 */

import { Suspense, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { HuddleWordmark } from "@/components/brand/HuddleWordmark";

/**
 * Right pane with nothing selected. WhatsApp treats this as a real screen and so
 * does this — a calm centred mark and one line, never a blank div or a spinner.
 */
const NoConversation = () => (
  <div className="flex h-full flex-col items-center justify-center px-8 text-center">
    <HuddleWordmark size={34} className="opacity-25" />
    <p className="mt-5 text-sm font-medium text-muted-foreground">Choose a conversation to start reading.</p>
  </div>
);

export interface ChatsTwoPaneProps {
  /** The conversation list — `Chats`, unmodified. */
  list: ReactNode;
  /** The conversation view — `ChatDialogue`, unmodified. */
  conversation: ReactNode;
}

export const ChatsTwoPane = ({ list, conversation }: ChatsTwoPaneProps) => {
  const isDesktop = useIsDesktop();
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const hasRoom = Boolean(searchParams.get("room"));
  const isGroupsExplore = pathname.startsWith("/groups");

  // Derived from the path rather than passed in, so ONE mounted instance serves
  // both routes. Passing it as a prop forced a route element per path, and
  // navigating between them remounted the list — losing scroll and search on
  // every selection. See chatsTwoPane.test.tsx.
  const mobilePane = pathname.startsWith("/chat-dialogue") ? "conversation" : "list";

  // Below lg: exactly one pane, exactly as today. Rendering both and hiding one
  // with CSS would mount two conversation views on a phone.
  if (!isDesktop) {
    return <>{mobilePane === "list" ? list : conversation}</>;
  }

  // Groups is a discovery destination, not a conversation inbox. It keeps the
  // app's Explore card stream and must not inherit Chats' empty right pane.
  if (isGroupsExplore) {
    return <div className="h-[100svh] w-full overflow-y-auto">{list}</div>;
  }

  return (
    <div className="flex h-[100svh] w-full overflow-hidden">
      {/* One surface divided by a single hairline — no card, no gap, no shadow. */}
      <aside className="h-full w-[360px] shrink-0 overflow-y-auto border-r border-border">
        {list}
      </aside>

      <section className="h-full min-w-0 flex-1 overflow-y-auto">
        {hasRoom ? <Suspense fallback={null}>{conversation}</Suspense> : <NoConversation />}
      </section>
    </div>
  );
};

export default ChatsTwoPane;
