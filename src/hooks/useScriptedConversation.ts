import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getPovTypingMsPerCharacter,
  getSpeakerTypingDurationMs,
  type ConversationMessage,
  type SpeedLevel
} from "../data/conversationConfig";

export type ConversationStatus =
  | "typing-outgoing"
  | "contact-typing"
  | "between-messages"
  | "complete";

export type PlaybackSpeed = 1 | 2;

type UseScriptedConversationOptions = {
  autoPlay?: boolean;
  contactName?: string;
  defaultSpeakerTypingSpeedLevel?: SpeedLevel;
  defaultPauseAfterMs?: number;
  povTypingSpeedLevel?: SpeedLevel;
  // When true, every speaker reveals their line character-by-character (the
  // Pokemon-battle textbox style) instead of the phone style where the other
  // speaker pops in fully while an "is typing" indicator runs.
  typeAllSpeakers?: boolean;
};

type ScriptedConversationState = {
  activeContactName: string;
  activeMessage: ConversationMessage | null;
  activeMessageText: string;
  draftText: string;
  isContactTyping: boolean;
  isComplete: boolean;
  isPlaying: boolean;
  pause: () => void;
  play: () => void;
  playbackSpeed: PlaybackSpeed;
  replay: () => void;
  reset: () => void;
  skipToEnd: () => void;
  status: ConversationStatus;
  togglePlayback: () => void;
  togglePlaybackSpeed: () => void;
  visibleMessages: ConversationMessage[];
};

type TimelineEntry = {
  message: ConversationMessage;
  revealMs: number;
  startMs: number;
  typingMs: number;
};

type Timeline = {
  boundaries: number[];
  entries: TimelineEntry[];
  totalMs: number;
};

type TimelineFrame = {
  activeMessage: ConversationMessage | null;
  activeMessageText: string;
  draftText: string;
  status: ConversationStatus;
  visibleMessages: ConversationMessage[];
};

const DEFAULT_CONTACT_NAME = "Frank";
const DEFAULT_PAUSE_MS = 380;
const DEFAULT_SPEED_LEVEL: SpeedLevel = 3;

function getTypingMs(
  message: ConversationMessage,
  povTypingSpeedLevel: SpeedLevel,
  defaultSpeakerTypingSpeedLevel: SpeedLevel,
  typeAllSpeakers: boolean
): number {
  // In battle mode both speakers "type" their line, so the other speaker uses
  // the same per-character cadence as the POV instead of the fixed-duration
  // "is typing" model used by the phone shell.
  if (message.speaker === "contact" || typeAllSpeakers) {
    const fallbackLevel =
      message.speaker === "contact"
        ? povTypingSpeedLevel
        : defaultSpeakerTypingSpeedLevel;
    const speedLevel =
      message.useDefaultTypingMs === false
        ? message.typingSpeedLevel ?? fallbackLevel
        : fallbackLevel;

    return Math.max(
      80,
      Math.round(message.text.length * getPovTypingMsPerCharacter(speedLevel))
    );
  }

  const speedLevel =
    message.useDefaultTypingMs === false
      ? message.typingSpeedLevel ?? defaultSpeakerTypingSpeedLevel
      : defaultSpeakerTypingSpeedLevel;

  return Math.max(40, getSpeakerTypingDurationMs(speedLevel, message.text.length));
}

function getPauseMs(
  message: ConversationMessage,
  defaultPauseAfterMs: number
): number {
  const pauseMs =
    message.useDefaultPauseAfterMs === false
      ? message.pauseAfterMs ?? defaultPauseAfterMs
      : defaultPauseAfterMs;

  return Math.max(0, pauseMs);
}

function uniqueSortedBoundaries(boundaries: number[]): number[] {
  return Array.from(new Set(boundaries.map((boundary) => Math.round(boundary))))
    .filter((boundary) => boundary >= 0)
    .sort((first, second) => first - second);
}

function buildTimeline(
  messages: ConversationMessage[],
  povTypingSpeedLevel: SpeedLevel,
  defaultSpeakerTypingSpeedLevel: SpeedLevel,
  defaultPauseAfterMs: number,
  typeAllSpeakers: boolean
): Timeline {
  const entries: TimelineEntry[] = [];
  const boundaries = [0];
  let elapsedMs = 0;

  messages.forEach((message, index) => {
    const typingMs = getTypingMs(
      message,
      povTypingSpeedLevel,
      defaultSpeakerTypingSpeedLevel,
      typeAllSpeakers
    );
    const startMs = elapsedMs;
    const revealMs = startMs + typingMs;
    const nextMessage = messages[index + 1];

    entries.push({
      message,
      revealMs,
      startMs,
      typingMs
    });

    boundaries.push(startMs, revealMs);

    if (message.speaker === "contact" || typeAllSpeakers) {
      const characterDelay = typingMs / Math.max(message.text.length, 1);

      for (
        let characterIndex = 1;
        characterIndex < message.text.length;
        characterIndex += 1
      ) {
        boundaries.push(startMs + characterDelay * characterIndex);
      }
    }

    elapsedMs = revealMs;

    if (nextMessage) {
      elapsedMs += getPauseMs(message, defaultPauseAfterMs);
      boundaries.push(elapsedMs);
    }
  });

  return {
    boundaries: uniqueSortedBoundaries(boundaries),
    entries,
    totalMs: Math.round(elapsedMs)
  };
}

