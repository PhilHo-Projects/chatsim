import { act, renderHook } from "@testing-library/react";
import type { ConversationMessage } from "../data/conversation";
import { getSpeakerTypingDurationMs } from "../data/conversationConfig";
import { useScriptedConversation } from "./useScriptedConversation";

const shortScript: ConversationMessage[] = [
  {
    id: "viewer-1",
    speaker: "viewer",
    text: "hey",
    pauseAfterMs: 20,
    useDefaultPauseAfterMs: false
  },
  {
    id: "contact-1",
    speaker: "contact",
    text: "sup",
    pauseAfterMs: 20,
    useDefaultPauseAfterMs: false
  }
];

const outgoingScript: ConversationMessage[] = [
  {
    id: "contact-1",
    speaker: "contact",
    text: "sup",
    pauseAfterMs: 20,
    useDefaultPauseAfterMs: false
  }
];

describe("useScriptedConversation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("types the POV message into the composer before sending it", () => {
    const { result } = renderHook(() =>
      useScriptedConversation(outgoingScript, { povTypingSpeedLevel: 5 })
    );

    expect(result.current.status).toBe("typing-outgoing");
    expect(result.current.draftText).toBe("");
    expect(result.current.visibleMessages).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(30);
    });

    expect(result.current.draftText).toBe("s");
    expect(result.current.visibleMessages).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(result.current.visibleMessages).toEqual([outgoingScript[0]]);
    expect(result.current.draftText).toBe("");
  });

  it("shows the speaker typing state before revealing an incoming line", () => {
    const { result } = renderHook(() =>
      useScriptedConversation(shortScript, {
        defaultSpeakerTypingSpeedLevel: 5,
        defaultPauseAfterMs: 20,
        povTypingSpeedLevel: 5
      })
    );

    expect(result.current.status).toBe("contact-typing");
    expect(result.current.activeContactName).toBe("Frank");
    expect(result.current.activeMessage).toEqual(shortScript[0]);
    expect(result.current.activeMessageText).toBe("hey");
    expect(result.current.visibleMessages).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(550);
    });

    expect(result.current.visibleMessages).toEqual([shortScript[0]]);
    expect(result.current.activeMessage).toEqual(shortScript[0]);
    expect(result.current.activeMessageText).toBe("hey");

    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(result.current.status).toBe("complete");
    expect(result.current.activeMessage).toEqual(shortScript[1]);
    expect(result.current.activeMessageText).toBe("sup");
    expect(result.current.visibleMessages).toEqual(shortScript);
  });

  it("can wait for an explicit play command before advancing the timeline", () => {
    const { result } = renderHook(() =>
      useScriptedConversation(shortScript, {
        autoPlay: false,
        defaultSpeakerTypingSpeedLevel: 5,
        defaultPauseAfterMs: 20,
        povTypingSpeedLevel: 5
      })
    );

    expect(result.current.isPlaying).toBe(false);

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(result.current.visibleMessages).toHaveLength(0);

    act(() => {
      result.current.play();
    });

    expect(result.current.isPlaying).toBe(true);

    act(() => {
      vi.advanceTimersByTime(550);
    });

    expect(result.current.visibleMessages).toEqual([shortScript[0]]);
  });

  it("replay resets the conversation to the first scripted state", () => {
    const { result } = renderHook(() =>
      useScriptedConversation(shortScript, {
        defaultSpeakerTypingSpeedLevel: 5,
        defaultPauseAfterMs: 20,
        povTypingSpeedLevel: 5
      })
    );

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(result.current.status).toBe("complete");

    act(() => {
      result.current.replay();
    });

    expect(result.current.status).toBe("contact-typing");
    expect(result.current.visibleMessages).toHaveLength(0);
    expect(result.current.draftText).toBe("");
  });

  it("pauses and resumes the timeline from the same frame", () => {
    const { result } = renderHook(() =>
      useScriptedConversation(outgoingScript, { povTypingSpeedLevel: 5 })
    );

    act(() => {
      vi.advanceTimersByTime(30);
    });

    expect(result.current.draftText).toBe("s");

    act(() => {
      result.current.pause();
      vi.advanceTimersByTime(500);
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.draftText).toBe("s");
    expect(result.current.visibleMessages).toHaveLength(0);

    act(() => {
      result.current.play();
      vi.advanceTimersByTime(60);
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isComplete).toBe(true);
    expect(result.current.visibleMessages).toEqual(outgoingScript);
  });

  it("can run the whole timeline at two times speed", () => {
    const { result } = renderHook(() =>
      useScriptedConversation(shortScript, {
        defaultSpeakerTypingSpeedLevel: 5,
        defaultPauseAfterMs: 20,
        povTypingSpeedLevel: 5
      })
    );

    act(() => {
      result.current.togglePlaybackSpeed();
    });

    expect(result.current.playbackSpeed).toBe(2);

    act(() => {
      vi.advanceTimersByTime(275);
    });

    expect(result.current.visibleMessages).toEqual([shortScript[0]]);
  });

  it("uses a custom speaker typing override when use default is unchecked", () => {
    const customScript: ConversationMessage[] = [
      {
        ...shortScript[0],
        typingSpeedLevel: 1,
        useDefaultTypingMs: false
      },
      shortScript[1]
    ];

    const { result } = renderHook(() =>
      useScriptedConversation(customScript, {
        defaultSpeakerTypingSpeedLevel: 5,
        defaultPauseAfterMs: 20,
        povTypingSpeedLevel: 5
      })
    );

    act(() => {
      vi.advanceTimersByTime(550);
    });

    expect(result.current.status).toBe("contact-typing");

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current.visibleMessages).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(650);
    });

    expect(result.current.visibleMessages).toEqual([customScript[0]]);
  });

  it("types every speaker out (no 'is typing') in battle mode", () => {
    const { result } = renderHook(() =>
      useScriptedConversation(shortScript, {
        defaultSpeakerTypingSpeedLevel: 5,
        defaultPauseAfterMs: 20,
        povTypingSpeedLevel: 5,
        typeAllSpeakers: true
      })
    );

    // The first line belongs to the viewer; in battle mode it is typed out
    // character-by-character instead of popping in with a typing indicator.
    expect(result.current.status).toBe("typing-outgoing");
    expect(result.current.isContactTyping).toBe(false);
    expect(result.current.activeMessageText).toBe("");

    act(() => {
      vi.advanceTimersByTime(35);
    });

    expect(result.current.activeMessageText).toBe("h");
    expect(result.current.status).toBe("typing-outgoing");
  });

  it("scales the speaker typing indicator for long incoming text", () => {
    const longIncomingScript: ConversationMessage[] = [
      {
        id: "viewer-long",
        speaker: "viewer",
        text: "x".repeat(160),
        pauseAfterMs: 20,
        useDefaultPauseAfterMs: false
      }
    ];
    const scaledTypingMs = getSpeakerTypingDurationMs(3, 160);

    expect(scaledTypingMs).toBeGreaterThan(getSpeakerTypingDurationMs(3, 20));

    const { result } = renderHook(() =>
      useScriptedConversation(longIncomingScript, {
        defaultSpeakerTypingSpeedLevel: 3,
        defaultPauseAfterMs: 20,
        povTypingSpeedLevel: 5
      })
    );

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(result.current.visibleMessages).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(scaledTypingMs - 1100);
    });

    expect(result.current.visibleMessages).toEqual([longIncomingScript[0]]);
  });
});
