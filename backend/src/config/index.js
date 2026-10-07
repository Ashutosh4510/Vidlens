require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  apifyToken: process.env.APIFY_API_TOKEN,
  geminiApiKey: process.env.GEMINI_API_KEY,
  enableTiktok: process.env.ENABLE_TIKTOK === 'true',
  // Match score threshold - videos below this are marked as low confidence
  matchThreshold: 40,
  // Minimum videos per source
  minVideosPerSource: 20,
  // Timeouts
  apifyTimeoutSecs: 120,
  productFetchTimeoutMs: 15000,
};
