import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  variant: {
    name: String,
    value: String,
    additionalPrice: {
      type: Number,
      default: 0
    }
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  couponCode: {
    type: String
  },
  couponDiscount: {
    type: Number,
    default: 0,
    min: 0
  },
  subtotal: {
    type: Number,
    default: 0,
    min: 0
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  shipping: {
    type: Number,
    default: 0,
    min: 0
  },
  total: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
cartSchema.index({ 'items.product': 1 });
cartSchema.index({ lastUpdated: 1 });

// Virtual for total items count
cartSchema.virtual('totalItems').get(function() {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Virtual for item count
cartSchema.virtual('itemCount').get(function() {
  return this.items.length;
});

// Calculate totals before saving
cartSchema.pre('save', function(next) {
  // Calculate subtotal
  this.subtotal = this.items.reduce((total, item) => {
    const itemPrice = item.price + (item.variant ? item.variant.additionalPrice : 0);
    return total + (itemPrice * item.quantity);
  }, 0);

  // Calculate tax (8% for example)
  const taxRate = 0.08;
  this.tax = this.subtotal * taxRate;

  // Calculate shipping (free over $100, $10 otherwise)
  this.shipping = this.subtotal >= 100 ? 0 : 10;

  // Calculate total with coupon discount
  this.total = this.subtotal + this.tax + this.shipping - this.couponDiscount;

  // Update last updated timestamp
  this.lastUpdated = new Date();

  next();
});

// Static method to find or create cart for user
cartSchema.statics.findOrCreateCart = async function(userId) {
  let cart = await this.findOne({ user: userId }).populate('items.product');
  
  if (!cart) {
    cart = await this.create({ user: userId, items: [] });
  }
  
  return cart;
};

// Instance method to add item to cart
cartSchema.methods.addItem = async function(productId, quantity = 1, variant = null) {
  // Find if item already exists in cart
  const existingItemIndex = this.items.findIndex(item => {
    const sameProduct = item.product.toString() === productId.toString();
    const sameVariant = JSON.stringify(item.variant) === JSON.stringify(variant);
    return sameProduct && sameVariant;
  });

  if (existingItemIndex > -1) {
    // Update quantity if item exists
    this.items[existingItemIndex].quantity += quantity;
    
    // Ensure quantity doesn't exceed max
    if (this.items[existingItemIndex].quantity > 10) {
      this.items[existingItemIndex].quantity = 10;
    }
  } else {
    // Get product details
    const Product = mongoose.model('Product');
    const product = await Product.findById(productId);
    
    if (!product) {
      throw new Error('Product not found');
    }

    if (!product.isActive || product.countInStock < quantity) {
      throw new Error('Product not available');
    }

    // Add new item to cart
    this.items.push({
      product: productId,
      name: product.name,
      image: product.images[0]?.url || '',
      price: product.price,
      quantity: Math.min(quantity, 10),
      variant: variant
    });
  }

  await this.save();
  return this;
};

// Instance method to update item quantity
cartSchema.methods.updateItemQuantity = async function(productId, quantity, variant = null) {
  const itemIndex = this.items.findIndex(item => {
    const sameProduct = item.product.toString() === productId.toString();
    const sameVariant = JSON.stringify(item.variant) === JSON.stringify(variant);
    return sameProduct && sameVariant;
  });

  if (itemIndex === -1) {
    throw new Error('Item not found in cart');
  }

  if (quantity <= 0) {
    // Remove item if quantity is 0 or negative
    this.items.splice(itemIndex, 1);
  } else {
    // Update quantity (max 10)
    this.items[itemIndex].quantity = Math.min(quantity, 10);
  }

  await this.save();
  return this;
};

// Instance method to remove item from cart
cartSchema.methods.removeItem = async function(productId, variant = null) {
  const itemIndex = this.items.findIndex(item => {
    const sameProduct = item.product.toString() === productId.toString();
    const sameVariant = JSON.stringify(item.variant) === JSON.stringify(variant);
    return sameProduct && sameVariant;
  });

  if (itemIndex === -1) {
    throw new Error('Item not found in cart');
  }

  this.items.splice(itemIndex, 1);
  await this.save();
  return this;
};

// Instance method to clear cart
cartSchema.methods.clearCart = async function() {
  this.items = [];
  this.couponCode = null;
  this.couponDiscount = 0;
  await this.save();
  return this;
};

// Instance method to apply coupon
cartSchema.methods.applyCoupon = async function(couponCode) {
  // Simple coupon logic - in production, you'd have a Coupon model
  const coupons = {
    'SAVE10': { type: 'percentage', value: 10, minAmount: 50 },
    'SAVE20': { type: 'percentage', value: 20, minAmount: 100 },
    'FLAT15': { type: 'fixed', value: 15, minAmount: 75 }
  };

  const coupon = coupons[couponCode.toUpperCase()];
  
  if (!coupon) {
    throw new Error('Invalid coupon code');
  }

  if (this.subtotal < coupon.minAmount) {
    throw new Error(`Minimum order amount of $${coupon.minAmount} required for this coupon`);
  }

  if (coupon.type === 'percentage') {
    this.couponDiscount = (this.subtotal * coupon.value) / 100;
  } else {
    this.couponDiscount = coupon.value;
  }

  this.couponCode = couponCode.toUpperCase();
  await this.save();
  return this;
};

// Instance method to remove coupon
cartSchema.methods.removeCoupon = async function() {
  this.couponCode = null;
  this.couponDiscount = 0;
  await this.save();
  return this;
};

// Instance method to validate cart items
cartSchema.methods.validateCartItems = async function() {
  const Product = mongoose.model('Product');
  const invalidItems = [];

  for (let i = 0; i < this.items.length; i++) {
    const item = this.items[i];
    const product = await Product.findById(item.product);

    if (!product || !product.isActive) {
      invalidItems.push({
        item: item,
        reason: 'Product no longer available'
      });
      continue;
    }

    if (product.countInStock < item.quantity) {
      invalidItems.push({
        item: item,
        reason: `Only ${product.countInStock} items available in stock`,
        availableQuantity: product.countInStock
      });
      continue;
    }

    if (product.price !== item.price) {
      invalidItems.push({
        item: item,
        reason: 'Price has changed',
        oldPrice: item.price,
        newPrice: product.price
      });
    }
  }

  return invalidItems;
};

// Instance method to merge guest cart
cartSchema.methods.mergeGuestCart = async function(guestCartItems) {
  for (const guestItem of guestCartItems) {
    await this.addItem(
      guestItem.product,
      guestItem.quantity,
      guestItem.variant
    );
  }
  return this;
};

// Static method to cleanup old carts (older than 30 days)
cartSchema.statics.cleanupOldCarts = async function() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const result = await this.deleteMany({
    lastUpdated: { $lt: thirtyDaysAgo },
    items: { $size: 0 } // Only delete empty carts
  });

  return result.deletedCount;
};

// Instance method to get cart summary
cartSchema.methods.getCartSummary = function() {
  return {
    itemCount: this.itemCount,
    totalItems: this.totalItems,
    subtotal: this.subtotal,
    tax: this.tax,
    shipping: this.shipping,
    couponDiscount: this.couponDiscount,
    couponCode: this.couponCode,
    total: this.total,
    currency: this.currency
  };
};

export default mongoose.model('Cart', cartSchema);