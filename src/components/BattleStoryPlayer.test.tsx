import { render, screen } from "@testing-library/react";
import { normalizeConversationConfig } from "../data/conversationConfig";
import type { ConversationMessage } from "../data/conversationConfig";
import { BATTLE_SPRITE_ROWS, BattleStoryPlayer } from "./BattleStoryPlayer";

const viewerMessage: ConversationMessage = {
  id: "viewer-1",
  speaker: "viewer",
  text: "I have crossed dimensions to tell you this sentence is very very very long and still needs to wrap inside the battle textbox."
};

const contactMessage: ConversationMessage = {
  id: "contact-1",
  speaker: "contact",
  text: "I am talking from the bottom side."
};

const config = normalizeConversationConfig({
  contact: {
    avatarUrl: "",
    initials: "M",
    name: "Maya",
    status: "online now",
    typingSpeedLevel: 3
  },
  viewer: {
    avatarUrl: "",
    initials: "F",
    name: "Frank",
    status: "online now"
  },
  messages: [viewerMessage, contactMessage]
});

describe("battle sprites", () => {
  it("uses rectangular pixel grids", () => {
    for (const rows of Object.values(BATTLE_SPRITE_ROWS)) {
      const width = rows[0].length;
      expect(width).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.length).toBe(width);
      }
    }
  });
});

describe("BattleStoryPlayer", () => {
  it("renders the battlefield with both trainers and status nameplates", () => {
    render(
      <BattleStoryPlayer
        activeMessage={viewerMessage}
        config={config}
        currentDialogueText={viewerMessage.text}
        visibleMessages={[contactMessage]}
      />
    );

    expect(screen.getByTestId("battle-stage")).toBeInTheDocument();
    expect(screen.getByTestId("battle-player-sprite")).toBeInTheDocument();
    expect(screen.getByTestId("battle-opponent-sprite")).toBeInTheDocument();
    expect(screen.getByTestId("battle-player-status")).toHaveTextContent("Maya");
    expect(screen.getByTestId("battle-opponent-status")).toHaveTextContent(
      "Frank"
    );
    expect(screen.getByTestId("battle-player-status")).toHaveTextContent(
      "♥ ♥ ♥ ♥ ♥"
    );
    expect(screen.getByTestId("battle-opponent-status")).toHaveTextContent(
      "♥ ♥ ♥ ♥ ♥"
    );
  });

  it("keeps the dialogue boxes a fixed size and highlights the active speaker", () => {
    render(
      <BattleStoryPlayer
        activeMessage={viewerMessage}
        config={config}
        currentDialogueText={viewerMessage.text}
        visibleMessages={[contactMessage]}
      />
    );

    const topPanel = screen.getByTestId("battle-top-dialogue");
    const bottomPanel = screen.getByTestId("battle-bottom-dialogue");

    // Static box: it must NOT grow to fit its content.
    expect(topPanel).not.toHaveClass("w-fit");
    expect(topPanel).not.toHaveClass("min-w-36");
    expect(topPanel).toHaveClass("overflow-hidden");
    expect(bottomPanel).toHaveClass("overflow-hidden");

    // Active speaker (the viewer) is highlighted; the other is dimmed.
    expect(topPanel).toHaveAttribute("data-active", "true");
    expect(bottomPanel).toHaveAttribute("data-active", "false");
    expect(bottomPanel).toHaveClass("opacity-60");

    expect(screen.getByTestId("battle-top-dialogue-speaker")).toHaveTextContent(
      "Frank"
    );
    expect(screen.getByTestId("battle-top-dialogue-text")).toHaveTextContent(
      viewerMessage.text
    );
    expect(screen.getByTestId("battle-top-dialogue-text")).toHaveClass(
      "[overflow-wrap:anywhere]"
    );
    expect(
      screen.getByTestId("battle-bottom-dialogue-speaker")
    ).toHaveTextContent("Maya");
    expect(screen.getByTestId("battle-bottom-dialogue-text")).toHaveTextContent(
      contactMessage.text
    );
  });

  it("moves the active highlight to the POV speaker when they talk", () => {
    render(
      <BattleStoryPlayer
        activeMessage={contactMessage}
        config={config}
        currentDialogueText={contactMessage.text}
        visibleMessages={[viewerMessage]}
      />
    );

    expect(screen.getByTestId("battle-top-dialogue")).toHaveAttribute(
      "data-active",
      "false"
    );
    expect(screen.getByTestId("battle-bottom-dialogue")).toHaveAttribute(
      "data-active",
      "true"
    );
    expect(screen.getByTestId("battle-top-dialogue-text")).toHaveTextContent(
      viewerMessage.text
    );
    expect(screen.getByTestId("battle-bottom-dialogue-text")).toHaveTextContent(
      contactMessage.text
    );
  });
});
