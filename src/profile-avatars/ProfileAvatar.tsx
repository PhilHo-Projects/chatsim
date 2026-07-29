import {
  PROFILE_AVATAR_PRESETS,
  type AvatarNode,
  type AvatarStroke,
  type ProfileAvatarPreset,
  type ProfileAvatarPresetId
} from "./profileAvatarPresets";

type ProfileAvatarProps = {
  compact?: boolean;
  presetId: ProfileAvatarPresetId;
};

export function ProfileAvatar({
  compact = false,
  presetId
}: ProfileAvatarProps) {
  const preset = PROFILE_AVATAR_PRESETS[presetId];
  const widthMultiplier = compact ? 1.8 : 1;
  const nodeMultiplier = compact ? 1.12 : 1;

  const resolveColor = (
    item: AvatarStroke | AvatarNode,
    selectedPreset: ProfileAvatarPreset
  ) =>
    item.color === "primary"
      ? selectedPreset.primaryColor
      : selectedPreset.secondaryColor;

  return (
    <svg
      aria-hidden="true"
      className="h-full w-full"
      data-avatar-preset={presetId}
      data-avatar-variant={compact ? "compact" : "full"}
      preserveAspectRatio="xMidYMid slice"
      viewBox={compact ? "0 45 300 300" : "0 0 300 400"}
    >
      <rect fill="#08070b" height="400" width="300" x="0" y="0" />
      {preset.marks.map((mark, index) => (
        <path
          key={`mark-${index}`}
          d={mark.d}
          fill="none"
          opacity={mark.opacity}
          stroke={resolveColor(mark, preset)}
          strokeLinecap="round"
          strokeWidth={mark.width * widthMultiplier}
        />
      ))}
      {preset.strokes.map((stroke, index) => (
        <path
          key={`stroke-${index}`}
          data-figure-stroke
          d={stroke.d}
          fill="none"
          opacity={stroke.opacity}
          stroke={resolveColor(stroke, preset)}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={stroke.width * widthMultiplier}
        />
      ))}
      {preset.nodes.map((node, index) => (
        <circle
          key={`node-${index}`}
          cx={node.cx}
          cy={node.cy}
          fill={resolveColor(node, preset)}
          opacity={node.opacity}
          r={node.r * nodeMultiplier}
        />
      ))}
    </svg>
  );
}