function getTimelineFrame(
  timeline: Timeline,
  positionMs: number,
  typeAllSpeakers: boolean
): TimelineFrame {
  if (timeline.entries.length === 0) {
    return {
      activeMessage: null,
      activeMessageText: "",
      draftText: "",
      status: "complete",
      visibleMessages: []
    };
  }

  const clampedPosition = Math.min(
    timeline.totalMs,
    Math.max(0, positionMs)
  );
  const visibleMessages = timeline.entries
    .filter((entry) => entry.revealMs <= clampedPosition)
    .map((entry) => entry.message);

  if (clampedPosition >= timeline.totalMs) {
    const activeMessage = visibleMessages[visibleMessages.length - 1] ?? null;

    return {
      activeMessage,
      activeMessageText: activeMessage?.text ?? "",
      draftText: "",
      status: "complete",
      visibleMessages
    };
  }

  const activeEntry = timeline.entries.find(
    (entry) =>
      clampedPosition >= entry.startMs && clampedPosition < entry.revealMs
  );

  if (!activeEntry) {
    const activeMessage = visibleMessages[visibleMessages.length - 1] ?? null;

    return {
      activeMessage,
      activeMessageText: activeMessage?.text ?? "",
      draftText: "",
      status: "between-messages",
      visibleMessages
    };
  }

  // Phone style: the other speaker pops in fully while an "is typing" bar runs.
  // Battle style (typeAllSpeakers): everyone types their line out instead.
  if (activeEntry.message.speaker === "viewer" && !typeAllSpeakers) {
    return {
      activeMessage: activeEntry.message,
      activeMessageText: activeEntry.message.text,
      draftText: "",
      status: "contact-typing",
      visibleMessages
    };
  }

  const characterDelay =
    activeEntry.typingMs / Math.max(activeEntry.message.text.length, 1);
  const characterCount = Math.min(
    activeEntry.message.text.length - 1,
    Math.max(
      0,
      Math.floor((clampedPosition - activeEntry.startMs) / characterDelay)
    )
  );

  const draftText = activeEntry.message.text.slice(0, characterCount);

  return {
    activeMessage: activeEntry.message,
    activeMessageText: draftText,
    draftText,
    status: "typing-outgoing",
    visibleMessages
  };
}

