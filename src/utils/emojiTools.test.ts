import {
  getEmojiAutocomplete,
  insertTextAtSelection,
  searchEmojiEntries
} from "./emojiTools";

describe("emoji tools", () => {
  it("finds emoji by discord-style shortcode and keywords", () => {
    const matches = searchEmojiEntries("roll");

    expect(matches[0]).toMatchObject({
      emoji: "🙄",
      shortcode: "roll_eyes"
    });
  });

  it("detects colon autocomplete at the cursor", () => {
    const autocomplete = getEmojiAutocomplete("ok :roll", "ok :roll".length);

    expect(autocomplete).toMatchObject({
      query: "roll",
      tokenEnd: 8,
      tokenStart: 3
    });
    expect(autocomplete?.matches[0].emoji).toBe("🙄");
  });

  it("inserts emoji at the selected text range", () => {
    expect(insertTextAtSelection("ok :roll", "🙄", 3, 8)).toEqual({
      nextCursor: 5,
      text: "ok 🙄"
    });
  });
});
