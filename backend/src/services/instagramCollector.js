const { ApifyClient } = require('apify-client');
const config = require('../config');
const logger = require('../utils/logger');
const { brandedProduct } = require('../utils/queryText');

let client = null;
if (config.apifyToken && config.apifyToken !== 'your_apify_api_token_here') {
  client = new ApifyClient({ token: config.apifyToken });
}

// Apify bills per result: ~10 reels from each of several hashtags gives enough candidates for scoring
// (48 per platform) without paying for results that are never scored.
const MAX_HASHTAGS_PER_RUN = 6;
const RESULTS_PER_HASHTAG = 10;

/**
 * Collect Instagram Reels using Apify's Instagram Hashtag scraper (resultsType: reels).
 * Searches hashtags derived from the image brain, then broadens to category-level
 * hashtags if fewer than minResults unique reels were found.
 */
async function collectInstagramReels(productAnalysis, existingHashes = new Set(), minResults = 20) {
  logger.info('Instagram collector: starting', {
    queries: productAnalysis.searchQueries?.length,
    hashtags: productAnalysis.hashtags?.length,
    hasToken: Boolean(client),
  });

  const allVideos = [];
  const seenUrls = new Set();

  if (!client) {
    logger.warn('Instagram collector: Apify token not configured, no reels collected');
    return allVideos;
  }

  const runHashtags = async (hashtags) => {
    if (hashtags.length === 0) return;

    try {
      logger.info('Instagram collector: querying Apify actor', { hashtags });

      const run = await client.actor('apify/instagram-hashtag-scraper').call(
        {
          hashtags,
          resultsType: 'reels',
          resultsLimit: RESULTS_PER_HASHTAG,
        },
        {
          timeout: config.apifyTimeoutSecs,
          memory: 512,
          log: null,
        }
      );

      const { items } = await client.dataset(run.defaultDatasetId).listItems();

      for (const item of items) {
        const isVideo = item.type === 'Video' || item.productType === 'clips' || Boolean(item.videoUrl);
        if (!isVideo || !item.shortCode) continue;

        const videoUrl = `https://www.instagram.com/reel/${item.shortCode}/`;
        if (seenUrls.has(videoUrl)) continue;
        seenUrls.add(videoUrl);

        allVideos.push({
          platform: 'instagram',
          platformVideoId: item.shortCode,
          videoUrl,
          thumbnailUrl: item.displayUrl || item.images?.[0] || null,
          caption: item.caption || '',
          author: item.ownerUsername || 'instagram_creator',
        });
      }
    } catch (error) {
      logger.warn('Instagram collector: Apify call error', { hashtags, error: error.message });
    }
  };

  const primary = buildInstagramHashtags(productAnalysis);
  await runHashtags(primary);

  // Shortfall: broaden to generic category hashtags. Any remaining deficit is
  // reported to the UI by the pipeline rather than padded with placeholder data.
  if (allVideos.length < minResults) {
    const broad = buildBroadHashtags(productAnalysis).filter((h) => !primary.includes(h));
    logger.info('Instagram collector: shortfall, broadening hashtags', {
      current: allVideos.length,
      target: minResults,
      broad,
    });
    await runHashtags(broad);
  }

  logger.info('Instagram collector: finished', { totalVideos: allVideos.length });
  return allVideos;
}

/**
 * Instagram hashtags only allow letters, digits and underscores.
 */
function toHashtag(text) {
  return (text || '')
    .toLowerCase()
    .replace(/^#/, '')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}_]/gu, '');
}

function uniqueHashtags(list) {
  return [...new Set(list.map(toHashtag).filter((h) => h.length >= 3))];
}

function buildInstagramHashtags(analysis) {
  const attrs = analysis.attributes || {};
  const candidates = [];

  if (analysis.hashtags?.length) {
    candidates.push(...analysis.hashtags.slice(0, 5));
  }

  if (attrs.brand && attrs.productType) {
    candidates.push(brandedProduct(attrs.brand, attrs.productType));
  }

  if (attrs.colors?.length && attrs.productType) {
    candidates.push(`${attrs.colors[0]} ${attrs.productType}`);
  }

  if (analysis.searchQueries?.length) {
    candidates.push(...analysis.searchQueries.slice(0, 3));
  }

  if (attrs.productType) {
    candidates.push(attrs.productType);
  }

  return uniqueHashtags(candidates).slice(0, MAX_HASHTAGS_PER_RUN);
}

/**
 * Generic category-level hashtags used only when specific ones fall short.
 */
function buildBroadHashtags(analysis) {
  const attrs = analysis.attributes || {};
  const candidates = [];

  if (attrs.productType) {
    const words = attrs.productType.toLowerCase().split(/\s+/).filter(Boolean);
    const lastWord = words[words.length - 1];
    candidates.push(lastWord, `${lastWord}review`, `${lastWord}haul`);
    if (words.length > 2) candidates.push(words.slice(-2).join(''));
  }

  if (attrs.brand) {
    candidates.push(attrs.brand);
  }

  return uniqueHashtags(candidates).slice(0, MAX_HASHTAGS_PER_RUN);
}

module.exports = { collectInstagramReels, buildInstagramHashtags, buildBroadHashtags };
