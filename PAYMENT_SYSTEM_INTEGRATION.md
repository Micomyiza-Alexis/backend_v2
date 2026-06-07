# HDEV Payment System Setup & Integration Guide

## System Overview

The SafariTix payment system uses HDEV as the mobile money payment provider with these components:

### Backend Components
- **Routes**: `backend_v2/routes/payment.js` - Defines payment endpoints
- **Controller**: `backend_v2/controllers/paymentController.js` - Handles payment logic
- **HDEV Service**: `backend_v2/services/hdevPayment.js` - HDEV API integration
- **Payment Gateway**: `backend_v2/services/paymentGatewayService.js` - Abstract payment provider layer
- **Middleware**: `backend_v2/middleware/authenticate.js` - JWT auth for payment endpoints

### Frontend Components
- **PaymentForm**: `project_safatiTix-developer/src/components/PaymentForm.jsx` - Payment UI
- **usePayment Hook**: `project_safatiTix-developer/src/hooks/usePayment.js` - Payment logic hook
- **CheckoutPage**: `project_safatiTix-developer/src/pages/CheckoutPage.jsx` - Checkout page
- **Payment Utils**: `project_safatiTix-developer/src/utils/paymentUtils.js` - Utility functions
- **Payment API**: `project_safatiTix-developer/src/services/paymentAPI.js` - API client

### Database
- **Schema**: `backend_v2/migrations/001_create_payments_table.sql`
- **Table**: `payments` - Stores payment records with status tracking

## API Endpoints

### 1. Initiate Payment
```
POST /api/payments/initiate
Authorization: Bearer {JWT_TOKEN}

Request:
{
  "booking_id": "uuid",
  "phone_number": "0788123456" | "+250788123456",
  "amount": 15000,
  "payment_method": "mobile_money"
}

Response (202):
{
  "success": true,
  "payment": {
    "id": "payment-uuid",
    "transaction_ref": "SAFARITIX_BOOKING_...",
    "amount": 15000,
    "status": "pending",
    "provider_reference": "HDEV_REF_123"
  },
  "message": "Payment request sent. Check your phone to confirm."
}
```

### 2. Check Payment Status
```
GET /api/payments/{paymentId}/status
Authorization: Bearer {JWT_TOKEN}

Response (200):
{
  "success": true,
  "payment": {
    "id": "payment-uuid",
    "status": "paid",
    "amount": 15000,
    "completed_at": "2025-02-15T10:30:00Z"
  },
  "ticket": {
    "id": "ticket-uuid",
    "booking_ref": "BK-ticket-ref",
    "seat_number": "A1",
    "status": "CONFIRMED",
    "qr_code": "..."
  }
}
```

### 3. Receive Webhook
```
POST /api/payments/webhook
X-Payment-Webhook-Secret: {PAYMENT_WEBHOOK_SECRET}

Request:
{
  "tx_ref": "SAFARITIX_BOOKING_...",
  "status": "success",
  "amount": 15000,
  "provider_reference": "HDEV_REF_123"
}

Response (200):
{
  "success": true,
  "payment": {
    "id": "payment-uuid",
    "status": "paid",
    "booking_status": "paid"
  }
}
```

### 4. Cancel Payment
```
POST /api/payments/{paymentId}/cancel
Authorization: Bearer {JWT_TOKEN}

Response (200):
{
  "success": true,
  "payment": {
    "id": "payment-uuid",
    "status": "cancelled"
  }
}
```

## Environment Configuration

Create/update `.env` file with:

```
# HDEV Payment Gateway
HDEV_PAYMENT_API_KEY=your_hdev_api_key
HDEV_PAYMENT_API_ID=your_hdev_api_id
HDEV_PAYMENT_API_BASE_URL=https://api.hdev.com/api/v1
HDEV_CALLBACK_URL=https://your-domain.com/api/payments/webhook

# Webhook Security
PAYMENT_WEBHOOK_SECRET=your_secure_random_secret_here

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/safaritix

# Environment
NODE_ENV=production

# Optional: Auto-confirm payments (development only)
AUTO_CONFIRM_PAYMENTS=false
```

