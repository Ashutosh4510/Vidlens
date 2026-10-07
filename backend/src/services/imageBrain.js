const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const NodeCache = require('node-cache');

// Cache image analysis results for 2 hours
const analysisCache = new NodeCache({ stdTTL: 7200 });

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Analyse a product image using Google Gemini Vision API.
 * Extracts visual attributes to power search queries and scoring.
 */
async function analyzeProductImage(imageUrl, productTitle = '', productDescription = '') {
  const cacheKey = `analysis:${imageUrl || productTitle}`;
  const cached = analysisCache.get(cacheKey);
  if (cached) {
    logger.info('Image brain: cache hit', { key: cacheKey });
    return cached;
  }

  if (!config.geminiApiKey || config.geminiApiKey === 'your_gemini_api_key_here') {
    logger.info('Image brain: Gemini API key not configured, using heuristic visual analysis');
    const fallback = generateFallbackAnalysis(productTitle, productDescription);
    analysisCache.set(cacheKey, fallback);
    return fallback;
  }

  logger.info('Image brain: analyzing with Gemini Vision', { imageUrl, productTitle });

  const prompt = buildAnalysisPrompt(productTitle, productDescription);

  try {
    let parts = [{ text: prompt }];

    // If we have an image URL, include it
    if (imageUrl) {
      parts = [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: await fetchImageAsBase64(imageUrl),
          },
        },
        { text: prompt },
      ];
    }

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${config.geminiApiKey}`,
      {
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      },
      { timeout: 30000 }
    );

    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');

    const analysis = JSON.parse(text);
    const result = normalizeAnalysis(analysis, productTitle);

    analysisCache.set(cacheKey, result);
    logger.info('Image brain: analysis complete', { attributes: result.attributes });

    return result;
  } catch (error) {
    logger.error('Image brain: analysis failed', { error: error.message });
    // Fallback: generate basic analysis from title/description
    return generateFallbackAnalysis(productTitle, productDescription);
  }
}

/**
 * Score a video against the product analysis.
 * Compares video thumbnail/caption against product attributes.
 */
async function scoreVideo(video, productAnalysis) {
  try {
    const scores = [];
    const reasons = [];

    // 1. Caption/text relevance scoring
    const captionScore = scoreCaptionRelevance(video.caption, productAnalysis);
    scores.push(captionScore.score * 0.4); // 40% weight
    if (captionScore.reason) reasons.push(captionScore.reason);

    // 2. Keyword match scoring
    const keywordScore = scoreKeywordMatch(video.caption, productAnalysis);
    scores.push(keywordScore.score * 0.3); // 30% weight
    if (keywordScore.reason) reasons.push(keywordScore.reason);

    // 3. Visual similarity (thumbnail vs product image)
    let visualScore = { score: 50, reason: 'Visual comparison baseline' };
    if (video.thumbnailUrl && productAnalysis.imageUrl) {
      visualScore = await scoreVisualSimilarity(video.thumbnailUrl, productAnalysis);
      reasons.push(visualScore.reason);
    }
    scores.push(visualScore.score * 0.3); // 30% weight

    const totalScore = Math.round(scores.reduce((a, b) => a + b, 0));
    const matchReason = reasons.filter(Boolean).join('; ');

    return {
      matchScore: Math.min(100, Math.max(0, totalScore)),
      matchReason,
      isBelowThreshold: totalScore < config.matchThreshold,
    };
  } catch (error) {
    logger.error('Scoring failed', { error: error.message });
    return {
      matchScore: 30,
      matchReason: 'Scoring error - baseline score applied',
      isBelowThreshold: true,
    };
  }
}

/**
 * Score video thumbnail against product using Gemini Vision comparison
 */
async function scoreVisualSimilarity(thumbnailUrl, productAnalysis) {
  try {
    const thumbnailBase64 = await fetchImageAsBase64(thumbnailUrl);
    if (!thumbnailBase64) {
      return { score: 40, reason: 'Thumbnail unavailable for visual comparison' };
    }

    const parts = [
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: thumbnailBase64,
        },
      },
      {
        text: `You are comparing a video thumbnail to a product. The product is: "${productAnalysis.attributes?.productType || 'unknown'}" with these attributes:
- Colors: ${productAnalysis.attributes?.colors?.join(', ') || 'unknown'}
- Key features: ${productAnalysis.attributes?.keyFeatures?.join(', ') || 'unknown'}
- Brand/Logo: ${productAnalysis.attributes?.brand || 'unknown'}

Rate how likely this thumbnail shows this EXACT product (not just similar category) on a scale of 0-100.
Respond in JSON: {"score": <number>, "reason": "<one line explanation>"}`,
      },
    ];

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${config.geminiApiKey}`,
      {
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
        },
      },
      { timeout: 15000 }
    );

    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    const result = JSON.parse(text);
    return { score: result.score || 40, reason: result.reason || 'Visual comparison done' };
  } catch (error) {
    logger.debug('Visual scoring fallback', { error: error.message });
    return { score: 45, reason: 'Visual comparison unavailable' };
  }
}

// ─── Helper Functions ────────────────────────────────

function buildAnalysisPrompt(title, description) {
  return `Analyze this product image and extract structured visual attributes. If no image is provided, analyze based on the product information.

Product title: "${title || 'Unknown'}"
Product description: "${description || 'None provided'}"

Return a JSON object with these exact fields:
{
  "productType": "category of the product (e.g., t-shirt, chocolate bar, sneakers)",
  "colors": ["list of dominant colors"],
  "patterns": ["prints, graphics, patterns visible"],
  "brand": "brand name if visible or identifiable",
  "textOnProduct": ["any text/words visible on the product"],
  "material": "material type if identifiable (cotton, leather, plastic, etc.)",
  "shape": "general shape/form description",
  "keyFeatures": ["distinctive visual features that make this product unique"],
  "searchQueries": ["5-8 optimized search queries for finding videos of this exact product on social media"],
  "hashtags": ["10-15 relevant Instagram hashtags for finding videos of this product"],
  "metaAdKeywords": ["5-8 keywords optimized for Meta Ad Library search"]
}`;
}