export function useScriptedConversation(
  messages: ConversationMessage[],
  options: UseScriptedConversationOptions = {}
): ScriptedConversationState {
  const autoPlay = options.autoPlay ?? true;
  const [isPlaying, setIsPlaying] = useState(
    () => autoPlay && messages.length > 0
  );
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [positionMs, setPositionMs] = useState(0);
  const timerRef = useRef<number | null>(null);
  const clockRef = useRef({
    anchorPositionMs: 0,
    anchorTimeMs: Date.now()
  });

  const activeContactName = options.contactName ?? DEFAULT_CONTACT_NAME;
  const povTypingSpeedLevel =
    options.povTypingSpeedLevel ?? DEFAULT_SPEED_LEVEL;
  const defaultSpeakerTypingSpeedLevel =
    options.defaultSpeakerTypingSpeedLevel ?? DEFAULT_SPEED_LEVEL;
  const defaultPauseAfterMs = options.defaultPauseAfterMs ?? DEFAULT_PAUSE_MS;
  const typeAllSpeakers = options.typeAllSpeakers ?? false;

  const timeline = useMemo(
    () =>
      buildTimeline(
        messages,
        povTypingSpeedLevel,
        defaultSpeakerTypingSpeedLevel,
        defaultPauseAfterMs,
        typeAllSpeakers
      ),
    [
      defaultPauseAfterMs,
      defaultSpeakerTypingSpeedLevel,
      messages,
      povTypingSpeedLevel,
      typeAllSpeakers
    ]
  );
  const frame = useMemo(
    () => getTimelineFrame(timeline, positionMs, typeAllSpeakers),
    [positionMs, timeline, typeAllSpeakers]
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) {
      return;
    }

    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => {
    clearTimer();
    clockRef.current = {
      anchorPositionMs: 0,
      anchorTimeMs: Date.now()
    };
    setPositionMs(0);
    setIsPlaying(autoPlay && timeline.totalMs > 0);
    setPlaybackSpeed(1);
  }, [autoPlay, clearTimer, timeline]);

  const getCurrentPosition = useCallback(() => {
    if (!isPlaying) {
      return positionMs;
    }

    const elapsedWallMs = Date.now() - clockRef.current.anchorTimeMs;

    return Math.min(
      timeline.totalMs,
      Math.max(
        0,
        clockRef.current.anchorPositionMs + elapsedWallMs * playbackSpeed
      )
    );
  }, [isPlaying, playbackSpeed, positionMs, timeline.totalMs]);

  const syncClockPosition = useCallback(() => {
    const currentPosition = getCurrentPosition();

    clockRef.current = {
      anchorPositionMs: currentPosition,
      anchorTimeMs: Date.now()
    };
    setPositionMs(currentPosition);

    if (currentPosition >= timeline.totalMs) {
      setIsPlaying(false);
    }

    return currentPosition;
  }, [getCurrentPosition, timeline.totalMs]);

  useEffect(() => {
    clearTimer();

    if (!isPlaying || timeline.totalMs === 0) {
      return undefined;
    }

    const currentPosition = getCurrentPosition();

    if (currentPosition >= timeline.totalMs) {
      clockRef.current = {
        anchorPositionMs: timeline.totalMs,
        anchorTimeMs: Date.now()
      };
      setPositionMs(timeline.totalMs);
      setIsPlaying(false);
      return undefined;
    }

    clockRef.current = {
      anchorPositionMs: currentPosition,
      anchorTimeMs: Date.now()
    };

    const nextBoundary =
      timeline.boundaries.find((boundary) => boundary > currentPosition + 0.1) ??
      timeline.totalMs;
    const delayMs = Math.max(
      0,
      Math.ceil((nextBoundary - currentPosition) / playbackSpeed)
    );

    timerRef.current = window.setTimeout(() => {
      const nextPosition = Math.min(nextBoundary, timeline.totalMs);

      clockRef.current = {
        anchorPositionMs: nextPosition,
        anchorTimeMs: Date.now()
      };
      setPositionMs(nextPosition);

      if (nextPosition >= timeline.totalMs) {
        setIsPlaying(false);
      }
    }, delayMs);

    return clearTimer;
  }, [
    clearTimer,
    getCurrentPosition,
    isPlaying,
    playbackSpeed,
    positionMs,
    timeline
  ]);

  const play = useCallback(() => {
    clearTimer();
    const startPosition =
      getCurrentPosition() >= timeline.totalMs ? 0 : getCurrentPosition();

    clockRef.current = {
      anchorPositionMs: startPosition,
      anchorTimeMs: Date.now()
    };
    setPositionMs(startPosition);
    setIsPlaying(timeline.totalMs > 0);
  }, [clearTimer, getCurrentPosition, timeline.totalMs]);

  const pause = useCallback(() => {
    clearTimer();
    syncClockPosition();
    setIsPlaying(false);
  }, [clearTimer, syncClockPosition]);

  const reset = useCallback(() => {
    clearTimer();
    clockRef.current = {
      anchorPositionMs: 0,
      anchorTimeMs: Date.now()
    };
    setPositionMs(0);
    setIsPlaying(timeline.totalMs > 0);
  }, [clearTimer, timeline.totalMs]);

  const replay = reset;

  const skipToEnd = useCallback(() => {
    clearTimer();
    clockRef.current = {
      anchorPositionMs: timeline.totalMs,
      anchorTimeMs: Date.now()
    };
    setPositionMs(timeline.totalMs);
    setIsPlaying(false);
  }, [clearTimer, timeline.totalMs]);

  const togglePlayback = useCallback(() => {
    if (getCurrentPosition() >= timeline.totalMs) {
      reset();
      return;
    }

    if (isPlaying) {
      pause();
      return;
    }

    play();
  }, [getCurrentPosition, isPlaying, pause, play, reset, timeline.totalMs]);

  const togglePlaybackSpeed = useCallback(() => {
    syncClockPosition();
    setPlaybackSpeed((currentSpeed) => (currentSpeed === 1 ? 2 : 1));
  }, [syncClockPosition]);

  return {
    activeContactName,
    activeMessage: frame.activeMessage,
    activeMessageText: frame.activeMessageText,
    draftText: frame.draftText,
    isContactTyping: frame.status === "contact-typing",
    isComplete: frame.status === "complete",
    isPlaying,
    pause,
    play,
    playbackSpeed,
    replay,
    reset,
    skipToEnd,
    status: frame.status,
    togglePlayback,
    togglePlaybackSpeed,
    visibleMessages: frame.visibleMessages
  };
}
