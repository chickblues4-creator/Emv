const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../db');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function verifyWebhookSignature(req) {
  const signature = req.headers['verif-hash'];
  
  if (!signature) {
    console.warn('⚠️  No signature in webhook request');
    return false;
  }

  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  const isValid = hash === signature;
  console.log(`${isValid ? '✅' : '❌'} Webhook signature ${isValid ? 'VALID' : 'INVALID'}`);
  return isValid;
}

router.post('/flutterwave', async (req, res) => {
  try {
    const payload = req.body;
    const webhookId = uuidv4();

    console.log('\n📨 Webhook received from Flutterwave');
    console.log('Event:', payload.event);

    const isValid = verifyWebhookSignature(req);
    if (!isValid) {
      console.error('❌ Webhook signature verification failed');
    }

    const tx_ref = payload.data?.tx_ref || payload.txRef;
    const event = payload.event || 'charge.completed';
    const status = payload.data?.status;
    const flw_ref = payload.data?.flw_ref;

    console.log(`Transaction Ref: ${tx_ref}, Status: ${status}`);

    await db.run(
      `INSERT INTO webhook_logs (id, tx_ref, event_type, payload, verified, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        webhookId,
        tx_ref,
        event,
        JSON.stringify(payload),
        isValid ? 1 : 0,
        status || 'received'
      ]
    );

    if (tx_ref && status) {
      const updateFields = [status.toUpperCase()];
      let updateQuery = 'UPDATE transactions SET status = ?';

      if (flw_ref) {
        updateQuery += ', flutterwave_ref = ?';
        updateFields.push(flw_ref);
      }

      updateQuery += ', updated_at = CURRENT_TIMESTAMP WHERE tx_ref = ?';
      updateFields.push(tx_ref);

      await db.run(updateQuery, updateFields);

      console.log(`✅ Transaction ${tx_ref} updated to ${status}`);

      if (status === 'successful') {
        console.log('💰 PAYMENT SUCCESSFUL:', tx_ref);
      }

      if (status === 'failed' || status === 'declined') {
        console.log('❌ PAYMENT FAILED:', tx_ref);
      }

      if (status === 'pending') {
        console.log('⏳ PAYMENT PENDING:', tx_ref);
      }
    }

    res.json({
      success: true,
      message: 'Webhook received and processed',
      webhook_id: webhookId
    });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(200).json({
      success: false,
      message: 'Webhook processing failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const { tx_ref, event_type, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM webhook_logs WHERE 1=1';
    let params = [];

    if (tx_ref) {
      query += ' AND tx_ref = ?';
      params.push(tx_ref);
    }

    if (event_type) {
      query += ' AND event_type = ?';
      params.push(event_type);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const logs = await db.all(query, params);

    res.json({
      success: true,
      data: logs,
      count: logs.length
    });

  } catch (error) {
    console.error('❌ Webhook logs error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to fetch webhook logs'
    });
  }
});

module.exports = router;
