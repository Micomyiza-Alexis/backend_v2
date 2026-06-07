const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const auth = require('../middleware/authenticate');

router.post('/initiate', auth, paymentController.initiatePayment);
router.post('/webhook', paymentController.webhook);
router.get('/:paymentId/status', auth, paymentController.getPaymentStatus);
router.post('/:paymentId/cancel', auth, paymentController.cancelPayment);

module.exports = router;
