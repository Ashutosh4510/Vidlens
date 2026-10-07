const config = require('../config');
const logger = require('../utils/logger');
const { resolveProduct } = require('./productResolver');
const { analyzeProductImage, scoreVideo } = require('./imageBrain');
const { collectInstagramReels } = require('./instagramCollector');
const { collectMetaAds } = require('./metaAdCollector');
const { collectTikTokVideos } = require('./tiktokCollector');
const { deduplicateVideos, getDeficit } = require('./deduplicator');
const db = require('../db/queries');

// In-memory progress tracking per search
const progressMap = new Map();

function getProgress(searchId) {
  return progressMap.get(searchId) || { steps: [], status: 'unknown' };
}

function emitProgress(searchId, step, detail = '') {
  if (!progressMap.has(searchId)) {
    progressMap.set(searchId, { steps: [], status: 'processing' });
  }
  const progress = progressMap.get(searchId);
  const entry = { step, detail, timestamp: new Date().toISOString() };
  progress.steps.push(entry);
  progress.currentStep = step;
  progress.currentDetail = detail;

  // Notify SSE listeners
  const listeners = sseListeners.get(searchId) || [];
  for (const res of listeners) {
    try {
      res.write(`data: ${JSON.stringify({ type: 'progress', ...entry })}\n\n`);
    } catch (e) {}
  }
}

// SSE listener management
const sseListeners = new Map();

function addSSEListener(searchId, res) {
  if (!sseListeners.has(searchId)) {
    sseListeners.set(searchId, []);
  }
  sseListeners.get(searchId).push(res);

  // Send current progress
  const progress = progressMap.get(searchId);
  if (progress) {
    for (const step of progress.steps) {
      res.write(`data: ${JSON.stringify({ type: 'progress', ...step })}\n\n`);
    }
  }
}

function removeSSEListener(searchId, res) {
  const listeners = sseListeners.get(searchId) || [];
  const idx = listeners.indexOf(res);
  if (idx !== -1) listeners.splice(idx, 1);
}

function notifyComplete(searchId, result) {
  const listeners = sseListeners.get(searchId) || [];
  for (const res of listeners) {
    try {
      res.write(`data: ${JSON.stringify({ type: 'complete', ...result })}\n\n`);
    } catch (e) {}
  }
  // Clean up after a delay
  setTimeout(() => {
    progressMap.delete(searchId);
    sseListeners.delete(searchId);
  }, 60000);
}

/**
 * Main search pipeline. Runs asynchronously.
 * 
 * Flow:
 * 1. Resolve product (URL scraping or keyword)
 * 2. Analyze product image with Gemini Vision
 * 3. Collect videos from Instagram + Meta (parallel) + TikTok (optional)
 * 4. De-duplicate against history
 * 5. Score each video against product
 * 6. Store and return results
 */
