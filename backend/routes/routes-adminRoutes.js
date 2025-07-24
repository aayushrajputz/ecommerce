import express from 'express';
import asyncHandler from 'express-async-handler';
import { query, body, validationResult } from 'express-validator';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply admin middleware to all routes
router.use(protect);
router.use(admin);

// @desc    Get admin dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private/Admin
router.get('/dashboard', [
  query('period').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Period must be 7d, 30d, 90d, or 1y'),
], asyncHandler(async (req, res) => {
  const { period = '30d' } = req.query;

  // Calculate date range
  const now = new Date();
  let startDate;
  
  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default: // 30d
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // Get overview statistics
  const [
    totalUsers,
    totalProducts,
    totalOrders,
    totalRevenue,
    newUsersCount,
    newOrdersCount,
    lowStockProducts,
    recentOrders
  ] = await Promise.all([
    User.countDocuments({ isActive: true }),
    Product.countDocuments({ isActive: true }),
    Order.countDocuments(),
    Order.aggregate([
      { $match: { isPaid: true } },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]),
    User.countDocuments({ 
      createdAt: { $gte: startDate },
      isActive: true 
    }),
    Order.countDocuments({ 
      createdAt: { $gte: startDate } 
    }),
    Product.countDocuments({ 
      isActive: true,
      countInStock: { $lte: 5 }
    }),
    Order.find()
      .populate('user', 'name email')
      .populate('orderItems.product', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
  ]);

  // Get period revenue
  const periodRevenue = await Order.aggregate([
    { 
      $match: { 
        isPaid: true,
        createdAt: { $gte: startDate }
      } 
    },
    { $group: { _id: null, total: { $sum: '$totalPrice' } } }
  ]);

  // Get top selling products
  const topProducts = await Order.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    { $unwind: '$orderItems' },
    {
      $group: {
        _id: '$orderItems.product',
        totalSold: { $sum: '$orderItems.quantity' },
        revenue: { $sum: { $multiply: ['$orderItems.quantity', '$orderItems.price'] } },
        productName: { $first: '$orderItems.name' }
      }
    },
    { $sort: { totalSold: -1 } },
    { $limit: 5 }
  ]);

  // Get daily sales for chart
  const dailySales = await Order.aggregate([
    {
      $match: {
        isPaid: true,
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        sales: { $sum: '$totalPrice' },
        orders: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Get order status distribution
  const orderStatusDistribution = await Order.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  // Get user registration trend
  const userRegistrations = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        isActive: true
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.json({
    success: true,
    dashboard: {
      overview: {
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        newUsers: newUsersCount,
        newOrders: newOrdersCount,
        lowStockProducts,
        periodRevenue: periodRevenue[0]?.total || 0
      },
      charts: {
        dailySales,
        orderStatusDistribution,
        userRegistrations
      },
      topProducts,
      recentOrders,
      period
    }
  });
}));

// @desc    Get all users with pagination and search
// @route   GET /api/admin/users
// @access  Private/Admin
router.get('/users', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().withMessage('Search must be a string'),
  query('status').optional().isIn(['active', 'inactive', 'all']).withMessage('Status must be active, inactive, or all'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { 
    page = 1, 
    limit = 20, 
    search = '', 
    status = 'all',
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build filter
  const filter = {};
  
  if (status !== 'all') {
    filter.isActive = status === 'active';
  }

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  // Build sort
  const sort = {};
  sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

  // Pagination
  const skip = (page - 1) * limit;

  const users = await User.find(filter)
    .select('-password')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const totalUsers = await User.countDocuments(filter);
  const totalPages = Math.ceil(totalUsers / limit);

  res.json({
    success: true,
    users,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalUsers,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  });
}));

// @desc    Get user details
// @route   GET /api/admin/users/:id
// @access  Private/Admin
router.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('-password')
    .populate('wishlist', 'name price images');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Get user's order statistics
  const orderStats = await Order.aggregate([
    { $match: { user: user._id } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: '$totalPrice' },
        averageOrderValue: { $avg: '$totalPrice' }
      }
    }
  ]);

  // Get recent orders
  const recentOrders = await Order.find({ user: user._id })
    .select('orderNumber status totalPrice createdAt')
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({
    success: true,
    user,
    stats: orderStats[0] || {
      totalOrders: 0,
      totalSpent: 0,
      averageOrderValue: 0
    },
    recentOrders
  });
}));

