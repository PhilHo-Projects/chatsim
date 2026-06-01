import { useEffect, useRef } from "react";
import type { ConversationMessage } from "../data/conversation";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

type MessageListProps = {
  contactAvatarUrl?: string;
  contactInitials: string;
  contactName: string;
  contactStatus?: string;
  isContactTyping: boolean;
  messages: ConversationMessage[];
};

export function MessageList({
  contactAvatarUrl,
  contactInitials,
  contactName,
  contactStatus,
  isContactTyping,
  messages
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollArea = scrollRef.current;

    if (!scrollArea) {
      return;
    }

    if (typeof scrollArea.scrollTo === "function") {
      scrollArea.scrollTo({
        top: scrollArea.scrollHeight,
        behavior: "smooth"
      });
      return;
    }

    scrollArea.scrollTop = scrollArea.scrollHeight;
  }, [isContactTyping, messages.length]);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto bg-white/30 px-4 py-5 backdrop-blur-2xl"
      data-testid="message-list"
    >
      <ol className="flex min-h-full flex-col justify-end gap-3">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            contactAvatarUrl={contactAvatarUrl}
            contactInitials={contactInitials}
            contactName={contactName}
            contactStatus={contactStatus}
            message={message}
          />
        ))}
        {isContactTyping ? (
          <li className="animate-[bubble-in_260ms_ease-out_both]">
            <TypingIndicator
              contactAvatarUrl={contactAvatarUrl}
              contactInitials={contactInitials}
              contactName={contactName}
              contactStatus={contactStatus}
            />
          </li>
        ) : null}
      </ol>
    </div>
  );
}
