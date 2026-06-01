import type { ConversationMessage } from "../data/conversation";
import { Avatar } from "./Avatar";

type MessageBubbleProps = {
  contactAvatarUrl?: string;
  contactInitials: string;
  contactName: string;
  contactStatus?: string;
  message: ConversationMessage;
};

export function MessageBubble({
  contactAvatarUrl,
  contactInitials,
  contactName,
  contactStatus,
  message
}: MessageBubbleProps) {
  const isPovMessage = message.speaker === "contact";

  return (
    <li
      className={`flex w-full items-end gap-2 ${
        isPovMessage ? "justify-end" : "justify-start"
      } animate-[bubble-in_260ms_ease-out_both]`}
    >
      {!isPovMessage ? (
        <Avatar
          avatarUrl={contactAvatarUrl}
          initials={contactInitials}
          label={`${contactName} avatar`}
          size="sm"
          status={contactStatus}
        />
      ) : null}
      <div
        className={`max-w-[78%] whitespace-pre-wrap rounded-[22px] px-4 py-2.5 text-[15px] leading-snug shadow-bubble [overflow-wrap:anywhere] ${
          isPovMessage
            ? "rounded-br-md bg-[#1769d2]/95 text-white"
            : "rounded-bl-md bg-white/70 text-slate-900 ring-1 ring-white/70 backdrop-blur-xl"
        }`}
      >
        {message.text}
      </div>
    </li>
  );
}
