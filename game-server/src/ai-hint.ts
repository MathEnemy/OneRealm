// ai-hint.ts — Mock AI Mentor (ADR-011: rule-based, no LLM call)
// CONTRACTS.md: POST /api/ai-hint contract
// Pitch narrative: "powered by OnePredict — Phase 2 connects to full model"

export interface AiHintResult {
  hint:               string;
  readiness:          number;  // 0-100
  recommended_quest:  string;  // "forest" | "training"
}

/**
 * Generate AI mentor hint based on hero stats.
 * ADR-011: Rule-based mock — instant sync response (<100ms).
 * CONTRACTS.md formula: readiness = min(100, round((heroPower / 50) * 100))
 */
export function getAiHint(heroPower: number, equippedSlots: number): AiHintResult {
  // CONTRACTS.md: readiness formula
  const readiness = Math.min(100, Math.round((heroPower / 50) * 100));

  if (readiness >= 70) {
    return {
      hint: `Hero ready (${readiness}%). Recommend Forest Quest for rare loot drop.`,
      readiness,
      recommended_quest: 'forest',
    };
  }

  // Suggest equipping missing slots
  let missing: string;
  if (equippedSlots === 0) {
    missing = 'weapon + armor';
  } else if (equippedSlots === 1) {
    missing = 'the remaining slot';
  } else {
    missing = 'better equipment';
  }

  return {
    hint: `Equip ${missing} first. Power ${heroPower}/50 needed for optimal readiness.`,
    readiness,
    recommended_quest: 'training',
  };
}
