import express from 'express';
import asyncHandler from 'express-async-handler';
import { body, validationResult } from 'express-validator';
import Stripe from 'stripe';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order.js';
import { protect } from '../middleware/authMiddleware.js';
import dotenv from 'dotenv'
dotenv.config();
const router = express.Router();

// Initialize payment gateways
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Test route to verify payment routes are loaded
router.get('/test', (req, res) => res.json({ ok: true }));

// @desc    Create Stripe payment intent
// @route   POST /api/payments/stripe/create-intent
// @access  Public (temporarily for demo)
router.post('/stripe/create-intent', [
  body('amount').isFloat({ min: 0.5 }).withMessage('Amount must be at least $0.50'),
  body('currency').optional().isIn(['usd', 'eur', 'gbp', 'cad', 'aud']).withMessage('Invalid currency'),
  body('orderId').isString().withMessage('Order ID is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { amount, currency = 'usd', orderId, paymentMethodTypes = ['card'] } = req.body;

  // Verify order exists
  // Populate user to get email
  const order = await Order.findById(orderId).populate('user', 'email');
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  if (order.isPaid) {
    res.status(400);
    throw new Error('Order is already paid');
  }

  // Get user email from populated user or fallback
  let userEmail = 'demo@example.com';
  let userId = '';
  if (order.user && order.user.email) {
    userEmail = order.user.email;
    userId = order.user._id ? order.user._id.toString() : '';
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        orderId: orderId,
        userId: userId,
        userEmail: userEmail
      },
      description: `Payment for Order #${order.orderNumber}`,
      receipt_email: userEmail,
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    });
  } catch (error) {
    console.error('Stripe payment intent creation failed:', error);
    res.status(500);
    throw new Error('Failed to create payment intent');
  }
}));

// @desc    Confirm Stripe payment
// @route   POST /api/payments/stripe/confirm
// @access  Private
router.post('/stripe/confirm', protect, [
  body('paymentIntentId').notEmpty().withMessage('Payment intent ID is required'),
  body('orderId').isMongoId().withMessage('Invalid order ID'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { paymentIntentId, orderId } = req.body;

  try {
    // Retrieve the payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      // Update order payment status
      const order = await Order.findById(orderId);
      
      if (!order) {
        res.status(404);
        throw new Error('Order not found');
      }

      if (order.user.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error('Not authorized to access this order');
      }

      await order.updatePaymentStatus({
        id: paymentIntent.id,
        status: paymentIntent.status,
        update_time: new Date().toISOString(),
        email_address: req.user.email,
        paymentMethod: 'stripe',
        transactionId: paymentIntent.id,
        currency: paymentIntent.currency
      });

      res.json({
        success: true,
        message: 'Payment confirmed successfully',
        order,
        paymentDetails: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency
        }
      });
    } else {
      res.status(400);
      throw new Error('Payment not completed');
    }
  } catch (error) {
    console.error('Stripe payment confirmation failed:', error);
    res.status(500);
    throw new Error('Failed to confirm payment');
  }
}));

// @desc    Create Razorpay order
// @route   POST /api/payments/razorpay/create-order
// @access  Public (temporarily for demo)
router.post('/razorpay/create-order', [
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be at least ₹1'),
  body('currency').optional().isIn(['INR']).withMessage('Currency must be INR for Razorpay'),
  body('orderId').isString().withMessage('Order ID is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { amount, currency = 'INR', orderId } = req.body;

  // DEMO: Skip order lookup and just create a Razorpay order
  try {
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Convert to paise
      currency: currency,
      receipt: `order_${orderId}`,
      notes: {
        orderId: orderId
      }
    });

    res.json({
      success: true,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Razorpay order creation failed:', error);
    res.status(500);
    throw new Error('Failed to create Razorpay order');
  }
}));

// @desc    Create Razorpay order
// @route   POST /api/payments/razorpay/order
// @access  Public
router.post('/razorpay/order', asyncHandler(async (req, res) => {
  const { amount } = req.body;
  try {
    const order = await razorpay.orders.create({
      amount: amount * 100, // amount in paise
      currency: 'INR',
      payment_capture: 1,
    });
    res.json({ orderId: order.id, key: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create Razorpay order' });
  }
}));

// @desc    Verify Razorpay payment
// @route   POST /api/payments/razorpay/verify
// @access  Private
router.post('/razorpay/verify', protect, [
  body('razorpayOrderId').notEmpty().withMessage('Razorpay order ID is required'),
  body('razorpayPaymentId').notEmpty().withMessage('Razorpay payment ID is required'),
  body('razorpaySignature').notEmpty().withMessage('Razorpay signature is required'),
  body('orderId').isMongoId().withMessage('Invalid order ID'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId } = req.body;

  try {
    // Verify signature
    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      res.status(400);
      throw new Error('Invalid payment signature');
    }

    // Get payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpayPaymentId);

    if (payment.status === 'captured') {
      // Update order payment status
      const order = await Order.findById(orderId);
      
      if (!order) {
        res.status(404);
        throw new Error('Order not found');
      }

      if (order.user.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error('Not authorized to access this order');
      }

      await order.updatePaymentStatus({
        id: payment.id,
        status: payment.status,
        update_time: new Date().toISOString(),
        email_address: req.user.email,
        paymentMethod: 'razorpay',
        transactionId: payment.id,
        currency: payment.currency
      });

      res.json({
        success: true,
        message: 'Payment verified successfully',
        order,
        paymentDetails: {
          id: payment.id,
          status: payment.status,
          amount: payment.amount / 100,
          currency: payment.currency
        }
      });
    } else {
      res.status(400);
      throw new Error('Payment not captured');
    }
  } catch (error) {
    console.error('Razorpay payment verification failed:', error);
    res.status(500);
    throw new Error('Failed to verify payment');
  }
}));

