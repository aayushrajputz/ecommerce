import express from 'express';
import asyncHandler from 'express-async-handler';
import { body, query, validationResult } from 'express-validator';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Cart from '../models/Cart.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
router.post('/', protect, [
  body('orderItems').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
  body('orderItems.*.product').isMongoId().withMessage('Invalid product ID'),
  body('orderItems.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('shippingAddress.name').notEmpty().withMessage('Shipping name is required'),
  body('shippingAddress.address').notEmpty().withMessage('Shipping address is required'),
  body('shippingAddress.city').notEmpty().withMessage('City is required'),
  body('shippingAddress.postalCode').notEmpty().withMessage('Postal code is required'),
  body('shippingAddress.country').notEmpty().withMessage('Country is required'),
  body('shippingAddress.phone').notEmpty().withMessage('Phone number is required'),
  body('paymentMethod').isIn(['stripe', 'razorpay', 'paypal', 'cash_on_delivery']).withMessage('Invalid payment method'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const {
    orderItems,
    shippingAddress,
    billingAddress,
    paymentMethod,
    couponCode,
    notes
  } = req.body;

  if (!orderItems || orderItems.length === 0) {
    res.status(400);
    throw new Error('No order items provided');
  }

  // Validate and calculate order details
  let itemsPrice = 0;
  const processedItems = [];

  for (const item of orderItems) {
    const product = await Product.findById(item.product);
    
    if (!product || !product.isActive) {
      res.status(404);
      throw new Error(`Product not found: ${item.product}`);
    }

    if (product.countInStock < item.quantity) {
      res.status(400);
      throw new Error(`Insufficient stock for product: ${product.name}`);
    }

    const itemTotal = product.price * item.quantity;
    itemsPrice += itemTotal;

    processedItems.push({
      product: product._id,
      name: product.name,
      image: product.images[0]?.url || '',
      price: product.price,
      quantity: item.quantity,
      variant: item.variant || null
    });
  }

  // Calculate tax (8%)
  const taxPrice = itemsPrice * 0.08;

  // Calculate shipping
  const shippingPrice = itemsPrice >= 100 ? 0 : 10;

  // Apply coupon discount (simplified logic)
  let discountAmount = 0;
  if (couponCode) {
    const coupons = {
      'SAVE10': { type: 'percentage', value: 10, minAmount: 50 },
      'SAVE20': { type: 'percentage', value: 20, minAmount: 100 },
      'FLAT15': { type: 'fixed', value: 15, minAmount: 75 }
    };

    const coupon = coupons[couponCode.toUpperCase()];
    if (coupon && itemsPrice >= coupon.minAmount) {
      if (coupon.type === 'percentage') {
        discountAmount = (itemsPrice * coupon.value) / 100;
      } else {
        discountAmount = coupon.value;
      }
    }
  }

  // Calculate total price
  const totalPrice = itemsPrice + taxPrice + shippingPrice - discountAmount;

  // Create order
  const order = new Order({
    user: req.user._id,
    orderItems: processedItems,
    shippingAddress,
    billingAddress: billingAddress || shippingAddress,
    paymentMethod,
    itemsPrice,
    taxPrice,
    shippingPrice,
    discountAmount,
    couponCode,
    totalPrice,
    notes,
    isPaid: paymentMethod === 'cash_on_delivery' ? false : false,
    status: 'pending'
  });

  const createdOrder = await order.save();

  // Update product stock
  for (const item of orderItems) {
    const product = await Product.findById(item.product);
    await product.updateStock(item.quantity, 'subtract');
  }

  // Clear user's cart after successful order
  try {
    await Cart.deleteOne({ user: req.user._id });
  } catch (error) {
    console.log('Error clearing cart:', error);
  }

  res.status(201).json({
    success: true,
    message: 'Order created successfully',
    order: createdOrder
  });
}));

// @desc    Get user orders
// @route   GET /api/orders
// @access  Private
router.get('/', protect, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('status').optional().isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).withMessage('Invalid status'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { page = 1, limit = 10, status } = req.query;

  const orders = await Order.getOrdersByUser(req.user._id, { page, limit, status });

  const totalOrders = await Order.countDocuments({ 
    user: req.user._id,
    ...(status && { status })
  });

  const totalPages = Math.ceil(totalOrders / limit);

  res.json({
    success: true,
    orders,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalOrders,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  });
}));

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email')
    .populate('orderItems.product', 'name images slug');

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Check if user owns the order or is admin
  if (order.user._id.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    res.status(403);
    throw new Error('Not authorized to access this order');
  }

  res.json({
    success: true,
    order
  });
}));

// @desc    Update order to paid
// @route   PUT /api/orders/:id/pay
// @access  Private
router.put('/:id/pay', protect, [
  body('paymentResult').isObject().withMessage('Payment result is required'),
  body('paymentResult.id').notEmpty().withMessage('Payment ID is required'),
  body('paymentResult.status').notEmpty().withMessage('Payment status is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Check if user owns the order
  if (order.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to access this order');
  }

  if (order.isPaid) {
    res.status(400);
    throw new Error('Order is already paid');
  }

  await order.updatePaymentStatus(req.body.paymentResult);

  res.json({
    success: true,
    message: 'Order paid successfully',
    order
  });
}));

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
router.put('/:id/cancel', protect, [
  body('reason').optional().isString().withMessage('Cancellation reason must be a string'),
], asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Check if user owns the order
  if (order.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to access this order');
  }

  try {
    await order.cancelOrder(req.body.reason || 'Cancelled by user', req.user._id);

    // Restore product stock
    for (const item of order.orderItems) {
      const product = await Product.findById(item.product);
      if (product) {
        await product.updateStock(item.quantity, 'add');
      }
    }

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
}));

