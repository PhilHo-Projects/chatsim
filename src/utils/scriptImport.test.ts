import { parseScriptText } from "./scriptImport";

const cast = { contactName: "Maya", viewerName: "Frank" };

describe("parseScriptText", () => {
  it("maps me: to the POV (contact) and you: to the speaker (viewer)", () => {
    const messages = parseScriptText("me: yo waddup\nyou: nm let's eat", cast);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ speaker: "contact", text: "yo waddup" });
    expect(messages[1]).toMatchObject({ speaker: "viewer", text: "nm let's eat" });
  });

  it("matches labels against the configured cast names (case-insensitive)", () => {
    const messages = parseScriptText("Frank: hey\nmaya: hi", cast);

    expect(messages[0]).toMatchObject({ speaker: "viewer", text: "hey" });
    expect(messages[1]).toMatchObject({ speaker: "contact", text: "hi" });
  });

  it("keeps text after the first colon intact", () => {
    const messages = parseScriptText("you: meet me at 5:30", cast);

    expect(messages[0]).toMatchObject({ speaker: "viewer", text: "meet me at 5:30" });
  });

  it("binds unknown labels: first seen to contact, next to viewer", () => {
    const messages = parseScriptText("Alex: hey\nSam: yo\nAlex: ok", cast);

    expect(messages.map((m) => m.speaker)).toEqual(["contact", "viewer", "contact"]);
  });

  it("appends a line with no label to the previous message", () => {
    const messages = parseScriptText("me: line one\nstill me", cast);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ speaker: "contact", text: "line one\nstill me" });
  });

  it("treats a blank line as a separator that ends the current message", () => {
    const messages = parseScriptText("me: first\n\norphan line", cast);

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ speaker: "contact", text: "orphan line" });
  });

  it("gives every message a stable unique id and default timing flags", () => {
    const messages = parseScriptText("me: a\nyou: b", cast);

    const ids = messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(messages[0].useDefaultTypingMs).toBe(true);
    expect(messages[0].useDefaultPauseAfterMs).toBe(true);
  });

  it("returns an empty array for blank input", () => {
    expect(parseScriptText("   \n  \n", cast)).toEqual([]);
  });

  it("caps the number of imported lines at 100", () => {
    const text = Array.from({ length: 130 }, (_, i) => `me: line ${i}`).join("\n");

    expect(parseScriptText(text, cast)).toHaveLength(100);
  });
});
