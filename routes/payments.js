const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const flutterwave = require('../flutterwave');
const { encrypt } = require('../encryption');

router.post('/charge-card', async (req, res) => {
  try {
    const { pan, cvv, expiry_month, expiry_year, pin, amount, currency, email, phone_number, fullname, description, payment_type } = req.body;

    if (!pan || !cvv || !expiry_month || !expiry_year || !amount || !email) {
      return res.status(400).json({
        error: true,
        message: 'Missing required fields'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        error: true,
        message: 'Amount must be greater than 0'
      });
    }

    const tx_ref = `SWIFTPOS-${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
    const transaction_id = uuidv4();

    console.log(`\n💳 New payment request: ${tx_ref}`);

    const chargePayload = {
      pan,
      cvv,
      expiry_month,
      expiry_year,
      pin,
      amount,
      currency: currency || 'NGN',
      email,
      phone_number,
      fullname: fullname || 'Customer',
      tx_ref,
      narration: description || 'SwiftPOS Payment',
      payment_type: payment_type || 'card_charge'
    };

    const result = await flutterwave.chargeCard(chargePayload);

    const cardLast4 = pan.slice(-4);
    const cardNetwork = detectNetwork(pan);
    const encrypted_pan = encrypt(pan);
    const encrypted_cvv = encrypt(cvv);

    await db.run(
      `INSERT INTO transactions (
        id, tx_ref, amount, currency, status, payment_method,
        card_last4, card_network, customer_email, customer_phone,
        customer_name, description, merchant_name,
        flutterwave_ref, flutterwave_response, encrypted_data, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transaction_id, tx_ref, amount, currency || 'NGN',
        result.success ? (result.status || 'PENDING') : 'FAILED',
        'CARD_CHARGE', cardLast4, cardNetwork, email, phone_number || '',
        fullname || 'Customer', description || '', process.env.MERCHANT_NAME,
        result.data?.data?.flw_ref || null,
        JSON.stringify(result.data || result),
        JSON.stringify({ pan: encrypted_pan, cvv: encrypted_cvv }),
        JSON.stringify({ payment_type, terminal_id: 'SW-2024-001' })
      ]
    );

    console.log(`✅ Transaction saved: ${transaction_id}`);

    return res.json({
      success: result.success,
      transaction_id,
      tx_ref,
      status: result.status || 'PENDING',
      data: result.data?.data || result,
      message: result.success ? 'Charge initiated successfully' : result.error
    });

  } catch (error) {
    console.error('❌ Payment error:', error);
    res.status(500).json({
      error: true,
      message: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.post('/verify-payment', async (req, res) => {
  try {
    const { tx_ref, transaction_id, flutterwave_ref } = req.body;

    if (!tx_ref && !transaction_id && !flutterwave_ref) {
      return res.status(400).json({
        error: true,
        message: 'Provide either tx_ref, transaction_id, or flutterwave_ref'
      });
    }

    let txn;
    if (tx_ref) {
      txn = await db.get('SELECT * FROM transactions WHERE tx_ref = ?', [tx_ref]);
    } else if (transaction_id) {
      txn = await db.get('SELECT * FROM transactions WHERE id = ?', [transaction_id]);
    } else if (flutterwave_ref) {
      txn = await db.get('SELECT * FROM transactions WHERE flutterwave_ref = ?', [flutterwave_ref]);
    }

    if (!txn) {
      return res.status(404).json({
        error: true,
        message: 'Transaction not found'
      });
    }

    console.log(`🔍 Verifying: ${txn.tx_ref}`);

    let verification;
    if (txn.flutterwave_ref) {
      verification = await flutterwave.verifyTransaction(txn.flutterwave_ref);
    } else {
      verification = await flutterwave.getTransactionByRef(txn.tx_ref);
    }

    if (verification.success && verification.status) {
      await db.run(
        'UPDATE transactions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [verification.status.toUpperCase(), txn.id]
      );
      console.log(`✅ Updated status: ${verification.status}`);
    }

    return res.json({
      success: true,
      transaction: {
        id: txn.id,
        tx_ref: txn.tx_ref,
        amount: txn.amount,
        currency: txn.currency,
        status: (verification.status || txn.status).toUpperCase(),
        card_last4: txn.card_last4,
        card_network: txn.card_network,
        customer_email: txn.customer_email,
        created_at: txn.created_at,
        updated_at: txn.updated_at
      },
      verification: verification.data?.data || verification.data
    });

  } catch (error) {
    console.error('❌ Verification error:', error);
    res.status(500).json({
      error: true,
      message: 'Verification failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.post('/refund', async (req, res) => {
  try {
    const { transaction_id, amount } = req.body;

    if (!transaction_id || !amount) {
      return res.status(400).json({
        error: true,
        message: 'Provide transaction_id and amount'
      });
    }

    const txn = await db.get('SELECT * FROM transactions WHERE id = ?', [transaction_id]);

    if (!txn) {
      return res.status(404).json({
        error: true,
        message: 'Transaction not found'
      });
    }

    if (!txn.flutterwave_ref) {
      return res.status(400).json({
        error: true,
        message: 'Cannot refund - no Flutterwave reference'
      });
    }

    console.log(`💰 Processing refund: ${transaction_id}, Amount: ${amount}`);

    const refund = await flutterwave.refundTransaction(txn.flutterwave_ref, amount);

    if (refund.success) {
      await db.run(
        'UPDATE transactions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['REFUNDED', txn.id]
      );
      console.log(`✅ Refund processed successfully`);
    }

    return res.json({
      success: refund.success,
      message: refund.success ? 'Refund processed' : refund.error,
      data: refund.data
    });

  } catch (error) {
    console.error('❌ Refund error:', error);
    res.status(500).json({
      error: true,
      message: 'Refund failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/public-key', (req, res) => {
  res.json({
    success: true,
    public_key: flutterwave.getPublicKey(),
    encryption_key: flutterwave.getEncryptionKey(),
    environment: flutterwave.getEnvironment()
  });
});

function detectNetwork(pan) {
  if (/^4/.test(pan)) return 'VISA';
  if (/^5[1-5]/.test(pan)) return 'MASTERCARD';
  if (/^(34|37)/.test(pan)) return 'AMEX';
  if (/^6(011|22|4|5)/.test(pan)) return 'DISCOVER';
  if (/^35/.test(pan)) return 'JCB';
  if (/^3(0[0-5]|[68])/.test(pan)) return 'DINERS';
  if (/^(5061|5062|650|633)/.test(pan)) return 'VERVE';
  return 'UNKNOWN';
}

module.exports = router;
