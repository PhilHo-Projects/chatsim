import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pause, Play } from "lucide-react";
import "../battle/battle-motion.css";
import "../conversation/conversation-motion.css";
import { NeonBackground } from "../neon-background/NeonBackground";
import "./motion-lab.css";

type MotionLabProps = {
  onBack: () => void;
};

type FallbackAnimationElement = HTMLElement | SVGElement;

type FallbackAnimationStyle = {
  baseDuration: string;
  originalDuration: string;
  originalPlayState: string;
};

const PLAYBACK_RATES = [0.5, 1, 2] as const;
const FALLBACK_ANIMATION_SELECTOR = [
  ".neon-bg__edge",
  ".neon-bg__spark",
  ".motion-lab__bubble",
  ".motion-lab__typing span",
  ".motion-lab__battle-sprite",
  ".motion-lab__battle-sample i"
].join(", ");

function scaleAnimationDurations(value: string, playbackRate: number) {
  return value
    .split(",")
    .map((duration) => {
      const trimmedDuration = duration.trim();
      const match = trimmedDuration.match(/^(-?\d*\.?\d+)(ms|s)$/);

      if (!match) {
        return trimmedDuration;
      }

      const scaledValue = Number(
        (Number(match[1]) / playbackRate).toFixed(3)
      );

      return `${scaledValue}${match[2]}`;
    })
    .join(", ");
}

function isScalableAnimationDuration(value: string) {
  return value
    .split(",")
    .every((duration) => /^-?\d*\.?\d+(ms|s)$/.test(duration.trim()));
}

export function MotionLab({ onBack }: MotionLabProps) {
  const labRef = useRef<HTMLElement>(null);
  const fallbackStylesRef = useRef(
    new Map<FallbackAnimationElement, FallbackAnimationStyle>()
  );
  const [isPaused, setIsPaused] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    const container = labRef.current;

    if (!container) {
      return;
    }

    if (container.getAnimations) {
      for (const animation of container.getAnimations({ subtree: true })) {
        animation.playbackRate = playbackRate;

        if (isPaused) {
          animation.pause();
        } else {
          animation.play();
        }
      }

      return;
    }

    const animatedElements =
      container.querySelectorAll<FallbackAnimationElement>(
        FALLBACK_ANIMATION_SELECTOR
      );

    for (const element of animatedElements) {
      const computedDuration = getComputedStyle(element).animationDuration;
      const scalableDuration = isScalableAnimationDuration(computedDuration)
        ? computedDuration
        : "";
      const existingStyle = fallbackStylesRef.current.get(element);
      const fallbackStyle = existingStyle ?? {
        baseDuration: scalableDuration,
        originalDuration: element.style.animationDuration,
        originalPlayState: element.style.animationPlayState
      };

      if (!fallbackStyle.baseDuration && scalableDuration) {
        fallbackStyle.baseDuration = scalableDuration;
      }

      fallbackStylesRef.current.set(element, fallbackStyle);
      element.style.animationPlayState = isPaused ? "paused" : "running";

      if (fallbackStyle.baseDuration) {
        element.style.animationDuration = scaleAnimationDurations(
          fallbackStyle.baseDuration,
          playbackRate
        );
      }
    }
  }, [isPaused, playbackRate]);

  useEffect(
    () => () => {
      for (const [element, style] of fallbackStylesRef.current) {
        element.style.animationDuration = style.originalDuration;
        element.style.animationPlayState = style.originalPlayState;
      }
    },
    []
  );

  return (
    <main className="motion-lab" ref={labRef}>
      <NeonBackground />

      <div className="motion-lab__content">
        <header className="motion-lab__header">
          <div>
            <p className="motion-lab__eyebrow">Unlinked local workspace</p>
            <h1>Motion lab</h1>
            <p>
              Real feature keyframes, isolated from the browsing and story
              layouts.
            </p>
          </div>

          <button
            className="motion-lab__back"
            type="button"
            onClick={onBack}
          >
            <ArrowLeft aria-hidden="true" />
            Back to app
          </button>
        </header>

        <section aria-label="Animation controls" className="motion-lab__controls">
          <button
            aria-label={isPaused ? "Play animations" : "Pause animations"}
            aria-pressed={isPaused}
            className="motion-lab__control"
            type="button"
            onClick={() => setIsPaused((current) => !current)}
          >
            {isPaused ? (
              <Play aria-hidden="true" />
            ) : (
              <Pause aria-hidden="true" />
            )}
            {isPaused ? "Play" : "Pause"}
          </button>

          <div aria-label="Animation speed" className="motion-lab__rates">
            {PLAYBACK_RATES.map((rate) => (
              <button
                key={rate}
                aria-label={`Set animation speed to ${rate}x`}
                aria-pressed={playbackRate === rate}
                className="motion-lab__rate"
                type="button"
                onClick={() => setPlaybackRate(rate)}
              >
                {rate}x
              </button>
            ))}
          </div>

          <p>
            Your operating system&apos;s reduced-motion preference remains
            authoritative.
          </p>
        </section>

        <section className="motion-lab__neon-card">
          <div>
            <p className="motion-lab__module-label">Background module</p>
            <h2>Neon tendrils</h2>
            <p>
              Six SVG layers drift using transforms only. Eight sparks animate
              opacity and transforms; the center stays clear.
            </p>
          </div>
          <div aria-label="Clear center preview" className="motion-lab__clear-zone">
            <span>clear content zone</span>
          </div>
        </section>

        <div className="motion-lab__sample-grid">
          <section className="motion-lab__sample-card">
            <p className="motion-lab__module-label">Conversation module</p>
            <h2>Conversation motion</h2>
            <p>Bubble entrance and staggered typing dots.</p>
            <div className="motion-lab__phone-sample" aria-hidden="true">
              <div className="motion-lab__bubble">you still awake?</div>
              <div className="motion-lab__typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </section>

          <section className="motion-lab__sample-card">
            <p className="motion-lab__module-label">Battle module</p>
            <h2>Battle motion</h2>
            <p>Pixel-safe sprite bob and stepped prompt blink.</p>
            <div className="motion-lab__battle-sample" aria-hidden="true">
              <div className="battle-pixel-sprite motion-lab__battle-sprite">
                <span />
              </div>
              <strong>PHIL used SEND TEXT</strong>
              <i>▼</i>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
