import {
  SCENE_MESSAGE_MAX_COUNT,
  type ConversationMessage,
  type SpeakerId
} from "../data/conversationConfig";

type ParseOptions = {
  contactName: string;
  viewerName: string;
};

const LABELLED_LINE = /^([^:]{1,40}):\s?(.*)$/;

/**
 * Turn a pasted back-and-forth script into conversation messages.
 *
 * Deterministic v1 rules (an LLM can replace this behind the same signature later):
 * - `Label: text` sets the speaker from the label.
 *   `me` / the POV name -> contact, `you` / the speaker name -> viewer.
 *   Any other first-seen label binds to contact, the next distinct label to viewer.
 * - A line with no label is appended to the previous message (newline-joined).
 * - A blank line is a separator: it ends the current message.
 * - Output is capped at SCENE_MESSAGE_MAX_COUNT lines.
 */
export function parseScriptText(
  text: string,
  { contactName, viewerName }: ParseOptions
): ConversationMessage[] {
  const contactKey = contactName.trim().toLowerCase();
  const viewerKey = viewerName.trim().toLowerCase();
  const unknownLabels: string[] = [];

  const resolveSpeaker = (rawLabel: string): SpeakerId => {
    const label = rawLabel.trim().toLowerCase();

    if (label === "me" || (contactKey && label === contactKey)) {
      return "contact";
    }
    if (label === "you" || (viewerKey && label === viewerKey)) {
      return "viewer";
    }

    let index = unknownLabels.indexOf(label);
    if (index === -1) {
      unknownLabels.push(label);
      index = unknownLabels.length - 1;
    }

    return index % 2 === 0 ? "contact" : "viewer";
  };

  const messages: ConversationMessage[] = [];
  let current: ConversationMessage | null = null;

  const pushMessage = (speaker: SpeakerId, body: string) => {
    const message: ConversationMessage = {
      id: `imported-${messages.length + 1}`,
      speaker,
      text: body,
      useDefaultTypingMs: true,
      useDefaultPauseAfterMs: true
    };
    messages.push(message);
    return message;
  };

  for (const rawLine of text.split("\n")) {
    if (messages.length >= SCENE_MESSAGE_MAX_COUNT) {
      break;
    }

    const line = rawLine.trim();

    if (line.length === 0) {
      current = null;
      continue;
    }

    const match = line.match(LABELLED_LINE);

    if (match) {
      current = pushMessage(resolveSpeaker(match[1]), match[2].trim());
      continue;
    }

    if (current) {
      current.text = current.text.length > 0 ? `${current.text}\n${line}` : line;
    } else {
      current = pushMessage("contact", line);
    }
  }

  return messages;
}
