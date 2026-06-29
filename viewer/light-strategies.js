(function initLightStrategies(global) {
  const RECENCY_DECAY = 0.7;

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function hexToRgb(hex) {
    const value = Number.parseInt(hex.slice(1), 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    };
  }

  function lerpColor(fromHex, toHex, t) {
    const from = hexToRgb(fromHex);
    const to = hexToRgb(toHex);
    const r = Math.round(from.r + (to.r - from.r) * t);
    const g = Math.round(from.g + (to.g - from.g) * t);
    const b = Math.round(from.b + (to.b - from.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function blendEmotionColor(emotions, weights) {
    let r = 0;
    let g = 0;
    let b = 0;
    let total = 0;

    weights.forEach((weight, index) => {
      if (weight <= 0) {
        return;
      }
      const rgb = hexToRgb(emotions[index].color);
      r += rgb.r * weight;
      g += rgb.g * weight;
      b += rgb.b * weight;
      total += weight;
    });

    if (total === 0) {
      return "#3a3f4d";
    }

    return `rgb(${Math.round(r / total)}, ${Math.round(g / total)}, ${Math.round(b / total)})`;
  }

  function warmthColor(valence, emotionValues, maxScore) {
    const fallback =
      (emotionValues[0] + emotionValues[2] - emotionValues[1] - emotionValues[4]) / (maxScore * 2) + 0.5;
    const warmth = valence ?? fallback;
    return lerpColor("#4a7cff", "#f5c542", clamp01(warmth));
  }

  function lightOpacity(share) {
    return 0.06 + clamp01(share) * 0.94;
  }

  function findRow(rows, word) {
    return rows.find((entry) => entry.word === word);
  }

  function buildAggregate(weightedWords, emotionKeys) {
    if (weightedWords.length === 0) {
      return null;
    }

    const totals = Object.fromEntries(emotionKeys.map((key) => [key, 0]));
    let valenceSum = 0;
    let arousalSum = 0;
    let vadWeight = 0;
    let weightSum = 0;

    for (const { row, weight } of weightedWords) {
      if (weight <= 0) {
        continue;
      }

      weightSum += weight;

      for (const key of emotionKeys) {
        totals[key] += row.scores[key] * weight;
      }

      if (row.valence != null) {
        valenceSum += row.valence * weight;
        arousalSum += row.arousal * weight;
        vadWeight += weight;
      }
    }

    if (weightSum === 0) {
      return null;
    }

    const emotionValues = emotionKeys.map((key) => totals[key]);
    const totalEmotion = emotionValues.reduce((sum, value) => sum + value, 0);
    const maxScore = Math.max(...emotionValues, 0.001);

    return {
      emotionValues,
      shares: emotionValues.map((value) => (totalEmotion > 0 ? value / totalEmotion : 0)),
      maxScore,
      valence: vadWeight ? valenceSum / vadWeight : null,
      arousal: vadWeight ? arousalSum / vadWeight : null,
      wordCount: weightedWords.length,
    };
  }

  function mapAggregateToLights(aggregate, lightMeta, emotions) {
    if (!aggregate) {
      return lightMeta.map((meta) => ({
        color: "#3a3f4d",
        opacity: 0.08,
        label: meta.label,
      }));
    }

    const { emotionValues, shares, valence, arousal } = aggregate;

    return lightMeta.map((meta) => {
      if (meta.type === "emotion") {
        return {
          color: emotions[meta.index].color,
          opacity: lightOpacity(shares[meta.index]),
          label: meta.label,
        };
      }

      if (meta.type === "blend") {
        return {
          color: blendEmotionColor(emotions, shares),
          opacity: lightOpacity(Math.max(...shares)),
          label: meta.label,
        };
      }

      const warmth =
        arousal ?? (shares[0] + shares[2] - shares[1] - shares[4]) * 0.5 + 0.5;

      return {
        color: warmthColor(valence, emotionValues, aggregate.maxScore),
        opacity: lightOpacity(warmth),
        label: meta.label,
      };
    });
  }

  function wordScoreShares(row, emotionKeys) {
    return emotionKeys.map((key) => row.scores[key]);
  }

  function truncateLabel(text, maxLength = 9) {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength - 1)}…`;
  }

  function slotLightState(ctx, word, slotIndex) {
    const slotLabel = `${slotIndex + 1}`;

    if (!word) {
      return {
        color: "#3a3f4d",
        opacity: 0.08,
        label: slotLabel,
        ariaLabel: `Slot ${slotIndex + 1} empty`,
        empty: true,
      };
    }

    const row = findRow(ctx.rows, word);
    if (!row) {
      return {
        color: "#3a3f4d",
        opacity: 0.08,
        label: "?",
        ariaLabel: `Slot ${slotIndex + 1} unknown word`,
        empty: true,
      };
    }

    const shares = wordScoreShares(row, ctx.emotionKeys);

    return {
      color: blendEmotionColor(ctx.emotions, shares),
      opacity: lightOpacity(row.confidence),
      label: truncateLabel(word),
      ariaLabel: `Slot ${slotIndex + 1}: ${word} (${row.primaryEmotion})`,
      word,
      primaryEmotion: row.primaryEmotion,
      empty: false,
    };
  }

  function mapSlotWordsToLights(ctx, slotWords) {
    return slotWords.map((word, slotIndex) => slotLightState(ctx, word, slotIndex));
  }

  function mapScoreboardToLights(ctx) {
    const slotCount = ctx.lightMeta.length;
    const slotWords = Array.from({ length: slotCount }, (_, index) => ctx.roomWords[index] ?? null);
    return mapSlotWordsToLights(ctx, slotWords);
  }

  function mapSlidingWindowToLights(ctx) {
    const slotCount = ctx.lightMeta.length;
    const windowWords = ctx.roomWords.slice(-slotCount);
    const slotWords = Array.from({ length: slotCount - windowWords.length }, () => null).concat(windowWords);
    return mapSlotWordsToLights(ctx, slotWords);
  }

  function buildSlotReadout(lights, slotCount, { headline, overflow = 0, overflowNote = null }) {
    const filledCount = lights.filter((light) => !light.empty).length;

    if (filledCount === 0) {
      return {
        mode: "scoreboard",
        headline,
        slots: [],
        overflow: 0,
        overflowNote: null,
      };
    }

    const slots = lights
      .map((light, index) => ({
        slot: index + 1,
        word: light.word ?? null,
        emotion: light.primaryEmotion ?? null,
        color: light.color,
        empty: light.empty,
      }))
      .filter((slot) => !slot.empty);

    return {
      mode: "scoreboard",
      headline,
      slots,
      overflow,
      overflowNote,
    };
  }

  function collectWeightedWords(ctx, wordWeightFn) {
    const weightedWords = [];

    ctx.roomWords.forEach((word, index) => {
      const row = findRow(ctx.rows, word);
      if (!row) {
        return;
      }

      const weight = wordWeightFn(row, index, ctx.roomWords.length);
      if (weight > 0) {
        weightedWords.push({ row, weight });
      }
    });

    return weightedWords;
  }

  function emptyReadout() {
    return {
      mode: "aggregate",
      blendLabel: "Add words to preview how the eight lights respond to a combination.",
      dominantLabel: null,
      vadLabel: null,
    };
  }

  const equalWeightStrategy = {
    id: "equal-weight",
    label: "Equal weight",
    summary: "Every word in the room contributes equally, scaled only by lexicon confidence.",
    computeAggregate(ctx) {
      return buildAggregate(
        collectWeightedWords(ctx, (row) => row.confidence),
        ctx.emotionKeys,
      );
    },
    describeAggregate(aggregate, ctx) {
      if (!aggregate) {
        return emptyReadout();
      }

      const dominantIndex = aggregate.emotionValues.indexOf(Math.max(...aggregate.emotionValues));

      return {
        mode: "aggregate",
        blendLabel: `Equal-weight mix of ${ctx.roomWords.length} word${ctx.roomWords.length === 1 ? "" : "s"}`,
        dominantLabel: ctx.emotions[dominantIndex].label,
        vadLabel:
          aggregate.valence != null
            ? `V ${aggregate.valence.toFixed(2)} · A ${aggregate.arousal.toFixed(2)}`
            : null,
      };
    },
  };

  const recencyWeightedStrategy = {
    id: "recency-weighted",
    label: "Recency weighted",
    summary: "Recently added words influence the lights more; older words fade exponentially.",
    computeAggregate(ctx) {
      const count = ctx.roomWords.length;

      return buildAggregate(
        collectWeightedWords(ctx, (row, index) => {
          const recencyFactor = RECENCY_DECAY ** (count - 1 - index);
          return row.confidence * recencyFactor;
        }),
        ctx.emotionKeys,
      );
    },
    describeAggregate(aggregate, ctx) {
      if (!aggregate) {
        return emptyReadout();
      }

      const dominantIndex = aggregate.emotionValues.indexOf(Math.max(...aggregate.emotionValues));
      const newest = ctx.roomWords[ctx.roomWords.length - 1];

      return {
        mode: "aggregate",
        blendLabel: `Recency-weighted mix of ${ctx.roomWords.length} word${ctx.roomWords.length === 1 ? "" : "s"}`,
        dominantLabel: ctx.emotions[dominantIndex].label,
        newestLabel: newest,
        vadLabel:
          aggregate.valence != null
            ? `V ${aggregate.valence.toFixed(2)} · A ${aggregate.arousal.toFixed(2)}`
            : null,
      };
    },
  };

  const scoreboardStrategy = {
    id: "scoreboard",
    label: "Scoreboard",
    summary: "Eight fixed slots: each light shows one word in tray order (first word → slot 1).",
    usesAggregate: false,
    computeLights(ctx) {
      const lights = mapScoreboardToLights(ctx);
      const slotCount = ctx.lightMeta.length;
      const overflow = Math.max(0, ctx.roomWords.length - slotCount);

      return {
        aggregate: null,
        lights,
        readout: buildSlotReadout(lights, slotCount, {
          headline:
            ctx.roomWords.length === 0
              ? "Eight empty slots — add words to fill the board."
              : `${Math.min(ctx.roomWords.length, slotCount)} of ${slotCount} slots filled`,
          overflow,
          overflowNote:
            overflow > 0
              ? `${overflow} more word${overflow === 1 ? "" : "s"} in tray not shown (eight-slot limit).`
              : null,
        }),
      };
    },
  };

  const slidingWindowStrategy = {
    id: "sliding-window",
    label: "Sliding window",
    summary: "Eight slots showing the most recent words; oldest visible words roll off as new ones are added.",
    usesAggregate: false,
    computeLights(ctx) {
      const lights = mapSlidingWindowToLights(ctx);
      const slotCount = ctx.lightMeta.length;
      const hidden = Math.max(0, ctx.roomWords.length - slotCount);
      const visible = Math.min(ctx.roomWords.length, slotCount);

      return {
        aggregate: null,
        lights,
        readout: buildSlotReadout(lights, slotCount, {
          headline:
            ctx.roomWords.length === 0
              ? "Eight empty slots — add words to fill the window."
              : `Showing last ${visible} word${visible === 1 ? "" : "s"} (newest in slot ${slotCount})`,
          overflow: hidden,
          overflowNote:
            hidden > 0
              ? `${hidden} older word${hidden === 1 ? "" : "s"} rolled off the window.`
              : null,
        }),
      };
    },
  };

  const strategies = [
    equalWeightStrategy,
    recencyWeightedStrategy,
    scoreboardStrategy,
    slidingWindowStrategy,
  ];
  const strategyMap = Object.fromEntries(strategies.map((strategy) => [strategy.id, strategy]));

  global.LightStrategies = {
    all: strategies,
    defaultId: equalWeightStrategy.id,
    get(id) {
      return strategyMap[id] ?? equalWeightStrategy;
    },
    createContext(roomWords, rows, emotions, emotionKeys, lightMeta) {
      return { roomWords, rows, emotions, emotionKeys, lightMeta };
    },
    computeLights(strategy, ctx) {
      if (strategy.usesAggregate === false && strategy.computeLights) {
        return strategy.computeLights(ctx);
      }

      const aggregate = strategy.computeAggregate(ctx);
      return {
        aggregate,
        lights: mapAggregateToLights(aggregate, ctx.lightMeta, ctx.emotions),
        readout: strategy.describeAggregate(aggregate, ctx),
      };
    },
  };
})(window);
