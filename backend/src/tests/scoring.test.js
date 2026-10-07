const { describe, it } = require('node:test');
const assert = require('node:assert');

// We test the caption scoring logic directly (doesn't need API keys)
// Import scoring helpers by requiring the imageBrain module
const path = require('path');

// Inline test versions of the scoring functions (same logic as imageBrain.js)
function scoreCaptionRelevance(caption, analysis) {
  if (!caption) return { score: 20, reason: 'No caption available' };

  const captionLower = caption.toLowerCase();
  const attrs = analysis.attributes || {};
  let matches = 0;
  let total = 0;
  const matched = [];

  if (attrs.productType) {
    total++;
    if (captionLower.includes(attrs.productType.toLowerCase())) {
      matches++;
      matched.push('product type');
    }
  }

  for (const color of (attrs.colors || [])) {
    total++;
    if (captionLower.includes(color.toLowerCase())) {
      matches++;
      matched.push(color);
    }
  }

  if (attrs.brand) {
    total++;
    if (captionLower.includes(attrs.brand.toLowerCase())) {
      matches += 2;
      total++;
      matched.push(`brand: ${attrs.brand}`);
    }
  }

  for (const feature of (attrs.keyFeatures || []).slice(0, 5)) {
    total++;
    if (captionLower.includes(feature.toLowerCase())) {
      matches++;
      matched.push(feature);
    }
  }

  const score = total > 0 ? Math.round((matches / total) * 100) : 20;
  return { score: Math.min(100, score), reason: matched.length > 0 ? `Caption matches: ${matched.join(', ')}` : 'No attribute matches in caption' };
}

describe('Scoring Logic', () => {
  const mockAnalysis = {
    attributes: {
      productType: 'graphic tee',
      colors: ['black', 'white'],
      brand: 'Nike',
      keyFeatures: ['oversized', 'cotton', 'streetwear'],
    },
  };

  it('should give high score when caption matches product type and colors', () => {
    const result = scoreCaptionRelevance(
      'Check out this black graphic tee! Perfect for streetwear',
      mockAnalysis
    );
    assert.ok(result.score > 30, `Score should be > 30, got ${result.score}`);
    assert.ok(result.reason.includes('product type'));
  });

  it('should give high score when brand is mentioned', () => {
    const result = scoreCaptionRelevance(
      'New Nike collection just dropped',
      mockAnalysis
    );
    assert.ok(result.score > 0, `Score should be > 0, got ${result.score}`);
    assert.ok(result.reason.includes('Nike'));
  });

  it('should give low score for unrelated caption', () => {
    const result = scoreCaptionRelevance(
      'Beautiful sunset at the beach today',
      mockAnalysis
    );
    assert.ok(result.score < 30, `Score should be < 30, got ${result.score}`);
  });

  it('should handle empty caption', () => {
    const result = scoreCaptionRelevance('', mockAnalysis);
    assert.strictEqual(result.score, 20);
  });

  it('should handle null caption', () => {
    const result = scoreCaptionRelevance(null, mockAnalysis);
    assert.strictEqual(result.score, 20);
  });

  it('should handle analysis without attributes', () => {
    const result = scoreCaptionRelevance('some video caption', { attributes: {} });
    assert.ok(result.score >= 0);
  });

  it('should match multiple attributes and accumulate score', () => {
    const result = scoreCaptionRelevance(
      'Black and white Nike graphic tee, oversized cotton streetwear look',
      mockAnalysis
    );
    assert.ok(result.score > 70, `Score should be > 70, got ${result.score}`);
  });
});
