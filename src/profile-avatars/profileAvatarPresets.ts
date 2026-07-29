import { createSeededRandom } from "../utils/seededRandom";

export const PROFILE_AVATAR_PRESET_IDS = [
  "sitting",
  "waving",
  "leaning",
  "walking",
  "floating"
] as const;

export type ProfileAvatarPresetId =
  (typeof PROFILE_AVATAR_PRESET_IDS)[number];

type AvatarColorRole = "primary" | "secondary";

export type AvatarStroke = {
  color: AvatarColorRole;
  d: string;
  opacity?: number;
  width: number;
};

export type AvatarNode = {
  color: AvatarColorRole;
  cx: number;
  cy: number;
  opacity?: number;
  r: number;
};

export type ProfileAvatarPreset = {
  id: ProfileAvatarPresetId;
  marks: readonly AvatarStroke[];
  nodes: readonly AvatarNode[];
  primaryColor: string;
  secondaryColor: string;
  strokes: readonly AvatarStroke[];
};

export const PROFILE_AVATAR_PRESETS: Record<
  ProfileAvatarPresetId,
  ProfileAvatarPreset
> = {
  sitting: {
    id: "sitting",
    marks: [
      {
        color: "secondary",
        d: "M42 311 C96 302 204 302 258 311",
        opacity: 0.28,
        width: 2
      }
    ],
    nodes: [
      { color: "primary", cx: 153, cy: 101, r: 19 },
      { color: "secondary", cx: 48, cy: 310, opacity: 0.65, r: 4 }
    ],
    primaryColor: "var(--neon-1)",
    secondaryColor: "var(--neon-3)",
    strokes: [
      {
        color: "primary",
        d: "M153 126 C150 158 145 195 133 226",
        width: 5.5
      },
      {
        color: "secondary",
        d: "M149 151 C125 169 109 191 102 218",
        width: 4.4
      },
      {
        color: "secondary",
        d: "M148 156 C170 171 183 193 179 218",
        width: 4.4
      },
      {
        color: "primary",
        d: "M133 226 C109 232 91 250 80 273",
        width: 5
      },
      {
        color: "primary",
        d: "M80 273 C100 291 121 300 145 301",
        width: 5
      },
      {
        color: "primary",
        d: "M133 226 C160 232 181 247 203 270",
        width: 5
      },
      {
        color: "primary",
        d: "M203 270 C192 288 180 298 164 304",
        width: 5
      }
    ]
  },
  waving: {
    id: "waving",
    marks: [
      {
        color: "secondary",
        d: "M55 326 Q150 307 245 326",
        opacity: 0.24,
        width: 2
      },
      {
        color: "primary",
        d: "M55 72 Q78 52 104 62",
        opacity: 0.18,
        width: 1.8
      }
    ],
    nodes: [
      { color: "primary", cx: 150, cy: 92, r: 19 },
      { color: "secondary", cx: 73, cy: 39, opacity: 0.82, r: 5 }
    ],
    primaryColor: "var(--neon-2)",
    secondaryColor: "var(--neon-4)",
    strokes: [
      {
        color: "primary",
        d: "M150 118 C148 156 151 194 150 231",
        width: 5.4
      },
      {
        color: "secondary",
        d: "M148 145 C121 128 101 101 88 65 C84 54 81 45 73 39",
        width: 4.5
      },
      {
        color: "secondary",
        d: "M151 151 C178 166 191 190 197 214",
        width: 4.5
      },
      {
        color: "primary",
        d: "M150 231 C127 254 112 279 104 307",
        width: 5
      },
      {
        color: "primary",
        d: "M150 231 C174 254 188 279 199 307",
        width: 5
      }
    ]
  },
  leaning: {
    id: "leaning",
    marks: [
      {
        color: "primary",
        d: "M58 302 C103 294 172 294 231 302",
        opacity: 0.25,
        width: 2
      },
      {
        color: "secondary",
        d: "M70 80 C111 55 213 62 246 105",
        opacity: 0.16,
        width: 1.8
      }
    ],
    nodes: [
      { color: "primary", cx: 176, cy: 95, r: 19 },
      { color: "secondary", cx: 82, cy: 274, opacity: 0.72, r: 4.5 }
    ],
    primaryColor: "var(--neon-3)",
    secondaryColor: "var(--neon-1)",
    strokes: [
      {
        color: "primary",
        d: "M168 120 C160 151 150 187 141 222",
        width: 5.4
      },
      {
        color: "secondary",
        d: "M160 148 C129 184 103 222 82 274",
        width: 4.6
      },
      {
        color: "secondary",
        d: "M158 151 C187 172 207 190 222 214",
        width: 4.6
      },
      {
        color: "primary",
        d: "M141 222 C119 245 104 268 85 301",
        width: 5
      },
      {
        color: "primary",
        d: "M141 222 C164 244 184 269 211 294",
        width: 5
      }
    ]
  },
  walking: {
    id: "walking",
    marks: [
      {
        color: "secondary",
        d: "M46 319 Q146 303 254 319",
        opacity: 0.26,
        width: 2
      }
    ],
    nodes: [
      { color: "primary", cx: 145, cy: 87, r: 19 },
      { color: "secondary", cx: 219, cy: 155, opacity: 0.62, r: 4 }
    ],
    primaryColor: "var(--neon-4)",
    secondaryColor: "var(--neon-2)",
    strokes: [
      {
        color: "primary",
        d: "M146 113 C143 149 149 185 153 217",
        width: 5.5
      },
      {
        color: "secondary",
        d: "M147 145 C125 159 106 174 88 195",
        width: 4.5
      },
      {
        color: "secondary",
        d: "M149 147 C172 155 194 159 219 155",
        width: 4.5
      },
      {
        color: "primary",
        d: "M153 217 C137 244 120 269 96 301",
        width: 5
      },
      {
        color: "primary",
        d: "M153 217 C177 238 191 260 207 287",
        width: 5
      },
      {
        color: "primary",
        d: "M207 287 Q220 300 238 304",
        width: 4.8
      }
    ]
  },
  floating: {
    id: "floating",
    marks: [
      {
        color: "secondary",
        d: "M45 198 C86 134 214 134 255 198",
        opacity: 0.2,
        width: 2
      },
      {
        color: "primary",
        d: "M69 266 C111 294 189 294 231 266",
        opacity: 0.18,
        width: 1.8
      }
    ],
    nodes: [
      { color: "primary", cx: 150, cy: 104, r: 19 },
      { color: "secondary", cx: 56, cy: 164, opacity: 0.7, r: 4 },
      { color: "secondary", cx: 244, cy: 164, opacity: 0.7, r: 4 }
    ],
    primaryColor: "var(--neon-1)",
    secondaryColor: "var(--neon-2)",
    strokes: [
      {
        color: "primary",
        d: "M150 130 C146 164 148 199 150 229",
        width: 5.5
      },
      {
        color: "secondary",
        d: "M147 153 C117 157 87 160 56 164",
        width: 4.6
      },
      {
        color: "secondary",
        d: "M153 153 C183 157 213 160 244 164",
        width: 4.6
      },
      {
        color: "primary",
        d: "M150 229 C126 247 111 271 92 298",
        width: 5
      },
      {
        color: "primary",
        d: "M150 229 C174 247 189 271 208 298",
        width: 5
      }
    ]
  }
};

const SHOWCASE_ASSIGNMENTS: Readonly<
  Record<string, ProfileAvatarPresetId>
> = {
  "user-phil": "sitting",
  "user-demo-01": "waving",
  "user-demo-02": "leaning",
  "user-demo-03": "walking",
  "user-demo-04": "floating"
};

export function getProfileAvatarPresetId(
  profileId: string
): ProfileAvatarPresetId {
  const assigned = SHOWCASE_ASSIGNMENTS[profileId];

  if (assigned) {
    return assigned;
  }

  const next = createSeededRandom(`${profileId}-profile-avatar`);
  const index = Math.floor(next() * PROFILE_AVATAR_PRESET_IDS.length);

  return PROFILE_AVATAR_PRESET_IDS[index];
}
