import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const addressSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  postalCode: {
    type: String,
    required: true,
  },
  country: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  phone: {
    type: String,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please add a valid phone number']
  },
  phoneOTP: String,
  phoneOTPExpire: Date,
  phoneVerified: {
    type: Boolean,
    default: false
  },
  avatar: {
    type: String,
    default: ''
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  addresses: [addressSchema],
  wishlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  emailVerificationToken: String,
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerifiedAt: Date,
  emailOTP: String,
  emailOTPExpire: Date,
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for account locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Indexes for performance
userSchema.index({ isAdmin: 1 });
userSchema.index({ isActive: 1 });

// Encrypt password using bcrypt
userSchema.pre('save', async function (next) {
  // Only run this function if password was actually modified
  if (!this.isModified('password')) {
    next();
  }

  // Hash password with cost of 12
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Add to wishlist
userSchema.methods.addToWishlist = async function (productId) {
  if (!this.wishlist.includes(productId)) {
    this.wishlist.push(productId);
    await this.save();
  }
  return this.wishlist;
};

// Remove from wishlist
userSchema.methods.removeFromWishlist = async function (productId) {
  this.wishlist = this.wishlist.filter(id => !id.equals(productId));
  await this.save();
  return this.wishlist;
};

// Add address
userSchema.methods.addAddress = async function (addressData) {
  // If this is set as default, remove default from others
  if (addressData.isDefault) {
    this.addresses.forEach(addr => addr.isDefault = false);
  }
  
  // If no addresses exist, make this the default
  if (this.addresses.length === 0) {
    addressData.isDefault = true;
  }

  this.addresses.push(addressData);
  await this.save();
  return this.addresses;
};

// Update address
userSchema.methods.updateAddress = async function (addressId, addressData) {
  const address = this.addresses.id(addressId);
  if (!address) {
    throw new Error('Address not found');
  }

  // If setting as default, remove default from others
  if (addressData.isDefault) {
    this.addresses.forEach(addr => addr.isDefault = false);
  }

  Object.assign(address, addressData);
  await this.save();
  return this.addresses;
};

// Remove address
userSchema.methods.removeAddress = async function (addressId) {
  const address = this.addresses.id(addressId);
  if (!address) {
    throw new Error('Address not found');
  }

  const wasDefault = address.isDefault;
  address.remove();

  // If removed address was default, set first address as default
  if (wasDefault && this.addresses.length > 0) {
    this.addresses[0].isDefault = true;
  }

  await this.save();
  return this.addresses;
};

// Handle failed login attempts
userSchema.methods.incLoginAttempts = async function () {
  // If we have previous lock and it has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Reset login attempts
userSchema.methods.resetLoginAttempts = async function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

export default mongoose.model('User', userSchema);