import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";

describe("MessageBubble", () => {
  it("allows long unbroken message text to wrap inside the phone", () => {
    render(
      <MessageBubble
        contactInitials="F"
        contactName="Frank"
        message={{
          id: "long-line",
          speaker: "viewer",
          text: "????????????????????????????????????????????"
        }}
      />
    );

    expect(
      screen.getByText("????????????????????????????????????????????")
    ).toHaveClass("[overflow-wrap:anywhere]");
    expect(screen.getByLabelText("Frank avatar")).toBeInTheDocument();
  });

  it("does not render an avatar for outgoing POV messages", () => {
    render(
      <MessageBubble
        contactInitials="F"
        contactName="Frank"
        message={{
          id: "pov-line",
          speaker: "contact",
          text: "on my way"
        }}
      />
    );

    expect(screen.queryByLabelText("Frank avatar")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("undefined avatar")).not.toBeInTheDocument();
  });
});
