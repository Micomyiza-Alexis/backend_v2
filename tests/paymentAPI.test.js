const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const TEST_TOKEN = 'your_test_jwt_token_here';

const headers = {
  Authorization: `Bearer ${TEST_TOKEN}`,
  'Content-Type': 'application/json'
};

async function testPaymentFlow() {
  try {
    console.log('1. Testing Payment Initiation...');
    const initiateResponse = await axios.post(
      `${BASE_URL}/payments/initiate`,
      {
        ticketId: 'ticket-123',
        phoneNumber: '+250788123456',
        amount: 15000
      },
      { headers }
    );

    console.log('✓ Payment initiated:', initiateResponse.data);
    const paymentId = initiateResponse.data.payment.id;
    const txRef = initiateResponse.data.payment.tx_ref;

    console.log('\n2. Testing Payment Status Check...');
    const statusResponse = await axios.get(
      `${BASE_URL}/payments/${paymentId}/status`,
      { headers }
    );

    console.log('✓ Payment status:', statusResponse.data);

    console.log('\n3. Simulating Webhook (Success)...');
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || 'test-secret';
    const webhookResponse = await axios.post(
      `${BASE_URL}/payments/webhook`,
      {
        tx_ref: txRef,
        status: 'success',
        amount: 15000
      },
      {
        headers: {
          'X-Payment-Webhook-Secret': webhookSecret,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✓ Webhook processed:', webhookResponse.data);

    console.log('\n4. Checking Payment Status After Webhook...');
    const finalStatusResponse = await axios.get(
      `${BASE_URL}/payments/${paymentId}/status`,
      { headers }
    );

    console.log('✓ Final payment status:', finalStatusResponse.data);

    if (finalStatusResponse.data.payment.status === 'paid') {
      console.log('\n✓ Test passed: Payment flow completed successfully');
    } else {
      console.log('\n✗ Test failed: Payment not marked as paid');
    }

  } catch (error) {
    console.error('✗ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

async function testPaymentCancellation() {
  try {
    console.log('\nTesting Payment Cancellation...');

    console.log('1. Creating payment...');
    const initiateResponse = await axios.post(
      `${BASE_URL}/payments/initiate`,
      {
        ticketId: 'ticket-789',
        phoneNumber: '+250788654321',
        amount: 20000
      },
      { headers }
    );

    const paymentId = initiateResponse.data.payment.id;
    console.log('✓ Payment created:', paymentId);

    console.log('2. Cancelling payment...');
    const cancelResponse = await axios.post(
      `${BASE_URL}/payments/${paymentId}/cancel`,
      {},
      { headers }
    );

    console.log('✓ Payment cancelled:', cancelResponse.data);

    console.log('3. Checking payment status...');
    const statusResponse = await axios.get(
      `${BASE_URL}/payments/${paymentId}/status`,
      { headers }
    );

    if (statusResponse.data.payment.status === 'cancelled') {
      console.log('✓ Test passed: Payment cancellation works');
    }

  } catch (error) {
    console.error('✗ Cancellation test failed:', error.response?.data || error.message);
  }
}

async function runTests() {
  console.log('Starting Payment API Tests...\n');
  await testPaymentFlow();
  await testPaymentCancellation();
  console.log('\n✓ All tests completed');
}

runTests().catch(console.error);
