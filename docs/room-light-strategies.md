# Room Light Strategies

The viewer’s **Room lights** panel uses a [strategy pattern](https://en.wikipedia.org/wiki/Strategy_pattern) to decide how selected words map to the eight preview lights. Each strategy answers one question: *how much should each word in the room contribute to the combined emotion vector?*

The UI exposes a **Light strategy** dropdown. The active strategy is stored in `localStorage` under `emotion-viewer-light-strategy`.

Implementation lives in `viewer/light-strategies.js`. The viewer builds a context object with the current room word list, lexicon rows, emotion metadata, and light layout, then delegates aggregation and light mapping to the selected strategy.

---

## Shared pipeline (aggregate strategies)

**Equal weight** and **Recency weighted** share the same aggregation pipeline:

1. **Per-word weight** — strategy-specific multiplier × lexicon `Confidence`.
2. **Emotion accumulation** — for each word, add `score[emotion] × weight` across the six emotions.
3. **Shares** — divide each accumulated emotion total by the sum of all six totals.
4. **Light mapping** — eight lights are driven from the shares:
   - Lights 1–6: one per emotion; color from the emotion palette; opacity from that emotion’s share.
   - Light 7 (**Blend**): RGB mix of all six emotion colors weighted by shares; opacity from the strongest share.
   - Light 8 (**Warmth**): cool blue ↔ warm gold from average VAD valence when available, otherwise from joy/love vs sadness/anger; opacity from arousal or a warmth proxy.

Opacity uses a floor of ~6% so inactive channels stay visible but dim.

---

## Strategy: Equal weight (`equal-weight`)

**Default.** This is the behavior used before strategies were introduced.

### Per-word weight

```
weight(word) = Confidence
```

Every word in the tray counts the same (modulo confidence). Order does not matter. Adding `heartbroken` and then `delighted` produces the same lights as adding them in reverse.

### When to use

- Stable “room mood” from the full set of placed words.
- Testing combinations where all tokens should matter equally (e.g. `i am heartbroken` vs `i am delighted` when connecting words are neutral).
- Closest match to a simple Unreal heuristic that sums lexicon rows without temporal bias.

### Example

| Words in room | Effect |
|---------------|--------|
| `heartbroken` only | Sadness channel dominates. |
| `heartbroken` + `delighted` | Joy and sadness both rise; blend splits between gold and blue. |
| `i` + `am` + `happy` | Connecting words add tiny neutral mass; `happy` still drives joy. |

---

## Strategy: Recency weighted (`recency-weighted`)

Recently added words influence the lights more; older words fade **exponentially** by position in the tray (oldest → newest).

### Per-word weight

```
recencyFactor(index) = 0.7 ^ (n - 1 - index)
weight(word) = Confidence × recencyFactor(index)
```

- `index` = 0-based position in the room list (left to right in the tray).
- `n` = number of words in the room.
- Newest word: factor `1.0`.
- Each step back in time multiplies by `0.7`.

| Position (oldest → newest) | Factor (3 words) | Factor (5 words) |
|----------------------------|------------------|------------------|
| Oldest | 0.49 | 0.24 |
| Middle | 0.70 | 0.34 |
| … | … | … |
| Newest | 1.00 | 1.00 |

### When to use

- Simulating a user “placing” words over time where the latest text should steer the room.
- Narrative beats: start with `contented`, then add `anxious` — the room should shift toward fear/anxiety without erasing the earlier word entirely.
- VR prototypes where recency matches attention or spotlight behavior.

### Example

Tray order: `contented` → `anxious`

- `contented` (joy-heavy) still contributes at 70% relative strength vs the newest word.
- `anxious` (fear-heavy) contributes at full strength, so fear/surprise channels gain on joy.

Re-add or reorder by removing and re-adding words; the tray order is the recency timeline.

---

## Strategy: Scoreboard (`scoreboard`)

Each of the eight lights is a **fixed slot** on a scoreboard. Lights are not emotion channels — they display individual words.

### Slot assignment

```
slot[i] = roomWords[i]   (i = 0 … 7)
```

- Tray order matches slot order: first word added → slot 1 (top-left), second → slot 2, and so on.
- Empty slots show a dim bulb labeled `1`–`8`.
- Filled slots show the word (truncated) and that word’s blended emotion color.
- Opacity follows lexicon `Confidence` for that word only.
- If more than eight words are in the tray, only the **first eight** appear on the board; additional words remain in the tray but do not get a light (the readout notes the overflow).

### Per-slot color

Each occupied slot blends the six emotion colors using **that word’s** lexicon scores (not a room-wide aggregate).

### When to use

- Testing phrases word-by-word: `i` → `am` → `heartbroken` fills three slots with distinct colors.
- VR layouts where each physical light represents one placed 3D text object.
- Comparing words side-by-side without merging them into one room mood.

### Example

| Tray order | Lights |
|------------|--------|
| `heartbroken` | Slot 1: blue sadness blend; slots 2–8 empty. |
| `heartbroken`, `delighted` | Slot 1: sadness; slot 2: gold joy; no merging. |
| `i`, `am`, `happy` | Three slots filled; connecting words show neutral tints at low opacity. |

---

## Strategy: Sliding window (`sliding-window`)

Like **Scoreboard**, each light is one word slot with that word’s own emotion color — but the board always shows the **most recently added** words.

### Slot assignment

```
window = roomWords[-8:]          # last eight words in tray order
slot[0 … pad-1] = empty         # left-padded when fewer than eight words
slot[pad … 7]   = window        # oldest visible → newest in slot 8
```

- **Newest word is always slot 8** (rightmost).
- With fewer than eight words, empty slots appear on the **left**.
- When a ninth word is added, the oldest visible word rolls off slot 1; the new word appears in slot 8.
- Words still in the tray but no longer in the window are noted in the readout as “rolled off.”

### When to use

- Simulating a rolling caption or recent history in VR.
- Long phrases where only the tail should drive individual lights.
- Contrasting with **Scoreboard**: add nine words and compare — scoreboard freezes the first eight; sliding window tracks the last eight.

### Example

| Tray (in order) | Visible slots (1 → 8) |
|-----------------|------------------------|
| `i`, `am`, `happy` | empty × 5, then `i`, `am`, `happy` |
| nine words `w1` … `w9` | `w2` … `w9` ( `w1` rolled off ) |

---

## Adding a new strategy

1. Add an object to `viewer/light-strategies.js` with:
   - `id`, `label`, `summary`
   - Either the **aggregate** path (`computeAggregate` + `describeAggregate`) or a custom path (`usesAggregate: false` + `computeLights`).
2. Register it in the `strategies` array.
3. Document it in this file.

Aggregate strategies should keep light layout in `mapAggregateToLights`. Slot-based strategies can return their own eight-light array from `computeLights`.

---

## Unreal / VR porting notes

- Export the same weight functions in Blueprints or C++ alongside the lexicon DataTable lookup.
- **Equal weight**: sum emotion columns × confidence for all tokens in the room.
- **Recency weighted**: maintain an ordered list of placed words; apply `0.7 ^ (n - 1 - index)` before summing.
- **Scoreboard**: map `roomWords[0..7]` directly to eight light actors; color each from that row’s six emotion scores.
- **Sliding window**: map `roomWords[-8:]` right-aligned into slots 1–8; slot 8 is always the newest word.
- Connecting words (`Sources = connecting`) have low confidence and flat scores, so they barely move lights under aggregate strategies and appear as faint neutral slots on slot-based strategies.
