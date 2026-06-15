export function getModelRecommendationBadges(modelRecommendation, options = {}) {
  if (!modelRecommendation) return [];
  const { includeOptional = false } = options;
  const badges = [];
  const addBadge = (label, value) => {
    if (!value) return;
    badges.push({ label, value });
  };

  addBadge('기본', modelRecommendation.defaultModel || modelRecommendation.openai || modelRecommendation.gemini);
  addBadge('비용', modelRecommendation.costTierLabel || modelRecommendation.costTier);
  addBadge(modelRecommendation.premiumModel ? '고품질' : '승격', modelRecommendation.premiumModel || modelRecommendation.escalationModel);
  if (includeOptional) {
    addBadge('직접', modelRecommendation.directOptional);
  }
  return badges;
}
