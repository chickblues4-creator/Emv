const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const { status, payment_method, limit = 100, offset = 0, email, start_date, end_date } = req.query;

    let query = 'SELECT * FROM transactions WHERE 1=1';
    let params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status.toUpperCase());
    }

    if (payment_method) {
      query += ' AND payment_method = ?';
      params.push(payment_method.toUpperCase());
    }

    if (email) {
      query += ' AND customer_email = ?';
      params.push(email);
    }

    if (start_date) {
      query += ' AND DATE(created_at) >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND DATE(created_at) <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const transactions = await db.all(query, params);

    let countQuery = 'SELECT COUNT(*) as count FROM transactions WHERE 1=1';
    let countParams = [];
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status.toUpperCase());
    }
    if (payment_method) {
      countQuery += ' AND payment_method = ?';
      countParams.push(payment_method.toUpperCase());
    }
    if (email) {
      countQuery += ' AND customer_email = ?';
      countParams.push(email);
    }
    if (start_date) {
      countQuery += ' AND DATE(created_at) >= ?';
      countParams.push(start_date);
    }
    if (end_date) {
      countQuery += ' AND DATE(created_at) <= ?';
      countParams.push(end_date);
    }

    const countResult = await db.get(countQuery, countParams);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: countResult.count
      }
    });

  } catch (error) {
    console.error('❌ Transactions fetch error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to fetch transactions'
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const txn = await db.get(
      'SELECT * FROM transactions WHERE id = ? OR tx_ref = ?',
      [id, id]
    );

    if (!txn) {
      return res.status(404).json({
        error: true,
        message: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      data: txn
    });

  } catch (error) {
    console.error('❌ Transaction fetch error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to fetch transaction'
    });
  }
});

router.get('/summary/daily', async (req, res) => {
  try {
    const { date } = req.query;
    const dateStr = date || new Date().toISOString().split('T')[0];

    const summary = await db.get(`
      SELECT
        COUNT(*) as total_transactions,
        SUM(amount) as total_amount,
        COUNT(CASE WHEN status = 'SUCCESSFUL' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'DECLINED' THEN 1 END) as declined_count,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_count
      FROM transactions
      WHERE DATE(created_at) = ?
    `, [dateStr]);

    res.json({
      success: true,
      date: dateStr,
      data: summary || {
        total_transactions: 0,
        total_amount: 0,
        approved_count: 0,
        declined_count: 0,
        pending_count: 0
      }
    });

  } catch (error) {
    console.error('❌ Summary error:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to fetch summary'
    });
  }
});

module.exports = router;
