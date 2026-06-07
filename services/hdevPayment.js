const axios = require('axios');

const initiatePayment = async ({ phoneNumber, amount, txRef, callbackUrl }) => {
  try {
    const apiKey = process.env.HDEV_PAYMENT_API_KEY;
    const apiId = process.env.HDEV_PAYMENT_API_ID;
    const baseUrl = process.env.HDEV_PAYMENT_API_BASE_URL;

    if (!apiKey || !apiId || !baseUrl) {
      throw new Error('HDEV API credentials not configured');
    }

    const response = await axios.post(
      `${baseUrl}/initiate`,
      {
        phone: phoneNumber,
        amount: amount,
        tx_ref: txRef,
        callback_url: callbackUrl
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'X-API-ID': apiId,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    return {
      success: response.status === 200 || response.status === 201,
      provider_reference: response.data?.reference || response.data?.tx_ref || '',
      status: response.data?.status || 'pending'
    };

  } catch (error) {
    console.error('HDEV payment initiation error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

const getPaymentStatus = async (txRef) => {
  try {
    const apiKey = process.env.HDEV_PAYMENT_API_KEY;
    const apiId = process.env.HDEV_PAYMENT_API_ID;
    const baseUrl = process.env.HDEV_PAYMENT_API_BASE_URL;

    const response = await axios.get(
      `${baseUrl}/get-pay-status?tx_ref=${txRef}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'X-API-ID': apiId
        },
        timeout: 10000
      }
    );

    return {
      success: response.status === 200,
      status: response.data?.status || 'pending',
      amount: response.data?.amount
    };

  } catch (error) {
    console.error('HDEV status check error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  initiatePayment,
  getPaymentStatus
};
