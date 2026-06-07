const { pool } = require('../config/database');

const verifyPaymentOwnership = async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    const userId = req.userId;

    const result = await pool.query(
      'SELECT * FROM payments WHERE id = $1',
      [paymentId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    const payment = result.rows[0];

    if (payment.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to payment'
      });
    }

    req.payment = payment;
    next();

  } catch (error) {
    console.error('Payment verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Payment verification failed'
    });
  }
};

const requireValidPaymentStatus = (allowedStatuses = ['pending', 'waiting']) => {
  return (req, res, next) => {
    if (!req.payment) {
      return res.status(400).json({
        success: false,
        message: 'Payment data required'
      });
    }

    if (!allowedStatuses.includes(req.payment.status)) {
      return res.status(400).json({
        success: false,
        message: `Payment status must be one of: ${allowedStatuses.join(', ')}`
      });
    }

    next();
  };
};

module.exports = {
  verifyPaymentOwnership,
  requireValidPaymentStatus
};