## Installation Steps

### 1. Create Database Table
Run the migration file:
```bash
cd backend_v2
psql -d safaritix -f migrations/001_create_payments_table.sql
```

Or manually:
```sql
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  booking_id UUID REFERENCES bookings(id),
  transaction_ref VARCHAR(255) UNIQUE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(8) DEFAULT 'RWF',
  phone_or_card VARCHAR(255),
  payment_method VARCHAR(64),
  status VARCHAR(32) DEFAULT 'pending',
  booking_status VARCHAR(32) DEFAULT 'pending_payment',
  provider_name VARCHAR(64),
  provider_reference VARCHAR(255) UNIQUE,
  provider_status VARCHAR(64),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_transaction_ref ON payments(transaction_ref);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_booking_id ON payments(booking_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_provider_reference ON payments(provider_reference);
```

### 2. Backend Setup
```bash
cd backend_v2
npm install axios  # HDEV API client

# Create .env file with HDEV credentials
cp .env.example.payment .env
# Edit .env with actual HDEV credentials
```

### 3. Frontend Setup
```bash
cd project_safatiTix-developer
npm install axios  # Already in dependencies

# Ensure payment components are imported in your routes
```

### 4. Test Payment Flow
```bash
node backend_v2/tests/paymentAPI.test.js
```

## Payment Flow Diagram

```
Frontend                  Backend                 Database                HDEV API
   |                        |                         |                      |
   |--POST /payments/initiate-->|                      |                      |
   |                         |--validate booking----->|                      |
   |                         |--generate tx_ref------->|                      |
   |                         |--call HDEV initiate----------->|               |
   |                         |<--provider ref--<|               |
   |<--202 (pending)---------|                       |                      |
   |                         |--save payment------->|                      |
   |                         |<--saved----<|                      |
   |                         |                       |                      |
   | (Poll GET /status)      |                       |                      |
   |--GET /status------------>|                      |                      |
   |<--202 (still pending)---|                       |                      |
   |                         |                       |                      |
   |  [User enters PIN]      |                       |                      |
   |                         |                       |                      |
   |                         |<----------webhook (tx_ref, success)-----------|
   |                         |--find payment-------->|                      |
   |                         |<--found--<|                      |
   |                         |--create ticket------->|                      |
   |                         |--update payment------->|                      |
   |                         |<--updated--<|                      |
   |                         |--send email-------->|                      |
   |                         |--200 OK------------|                      |
   |                         |                       |                      |
   | (Poll GET /status)      |                       |                      |
   |--GET /status------------>|                      |                      |
   |<--200 (PAID)-------+--ticket details------------|                      |
   |                  [Success screen]              |                      |
```

## Key Security Features

### 1. HMAC Webhook Validation
Every webhook must include the correct `X-Payment-Webhook-Secret` header. Without it, the webhook is rejected.

```javascript
const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
const suppliedSecret = req.get('x-payment-webhook-secret');
if (suppliedSecret !== webhookSecret) {
  return res.status(401).json({ error: 'Invalid webhook secret' });
}
```

### 2. Amount Verification
The webhook amount must match the stored payment amount to prevent tampering.

```javascript
if (Number(webhookPayload.amount) !== Number(paymentRow.amount)) {
  throw new Error('Amount mismatch');
}
```

