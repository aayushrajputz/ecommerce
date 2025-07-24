import express from 'express';
import asyncHandler from 'express-async-handler';
import { body, query, validationResult } from 'express-validator';
import Product from '../models/Product.js';
import { protect, admin, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// @desc    Get all products with filtering, sorting, and pagination
// @route   GET /api/products
// @access  Public
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('Minimum price must be a positive number'),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Maximum price must be a positive number'),
  query('minRating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const {
    keyword = '',
    category,
    brand,
    minPrice,
    maxPrice,
    minRating,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 12,
    featured
  } = req.query;

  // Build filter object
  const filter = { isActive: true };

  // Text search
  if (keyword) {
    filter.$text = { $search: keyword };
  }

  // Category filter
  if (category) {
    filter.category = new RegExp(category, 'i');
  }

  // Brand filter
  if (brand) {
    filter.brand = new RegExp(brand, 'i');
  }

  // Price range filter
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = parseFloat(minPrice);
    if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
  }

  // Rating filter
  if (minRating) {
    filter.rating = { $gte: parseFloat(minRating) };
  }

  // Featured filter
  if (featured === 'true') {
    filter.isFeatured = true;
  }

  // Sort options
  const sortOptions = {};
  switch (sortBy) {
    case 'price':
      sortOptions.price = sortOrder === 'asc' ? 1 : -1;
      break;
    case 'rating':
      sortOptions.rating = sortOrder === 'asc' ? 1 : -1;
      break;
    case 'name':
      sortOptions.name = sortOrder === 'asc' ? 1 : -1;
      break;
    case 'createdAt':
    default:
      sortOptions.createdAt = sortOrder === 'asc' ? 1 : -1;
      break;
  }

  // Pagination
  const skip = (page - 1) * limit;
  const parsedLimit = parseInt(limit);

  // Execute query with aggregation for better performance
  const products = await Product.aggregate([
    { $match: filter },
    { $sort: sortOptions },
    { $skip: skip },
    { $limit: parsedLimit },
    {
      $project: {
        name: 1,
        slug: 1,
        shortDescription: 1,
        price: 1,
        comparePrice: 1,
        images: 1,
        category: 1,
        brand: 1,
        rating: 1,
        numReviews: 1,
        countInStock: 1,
        isFeatured: 1,
        discountPercentage: {
          $cond: {
            if: { $and: [{ $gt: ['$comparePrice', 0] }, { $gt: ['$comparePrice', '$price'] }] },
            then: { $round: [{ $multiply: [{ $divide: [{ $subtract: ['$comparePrice', '$price'] }, '$comparePrice'] }, 100] }] },
            else: 0
          }
        },
        stockStatus: {
          $cond: {
            if: { $eq: ['$countInStock', 0] },
            then: 'out_of_stock',
            else: {
              $cond: {
                if: { $lte: ['$countInStock', '$lowStockThreshold'] },
                then: 'low_stock',
                else: 'in_stock'
              }
            }
          }
        },
        createdAt: 1
      }
    }
  ]);

  // Get total count for pagination
  const totalProducts = await Product.countDocuments(filter);
  const totalPages = Math.ceil(totalProducts / parsedLimit);

  res.json({
    success: true,
    products,
    pagination: {
      page: parseInt(page),
      limit: parsedLimit,
      totalProducts,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    },
    filters: {
      keyword,
      category,
      brand,
      minPrice,
      maxPrice,
      minRating,
      sortBy,
      sortOrder
    }
  });
}));

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('reviews.user', 'name avatar')
    .populate('vendor', 'name email');

  if (!product || !product.isActive) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Increment view count
  await product.incrementViews();

  res.json({
    success: true,
    product
  });
}));

// @desc    Get product by slug
// @route   GET /api/products/slug/:slug
// @access  Public
router.get('/slug/:slug', optionalAuth, asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true })
    .populate('reviews.user', 'name avatar')
    .populate('vendor', 'name email');

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Increment view count
  await product.incrementViews();

  res.json({
    success: true,
    product
  });
}));

// @desc    Create new product
// @route   POST /api/products
// @access  Private/Admin
router.post('/', protect, admin, [
  body('name').notEmpty().withMessage('Product name is required').isLength({ max: 200 }).withMessage('Name cannot exceed 200 characters'),
  body('description').notEmpty().withMessage('Description is required').isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('category').notEmpty().withMessage('Category is required'),
  body('brand').notEmpty().withMessage('Brand is required'),
  body('countInStock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const {
    name,
    description,
    shortDescription,
    price,
    comparePrice,
    costPrice,
    images,
    category,
    subCategory,
    brand,
    countInStock,
    lowStockThreshold,
    weight,
    dimensions,
    specifications,
    tags,
    isFeatured,
    metaTitle,
    metaDescription,
    shippingClass,
    taxClass
  } = req.body;

  // Generate unique SKU
  const sku = `${brand.substring(0, 3).toUpperCase()}-${Date.now()}`;

  const product = new Product({
    name,
    description,
    shortDescription,
    price,
    comparePrice,
    costPrice,
    images: images || [],
    category,
    subCategory,
    brand,
    sku,
    countInStock,
    lowStockThreshold: lowStockThreshold || 5,
    weight,
    dimensions,
    specifications: specifications || [],
    tags: tags || [],
    isFeatured: isFeatured || false,
    metaTitle,
    metaDescription,
    shippingClass: shippingClass || 'standard',
    taxClass: taxClass || 'standard',
    vendor: req.user._id
  });

  const createdProduct = await product.save();

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    product: createdProduct
  });
}));

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
router.put('/:id', protect, admin, [
  body('name').optional().notEmpty().withMessage('Product name cannot be empty').isLength({ max: 200 }).withMessage('Name cannot exceed 200 characters'),
  body('description').optional().notEmpty().withMessage('Description cannot be empty').isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('countInStock').optional().isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Update fields
  const updatedProduct = await Product.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    message: 'Product updated successfully',
    product: updatedProduct
  });
}));

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Soft delete by setting isActive to false
  product.isActive = false;
  product.status = 'archived';
  await product.save();

  res.json({
    success: true,
    message: 'Product deleted successfully'
  });
}));

