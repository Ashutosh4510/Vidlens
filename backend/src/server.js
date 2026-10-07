require('dotenv').config();

const express = require('express');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');

// Initialize database
require('./db/schema').getDb();

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(`${req.method} ${req.path}`, {
      status: res.statusCode,
      duration: `${Date.now() - start}ms`,
    });
  });
  next();
});

// Routes
app.use('/api/search', require('./routes/search'));
app.use('/api/history', require('./routes/history'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`, {
    env: config.nodeEnv,
    apifyConfigured: !!config.apifyToken,
    geminiConfigured: !!config.geminiApiKey,
    tiktokEnabled: config.enableTiktok,
  });
});

module.exports = app;
