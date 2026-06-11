const crypto = require('crypto');
const dotenv = require('dotenv');
dotenv.config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_SALT || 'default-encryption-key-change-this-to-32-chars-min';
const IV_LENGTH = 16;
const ALGORITHM = 'aes-256-cbc';

function encrypt(text) {
  if (!text) return null;
  
  if (!process.env.ENABLE_ENCRYPTION || process.env.ENABLE_ENCRYPTION !== 'true') {
    return text;
  }

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  } catch (err) {
    console.error('❌ Encryption error:', err.message);
    return text;
  }
}

function decrypt(text) {
  if (!text) return null;
  
  if (!process.env.ENABLE_ENCRYPTION || process.env.ENABLE_ENCRYPTION !== 'true') {
    return text;
  }

  try {
    const parts = text.split(':');
    if (parts.length !== 2) return text;

    const iv = Buffer.from(parts[0], 'hex');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.error('❌ Decryption error:', err.message);
    return text;
  }
}

function hashWebhookPayload(payload, secret) {
  try {
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  } catch (err) {
    console.error('❌ Hash error:', err);
    return null;
  }
}

function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

module.exports = {
  encrypt,
  decrypt,
  hashWebhookPayload,
  generateToken
};
