"""Build emotion lexicon CSVs from dair and borealis datasets for Unreal Blueprints."""

from __future__ import annotations

import argparse
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

EMOTIONS = ("joy", "sadness", "anger", "fear", "love", "surprise")

NRC_TO_SIX = {
    "joy": "joy",
    "sadness": "sadness",
    "anger": "anger",
    "fear": "fear",
    "surprise": "surprise",
    "trust": "love",
    "anticipation": "surprise",
    "disgust": "anger",
}

FEEL_PATTERN = re.compile(
    r"i feel (?:so |really |very |quite |pretty |a little |kind of |kinda )?"
    r"([a-z][a-z'-]{1,25})",
    re.I,
)

SKIP_WORDS = {
    "like", "that", "as", "when", "because", "if", "the", "a", "an", "my", "your",
    "this", "it", "im", "ive", "i", "me", "so", "very", "really", "just", "all",
    "more", "less", "not", "no", "yes", "good", "bad", "well", "now", "then",
    "there", "here", "one", "two", "some", "any", "much", "many", "way", "thing",
    "things", "people", "person", "time", "day", "days", "life", "lot", "bit",
    "kind", "sort", "type", "need", "want", "going", "get", "got", "make", "made",
    "think", "thought", "know", "knew", "say", "said", "see", "saw", "go", "went",
    "come", "came", "take", "took", "give", "gave", "keep", "kept", "let", "put",
    "try", "tried", "use", "used", "find", "found", "tell", "told", "ask", "asked",
    "work", "worked", "seem", "seemed", "look", "looked", "sound", "sounded",
    "be", "been", "being", "am", "is", "are", "was", "were", "do", "does", "did",
    "done", "have", "has", "had", "will", "would", "can", "could", "should", "must",
    "may", "might", "about", "for", "and", "its", "completely",
}

MANUAL_WORDS: dict[str, str] = {
    "happy": "joy",
    "glad": "joy",
    "excited": "joy",
    "cheerful": "joy",
    "delighted": "joy",
    "peaceful": "joy",
    "calm": "joy",
    "content": "joy",
    "sad": "sadness",
    "depressed": "sadness",
    "lonely": "sadness",
    "miserable": "sadness",
    "gloomy": "sadness",
    "angry": "anger",
    "furious": "anger",
    "irritated": "anger",
    "rage": "anger",
    "hate": "anger",
    "afraid": "fear",
    "scared": "fear",
    "anxious": "fear",
    "nervous": "fear",
    "terrified": "fear",
    "worried": "fear",
    "love": "love",
    "loving": "love",
    "adore": "love",
    "cherish": "love",
    "romantic": "love",
    "surprised": "surprise",
    "shocked": "surprise",
    "amazed": "surprise",
    "astonished": "surprise",
    "wow": "surprise",
}


@dataclass
class WordStats:
    emotion_counts: Counter = field(default_factory=Counter)
    dair_occurrences: int = 0
    borealis_occurrences: int = 0
    valence_sum: float = 0.0
    arousal_sum: float = 0.0
    dominance_sum: float = 0.0
    vad_count: int = 0


def normalize_word(raw: str) -> str | None:
    word = raw.lower().strip("' -")
    if not word or word in SKIP_WORDS or not word.isalpha():
        return None
    return word


def extract_dair_counts(df: pd.DataFrame) -> dict[str, WordStats]:
    stats: dict[str, WordStats] = defaultdict(WordStats)

    for text, emotion in zip(df["text"], df["emotions"], strict=True):
        for match in FEEL_PATTERN.finditer(text):
            word = normalize_word(match.group(1))
            if word:
                stats[word].emotion_counts[emotion] += 1
                stats[word].dair_occurrences += 1

    for word, emotion in MANUAL_WORDS.items():
        stats[word].emotion_counts[emotion] += 50
        stats[word].dair_occurrences += 50

    return stats


def extract_borealis_counts(df: pd.DataFrame) -> dict[str, WordStats]:
    stats: dict[str, WordStats] = defaultdict(WordStats)

    for row in df.itertuples(index=False):
        word = normalize_word(str(row.t1_unified))
        if not word:
            continue

        emotion = NRC_TO_SIX.get(str(row.NRC_TopEmotion))
        if not emotion:
            continue

        entry = stats[word]
        entry.emotion_counts[emotion] += 1
        entry.borealis_occurrences += 1
        entry.valence_sum += float(row.NRC_valence)
        entry.arousal_sum += float(row.NRC_arousal)
        entry.dominance_sum += float(row.NRC_dominance)
        entry.vad_count += 1

    return stats