// @desc    Handle Stripe webhook
// @route   POST /api/payments/webhook/stripe
// @access  Public (webhook endpoint)
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('PaymentIntent succeeded:', paymentIntent.id);
      
      // Update order status
      try {
        if (paymentIntent.metadata.orderId) {
          const order = await Order.findById(paymentIntent.metadata.orderId);
          if (order && !order.isPaid) {
            await order.updatePaymentStatus({
              id: paymentIntent.id,
              status: 'succeeded',
              update_time: new Date().toISOString(),
              email_address: paymentIntent.metadata.userEmail,
              paymentMethod: 'stripe',
              transactionId: paymentIntent.id,
              currency: paymentIntent.currency
            });
            console.log(`Order ${order.orderNumber} marked as paid`);
          }
        }
      } catch (error) {
        console.error('Error updating order from webhook:', error);
      }
      break;
      
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('PaymentIntent failed:', failedPayment.id);
      // Handle failed payment (send notification, etc.)
      break;
      
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
}));

// @desc    Handle Razorpay webhook
// @route   POST /api/payments/webhook/razorpay
// @access  Public (webhook endpoint)
router.post('/webhook/razorpay', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  try {
    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (expectedSignature !== signature) {
      return res.status(400).send('Invalid signature');
    }

    const event = JSON.parse(req.body);

    switch (event.event) {
      case 'payment.captured':
        const payment = event.payload.payment.entity;
        console.log('Razorpay payment captured:', payment.id);
        
        // Update order status
        try {
          if (payment.notes && payment.notes.orderId) {
            const order = await Order.findById(payment.notes.orderId);
            if (order && !order.isPaid) {
              await order.updatePaymentStatus({
                id: payment.id,
                status: 'captured',
                update_time: new Date().toISOString(),
                email_address: payment.notes.userEmail,
                paymentMethod: 'razorpay',
                transactionId: payment.id,
                currency: payment.currency
              });
              console.log(`Order ${order.orderNumber} marked as paid`);
            }
          }
        } catch (error) {
          console.error('Error updating order from Razorpay webhook:', error);
        }
        break;
        
      case 'payment.failed':
        const failedPayment = event.payload.payment.entity;
        console.log('Razorpay payment failed:', failedPayment.id);
        // Handle failed payment
        break;
        
      default:
        console.log(`Unhandled Razorpay event ${event.event}`);
    }

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Razorpay webhook error:', error);
    res.status(500).send('Server Error');
  }
}));

// @desc    Get payment methods
// @route   GET /api/payments/methods
// @access  Public
router.get('/methods', asyncHandler(async (req, res) => {
  const paymentMethods = [
    {
      id: 'stripe',
      name: 'Credit/Debit Card',
      description: 'Pay securely with your credit or debit card',
      supported_currencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
      fees: 'Processing fee: 2.9% + $0.30',
      icon: 'credit-card',
      enabled: !!process.env.STRIPE_SECRET_KEY
    },
    {
      id: 'razorpay',
      name: 'UPI / Cards / Wallets',
      description: 'Pay with UPI, cards, or digital wallets',
      supported_currencies: ['INR'],
      fees: 'Processing fee varies by payment method',
      icon: 'mobile-payment',
      enabled: !!process.env.RAZORPAY_KEY_ID
    },
    {
      id: 'cash_on_delivery',
      name: 'Cash on Delivery',
      description: 'Pay when your order is delivered',
      supported_currencies: ['USD', 'INR'],
      fees: 'No processing fee',
      icon: 'cash',
      enabled: true
    }
  ];

  res.json({
    success: true,
    paymentMethods: paymentMethods.filter(method => method.enabled)
  });
}));

// @desc    Refund payment (Admin only)
// @route   POST /api/payments/refund
// @access  Private/Admin
router.post('/refund', protect, [
  body('orderId').isMongoId().withMessage('Invalid order ID'),
  body('amount').optional().isFloat({ min: 0.01 }).withMessage('Refund amount must be positive'),
  body('reason').optional().isString().withMessage('Reason must be a string'),
], asyncHandler(async (req, res) => {
  if (!req.user.isAdmin) {
    res.status(403);
    throw new Error('Admin access required');
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { orderId, amount, reason } = req.body;

  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  if (!order.isPaid) {
    res.status(400);
    throw new Error('Order is not paid, cannot refund');
  }

  if (!order.paymentResult || !order.paymentResult.transactionId) {
    res.status(400);
    throw new Error('Payment transaction ID not found');
  }

  try {
    let refund;
    const refundAmount = amount ? Math.round(amount * 100) : undefined;

    if (order.paymentResult.paymentMethod === 'stripe') {
      refund = await stripe.refunds.create({
        payment_intent: order.paymentResult.transactionId,
        amount: refundAmount,
        reason: 'requested_by_customer',
        metadata: {
          orderId: order._id.toString(),
          adminReason: reason || 'Admin refund'
        }
      });
    } else if (order.paymentResult.paymentMethod === 'razorpay') {
      refund = await razorpay.payments.refund(order.paymentResult.transactionId, {
        amount: refundAmount,
        notes: {
          orderId: order._id.toString(),
          reason: reason || 'Admin refund'
        }
      });
    } else {
      res.status(400);
      throw new Error('Refund not supported for this payment method');
    }

    // Update order status
    order.status = 'refunded';
    order.refundedAt = new Date();
    order.refundReason = reason || 'Refunded by admin';
    await order.save();

    res.json({
      success: true,
      message: 'Refund processed successfully',
      refund: {
        id: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
        currency: refund.currency
      },
      order
    });
  } catch (error) {
    console.error('Refund processing failed:', error);
    res.status(500);
    throw new Error('Failed to process refund');
  }
}));

export default router;