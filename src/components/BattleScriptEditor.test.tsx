import { fireEvent, render, screen } from "@testing-library/react";
import { normalizeConversationConfig } from "../data/conversationConfig";
import type { ConversationConfig } from "../data/conversationConfig";
import { BattleScriptEditor } from "./BattleScriptEditor";

function buildConfig(): ConversationConfig {
  return normalizeConversationConfig({
    contact: {
      avatarUrl: "",
      initials: "N",
      name: "Nor",
      status: "online now",
      typingSpeedLevel: 4
    },
    defaultSpeakerTypingSpeedLevel: 4,
    messages: [
      { id: "viewer-1", speaker: "viewer", text: "Go!" },
      { id: "contact-1", speaker: "contact", text: "fine" }
    ],
    viewer: {
      avatarUrl: "",
      initials: "P",
      name: "Phil",
      status: "online now"
    }
  });
}

function renderEditor(onChange = vi.fn()) {
  const config = buildConfig();
  render(
    <BattleScriptEditor
      canUndo={false}
      config={config}
      onChange={onChange}
      onClose={vi.fn()}
      onStoryTitleChange={vi.fn()}
      onUndo={vi.fn()}
      requiresPassword={false}
      storyTitle="Battle"
    />
  );
  return { config, onChange };
}

describe("BattleScriptEditor", () => {
  it("shows the opponent on top and the player on the bottom with their lines", () => {
    renderEditor();

    expect(screen.getByTestId("battle-script-editor")).toBeInTheDocument();
    expect(screen.getByTestId("battle-editor-opponent-name")).toHaveValue("Phil");
    expect(screen.getByTestId("battle-editor-player-name")).toHaveValue("Nor");
    expect(screen.getByLabelText("Line 1 text")).toHaveValue("Go!");
    expect(screen.getByLabelText("Line 2 text")).toHaveValue("fine");
  });

  it("renames the opponent trainer", () => {
    const { onChange } = renderEditor();

    fireEvent.change(screen.getByTestId("battle-editor-opponent-name"), {
      target: { value: "Gary" }
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        viewer: expect.objectContaining({ name: "Gary" })
      })
    );
  });

  it("edits a dialogue line", () => {
    const { onChange } = renderEditor();

    fireEvent.change(screen.getByLabelText("Line 1 text"), {
      target: { value: "You're toast!" }
    });

    const updated = onChange.mock.calls.slice(-1)[0]?.[0] as ConversationConfig;
    expect(updated.messages[0].text).toBe("You're toast!");
  });

  it("flips a line between the opponent and player", () => {
    const { onChange } = renderEditor();

    // Line 1 starts as the opponent (viewer); switch it to the player.
    fireEvent.click(screen.getAllByRole("button", { name: "Player" })[0]);

    const updated = onChange.mock.calls.slice(-1)[0]?.[0] as ConversationConfig;
    expect(updated.messages[0].speaker).toBe("contact");
  });

  it("adds a new line", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByTestId("battle-editor-add-line"));

    const updated = onChange.mock.calls.slice(-1)[0]?.[0] as ConversationConfig;
    expect(updated.messages.length).toBe(3);
  });
});