### 3. Idempotent Processing
The same webhook can be received multiple times (HDEV's retry logic). The system handles this by checking if the payment is already paid before creating duplicate tickets.

```javascript
if (getPaymentBookingStatus(paymentRow) === 'paid') {
  // Return success without creating duplicate tickets
  return res.json({ success: true });
}
```

### 4. Phone Number Validation
Only Rwanda mobile numbers are accepted (07xxxxxxxx or 2507xxxxxxxx format).

```javascript
const isSupportedRwandaMsisdn = (value) => /^2507\d{8}$/.test(String(value || ''));
```

### 5. Booking Hold Expiration
Payments automatically expire if not completed within the configured booking hold duration (default 7 minutes).

```javascript
if (paymentRow.expires_at && new Date(paymentRow.expires_at) <= now) {
  await finalizeFailedPayment(client, paymentRow, 'expired_before_payment');
}
```

## Frontend Integration

### Using the PaymentForm Component
```jsx
import PaymentForm from '@/components/PaymentForm';
import { usePayment } from '@/hooks/usePayment';

export function CheckoutPage() {
  const { payment, loading, error } = usePayment();

  return (
    <div>
      <OrderSummary />
      {!payment?.status || payment.status === 'cancelled' ? (
        <PaymentForm ticketId={ticketId} amount={amount} />
      ) : payment.status === 'pending' ? (
        <p>Processing payment... Please check your phone.</p>
      ) : payment.status === 'paid' ? (
        <SuccessMessage tickets={payment.tickets} />
      ) : (
        <ErrorMessage error={payment.error} />
      )}
    </div>
  );
}
```

### Using the usePayment Hook Directly
```jsx
import { usePayment } from '@/hooks/usePayment';

export function PaymentInitiator() {
  const { initiatePayment, checkPaymentStatus } = usePayment();

  const handlePay = async () => {
    try {
      const payment = await initiatePayment('ticket-123', '+250788123456', 15000);
      
      const success = await checkPaymentStatus(
        payment.id,
        (result) => console.log('Payment success:', result),
        (error) => console.log('Payment failed:', error),
        300000 // 5 minute timeout
      );

      if (success) {
        // Payment confirmed
        window.location.href = '/success';
      }
    } catch (error) {
      console.error('Payment error:', error);
    }
  };

  return <button onClick={handlePay}>Confirm & Pay</button>;
}
```

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] Environment variables are set correctly
- [ ] Payment initiation returns 202 with payment ID
- [ ] Phone number validation works for Rwanda numbers
- [ ] Payment status polling returns pending status
- [ ] Webhook with correct secret is accepted (200)
- [ ] Webhook without secret is rejected (401)
- [ ] Payment amount mismatch is rejected
- [ ] Duplicate webhooks don't create duplicate tickets
- [ ] Payment status reflects completion after webhook
- [ ] Frontend form submission initiates payment
- [ ] Frontend polling updates with payment status
- [ ] Success page shows ticket details
- [ ] Email is sent after successful payment
- [ ] Recovery from failed payments works

## Troubleshooting

### Payment initiate returns 500
- Check HDEV credentials in `.env`
- Verify DATABASE_URL is correct
- Check PostgreSQL connection

### Webhook not received
- Verify HDEV_CALLBACK_URL is publicly accessible
- Check firewall/VPN settings
- Monitor HDEV dashboard for retry logs
- Verify webhook secret matches

### Payment stuck on "pending"
- Check if webhook was received (check logs)
- Verify payment status polling is working
- Check if HDEV provider reference was stored
- Look for errors in database transactions

### Duplicate tickets created
- Ensure webhook HMAC validation is enabled
- Check for concurrent webhook calls
- Verify database transactions are properly rolled back on failure

## Performance Tuning

- Webhook status retrieval: indexed on `provider_reference` for O(1) lookup
- User payments: indexed on `user_id` for quick user history
- Status polling: optimized with connection pooling, queries timeout at 30s
- Frontend polling: 4-second intervals, 5-minute maximum timeout

## Monitoring

Check payment system health:
```bash
# Recent payments
psql -d safaritix -c "
  SELECT id, status, amount, created_at FROM payments 
  ORDER BY created_at DESC LIMIT 10;
"

# Failed payments
psql -d safaritix -c "
  SELECT id, status, failed_at FROM payments 
  WHERE status IN ('failed', 'cancelled') 
  ORDER BY failed_at DESC LIMIT 5;
"

# Pending payments (may be expired)
psql -d safaritix -c "
  SELECT id, status, expired_at FROM payments 
  WHERE status = 'pending' AND expires_at < NOW();
"
```

## Next Steps

1. Configure HDEV sandbox credentials first
2. Test in development environment using `AUTO_CONFIRM_PAYMENTS=true`
3. Migrate database schema
4. Deploy backend with HDEV production credentials
5. Test with real HDEV API calls
6. Monitor webhook delivery
7. Deploy frontend components
8. Run full end-to-end tests
