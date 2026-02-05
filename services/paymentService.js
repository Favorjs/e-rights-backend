// server/services/paymentService.js
const axios = require('axios');

const baseUrl = process.env.VETROPAY_URL;

class PaymentService {
  async generateDynamic(txRef, amount) {
    const url = `${baseUrl}/v1/rest/generate-dynamic-transactional-account`;
    const authorization_token = process.env.VETROPAY_API_KEY;

    if (!authorization_token) {
      throw new Error('Missing Vetropay credentials: set VETROPAY_API_KEY');
    }

    const headers = {
      'Authorization': `Bearer ${authorization_token}`,
      'Content-Type': 'application/json'
    };

    const payload = {
      txRef: txRef,
      amount: amount.toString()
    };

    try {
      const res = await axios.post(url, payload, {
        headers,
        timeout: 20000
      });
      return res.data;
    } catch (err) {
      // Check for network or timeout errors
      let message = 'Vetropay deposit failed';
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
        message = 'Internet connection error. Please check your connection and try again.';
      } else {
        const responseData = err?.response?.data;
        message = responseData?.message || err.message || message;
      }
      const status = err?.response?.status;
      const data = err?.response?.data?.data ?? null;
      return {
        status: false,
        message,
        statusCode: status,
        data,
        errors: err?.response?.data?.errors
      };
    }
  }

  async queryDynamic(txRef) {
    const url = `${baseUrl}/v1/rest/nip-query-dynamic-deposit-account`;
    const authorization_token = process.env.VETROPAY_API_KEY;

    if (!authorization_token) {
      throw new Error('Missing Vetropay credentials: set VETROPAY_API_KEY');
    }

    const headers = {
      'Authorization': `Bearer ${authorization_token}`,
      'Content-Type': 'application/json'
    };

    const payload = {
      txRef: txRef
    };

    try {
      const res = await axios.post(url, payload, {
        headers,
        timeout: 20000
      });
      return res.data;
    } catch (err) {
      // Check for network or timeout errors
      let message = 'Query dynamic transactional failed';
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
        message = 'Internet connection error. Please check your connection and try again.';
      } else {
        const responseData = err?.response?.data;
        message = responseData?.message || err.message || message;
      }
      const status = err?.response?.status;
      const data = err?.response?.data?.data ?? null;
      return {
        status: false,
        message,
        statusCode: status,
        data,
        errors: err?.response?.data?.errors
      };
    }
  }
}

module.exports = new PaymentService();
