import express from 'express';
import asyncHandler from 'express-async-handler';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { protect, admin, generateToken, setTokenCookie } from '../middleware/authMiddleware.js';
import sendEmail from '../utils/sendEmail.js';

const router = express.Router();

// Helper: generate OTP
function generateOTP() {
  return (Math.floor(100000 + Math.random() * 900000)).toString();
}

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', [
  body('name').notEmpty().withMessage('Name is required').isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email').isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { name, email, password } = req.body;

  // Check if user already exists
  let user = await User.findOne({ email });
  if (user) {
    if (!user.emailVerified) {
      // If user exists but not verified, allow resending OTP
      const emailOtp = generateOTP();
      user.emailOTP = emailOtp;
      user.emailOTPExpire = Date.now() + 10 * 60 * 1000; // 10 min
      await user.save();
      try {
        await sendEmail(
          user.email,
          'Your ShopHub Email Verification Code',
          `Your verification code is: ${emailOtp}`
        );
        return res.status(200).json({
          success: true,
          message: 'User already exists but not verified. OTP resent.',
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            isAdmin: user.isAdmin,
            isActive: user.isActive,
            emailVerified: user.emailVerified
          }
        });
      } catch (emailError) {
        console.error('Email OTP send error:', emailError);
        return res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again.' });
      }
    } else {
      res.status(400);
      throw new Error('User with this email already exists');
    }
  }

  // Create user
  user = await User.create({
    name,
    email,
    password,
    emailVerified: false
  });

  // Generate and save OTP
  const emailOtp = generateOTP();
  user.emailOTP = emailOtp;
  user.emailOTPExpire = Date.now() + 10 * 60 * 1000; // 10 min
  await user.save();

  try {
    await sendEmail(
      user.email,
      'Your ShopHub Email Verification Code',
      `Your verification code is: ${emailOtp}`
    );
    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email for the verification code.',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        emailVerified: user.emailVerified
      }
    });
  } catch (emailError) {
    console.error('Email OTP send error:', emailError);
    // Do NOT delete the user!
    res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again.' });
  }
}));

// Add Email OTP verification route
router.post('/verify-email-otp', asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  console.log('[VERIFY EMAIL OTP]', { email, otp });
  const user = await User.findOne({ email });
  if (!user) {
    console.log('[VERIFY EMAIL OTP] User not found:', email);
    res.status(404);
    throw new Error('User not found');
  }
  console.log('[VERIFY EMAIL OTP] User OTP:', user.emailOTP, 'Expire:', user.emailOTPExpire, 'Now:', Date.now());
  if (!user.emailOTP || !user.emailOTPExpire || user.emailOTPExpire < Date.now()) {
    res.status(400);
    throw new Error('OTP expired or not set');
  }
  if (user.emailOTP !== otp) {
    res.status(400);
    throw new Error('Invalid OTP');
  }
  user.emailVerified = true;
  user.emailOTP = undefined;
  user.emailOTPExpire = undefined;
  await user.save();
  res.json({ success: true, message: 'Email verified successfully' });
}));

// Add OTP verification route
router.post('/verify-otp', asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    res.status(400);
    throw new Error('Phone and OTP are required');
  }
  const user = await User.findOne({ phone });
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  if (!user.phoneOTP || !user.phoneOTPExpire || user.phoneOTPExpire < Date.now()) {
    res.status(400);
    throw new Error('OTP expired or not set');
  }
  if (user.phoneOTP !== otp) {
    res.status(400);
    throw new Error('Invalid OTP');
  }
  user.phoneVerified = true;
  user.phoneOTP = undefined;
  user.phoneOTPExpire = undefined;
  await user.save();
  res.json({ success: true, message: 'Phone verified successfully' });
}));