// @desc    Get all orders (Admin)
// @route   GET /api/orders/admin/all
// @access  Private/Admin
router.get('/admin/all', protect, admin, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).withMessage('Invalid status'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { 
    page = 1, 
    limit = 20, 
    status, 
    sortBy = 'createdAt', 
    sortOrder = 'desc',
    startDate,
    endDate
  } = req.query;

  // Build filter
  const filter = {};
  if (status) filter.status = status;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  // Build sort
  const sort = {};
  sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

  // Pagination
  const skip = (page - 1) * limit;

  const orders = await Order.find(filter)
    .populate('user', 'name email')
    .populate('orderItems.product', 'name images')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const totalOrders = await Order.countDocuments(filter);
  const totalPages = Math.ceil(totalOrders / limit);

  res.json({
    success: true,
    orders,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalOrders,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  });
}));

// @desc    Update order status (Admin)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
router.put('/:id/status', protect, admin, [
  body('status').isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).withMessage('Invalid status'),
  body('trackingNumber').optional().isString().withMessage('Tracking number must be a string'),
  body('carrier').optional().isString().withMessage('Carrier must be a string'),
  body('note').optional().isString().withMessage('Note must be a string'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { status, trackingNumber, carrier, note } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Update order fields
  order.status = status;
  if (trackingNumber) order.trackingNumber = trackingNumber;
  if (carrier) order.carrier = carrier;

  // Add to status history
  order.statusHistory.push({
    status,
    timestamp: new Date(),
    note: note || `Status updated to ${status} by admin`,
    updatedBy: req.user._id
  });

  await order.save();

  res.json({
    success: true,
    message: 'Order status updated successfully',
    order
  });
}));

// @desc    Get order statistics (Admin)
// @route   GET /api/orders/admin/stats
// @access  Private/Admin
router.get('/admin/stats', protect, admin, [
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid date'),
], asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const stats = await Order.getOrderStats(startDate, endDate);

  // Get monthly revenue for the last 12 months
  const monthlyStats = await Order.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1))
        },
        isPaid: true
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        revenue: { $sum: '$totalPrice' },
        orders: { $sum: 1 }
      }
    },
    {
      $sort: {
        '_id.year': 1,
        '_id.month': 1
      }
    }
  ]);

  // Recent orders
  const recentOrders = await Order.find()
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({
    success: true,
    stats: {
      ...stats,
      monthlyStats,
      recentOrders
    }
  });
}));

// @desc    Track order by order number
// @route   GET /api/orders/track/:orderNumber
// @access  Public
router.get('/track/:orderNumber', asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber })
    .populate('orderItems.product', 'name images')
    .select('-user -paymentResult -billingAddress');

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  res.json({
    success: true,
    order: {
      orderNumber: order.orderNumber,
      status: order.status,
      statusHistory: order.statusHistory,
      orderItems: order.orderItems,
      shippingAddress: order.shippingAddress,
      totalPrice: order.totalPrice,
      trackingNumber: order.trackingNumber,
      carrier: order.carrier,
      estimatedDelivery: order.estimatedDelivery || order.defaultEstimatedDelivery,
      createdAt: order.createdAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt
    }
  });
}));

// @desc    Reorder (create new order from existing order)
// @route   POST /api/orders/:id/reorder
// @access  Private
router.post('/:id/reorder', protect, asyncHandler(async (req, res) => {
  const originalOrder = await Order.findById(req.params.id);

  if (!originalOrder) {
    res.status(404);
    throw new Error('Original order not found');
  }

  // Check if user owns the original order
  if (originalOrder.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to access this order');
  }

  // Check product availability
  const availableItems = [];
  for (const item of originalOrder.orderItems) {
    const product = await Product.findById(item.product);
    if (product && product.isActive && product.countInStock >= item.quantity) {
      availableItems.push({
        product: item.product,
        quantity: item.quantity,
        variant: item.variant
      });
    }
  }

  if (availableItems.length === 0) {
    res.status(400);
    throw new Error('No items from the original order are available');
  }

  // Create new order with available items
  const orderData = {
    orderItems: availableItems,
    shippingAddress: originalOrder.shippingAddress,
    billingAddress: originalOrder.billingAddress,
    paymentMethod: originalOrder.paymentMethod,
    notes: 'Reordered from order ' + originalOrder.orderNumber
  };

  // Use existing order creation logic
  req.body = orderData;
  
  // Redirect to order creation with validation disabled for this specific case
  return res.json({
    success: true,
    message: 'Reorder items prepared',
    availableItems,
    unavailableCount: originalOrder.orderItems.length - availableItems.length
  });
}));

export default router;