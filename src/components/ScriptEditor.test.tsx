import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { ScriptEditor } from "./ScriptEditor";
import {
  normalizeConversationConfig,
  type ConversationConfig,
  type StoryScene
} from "../data/conversationConfig";

const baseConfig = normalizeConversationConfig({
  sceneTitle: "Scene 1",
  contact: {
    name: "Maya",
    initials: "M",
    status: "online now",
    avatarUrl: "",
    typingSpeedLevel: 3
  },
  viewer: { name: "Frank", initials: "F", status: "online now", avatarUrl: "" },
  messages: [
    { id: "m1", speaker: "contact", text: "hello world" },
    { id: "m2", speaker: "viewer", text: "hi back" }
  ]
});

function Harness({ initial }: { initial: ConversationConfig }) {
  const [config, setConfig] = useState(initial);
  const scene = { id: "scene-1", ...config } as StoryScene;

  return (
    <ScriptEditor
      activeSceneId="scene-1"
      canUndo={false}
      config={config}
      onChange={setConfig}
      onClose={() => {}}
      onSceneAdd={() => {}}
      onSceneSelect={() => {}}
      onStoryTitleChange={() => {}}
      onUndo={() => {}}
      requiresPassword={false}
      scenes={[scene]}
      storyTitle="Story 8"
    />
  );
}

describe("ScriptEditor preview + paste", () => {
  it("shows every scripted line in the live preview", () => {
    render(<Harness initial={baseConfig} />);

    const preview = screen.getByTestId("conversation-preview");

    expect(within(preview).getByText("hello world")).toBeInTheDocument();
    expect(within(preview).getByText("hi back")).toBeInTheDocument();
  });

  it("imports pasted lines and appends them to the script", () => {
    render(<Harness initial={baseConfig} />);

    fireEvent.click(screen.getByRole("button", { name: "Paste a script" }));
    fireEvent.change(screen.getByLabelText("Script text"), {
      target: { value: "me: yo\nyou: sup" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Add pasted lines" }));

    const preview = screen.getByTestId("conversation-preview");
    expect(within(preview).getByText("hello world")).toBeInTheDocument();
    expect(within(preview).getByText("yo")).toBeInTheDocument();
    expect(within(preview).getByText("sup")).toBeInTheDocument();
  });

  it("can replace the whole script from a pasted block", () => {
    render(<Harness initial={baseConfig} />);

    fireEvent.click(screen.getByRole("button", { name: "Paste a script" }));
    fireEvent.change(screen.getByLabelText("Script text"), {
      target: { value: "me: fresh start" }
    });
    fireEvent.click(screen.getByLabelText("Replace existing lines"));
    fireEvent.click(screen.getByRole("button", { name: "Add pasted lines" }));

    const preview = screen.getByTestId("conversation-preview");
    expect(within(preview).getByText("fresh start")).toBeInTheDocument();
    expect(within(preview).queryByText("hello world")).not.toBeInTheDocument();
  });
});
