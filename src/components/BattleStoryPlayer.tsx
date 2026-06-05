import type {
  ConversationConfig,
  ConversationMessage
} from "../data/conversationConfig";

type BattleStoryPlayerProps = {
  activeMessage: ConversationMessage | null;
  config: ConversationConfig;
  currentDialogueText: string;
  visibleMessages: ConversationMessage[];
};

type BattleSpeaker = ConversationMessage["speaker"];

function getSpeakerName(speaker: BattleSpeaker, config: ConversationConfig) {
  return speaker === "contact" ? config.contact.name : config.viewer.name;
}

function getLatestTextForSpeaker(
  messages: ConversationMessage[],
  speaker: BattleSpeaker
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].speaker === speaker) {
      return messages[index].text;
    }
  }

  return "";
}

/* -------------------------------------------------------------------------- */
/* Pixel-art trainers                                                          */
/* -------------------------------------------------------------------------- */

const PIXEL = 7;

// Two-tone palette per material so the sprites read with light/shadow depth
// instead of flat blobs. Lowercase = base tone, uppercase = shadow tone.
const PALETTE: Record<string, string> = {
  // skin
  s: "#f4c79f",
  S: "#d89c6f",
  // dark features (eyes / mouth)
  e: "#2b2233",
  // shoes (both)
  b: "#1f2630",
  // ---- Nor (bottom player, back view): brown-haired girl ----
  h: "#6f4a2c", // brown hair
  H: "#4d3320", // brown hair shade
  k: "#ef7d8e", // coral top
  K: "#cf5a6d", // coral top shade
  n: "#3f5d92", // denim skirt
  N: "#2b4067", // denim skirt shade
  // ---- Phil (top opponent, front view): goofy weirdo ----
  g: "#8fc740", // wild green hair
  G: "#5f9020", // green hair shade
  y: "#f2c14e", // mustard sweater
  Y: "#cf9b2f", // mustard sweater shade
  p: "#3a4356", // slate trousers
  P: "#272e3c" // slate trousers shade
};

const OUTLINE = "#1b1320";

// Nor: bottom player, back view. Brown-haired girl with long hair down her
// back, a coral top and a flared denim skirt. 16 wide.
const PLAYER_SPRITE_ROWS = [
  "....hhhhhhhh....",
  "...hhhhhhhhhh...",
  "..hhhhhhhhhhhh..",
  "..hhHHHHHHHHhh..",
  "..hhhhhhhhhhhh..",
  "..hhhhhhhhhhhh..",
  ".shhhhhhhhhhhhs.",
  ".shhhhhhhhhhhhs.",
  ".shhHHHHHHHHhhs.",
  ".shhhhhhhhhhhhs.",
  "..hhhhhhhhhhhh..",
  "..kkkkkkkkkkkk..",
  "..kkkkKKKKkkkk..",
  "..nnnnnnnnnnnn..",
  ".nnnnnnnnnnnnnn.",
  "....ss....ss....",
  "....ss....ss....",
  "...bbb....bbb..."
];

// Phil: top opponent, front view. A goofy weirdo with wild green hair,
// lopsided eyes and a big dumb grin in a mustard sweater. 16 wide.
const OPPONENT_SPRITE_ROWS = [
  ".g..gg..g..gg...",
  "..gggggggggggg..",
  "..gggggggggggg..",
  "..ggssssssssgg..",
  "..ggseessessgg..",
  "..ggssssssssgg..",
  "..ggseeeesssgg..",
  ".....ssssss.....",
  "..yyyyyyyyyyyy..",
  ".syyyyyyyyyyyys.",
  ".syyyyYYYYyyyys.",
  "..yyyyyyyyyyyy..",
  "...pppppppppp...",
  "...pppppppppp...",
  "...pppp..pppp...",
  "...pPpp..ppPp...",
  "...bbbb..bbbb...",
  "..bbbbb..bbbbb.."
];

