const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    flutterwave: {
      environment: process.env.FLUTTERWAVE_ENVIRONMENT,
      configured: !!(process.env.FLUTTERWAVE_PUBLIC_KEY && process.env.FLUTTERWAVE_SECRET_KEY)
    },
    version: '1.0.0'
  });
});

router.get('/db', async (req, res) => {
  try {
    const result = await db.get('SELECT COUNT(*) as count FROM transactions');
    const webhookLogs = await db.get('SELECT COUNT(*) as count FROM webhook_logs');

    res.json({
      success: true,
      database: 'connected',
      transactions_count: result.count,
      webhook_logs_count: webhookLogs.count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/endpoints', (req, res) => {
  const endpoints = [
    { method: 'GET', path: '/api/health', description: 'Health check' },
    { method: 'GET', path: '/api/config', description: 'Get configuration' },
    { method: 'POST', path: '/api/payments/charge-card', description: 'Charge a card' },
    { method: 'POST', path: '/api/payments/verify-payment', description: 'Verify payment' },
    { method: 'POST', path: '/api/payments/refund', description: 'Refund transaction' },
    { method: 'GET', path: '/api/payments/public-key', description: 'Get Flutterwave public key' },
    { method: 'GET', path: '/api/transactions', description: 'Get all transactions' },
    { method: 'GET', path: '/api/transactions/:id', description: 'Get single transaction' },
    { method: 'GET', path: '/api/transactions/summary/daily', description: 'Daily summary' },
    { method: 'POST', path: '/webhook/flutterwave', description: 'Flutterwave webhook' },
    { method: 'GET', path: '/webhook/logs', description: 'Get webhook logs' }
  ];

  res.json({
    success: true,
    total_endpoints: endpoints.length,
    endpoints
  });
});

router.get('/system', (req, res) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();

  res.json({
    success: true,
    system: {
      uptime_seconds: Math.floor(uptime),
      memory: {
        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024)
      },
      node_version: process.version,
      platform: process.platform,
      timestamp: new Date().toISOString()
    }
  });
});

module.exports = router;