async function runSearchPipeline(searchId, input) {
  try {
    emitProgress(searchId, 'resolving', 'Resolving product information...');

    // Step 1: Resolve product
    const product = await resolveProduct(input);
    
    db.updateSearch(searchId, {
      productTitle: product.title,
      productDescription: product.description,
      productImageUrl: product.imageUrl,
    });

    emitProgress(searchId, 'analyzing', 'Analyzing product with AI vision...');

    // Step 2: Analyze product image
    const analysis = await analyzeProductImage(
      product.imageUrl,
      product.title,
      product.description
    );

    db.updateSearch(searchId, {
      productAttributes: analysis.attributes,
    });

    // Add imageUrl to analysis for scoring
    analysis.imageUrl = product.imageUrl;

    emitProgress(searchId, 'collecting_instagram', 'Searching Instagram Reels...');
    emitProgress(searchId, 'collecting_meta', 'Searching Meta Ad Library...');

    // Step 3: Collect videos in parallel
    const MIN = config.minVideosPerSource;

    const [instagramRaw, metaRaw, tiktokRaw] = await Promise.allSettled([
      collectInstagramReels(analysis, db.getSeenVideoHashes('instagram'), MIN),
      collectMetaAds(analysis, db.getSeenVideoHashes('meta'), MIN),
      collectTikTokVideos(analysis, db.getSeenVideoHashes('tiktok')),
    ]);

    const instagramVideos = instagramRaw.status === 'fulfilled' ? instagramRaw.value : [];
    const metaVideos = metaRaw.status === 'fulfilled' ? metaRaw.value : [];
    const tiktokVideos = tiktokRaw.status === 'fulfilled' ? tiktokRaw.value : [];

    if (instagramRaw.status === 'rejected') {
      logger.error('Instagram collection failed', { error: instagramRaw.reason?.message });
      emitProgress(searchId, 'instagram_error', `Instagram: ${instagramRaw.reason?.message}`);
    }
    if (metaRaw.status === 'rejected') {
      logger.error('Meta collection failed', { error: metaRaw.reason?.message });
      emitProgress(searchId, 'meta_error', `Meta: ${metaRaw.reason?.message}`);
    }

    emitProgress(searchId, 'deduplicating', `De-duplicating ${instagramVideos.length + metaVideos.length + tiktokVideos.length} videos...`);

    // Step 4: De-duplicate
    const igDeduped = deduplicateVideos(instagramVideos, 'instagram');
    const metaDeduped = deduplicateVideos(metaVideos, 'meta');
    const tiktokDeduped = deduplicateVideos(tiktokVideos, 'tiktok');

    // Check deficits
    const igDeficit = getDeficit(igDeduped.length, MIN);
    const metaDeficit = getDeficit(metaDeduped.length, MIN);

    if (igDeficit > 0) {
      emitProgress(searchId, 'shortfall', `Instagram: ${igDeduped.length}/${MIN} videos. Shortfall of ${igDeficit} flagged.`);
    }
    if (metaDeficit > 0) {
      emitProgress(searchId, 'shortfall', `Meta: ${metaDeduped.length}/${MIN} videos. Shortfall of ${metaDeficit} flagged.`);
    }

    emitProgress(searchId, 'scoring', 'Scoring videos against product...');

    // Step 5: Score videos
    const scoredIG = await scoreVideoBatch(igDeduped, analysis);
    const scoredMeta = await scoreVideoBatch(metaDeduped, analysis);
    const scoredTiktok = await scoreVideoBatch(tiktokDeduped, analysis);

    emitProgress(searchId, 'saving', 'Saving results...');

    // Step 6: Store results
    db.insertVideos(searchId, scoredIG);
    db.insertVideos(searchId, scoredMeta);
    if (scoredTiktok.length > 0) {
      db.insertVideos(searchId, scoredTiktok);
    }

    // Update search record
    db.updateSearch(searchId, {
      status: 'completed',
      instagramCount: scoredIG.length,
      metaCount: scoredMeta.length,
      tiktokCount: scoredTiktok.length,
      completedAt: new Date().toISOString(),
    });

    const result = {
      searchId,
      instagram: scoredIG.length,
      meta: scoredMeta.length,
      tiktok: scoredTiktok.length,
      total: scoredIG.length + scoredMeta.length + scoredTiktok.length,
    };

    emitProgress(searchId, 'complete', `Found ${result.total} videos total`);
    notifyComplete(searchId, result);

    logger.info('Search pipeline complete', result);
    return result;

  } catch (error) {
    logger.error('Search pipeline failed', { searchId, error: error.message, stack: error.stack });
    
    db.updateSearch(searchId, {
      status: 'failed',
      errorMessage: error.message,
    });

    emitProgress(searchId, 'error', error.message);
    notifyComplete(searchId, { error: error.message });

    throw error;
  }
}

/**
 * Score a batch of videos. Processes in parallel with concurrency limit.
 */
async function scoreVideoBatch(videos, analysis, concurrency = 5) {
  const results = [];

  for (let i = 0; i < videos.length; i += concurrency) {
    const batch = videos.slice(i, i + concurrency);
    const scored = await Promise.all(
      batch.map(async (video) => {
        const score = await scoreVideo(video, analysis);
        return { ...video, ...score };
      })
    );
    results.push(...scored);
  }

  // Sort by match score descending
  results.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  return results;
}

module.exports = { runSearchPipeline, getProgress, addSSEListener, removeSSEListener };
