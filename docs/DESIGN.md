# Design system: the nursery nightlight

## Concept

CrySense is opened most often at 3 a.m., by someone exhausted, holding a baby. The interface behaves like a nursery nightlight: soft, glowing, never harsh.

- **Day:** lavender-milk frosted glass over slowly drifting pastel light (lavender, blush, mint, butter).
- **Night (automatic from 8 pm to 6 am):** everything dims to deep indigo, a few stars appear, and the record button becomes a warm moon. The screen won't jolt a sleepy parent or baby awake.
- **Two spaces, two tints:** baby care is periwinkle; the mother's private space is rose. The tint changes across the whole interface, so you always know whose space you are in.

The one memorable element is the **moon recorder**: a large glowing button that breathes while recording, with a halo that follows the microphone level. Everything else stays quiet.

## Modular bento home

Both homes are a two-column bento of glass tiles. Each module owns one soft hue (lilac, blush, mint, butter, sky or peach) that colours its icon chip and a glow in the tile's top-right corner. Small tiles take one column; medium and large take two. Tiles act inline where one tap is enough (water, one good thing, play sound, partner switch); tapping elsewhere opens the module. The safety-first Cry check is near the top of Baby care. "Edit home" opens the module library.

## Three light modes

Day, night (automatic from 8 pm), and **red night light**: deep maroon glass with warm coral text, the gentlest on sleepy eyes at 3 a.m. The theme button in the top bar cycles auto, day, night, red.

## Tokens (`frontend/src/styles/tokens.css`)

| Token | Day | Night | Use |
|---|---|---|---|
| `--base` | `#EEE9F8` | `#15132A` | Page background |
| `--ink` | `#2A2340` | `#EEEAFF` | Text |
| `--baby` | `#5F6AD1` | `#9EA6F7` | Baby care accent |
| `--mom` | `#B9507A` | `#F09BBC` | Mother's space accent |
| `--urgent` | `#B42343` | `#FF8DA4` | Help, emergencies |
| `--caution` | `#94600F` | `#F2C46B` | Assumed values, advice |
| `--ok` | `#23775F` | `#7FD8BB` | Confirmed, taken |
| `--glass` | white 52% | indigo 50% | Frosted surfaces, 22 px blur |

Light and dark tokens are defined once on `:root`, overridden under `prefers-color-scheme: dark` and under `[data-theme="dark"]`, which the theme provider sets.

## Type

- **Manrope** for headings and display moments.
- **DM Sans** for interface text and body copy.
- Scale (1.25 ratio): 13, 15, 16, 20, 26, 34 px. Sentence case everywhere, no all-caps labels.

## Shape follows hierarchy

| Element | Radius |
|---|---|
| Tab bar, sheets | 30 px |
| Cards | 24 px |
| Inputs, buttons | 16 px |
| Chips, pills | fully round |

## Components

| Component | File | Notes |
|---|---|---|
| Glass card | `components/Layout.tsx` | Variants: tint (module colour), urgent, caution, ok |
| Top bar | `Layout.tsx` | Brand, theme toggle, always-visible **Get help** pill |
| Tab bar | `Layout.tsx` | Baby, My space, Help, Settings; floating glass |
| Moon recorder | `components/MoonRecorder.tsx` | Breathing animation, level halo, timer, demo samples |
| Bottom sheet | `components/Sheet.tsx` | Focus moves in on open and returns on close; Escape closes |
| Safety panel | `components/SafetyPanel.tsx` | Level heading, rule messages, tap-to-call numbers, ruleset version |
| Consent prompt | `components/ConsentPrompt.tsx` | Explains the purpose, "Allow and continue" retries the action |
| Provenance badges | `features/baby/EventEditor.tsx` | "You said this" (green), "Assumed, please check" (amber) |
| Missing-data bars | `features/baby/Patterns.tsx` | Striped, dashed outline, labelled "none" |

## Writing

- Plain verbs, sentence case, one job per line.
- Buttons say what happens: "Save check-in", "Preview exactly what will be shared", "Allow and continue".
- Errors explain what to do: "The sound is very quiet. Hold the phone closer."
- Never clinical labels about the user. "Can't tell from this recording" instead of a guess.

## Accessibility

- Visible focus rings in the module accent colour.
- `prefers-reduced-motion` turns off drift, breathing and sheet animations.
- Every icon button has a label; scales announce "Mood: 3"; the coverage ring and charts have text alternatives.
- Typed input is available everywhere voice is (voice log, journal).
- Touch targets of at least 38 px, mostly 44 to 48 px.
- Safe-area insets respected for phones with notches and home indicators.