// @desc    Update user status
// @route   PUT /api/admin/users/:id
// @access  Private/Admin
router.put('/users/:id', [
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  body('isAdmin').optional().isBoolean().withMessage('isAdmin must be a boolean'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { isActive, isAdmin } = req.body;

  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Prevent admin from deactivating themselves
  if (req.user._id.toString() === user._id.toString() && isActive === false) {
    res.status(400);
    throw new Error('Cannot deactivate your own account');
  }

  // Update user
  if (typeof isActive !== 'undefined') user.isActive = isActive;
  if (typeof isAdmin !== 'undefined') user.isAdmin = isAdmin;

  await user.save();

  res.json({
    success: true,
    message: 'User updated successfully',
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      isAdmin: user.isAdmin
    }
  });
}));

// @desc    Get all products for admin
// @route   GET /api/admin/products
// @access  Private/Admin
router.get('/products', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().withMessage('Search must be a string'),
  query('category').optional().isString().withMessage('Category must be a string'),
  query('status').optional().isIn(['active', 'inactive', 'all']).withMessage('Status must be active, inactive, or all'),
], asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    search = '', 
    category,
    status = 'all',
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build filter
  const filter = {};
  
  if (status !== 'all') {
    filter.isActive = status === 'active';
  }

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { brand: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } }
    ];
  }

  if (category) {
    filter.category = { $regex: category, $options: 'i' };
  }

  // Build sort
  const sort = {};
  sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

  // Pagination
  const skip = (page - 1) * limit;

  const products = await Product.find(filter)
    .select('name images price category brand countInStock rating numReviews isActive isFeatured createdAt')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const totalProducts = await Product.countDocuments(filter);
  const totalPages = Math.ceil(totalProducts / limit);

  res.json({
    success: true,
    products,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalProducts,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  });
}));

// @desc    Update product status
// @route   PUT /api/admin/products/:id/status
// @access  Private/Admin
router.put('/products/:id/status', [
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  body('isFeatured').optional().isBoolean().withMessage('isFeatured must be a boolean'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { isActive, isFeatured } = req.body;

  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Update product
  if (typeof isActive !== 'undefined') product.isActive = isActive;
  if (typeof isFeatured !== 'undefined') product.isFeatured = isFeatured;

  await product.save();

  res.json({
    success: true,
    message: 'Product status updated successfully',
    product: {
      _id: product._id,
      name: product.name,
      isActive: product.isActive,
      isFeatured: product.isFeatured
    }
  });
}));

// @desc    Get product analytics
// @route   GET /api/admin/analytics/products
// @access  Private/Admin
router.get('/analytics/products', [
  query('period').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Period must be 7d, 30d, 90d, or 1y'),
], asyncHandler(async (req, res) => {
  const { period = '30d' } = req.query;

  // Calculate date range
  const now = new Date();
  let startDate;
  
  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default: // 30d
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // Get product performance
  const productPerformance = await Order.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    { $unwind: '$orderItems' },
    {
      $lookup: {
        from: 'products',
        localField: 'orderItems.product',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $group: {
        _id: '$orderItems.product',
        name: { $first: '$product.name' },
        category: { $first: '$product.category' },
        totalSold: { $sum: '$orderItems.quantity' },
        revenue: { $sum: { $multiply: ['$orderItems.quantity', '$orderItems.price'] } },
        averagePrice: { $avg: '$orderItems.price' }
      }
    },
    { $sort: { revenue: -1 } },
    { $limit: 20 }
  ]);

  // Get category performance
  const categoryPerformance = await Order.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    { $unwind: '$orderItems' },
    {
      $lookup: {
        from: 'products',
        localField: 'orderItems.product',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $group: {
        _id: '$product.category',
        totalSold: { $sum: '$orderItems.quantity' },
        revenue: { $sum: { $multiply: ['$orderItems.quantity', '$orderItems.price'] } },
        productCount: { $addToSet: '$orderItems.product' }
      }
    },
    {
      $project: {
        category: '$_id',
        totalSold: 1,
        revenue: 1,
        productCount: { $size: '$productCount' }
      }
    },
    { $sort: { revenue: -1 } }
  ]);

  // Get low stock alerts
  const lowStockProducts = await Product.find({
    isActive: true,
    $expr: { $lte: ['$countInStock', '$lowStockThreshold'] }
  })
  .select('name countInStock lowStockThreshold category')
  .sort({ countInStock: 1 })
  .limit(10);

  // Get out of stock products
  const outOfStockProducts = await Product.countDocuments({
    isActive: true,
    countInStock: 0
  });

  res.json({
    success: true,
    analytics: {
      productPerformance,
      categoryPerformance,
      lowStockProducts,
      outOfStockCount: outOfStockProducts,
      period
    }
  });
}));

