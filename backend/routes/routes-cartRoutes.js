import express from 'express';
import asyncHandler from 'express-async-handler';
import { body, validationResult } from 'express-validator';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const cart = await Cart.findOrCreateCart(req.user._id);
  await cart.populate('items.product', 'name images price countInStock isActive');

  // Validate cart items and remove unavailable ones
  const invalidItems = await cart.validateCartItems();
  let hasChanges = false;

  for (const invalidItem of invalidItems) {
    if (invalidItem.reason === 'Product no longer available') {
      await cart.removeItem(invalidItem.item.product);
      hasChanges = true;
    } else if (invalidItem.reason.includes('Only') && invalidItem.availableQuantity !== undefined) {
      // Update quantity to available stock
      await cart.updateItemQuantity(invalidItem.item.product, invalidItem.availableQuantity);
      hasChanges = true;
    }
  }

  if (hasChanges) {
    await cart.populate('items.product', 'name images price countInStock isActive');
  }

  res.json({
    success: true,
    cart,
    summary: cart.getCartSummary(),
    invalidItems: invalidItems.filter(item => 
      !item.reason.includes('Product no longer available') && 
      !item.reason.includes('Only')
    )
  });
}));

// @desc    Add item to cart
// @route   POST /api/cart/add
// @access  Private
router.post('/add', protect, [
  body('productId').isMongoId().withMessage('Invalid product ID'),
  body('quantity').optional().isInt({ min: 1, max: 10 }).withMessage('Quantity must be between 1 and 10'),
  body('variant').optional().isObject().withMessage('Variant must be an object'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { productId, quantity = 1, variant } = req.body;

  const cart = await Cart.findOrCreateCart(req.user._id);

  try {
    await cart.addItem(productId, quantity, variant);
    await cart.populate('items.product', 'name images price countInStock isActive');

    res.json({
      success: true,
      message: 'Item added to cart successfully',
      cart,
      summary: cart.getCartSummary()
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
}));

// @desc    Update cart item quantity
// @route   PUT /api/cart/update
// @access  Private
router.put('/update', protect, [
  body('productId').isMongoId().withMessage('Invalid product ID'),
  body('quantity').isInt({ min: 0, max: 10 }).withMessage('Quantity must be between 0 and 10'),
  body('variant').optional().isObject().withMessage('Variant must be an object'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { productId, quantity, variant } = req.body;

  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  try {
    await cart.updateItemQuantity(productId, quantity, variant);
    await cart.populate('items.product', 'name images price countInStock isActive');

    res.json({
      success: true,
      message: 'Cart item updated successfully',
      cart,
      summary: cart.getCartSummary()
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
}));

// @desc    Remove item from cart
// @route   DELETE /api/cart/remove
// @access  Private
router.delete('/remove', protect, [
  body('productId').isMongoId().withMessage('Invalid product ID'),
  body('variant').optional().isObject().withMessage('Variant must be an object'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { productId, variant } = req.body;

  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  try {
    await cart.removeItem(productId, variant);
    await cart.populate('items.product', 'name images price countInStock isActive');

    res.json({
      success: true,
      message: 'Item removed from cart successfully',
      cart,
      summary: cart.getCartSummary()
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
}));

// @desc    Clear entire cart
// @route   DELETE /api/cart/clear
// @access  Private
router.delete('/clear', protect, asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  await cart.clearCart();

  res.json({
    success: true,
    message: 'Cart cleared successfully',
    cart,
    summary: cart.getCartSummary()
  });
}));

// @desc    Apply coupon to cart
// @route   POST /api/cart/coupon
// @access  Private
router.post('/coupon', protect, [
  body('couponCode').notEmpty().withMessage('Coupon code is required').trim(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { couponCode } = req.body;

  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  if (cart.items.length === 0) {
    res.status(400);
    throw new Error('Cannot apply coupon to empty cart');
  }

  try {
    await cart.applyCoupon(couponCode);
    await cart.populate('items.product', 'name images price countInStock isActive');

    res.json({
      success: true,
      message: 'Coupon applied successfully',
      cart,
      summary: cart.getCartSummary()
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
}));

// @desc    Remove coupon from cart
// @route   DELETE /api/cart/coupon
// @access  Private
router.delete('/coupon', protect, asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  await cart.removeCoupon();
  await cart.populate('items.product', 'name images price countInStock isActive');

  res.json({
    success: true,
    message: 'Coupon removed successfully',
    cart,
    summary: cart.getCartSummary()
  });
}));

// @desc    Merge guest cart with user cart
// @route   POST /api/cart/merge
// @access  Private
router.post('/merge', protect, [
  body('guestCartItems').isArray().withMessage('Guest cart items must be an array'),
  body('guestCartItems.*.product').isMongoId().withMessage('Invalid product ID'),
  body('guestCartItems.*.quantity').isInt({ min: 1, max: 10 }).withMessage('Quantity must be between 1 and 10'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { guestCartItems } = req.body;

  if (!guestCartItems || guestCartItems.length === 0) {
    const cart = await Cart.findOrCreateCart(req.user._id);
    await cart.populate('items.product', 'name images price countInStock isActive');
    
    return res.json({
      success: true,
      message: 'No guest cart items to merge',
      cart,
      summary: cart.getCartSummary()
    });
  }

  const cart = await Cart.findOrCreateCart(req.user._id);

  try {
    await cart.mergeGuestCart(guestCartItems);
    await cart.populate('items.product', 'name images price countInStock isActive');

    res.json({
      success: true,
      message: 'Guest cart merged successfully',
      cart,
      summary: cart.getCartSummary()
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
}));

// @desc    Get cart count (for header badge)
// @route   GET /api/cart/count
// @access  Private
router.get('/count', protect, asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });

  const count = cart ? cart.totalItems : 0;

  res.json({
    success: true,
    count
  });
}));

// @desc    Save cart for later (wishlist functionality)
// @route   POST /api/cart/save-for-later
// @access  Private
router.post('/save-for-later', protect, [
  body('productId').isMongoId().withMessage('Invalid product ID'),
  body('variant').optional().isObject().withMessage('Variant must be an object'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { productId, variant } = req.body;

  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  try {
    // Remove from cart
    await cart.removeItem(productId, variant);
    
    // Add to user's wishlist
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user._id);
    await user.addToWishlist(productId);

    await cart.populate('items.product', 'name images price countInStock isActive');

    res.json({
      success: true,
      message: 'Item saved for later',
      cart,
      summary: cart.getCartSummary()
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
}));

// @desc    Move item from wishlist to cart
// @route   POST /api/cart/move-to-cart
// @access  Private
router.post('/move-to-cart', protect, [
  body('productId').isMongoId().withMessage('Invalid product ID'),
  body('quantity').optional().isInt({ min: 1, max: 10 }).withMessage('Quantity must be between 1 and 10'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { productId, quantity = 1 } = req.body;

  const cart = await Cart.findOrCreateCart(req.user._id);

  try {
    // Add to cart
    await cart.addItem(productId, quantity);
    
    // Remove from user's wishlist
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user._id);
    await user.removeFromWishlist(productId);

    await cart.populate('items.product', 'name images price countInStock isActive');

    res.json({
      success: true,
      message: 'Item moved to cart',
      cart,
      summary: cart.getCartSummary()
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
}));

// @desc    Get cart totals without items (for quick checkout)
// @route   GET /api/cart/summary
// @access  Private
router.get('/summary', protect, asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart) {
    return res.json({
      success: true,
      summary: {
        itemCount: 0,
        totalItems: 0,
        subtotal: 0,
        tax: 0,
        shipping: 0,
        couponDiscount: 0,
        couponCode: null,
        total: 0,
        currency: 'USD'
      }
    });
  }

  res.json({
    success: true,
    summary: cart.getCartSummary()
  });
}));

// @desc    Validate cart before checkout
// @route   GET /api/cart/validate
// @access  Private
router.get('/validate', protect, asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });

  if (!cart || cart.items.length === 0) {
    res.status(400);
    throw new Error('Cart is empty');
  }

  const invalidItems = await cart.validateCartItems();

  if (invalidItems.length > 0) {
    res.status(400).json({
      success: false,
      message: 'Cart contains invalid items',
      invalidItems
    });
  } else {
    res.json({
      success: true,
      message: 'Cart is valid for checkout',
      cart: {
        itemCount: cart.itemCount,
        totalItems: cart.totalItems,
        total: cart.total
      }
    });
  }
}));

export default router;