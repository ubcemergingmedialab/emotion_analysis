# Dataset Processing

This document describes the two source datasets used in this repository and the processing pipeline that turns them into a merged emotion lexicon for local heuristic sentiment analysis (for example, driving room lighting in Unreal Engine without web requests).

## Overview

Neither source dataset is a ready-made word→emotion lookup table. Both are transformed by `export_lexicon.py` into a compact CSV where each row is one word with six normalized emotion scores.

| Output | Description |
|--------|-------------|
| `merged_emotion_lexicon.csv` | Combined lexicon from both datasets (primary output) |
| `emotion_lexicon.csv` | Earlier dair-only export (kept for reference) |

The six target emotions are: **joy**, **sadness**, **anger**, **fear**, **love**, **surprise**.

---

## Source 1: DAIR (`dair/`)

### What it is

The [CARER / Hugging Face emotion dataset](https://huggingface.co/datasets/emotion) — preprocessed Twitter-style text labeled with one of six emotions. Stored locally as `dair/merged_training.pkl`.

See `dair/README.md` for citation and upstream links.

### Raw structure

| Column | Type | Description |
|--------|------|-------------|
| `text` | string | Short first-person sentence, usually containing “i feel …” |
| `emotions` | string | Single label: `joy`, `sadness`, `anger`, `fear`, `love`, or `surprise` |

~416,809 rows. Average length ~19 words. Nearly all rows contain the word “feel”.

### Processing steps

1. **Pattern extraction** — A regex mines phrases matching `i feel [modifier] <word>` from each sentence. Modifiers like “so”, “really”, and “very” are skipped.

2. **Word normalization** — Extracted tokens are lowercased, stripped of punctuation, and filtered against a stopword list (function words, pronouns, and common verbs that are not emotion terms).

3. **Count aggregation** — Each extracted word increments a counter for the sentence’s emotion label. The same word can accumulate counts across multiple emotions if it appears in differently labeled sentences.

4. **Manual keyword boosts** — A small set of common emotion words (`happy`, `sad`, `angry`, `afraid`, `love`, etc.) receives a fixed +50 count toward their expected emotion so they appear in the lexicon even if the `i feel` pattern misses them.

5. **Score computation** — For each word, emotion scores are `count / total_counts` across the six emotions.

### Characteristics

- Strong coverage of informal, social-media phrasing (“i feel awful”, “i feel honoured”).
- Labels come directly from the dataset’s six-way schema — no remapping required.
- Does not provide valence / arousal / dominance (VAD) scores.

---

## Source 2: Borealis / CR4-NarrEmote (`borealis/`)

### What it is

[CR4-NarrEmote](https://borealisdata.ca/) — an open-vocabulary narrative emotion dataset built with citizen science (Zooniverse). Annotators read literary passages, highlight a **character**, and type what that character is feeling.

See `borealis/CR4NarrEmote_ReadMe.txt` for column definitions.

### Files used

| File | Rows | Used by pipeline |
|------|------|------------------|
| `CR4NarrEmote_All.csv` | ~209k | No — includes rows without emotion labels |
| `CR4NarrEmote_t1Yes.csv` | ~130k | **Yes** — only annotations with an emotion label |

### Raw structure (relevant columns)

| Column | Description |
|--------|-------------|
| `passage` | Literary text shown to annotators |
| `highlighted_char` | Character span highlighted (e.g. “She”, “her best child”) — not used for lexicon extraction |
| `t1` | Raw free-text emotion from annotator |
| `t1_unified` | Cleaned / normalized emotion term |
| `NRC_TopEmotion` | Discrete emotion from NRC + BERT mapping (8 categories) |
| `NRC_valence`, `NRC_arousal`, `NRC_dominance` | Lexical VAD scores |

### Processing steps

1. **Word selection** — Each row’s `t1_unified` field is treated as one emotion vocabulary term (e.g. `annoyed`, `hopeful`, `heartbroken`).

2. **Word normalization** — Same rules as dair: lowercase, alphabetic-only, stopword filtering.

3. **Emotion remapping (8 → 6)** — Borealis uses the NRC eight-emotion schema. `NRC_TopEmotion` is mapped to the six target emotions:

   | NRC label | Mapped to |
   |-----------|-----------|
   | joy | joy |
   | sadness | sadness |
   | anger | anger |
   | fear | fear |
   | surprise | surprise |
   | trust | love |
   | anticipation | surprise |
   | disgust | anger |

4. **Count aggregation** — Each `t1_unified` word increments the counter for its mapped emotion.

5. **VAD averaging** — NRC valence, arousal, and dominance values are summed per word and averaged in the final output (only present for words with borealis data).

### Characteristics

- ~1,880 unique `t1_unified` terms; richer narrative / literary vocabulary.
- Labels describe a **character’s** emotion in context, not arbitrary nouns in a passage.
- Passage text itself is **not** word-labeled — only the annotator’s emotion term is used.
- Some words are ambiguous across NRC categories (e.g. `confused`, `relief`, `shocked`).

---

## Merging both sources

`export_lexicon.py` combines dair and borealis before building the final CSV.

### Merge logic

For each word appearing in either source:

1. **Emotion counts are added** — If dair has `happy → joy: 547` and borealis has `happy → joy: 3005`, the merged count is 3552.
2. **Scores are recomputed** from the combined totals (not averaged from separate scores).
3. **Per-source counts** are tracked in `DairOccurrences` and `BorealisOccurrences`.
4. **VAD** is averaged from borealis rows only; dair-only words leave those columns blank.

### Quality filters (defaults)

| Parameter | Default | Effect |
|-----------|---------|--------|
| `min_occurrences` | 15 | Drop rare words |
| `min_confidence` | 0.65 | Drop words without a clear dominant emotion |
| `max_words` | none | Optional cap on output size |

### Output columns

| Column | Description |
|--------|-------------|
| `Word` | Lookup key (lowercase) |
| `Joy` … `Surprise` | Normalized emotion weights (0–1) |
| `PrimaryEmotion` | Highest-scoring emotion |
| `Confidence` | Score of `PrimaryEmotion` |
| `Occurrences` | Combined count across sources |
| `DairOccurrences` / `BorealisOccurrences` | Per-source counts |
| `Sources` | `dair`, `borealis`, or `both` |
| `Valence`, `Arousal`, `Dominance` | Mean NRC VAD from borealis (if available) |

### Typical merge results

With default settings, the merged lexicon contains roughly **560 words**:

- ~274 words present in both datasets
- ~158 dair-only
- ~129 borealis-only

---

## Regenerating the lexicon

From the repository root:

```bash
pip install pandas
python export_lexicon.py
```

Custom parameters:

```bash
python export_lexicon.py --min-occurrences 20 --min-confidence 0.75 --max-words 400
```

Input defaults:

- `dair/merged_training.pkl`
- `borealis/CR4NarrEmote_t1Yes.csv`

Output default: `merged_emotion_lexicon.csv`

---

## Using the lexicon

The CSV is designed for import into Unreal Engine as a **DataTable** or for lookup in Blueprints / C++:

1. Tokenize room text (split, lowercase).
2. Look up each token in the lexicon by `Word`.
3. Sum the six emotion floats across matched words.
4. Normalize totals and map to light color (and optionally use VAD for brightness / warmth).

For a detailed walkthrough of the hexagon viewer that visualizes this data, see the [repository README](../README.md).