function getSpriteCols(rows: string[]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

function buildPixelShadow(rows: string[]) {
  const filled = new Set<string>();
  const colored: string[] = [];

  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      const color = PALETTE[char];
      if (color) {
        filled.add(`${x},${y}`);
        colored.push(`${x * PIXEL}px ${y * PIXEL}px 0 0 ${color}`);
      }
    });
  });

  // Auto-generate a 1px silhouette outline from the filled cells so the
  // sprite reads crisply against the battlefield without hand-authoring it.
  const seen = new Set<string>();
  const outline: string[] = [];
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  filled.forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    directions.forEach(([dx, dy]) => {
      const neighbor = `${x + dx},${y + dy}`;
      if (!filled.has(neighbor) && !seen.has(neighbor)) {
        seen.add(neighbor);
        outline.push(
          `${(x + dx) * PIXEL}px ${(y + dy) * PIXEL}px 0 0 ${OUTLINE}`
        );
      }
    });
  });

  return [...colored, ...outline].join(",");
}

export const BATTLE_SPRITE_ROWS = {
  opponent: OPPONENT_SPRITE_ROWS,
  player: PLAYER_SPRITE_ROWS
};

const PLAYER_SHADOW = buildPixelShadow(PLAYER_SPRITE_ROWS);
const OPPONENT_SHADOW = buildPixelShadow(OPPONENT_SPRITE_ROWS);

function PixelTrainer({ side }: { side: "opponent" | "player" }) {
  const isPlayer = side === "player";
  const rows = isPlayer ? PLAYER_SPRITE_ROWS : OPPONENT_SPRITE_ROWS;
  const cols = getSpriteCols(rows);
  const bob = isPlayer ? "1.9s" : "2.3s";

  return (
    <div
      aria-hidden="true"
      data-testid={isPlayer ? "battle-player-sprite" : "battle-opponent-sprite"}
      className="battle-pixel-sprite relative drop-shadow-[0_4px_0_rgba(15,23,42,0.22)]"
      style={{
        width: cols * PIXEL,
        height: rows.length * PIXEL,
        animation: `battle-bob ${bob} ease-in-out infinite`
      }}
    >
      <span
        className="absolute left-0 top-0"
        style={{
          width: PIXEL,
          height: PIXEL,
          boxShadow: isPlayer ? PLAYER_SHADOW : OPPONENT_SHADOW
        }}
      />
    </div>
  );
}