// Add Resend Email OTP route
router.post('/resend-email-otp', asyncHandler(async (req, res) => {
  const { email } = req.body;
  console.log('[RESEND EMAIL OTP]', { email });
  const user = await User.findOne({ email });
  if (!user) {
    console.log('[RESEND EMAIL OTP] User not found:', email);
    res.status(404);
    throw new Error('User not found');
  }
  const emailOtp = generateOTP();
  user.emailOTP = emailOtp;
  user.emailOTPExpire = Date.now() + 10 * 60 * 1000; // 10 min
  user.emailVerified = false;
  await user.save();
  console.log('[RESEND EMAIL OTP] New OTP:', emailOtp, 'Expire:', user.emailOTPExpire);
  try {
    await sendEmail(
      user.email,
      'Your ShopHub Email Verification Code',
      `Your new verification code is: ${emailOtp}`
    );
    res.json({ success: true, message: 'OTP resent successfully' });
  } catch (emailError) {
    console.error('Resend Email OTP error:', emailError);
    res.status(500);
    throw new Error('Failed to resend verification email. Please try again.');
  }
}));

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', [
  body('email').isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { email, password } = req.body;

  // Find user and include password for verification
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  // Check if account is locked
  if (user.isLocked) {
    res.status(423);
    throw new Error('Account temporarily locked due to too many failed login attempts');
  }

  // Check if account is active
  if (!user.isActive) {
    res.status(403);
    throw new Error('Account has been deactivated. Please contact support.');
  }

  // Verify password
  if (await user.matchPassword(password)) {
    // Reset login attempts on successful login
    await user.resetLoginAttempts();
    
    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);
    setTokenCookie(res, token);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        lastLogin: user.lastLogin
      },
      token
    });
  } else {
    // Increment login attempts on failed login
    await user.incLoginAttempts();
    res.status(401);
    throw new Error('Invalid email or password');
  }
}));

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', protect, (req, res) => {
  res.cookie('token', '', {
    expires: new Date(0),
    httpOnly: true
  });

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
router.get('/profile', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate('wishlist', 'name price images rating');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  res.json({
    success: true,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      isAdmin: user.isAdmin,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      addresses: user.addresses,
      wishlist: user.wishlist,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }
  });
}));

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
router.put('/profile', protect, [
  body('name').optional().notEmpty().withMessage('Name cannot be empty').isLength({ max: 50 }).withMessage('Name cannot be more than 50 characters'),
  body('email').optional().isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('phone').optional().isMobilePhone().withMessage('Please enter a valid phone number'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const user = await User.findById(req.user.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const { name, phone, dateOfBirth, gender, avatar } = req.body;

  // Update allowed fields
  if (name) user.name = name;
  if (phone) user.phone = phone;
  if (dateOfBirth) user.dateOfBirth = dateOfBirth;
  if (gender) user.gender = gender;
  if (avatar) user.avatar = avatar;

  const updatedUser = await user.save();

  res.json({
    success: true,
    message: 'Profile updated successfully',
    user: {
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      avatar: updatedUser.avatar,
      dateOfBirth: updatedUser.dateOfBirth,
      gender: updatedUser.gender,
      isAdmin: updatedUser.isAdmin,
      addresses: updatedUser.addresses
    }
  });
}));

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
router.put('/change-password', protect, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters long'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Verify current password
  if (!(await user.matchPassword(currentPassword))) {
    res.status(400);
    throw new Error('Current password is incorrect');
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
}));

// @desc    Add address
// @route   POST /api/auth/addresses
// @access  Private
router.post('/addresses', protect, [
  body('name').notEmpty().withMessage('Name is required'),
  body('address').notEmpty().withMessage('Address is required'),
  body('city').notEmpty().withMessage('City is required'),
  body('postalCode').notEmpty().withMessage('Postal code is required'),
  body('country').notEmpty().withMessage('Country is required'),
  body('phone').notEmpty().withMessage('Phone is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const user = await User.findById(req.user.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const addressData = req.body;
  await user.addAddress(addressData);

  res.status(201).json({
    success: true,
    message: 'Address added successfully',
    addresses: user.addresses
  });
}));

// @desc    Update address
// @route   PUT /api/auth/addresses/:id
// @access  Private
router.put('/addresses/:id', protect, [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('address').optional().notEmpty().withMessage('Address cannot be empty'),
  body('city').optional().notEmpty().withMessage('City cannot be empty'),
  body('postalCode').optional().notEmpty().withMessage('Postal code cannot be empty'),
  body('country').optional().notEmpty().withMessage('Country cannot be empty'),
  body('phone').optional().notEmpty().withMessage('Phone cannot be empty'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    throw new Error(errors.array().map(error => error.msg).join(', '));
  }

  const user = await User.findById(req.user.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  try {
    await user.updateAddress(req.params.id, req.body);
    
    res.json({
      success: true,
      message: 'Address updated successfully',
      addresses: user.addresses
    });
  } catch (error) {
    res.status(404);
    throw new Error(error.message);
  }
}));

// @desc    Delete address
// @route   DELETE /api/auth/addresses/:id
// @access  Private
router.delete('/addresses/:id', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  try {
    await user.removeAddress(req.params.id);
    
    res.json({
      success: true,
      message: 'Address deleted successfully',
      addresses: user.addresses
    });
  } catch (error) {
    res.status(404);
    throw new Error(error.message);
  }
}));

// @desc    Add product to wishlist
// @route   POST /api/auth/wishlist/:productId
// @access  Private
router.post('/wishlist/:productId', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  const productId = req.params.productId;

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  await user.addToWishlist(productId);
  await user.populate('wishlist', 'name price images rating');

  res.json({
    success: true,
    message: 'Product added to wishlist',
    wishlist: user.wishlist
  });
}));

// @desc    Remove product from wishlist
// @route   DELETE /api/auth/wishlist/:productId
// @access  Private
router.delete('/wishlist/:productId', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  const productId = req.params.productId;

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  await user.removeFromWishlist(productId);
  await user.populate('wishlist', 'name price images rating');

  res.json({
    success: true,
    message: 'Product removed from wishlist',
    wishlist: user.wishlist
  });
}));

// @desc    Get wishlist
// @route   GET /api/auth/wishlist
// @access  Private
router.get('/wishlist', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate('wishlist', 'name price images rating countInStock');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  res.json({
    success: true,
    wishlist: user.wishlist
  });
}));

export default router;