// @desc    Create product review
// @route   POST /api/products/:id/reviews
// @access  Private
router.post('/:id/reviews', protect, [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').notEmpty().withMessage('Review comment is required').isLength({ max: 1000 }).withMessage('Comment cannot exceed 1000 characters'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { rating, comment } = req.body;

  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  try {
    await product.addReview(req.user._id, rating, comment, req.user.name, req.user.avatar);
    
    res.status(201).json({
      success: true,
      message: 'Review added successfully',
      reviews: product.reviews
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
}));

// @desc    Get product reviews
// @route   GET /api/products/:id/reviews
// @access  Public
router.get('/:id/reviews', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Sort reviews
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + parseInt(limit);

  const sortedReviews = product.reviews.sort((a, b) => {
    if (sortOrder === 'desc') {
      return b[sortBy] > a[sortBy] ? 1 : -1;
    } else {
      return a[sortBy] > b[sortBy] ? 1 : -1;
    }
  });

  const paginatedReviews = sortedReviews.slice(startIndex, endIndex);
  const totalPages = Math.ceil(product.reviews.length / limit);

  res.json({
    success: true,
    reviews: paginatedReviews,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalReviews: product.reviews.length,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  });
}));

// @desc    Get product categories
// @route   GET /api/products/categories
// @access  Public
router.get('/categories/list', asyncHandler(async (req, res) => {
  const categories = await Product.distinct('category', { isActive: true });
  
  // Get category counts
  const categoryStats = await Product.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  const categoriesWithCount = categories.map(category => {
    const stat = categoryStats.find(s => s._id === category);
    return {
      name: category,
      count: stat ? stat.count : 0
    };
  });

  res.json({
    success: true,
    categories: categoriesWithCount
  });
}));

// @desc    Get product brands
// @route   GET /api/products/brands
// @access  Public
router.get('/brands/list', asyncHandler(async (req, res) => {
  const brands = await Product.distinct('brand', { isActive: true });
  
  // Get brand counts
  const brandStats = await Product.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$brand', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  const brandsWithCount = brands.map(brand => {
    const stat = brandStats.find(s => s._id === brand);
    return {
      name: brand,
      count: stat ? stat.count : 0
    };
  });

  res.json({
    success: true,
    brands: brandsWithCount
  });
}));

// @desc    Get featured products
// @route   GET /api/products/featured
// @access  Public
router.get('/featured/list', asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  const products = await Product.getFeatured(parseInt(limit));

  res.json({
    success: true,
    products
  });
}));

// @desc    Search product suggestions
// @route   GET /api/products/search/suggestions
// @access  Public
router.get('/search/suggestions', [
  query('q').notEmpty().withMessage('Search query is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { q, limit = 5 } = req.query;

  const suggestions = await Product.find({
    $text: { $search: q },
    isActive: true
  })
  .select('name category brand')
  .limit(parseInt(limit));

  const categories = await Product.distinct('category', {
    category: new RegExp(q, 'i'),
    isActive: true
  });

  const brands = await Product.distinct('brand', {
    brand: new RegExp(q, 'i'),
    isActive: true
  });

  res.json({
    success: true,
    suggestions: {
      products: suggestions,
      categories: categories.slice(0, 3),
      brands: brands.slice(0, 3)
    }
  });
}));

// @desc    Update product stock
// @route   PUT /api/products/:id/stock
// @access  Private/Admin
router.put('/:id/stock', protect, admin, [
  body('quantity').isInt().withMessage('Quantity must be an integer'),
  body('operation').isIn(['add', 'subtract', 'set']).withMessage('Operation must be add, subtract, or set'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { quantity, operation } = req.body;

  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  try {
    if (operation === 'set') {
      product.countInStock = quantity;
      await product.save();
    } else {
      await product.updateStock(quantity, operation);
    }

    res.json({
      success: true,
      message: 'Stock updated successfully',
      product: {
        _id: product._id,
        name: product.name,
        countInStock: product.countInStock,
        stockStatus: product.stockStatus
      }
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
}));

export default router;