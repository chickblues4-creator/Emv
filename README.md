# SwiftPOS Payment Terminal Backend

A complete production-ready payment processing backend for SwiftPOS payment terminal with Flutterwave integration.

## ✨ Features

✅ **Card Payment Processing**
- Track 2 swipe processing
- Manual card entry
- PIN & CVV validation
- Card network detection (VISA, MASTERCARD, AMEX, etc)

✅ **Flutterwave Integration**
- Real-time payment charging
- Payment verification
- Refund processing
- Webhook handling with signature verification
- Bank account resolution

✅ **Security**
- Encryption of sensitive data (PAN, CVV)
- HTTPS support
- CORS protection
- Rate limiting
- Webhook signature verification
- Secure database transactions

✅ **Database**
- SQLite3 for transaction logging
- Webhook logging with verification status
- Transaction history and reporting
- Export to CSV

✅ **Multi-Platform Support**
- Web browser compatible
- Mobile app ready (React Native, Flutter, Electron)
- RESTful API
- CORS enabled

## 🚀 Quick Start

### Prerequisites
- Node.js 14+
- npm or yarn
- Flutterwave account

### Installation

```bash
# Clone the repository
git clone https://github.com/chickblues4-creator/Emv.git
cd Emv

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your Flutterwave credentials
nano .env

# Start development server
npm run dev

# Or production
npm start
```

## ⚙️ Configuration

Edit `.env` file with your Flutterwave credentials:

```env
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST_xxxxx
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST_xxxxx
FLUTTERWAVE_ENCRYPTION_KEY=FLWSECK_TESTxxxxx
FLUTTERWAVE_ENVIRONMENT=test
```

Get your keys from: https://dashboard.flutterwave.com

## 📡 API Endpoints

### Payment Processing

**POST /api/payments/charge-card**
Charge a card (Track 2 or manual)
```json
{
  "pan": "4111111111111111",
  "cvv": "123",
  "expiry_month": "12",
  "expiry_year": "25",
  "pin": "1234",
  "amount": 1000,
  "currency": "NGN",
  "email": "customer@example.com"
}
```

**POST /api/payments/verify-payment**
Verify payment status
```json
{
  "tx_ref": "SWIFTPOS-1234567890-ABC123"
}
```

**POST /api/payments/refund**
Refund a transaction
```json
{
  "transaction_id": "uuid-here",
  "amount": 1000
}
```

**GET /api/payments/public-key**
Get Flutterwave public key for frontend

### Transactions

**GET /api/transactions**
Get all transactions
- Query: `?status=SUCCESSFUL&limit=100&offset=0`

**GET /api/transactions/:id**
Get single transaction

**GET /api/transactions/summary/daily**
Daily transaction summary
- Query: `?date=2024-01-15`

### Health & Monitoring

**GET /api/health**
Server health check

**GET /api/health/db**
Database status

**GET /api/health/system**
System resources info

**GET /api/health/endpoints**
List all available endpoints

### Configuration

**GET /api/config**
Server configuration status

**GET /api/config/merchant**
Merchant information

**GET /api/config/flutterwave**
Flutterwave configuration status

**GET /api/config/validate**
Validate all required configurations

### Webhooks

**POST /webhook/flutterwave**
Flutterwave webhook endpoint (configured in Flutterwave dashboard)

**GET /webhook/logs**
Get webhook logs
- Query: `?tx_ref=SWIFTPOS-xxx&limit=50&offset=0`

## 🔧 Frontend Integration

### Initialize Backend Connection

```javascript
const API_BASE_URL = 'http://localhost:3000/api';

async function connectBackend() {
  const response = await fetch(`${API_BASE_URL}/health`);
  const data = await response.json();
  console.log('Backend connected:', data);
}
```

### Process Payment

```javascript
async function chargeCard(cardData) {
  const response = await fetch(`${API_BASE_URL}/payments/charge-card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pan: cardData.pan,
      cvv: cardData.cvv,
      expiry_month: cardData.expiry_month,
      expiry_year: cardData.expiry_year,
      pin: cardData.pin,
      amount: cardData.amount,
      currency: 'NGN',
      email: cardData.email
    })
  });
  
  return await response.json();
}
```

### Verify Payment

```javascript
async function verifyPayment(tx_ref) {
  const response = await fetch(`${API_BASE_URL}/payments/verify-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tx_ref })
  });
  
  return await response.json();
}
```

## 🔗 Webhook Setup

1. Go to Flutterwave Dashboard: https://dashboard.flutterwave.com
2. Navigate to Settings → Webhooks
3. Add URL: `https://yourdomain.com/webhook/flutterwave`
4. Set webhook secret in your `.env` file
5. Test webhook delivery

## 🚢 Deployment

### Heroku
```bash
heroku create swiftpos-backend
git push heroku main
heroku config:set FLUTTERWAVE_SECRET_KEY=xxxx
heroku open
```

### Railway
1. Push to GitHub
2. Connect Railway to your repo
3. Add environment variables in Railway dashboard
4. Deploy

### DigitalOcean / VPS
```bash
git clone <repo>
npm install
npm start &
```

## 🔐 Security Checklist

- [ ] Change all default secrets in `.env`
- [ ] Use HTTPS in production
- [ ] Enable encryption: `ENABLE_ENCRYPTION=true`
- [ ] Set strong webhook secrets (32+ characters)
- [ ] Never commit `.env` file
- [ ] Use environment variables for all secrets
- [ ] Enable rate limiting
- [ ] Test webhook signature verification
- [ ] Implement CORS properly for your domain

## 🐛 Troubleshooting

### Port Already in Use
```bash
lsof -ti:3000 | xargs kill -9
```

### Database Locked
```bash
rm transactions.db
npm start
```

### Flutterwave Connection Failed
- Check internet connection
- Verify API keys are correct
- Confirm environment (test vs live)
- Check Flutterwave dashboard status

### Webhook Not Triggering
- Verify webhook URL is accessible
- Check firewall/network settings
- Ensure webhook secret matches
- Test with webhook test endpoint

## 📚 Resources

- [Flutterwave Docs](https://developer.flutterwave.com)
- [Node.js Docs](https://nodejs.org)
- [Express.js Docs](https://expressjs.com)
- [SQLite Docs](https://www.sqlite.org)

## 📞 Support

- GitHub Issues: Report bugs and feature requests
- Email: support@swiftpos.app
- Flutterwave Support: https://support.flutterwave.com

## 📄 License

MIT License - See LICENSE file

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

**Made with ❤️ by SwiftPOS Team**

For questions or support, please visit our GitHub repository or contact support.