def merge_stats(
    dair_stats: dict[str, WordStats],
    borealis_stats: dict[str, WordStats],
) -> dict[str, WordStats]:
    merged: dict[str, WordStats] = defaultdict(WordStats)

    for source in (dair_stats, borealis_stats):
        for word, entry in source.items():
            target = merged[word]
            target.emotion_counts.update(entry.emotion_counts)
            target.dair_occurrences += entry.dair_occurrences
            target.borealis_occurrences += entry.borealis_occurrences
            target.valence_sum += entry.valence_sum
            target.arousal_sum += entry.arousal_sum
            target.dominance_sum += entry.dominance_sum
            target.vad_count += entry.vad_count

    return merged


def source_label(dair_occurrences: int, borealis_occurrences: int) -> str:
    if dair_occurrences and borealis_occurrences:
        return "both"
    if dair_occurrences:
        return "dair"
    return "borealis"


def build_rows(
    stats: dict[str, WordStats],
    min_occurrences: int,
    min_confidence: float,
    max_words: int | None,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []

    for word, entry in stats.items():
        total = sum(entry.emotion_counts.values())
        if total < min_occurrences:
            continue

        scores = {
            emotion: entry.emotion_counts.get(emotion, 0) / total
            for emotion in EMOTIONS
        }
        primary_emotion = max(scores, key=scores.get)
        confidence = scores[primary_emotion]
        if confidence < min_confidence:
            continue

        row: dict[str, object] = {
            "Word": word,
            "Joy": round(scores["joy"], 4),
            "Sadness": round(scores["sadness"], 4),
            "Anger": round(scores["anger"], 4),
            "Fear": round(scores["fear"], 4),
            "Love": round(scores["love"], 4),
            "Surprise": round(scores["surprise"], 4),
            "PrimaryEmotion": primary_emotion,
            "Confidence": round(confidence, 4),
            "Occurrences": total,
            "DairOccurrences": entry.dair_occurrences,
            "BorealisOccurrences": entry.borealis_occurrences,
            "Sources": source_label(entry.dair_occurrences, entry.borealis_occurrences),
        }

        if entry.vad_count:
            row["Valence"] = round(entry.valence_sum / entry.vad_count, 4)
            row["Arousal"] = round(entry.arousal_sum / entry.vad_count, 4)
            row["Dominance"] = round(entry.dominance_sum / entry.vad_count, 4)
        else:
            row["Valence"] = ""
            row["Arousal"] = ""
            row["Dominance"] = ""

        rows.append(row)

    rows.sort(
        key=lambda row: (row["Confidence"], row["Occurrences"]),
        reverse=True,
    )
    if max_words is not None:
        rows = rows[:max_words]
    return rows


def export_merged_lexicon(
    dair_path: Path,
    borealis_path: Path,
    output_path: Path,
    min_occurrences: int = 15,
    min_confidence: float = 0.65,
    max_words: int | None = None,
) -> pd.DataFrame:
    dair_df = pd.read_pickle(dair_path)
    borealis_df = pd.read_csv(borealis_path, low_memory=False)

    merged_stats = merge_stats(
        extract_dair_counts(dair_df),
        extract_borealis_counts(borealis_df),
    )
    rows = build_rows(merged_stats, min_occurrences, min_confidence, max_words)
    lexicon = pd.DataFrame(rows)
    lexicon.to_csv(output_path, index=False)
    return lexicon


def main() -> None:
    root = Path(__file__).parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dair-input",
        type=Path,
        default=root / "dair" / "merged_training.pkl",
    )
    parser.add_argument(
        "--borealis-input",
        type=Path,
        default=root / "borealis" / "CR4NarrEmote_t1Yes.csv",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "merged_emotion_lexicon.csv",
    )
    parser.add_argument("--min-occurrences", type=int, default=15)
    parser.add_argument("--min-confidence", type=float, default=0.65)
    parser.add_argument(
        "--max-words",
        type=int,
        default=0,
        help="Cap output size (0 = no cap).",
    )
    args = parser.parse_args()

    lexicon = export_merged_lexicon(
        args.dair_input,
        args.borealis_input,
        args.output,
        min_occurrences=args.min_occurrences,
        min_confidence=args.min_confidence,
        max_words=args.max_words or None,
    )

    print(f"Wrote {len(lexicon)} words to {args.output}")
    print()
    print("Sources:")
    print(lexicon["Sources"].value_counts().to_string())
    print()
    print("PrimaryEmotion:")
    print(lexicon["PrimaryEmotion"].value_counts().to_string())
    print()
    print(lexicon.head(12).to_string(index=False))


if __name__ == "__main__":
    main()
