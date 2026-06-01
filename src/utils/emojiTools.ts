export type EmojiEntry = {
  emoji: string;
  keywords: string[];
  label: string;
  shortcode: string;
};

export type EmojiAutocomplete = {
  matches: EmojiEntry[];
  query: string;
  tokenEnd: number;
  tokenStart: number;
};

export const EMOJI_ENTRIES: EmojiEntry[] = [
  {
    emoji: "🙄",
    keywords: ["roll", "eyes", "eyeroll", "annoyed"],
    label: "rolling eyes",
    shortcode: "roll_eyes"
  },
  {
    emoji: "😂",
    keywords: ["joy", "laugh", "lol", "cry"],
    label: "face with tears of joy",
    shortcode: "joy"
  },
  {
    emoji: "😭",
    keywords: ["sob", "cry", "tears"],
    label: "loudly crying",
    shortcode: "sob"
  },
  {
    emoji: "💀",
    keywords: ["dead", "skull", "dying"],
    label: "skull",
    shortcode: "skull"
  },
  {
    emoji: "❤️",
    keywords: ["heart", "love"],
    label: "red heart",
    shortcode: "heart"
  },
  {
    emoji: "🔥",
    keywords: ["fire", "hot"],
    label: "fire",
    shortcode: "fire"
  },
  {
    emoji: "✨",
    keywords: ["sparkles", "magic", "shine"],
    label: "sparkles",
    shortcode: "sparkles"
  },
  {
    emoji: "👀",
    keywords: ["eyes", "look", "watch"],
    label: "eyes",
    shortcode: "eyes"
  },
  {
    emoji: "😈",
    keywords: ["devil", "evil", "smirk"],
    label: "smiling devil",
    shortcode: "smiling_imp"
  },
  {
    emoji: "🤔",
    keywords: ["thinking", "think", "hmm"],
    label: "thinking",
    shortcode: "thinking"
  },
  {
    emoji: "🫠",
    keywords: ["melt", "melting", "awkward"],
    label: "melting face",
    shortcode: "melting_face"
  },
  {
    emoji: "🥲",
    keywords: ["smile", "tear", "pain"],
    label: "smiling with tear",
    shortcode: "smiling_tear"
  }
];

export function searchEmojiEntries(query: string, limit = 8): EmojiEntry[] {
  const normalizedQuery = query.trim().toLowerCase().replace(/^:/, "");

  if (!normalizedQuery) {
    return EMOJI_ENTRIES.slice(0, limit);
  }

  return EMOJI_ENTRIES.filter((entry) => {
    const searchable = [entry.shortcode, entry.label, ...entry.keywords];

    return searchable.some((value) =>
      value.toLowerCase().includes(normalizedQuery)
    );
  }).slice(0, limit);
}

export function getEmojiAutocomplete(
  text: string,
  cursorPosition: number
): EmojiAutocomplete | null {
  const prefix = text.slice(0, cursorPosition);
  const match = /(^|\s):([a-z0-9_+-]{2,})$/i.exec(prefix);

  if (!match?.[2]) {
    return null;
  }

  const query = match[2];
  const tokenStart = cursorPosition - query.length - 1;
  const matches = searchEmojiEntries(query, 5);

  if (matches.length === 0) {
    return null;
  }

  return {
    matches,
    query,
    tokenEnd: cursorPosition,
    tokenStart
  };
}

export function insertTextAtSelection(
  text: string,
  insertedText: string,
  selectionStart: number,
  selectionEnd: number
) {
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const nextText = `${text.slice(0, start)}${insertedText}${text.slice(end)}`;

  return {
    nextCursor: start + insertedText.length,
    text: nextText
  };
}