// @desc    Get sales analytics
// @route   GET /api/admin/analytics/sales
// @access  Private/Admin
router.get('/analytics/sales', [
  query('period').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Period must be 7d, 30d, 90d, or 1y'),
], asyncHandler(async (req, res) => {
  const { period = '30d' } = req.query;

  // Calculate date range
  const now = new Date();
  let startDate;
  
  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default: // 30d
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // Get revenue and order trends
  const salesTrend = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        totalRevenue: { $sum: '$totalPrice' },
        paidRevenue: { 
          $sum: { 
            $cond: [{ $eq: ['$isPaid', true] }, '$totalPrice', 0] 
          } 
        },
        totalOrders: { $sum: 1 },
        paidOrders: {
          $sum: { $cond: [{ $eq: ['$isPaid', true] }, 1, 0] }
        },
        averageOrderValue: { $avg: '$totalPrice' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Get payment method breakdown
  const paymentMethodBreakdown = await Order.aggregate([
    { $match: { createdAt: { $gte: startDate }, isPaid: true } },
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        revenue: { $sum: '$totalPrice' }
      }
    },
    { $sort: { revenue: -1 } }
  ]);

  // Get customer insights
  const customerInsights = await Order.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: '$user',
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: '$totalPrice' },
        averageOrderValue: { $avg: '$totalPrice' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $project: {
        name: '$user.name',
        email: '$user.email',
        totalOrders: 1,
        totalSpent: 1,
        averageOrderValue: 1
      }
    },
    { $sort: { totalSpent: -1 } },
    { $limit: 10 }
  ]);

  res.json({
    success: true,
    analytics: {
      salesTrend,
      paymentMethodBreakdown,
      topCustomers: customerInsights,
      period
    }
  });
}));

// @desc    Cleanup old data (Admin utility)
// @route   POST /api/admin/cleanup
// @access  Private/Admin
router.post('/cleanup', [
  body('action').isIn(['carts', 'inactive_users', 'cancelled_orders']).withMessage('Invalid cleanup action'),
  body('days').optional().isInt({ min: 1 }).withMessage('Days must be a positive integer'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { action, days = 30 } = req.body;
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  let result = {};

  switch (action) {
    case 'carts':
      const deletedCarts = await Cart.cleanupOldCarts();
      result = { deletedCarts, message: `Cleaned up ${deletedCarts} old empty carts` };
      break;

    case 'inactive_users':
      const inactiveUsersResult = await User.updateMany(
        {
          lastLogin: { $lt: cutoffDate },
          isAdmin: false,
          isActive: true
        },
        { isActive: false }
      );
      result = { 
        deactivatedUsers: inactiveUsersResult.modifiedCount, 
        message: `Deactivated ${inactiveUsersResult.modifiedCount} inactive users` 
      };
      break;

    case 'cancelled_orders':
      const cancelledOrdersResult = await Order.deleteMany({
        status: 'cancelled',
        createdAt: { $lt: cutoffDate }
      });
      result = { 
        deletedOrders: cancelledOrdersResult.deletedCount, 
        message: `Deleted ${cancelledOrdersResult.deletedCount} old cancelled orders` 
      };
      break;

    default:
      res.status(400);
      throw new Error('Invalid cleanup action');
  }

  res.json({
    success: true,
    cleanup: result
  });
}));

export default router;