function normalizeAnalysis(analysis, productTitle) {
  return {
    attributes: {
      productType: analysis.productType || productTitle,
      colors: analysis.colors || [],
      patterns: analysis.patterns || [],
      brand: analysis.brand || '',
      textOnProduct: analysis.textOnProduct || [],
      material: analysis.material || '',
      shape: analysis.shape || '',
      keyFeatures: analysis.keyFeatures || [],
    },
    searchQueries: analysis.searchQueries || [productTitle],
    hashtags: analysis.hashtags || [],
    metaAdKeywords: analysis.metaAdKeywords || [productTitle],
  };
}

function generateFallbackAnalysis(title, description) {
  const combined = `${title} ${description}`.toLowerCase();
  const words = title.split(/\s+/).filter((w) => w.length > 2);

  const COLOR_LIST = ['black', 'white', 'grey', 'gray', 'charcoal', 'navy', 'blue', 'red', 'green', 'olive', 'brown', 'beige', 'cream', 'pink', 'purple', 'yellow', 'gold', 'silver', 'dark'];
  const MATERIAL_LIST = ['cotton', 'denim', 'leather', 'wool', 'linen', 'polyester', 'silk', 'mesh', 'fleece', 'canvas', 'metal', 'plastic', 'glass', 'ceramic'];
  const PATTERN_LIST = ['graphic', 'oversized', 'minimalist', 'vintage', 'striped', 'floral', 'plaid', 'printed', 'solid', 'embroidered', 'tie-dye', 'camo'];
  const BRAND_LIST = ['nike', 'adidas', 'gymshark', 'zara', 'apple', 'sony', 'samsung', 'gucci', 'h&m', "levi's", 'lululemon', 'under armour', 'puma', 'dior', 'prada', 'supreme', 'stussy'];

  const foundColors = COLOR_LIST.filter((c) => combined.includes(c));
  const foundMaterials = MATERIAL_LIST.filter((m) => combined.includes(m));
  const foundPatterns = PATTERN_LIST.filter((p) => combined.includes(p));
  const foundBrand = BRAND_LIST.find((b) => combined.includes(b)) || '';

  return {
    attributes: {
      productType: title.split(/\s+/).slice(0, 3).join(' '),
      colors: foundColors.length > 0 ? foundColors : ['black', 'neutral'],
      patterns: foundPatterns.length > 0 ? foundPatterns : ['contemporary'],
      brand: foundBrand ? foundBrand.charAt(0).toUpperCase() + foundBrand.slice(1) : 'Original Brand',
      textOnProduct: words.slice(0, 3),
      material: foundMaterials[0] || 'premium blend',
      shape: 'standard form factor',
      keyFeatures: words.slice(0, 5),
    },
    searchQueries: [
      title,
      `${title} review`,
      `${title} unboxing`,
      `best ${title}`,
      `${title} haul`,
    ],
    hashtags: words.map((w) => `#${w.replace(/[^a-z0-9]/gi, '')}`).filter(Boolean).concat(['#productreview', '#viral', '#discovery']),
    metaAdKeywords: [title, ...words.slice(0, 4)],
  };
}

function scoreCaptionRelevance(caption, analysis) {
  if (!caption) return { score: 20, reason: 'No caption available' };

  const captionLower = caption.toLowerCase();
  const attrs = analysis.attributes || {};
  let matches = 0;
  let total = 0;
  const matched = [];

  // Check product type
  if (attrs.productType) {
    total++;
    if (captionLower.includes(attrs.productType.toLowerCase())) {
      matches++;
      matched.push('product type');
    }
  }

  // Check colors
  for (const color of (attrs.colors || [])) {
    total++;
    if (captionLower.includes(color.toLowerCase())) {
      matches++;
      matched.push(color);
    }
  }

  // Check brand
  if (attrs.brand) {
    total++;
    if (captionLower.includes(attrs.brand.toLowerCase())) {
      matches += 2;
      total++;
      matched.push(`brand: ${attrs.brand}`);
    }
  }

  // Check key features
  for (const feature of (attrs.keyFeatures || []).slice(0, 5)) {
    total++;
    if (captionLower.includes(feature.toLowerCase())) {
      matches++;
      matched.push(feature);
    }
  }

  const score = total > 0 ? Math.round((matches / total) * 100) : 20;
  const reason = matched.length > 0
    ? `Caption matches: ${matched.join(', ')}`
    : 'No attribute matches in caption';

  return { score: Math.min(100, score), reason };
}

function scoreKeywordMatch(caption, analysis) {
  if (!caption) return { score: 15, reason: '' };

  const captionLower = caption.toLowerCase();
  const queries = analysis.searchQueries || [];
  let bestMatch = 0;

  for (const query of queries) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const matchCount = queryWords.filter((w) => captionLower.includes(w)).length;
    const ratio = queryWords.length > 0 ? matchCount / queryWords.length : 0;
    bestMatch = Math.max(bestMatch, ratio);
  }

  const score = Math.round(bestMatch * 100);
  return {
    score,
    reason: score > 50 ? 'Strong keyword overlap with search queries' : '',
  };
}

async function fetchImageAsBase64(imageUrl) {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    return Buffer.from(response.data).toString('base64');
  } catch (error) {
    logger.debug('Image fetch failed', { url: imageUrl, error: error.message });
    return null;
  }
}

module.exports = { analyzeProductImage, scoreVideo, scoreVisualSimilarity };
