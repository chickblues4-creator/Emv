const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const FW_BASE_URL = 'https://api.flutterwave.com/v3';
const FW_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;
const FW_PUBLIC_KEY = process.env.FLUTTERWAVE_PUBLIC_KEY;
const FW_ENCRYPTION_KEY = process.env.FLUTTERWAVE_ENCRYPTION_KEY;
const FW_ENVIRONMENT = process.env.FLUTTERWAVE_ENVIRONMENT || 'test';

// ─── AXIOS INSTANCE WITH AUTH ───
const flutterwaveClient = axios.create({
  baseURL: FW_BASE_URL,
  timeout: 30000,
  headers: {
    'Authorization': `Bearer ${FW_SECRET_KEY}`,
    'Content-Type': 'application/json'
  }
});

// ─── ERROR HANDLER ───
flutterwaveClient.interceptors.response.use(
  response => response,
  error => {
    console.error('❌ Flutterwave API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw error;
  }
);

// ─── CHARGE CARD (Track 2 or Manual Entry) ───
async function chargeCard(payload) {
  try {
    console.log('💳 Processing card charge...');

    const response = await flutterwaveClient.post('/charges?type=card', {
      card_number: payload.pan,
      cvv: payload.cvv || '000',
      expiry_month: payload.expiry_month,
      expiry_year: payload.expiry_year,
      currency: payload.currency || 'NGN',
      amount: payload.amount,
      email: payload.email,
      phone_number: payload.phone_number || '',
      fullname: payload.fullname || 'Customer',
      tx_ref: payload.tx_ref,
      narration: payload.narration || 'Payment',
      redirect_url: process.env.CALLBACK_URL,
      authorization: {
        mode: 'pin',
        pin: payload.pin || '1234'
      },
      meta: {
        source: 'SwiftPOS',
        terminal_id: 'SW-2024-001',
        type: payload.payment_type || 'card_charge'
      }
    });

    console.log('✅ Charge initiated:', response.data?.status);
    return {
      success: true,
      data: response.data,
      status: response.data?.status || response.data?.data?.status
    };
  } catch (error) {
    console.error('❌ Charge error:', error.response?.data?.message || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      code: error.response?.data?.code || 'CHARGE_FAILED',
      status: error.response?.status
    };
  }
}

// ─── VERIFY TRANSACTION ───
async function verifyTransaction(transactionId) {
  try {
    console.log('🔍 Verifying transaction:', transactionId);

    const response = await flutterwaveClient.get(`/transactions/${transactionId}/verify`);
    
    console.log('✅ Transaction verified:', response.data?.data?.status);
    return {
      success: true,
      data: response.data,
      status: response.data?.data?.status
    };
  } catch (error) {
    console.error('❌ Verification error:', error.response?.data?.message || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// ─── GET TRANSACTION BY REFERENCE ───
async function getTransactionByRef(tx_ref) {
  try {
    console.log('📋 Fetching transaction:', tx_ref);

    const response = await flutterwaveClient.get(`/transactions/verify_by_reference?tx_ref=${tx_ref}`);
    
    console.log('✅ Transaction fetched:', response.data?.data?.status);
    return {
      success: true,
      data: response.data,
      status: response.data?.data?.status
    };
  } catch (error) {
    console.error('❌ Fetch error:', error.response?.data?.message || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// ─── REFUND TRANSACTION ───
async function refundTransaction(transactionId, amount) {
  try {
    console.log('💰 Processing refund:', transactionId);

    const response = await flutterwaveClient.post(`/transactions/${transactionId}/refund`, {
      amount: amount
    });

    console.log('✅ Refund processed:', response.data?.status);
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    console.error('❌ Refund error:', error.response?.data?.message || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// ─── RESOLVE ACCOUNT ───
async function resolveAccount(accountNumber, bankCode) {
  try {
    console.log('🏦 Resolving account:', accountNumber);

    const response = await flutterwaveClient.get(
      `/accounts/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
    );

    console.log('✅ Account resolved:', response.data?.data?.account_name);
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    console.error('❌ Resolution error:', error.response?.data?.message || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// ─── GET BANKS LIST ───
async function getBanksList(country = 'NG') {
  try {
    const response = await flutterwaveClient.get(`/banks/${country}`);
    return {
      success: true,
      data: response.data?.data || []
    };
  } catch (error) {
    console.error('❌ Banks fetch error:', error.message);
    return {
      success: false,
      error: error.message,
      data: []
    };
  }
}

// ─── GET PUBLIC KEY ───
function getPublicKey() {
  return FW_PUBLIC_KEY;
}

// ─── GET ENCRYPTION KEY ───
function getEncryptionKey() {
  return FW_ENCRYPTION_KEY;
}

// ─── GET ENVIRONMENT ───
function getEnvironment() {
  return FW_ENVIRONMENT;
}

module.exports = {
  chargeCard,
  verifyTransaction,
  getTransactionByRef,
  refundTransaction,
  resolveAccount,
  getBanksList,
  getPublicKey,
  getEncryptionKey,
  getEnvironment
};