function BattlePlatform({ tone }: { tone: "near" | "far" }) {
  const size =
    tone === "near" ? "h-9 w-44 sm:h-10 sm:w-48" : "h-7 w-36 sm:h-8 sm:w-40";

  return (
    <div
      aria-hidden="true"
      className={`${size} rounded-[50%] border-[3px] border-[#9c8550] bg-[#d8b878] shadow-[inset_0_4px_0_rgba(255,255,255,0.4),inset_0_-4px_0_rgba(120,92,46,0.45)]`}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Speaker panel (status nameplate + static dialogue box)                      */
/* -------------------------------------------------------------------------- */

function HeartGauge() {
  return (
    <span className="shrink-0 tracking-[0.15em] text-[#ff5a72] drop-shadow-[1px_1px_0_rgba(0,0,0,0.45)]">
      ♥ ♥ ♥ ♥ ♥
    </span>
  );
}

function SpeakerPanel({
  corner,
  isActive,
  speakerName,
  statusTestId,
  testIdPrefix,
  text
}: {
  corner: "top-left" | "bottom-right";
  isActive: boolean;
  speakerName: string;
  statusTestId: string;
  testIdPrefix: string;
  text: string;
}) {
  const displayText = text.trim().length > 0 ? text : "...";
  const placement =
    corner === "top-left" ? "left-2.5 top-2.5" : "bottom-2.5 right-2.5";

  return (
    <div
      data-testid={testIdPrefix}
      data-active={isActive ? "true" : "false"}
      className={`absolute z-30 flex w-[min(16rem,calc(50%-0.75rem))] flex-col overflow-hidden rounded-md border-[3px] transition-[transform,opacity,border-color,box-shadow] duration-200 ${placement} ${
        isActive
          ? "border-[#ffd93b] shadow-[0_0_0_3px_rgba(255,217,59,0.35),5px_5px_0_rgba(15,23,42,0.35)]"
          : "border-[#1b2a4a] opacity-60 shadow-[4px_4px_0_rgba(15,23,42,0.25)]"
      }`}
    >
      <div
        data-testid={statusTestId}
        className={`flex items-center justify-between gap-2 px-2.5 py-1 text-[11px] font-black uppercase leading-none tracking-wide text-[#fdf6df] ${
          isActive ? "bg-[#2f4f9e]" : "bg-[#27407a]"
        }`}
      >
        <span className="truncate">{speakerName}</span>
        <HeartGauge />
      </div>

      <div className="relative h-[4.75rem] overflow-y-auto bg-[#f7f0d8] px-2.5 py-2">
        <p
          data-testid={`${testIdPrefix}-speaker`}
          className="sr-only"
        >
          {speakerName}
        </p>
        <p
          data-testid={`${testIdPrefix}-text`}
          className="whitespace-pre-wrap text-[13px] font-bold leading-snug tracking-tight text-[#21314f] [overflow-wrap:anywhere]"
        >
          {displayText}
        </p>
      </div>

      {isActive ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1 right-2 text-[#1b2a4a] [animation:battle-blink_1s_steps(1,end)_infinite]"
        >
          ▼
        </span>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Battle stage                                                                */
/* -------------------------------------------------------------------------- */

export function BattleStoryPlayer({
  activeMessage,
  config,
  currentDialogueText,
  visibleMessages
}: BattleStoryPlayerProps) {
  const activeSpeaker = activeMessage?.speaker ?? null;
  const viewerName = getSpeakerName("viewer", config);
  const contactName = getSpeakerName("contact", config);
  // The active speaker shows their line as it is typed out; the idle speaker
  // keeps their last fully-revealed line on screen.
  const viewerText =
    activeSpeaker === "viewer"
      ? currentDialogueText
      : getLatestTextForSpeaker(visibleMessages, "viewer");
  const contactText =
    activeSpeaker === "contact"
      ? currentDialogueText
      : getLatestTextForSpeaker(visibleMessages, "contact");

  return (
    <section
      aria-label="Battle story"
      data-testid="battle-stage"
      className="relative min-h-[380px] max-h-[640px] w-[min(640px,calc(100vw-24px))] flex-1 overflow-hidden rounded-xl border-4 border-slate-950 bg-[#7cc06a] font-mono shadow-[0_24px_64px_rgba(15,23,42,0.28)]"
    >
      {/* Sky + battlefield backdrop */}
      <div className="absolute inset-x-0 top-0 h-[42%] bg-[linear-gradient(180deg,#aee3f4_0%,#cdeede_70%,rgba(205,238,222,0)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 top-[36%] bg-[linear-gradient(180deg,#86c96f_0%,#6fb35c_55%,#5fa34f_100%)]" />
      {/* Soft grass banding + CRT scanlines for retro depth */}
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.06)_0_3px,rgba(15,23,42,0.05)_3px_4px)]" />
      <div className="pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18),inset_0_0_40px_rgba(15,23,42,0.18)]" />

      {/* Opponent — top-right on the far platform */}
      <div className="absolute right-[7%] top-[14%] z-10 flex flex-col items-center">
        <PixelTrainer side="opponent" />
        <div className="-mt-2">
          <BattlePlatform tone="far" />
        </div>
      </div>

      {/* Player — bottom-left on the near platform */}
      <div className="absolute bottom-[6%] left-[8%] z-10 flex flex-col items-center">
        <PixelTrainer side="player" />
        <div className="-mt-2">
          <BattlePlatform tone="near" />
        </div>
      </div>

      <SpeakerPanel
        corner="top-left"
        isActive={activeSpeaker === "viewer"}
        speakerName={viewerName}
        statusTestId="battle-opponent-status"
        testIdPrefix="battle-top-dialogue"
        text={viewerText}
      />
      <SpeakerPanel
        corner="bottom-right"
        isActive={activeSpeaker === "contact"}
        speakerName={contactName}
        statusTestId="battle-player-status"
        testIdPrefix="battle-bottom-dialogue"
        text={contactText}
      />
    </section>
  );
}
