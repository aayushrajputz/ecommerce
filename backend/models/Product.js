import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  name: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: ''
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true,
    maxlength: [1000, 'Review cannot be more than 1000 characters']
  },
  helpful: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  reported: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String
  }]
}, { timestamps: true });

const specificationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  value: {
    type: String,
    required: true
  }
});

const variantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true // e.g., "Color", "Size"
  },
  value: {
    type: String,
    required: true // e.g., "Red", "Large"
  },
  price: {
    type: Number,
    default: 0 // Additional price for this variant
  },
  stock: {
    type: Number,
    default: 0
  },
  sku: {
    type: String,
    required: true // <-- REMOVE unique: true
    // unique: true
  }
});

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a product name'],
    trim: true,
    maxlength: [200, 'Product name cannot be more than 200 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
    maxlength: [2000, 'Description cannot be more than 2000 characters']
  },
  shortDescription: {
    type: String,
    maxlength: [500, 'Short description cannot be more than 500 characters']
  },
  price: {
    type: Number,
    required: [true, 'Please add a price'],
    min: [0, 'Price must be a positive number']
  },
  comparePrice: {
    type: Number,
    min: [0, 'Compare price must be a positive number']
  },
  costPrice: {
    type: Number,
    min: [0, 'Cost price must be a positive number']
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    altText: String,
    isMain: {
      type: Boolean,
      default: false
    }
  }],
  category: {
    type: String,
    required: [true, 'Please add a category']
  },
  subCategory: {
    type: String
  },
  brand: {
    type: String,
    required: [true, 'Please add a brand']
  },
  sku: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  barcode: {
    type: String,
    unique: true,
    sparse: true
  },
  weight: {
    type: Number,
    min: [0, 'Weight must be a positive number']
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number
  },
  countInStock: {
    type: Number,
    required: true,
    min: [0, 'Stock must be a positive number'],
    default: 0
  },
  lowStockThreshold: {
    type: Number,
    default: 5
  },
  trackQuantity: {
    type: Boolean,
    default: true
  },
  variants: [variantSchema],
  specifications: [specificationSchema],
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  isFeatured: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metaTitle: {
    type: String,
    maxlength: [60, 'Meta title cannot be more than 60 characters']
  },
  metaDescription: {
    type: String,
    maxlength: [160, 'Meta description cannot be more than 160 characters']
  },
  reviews: [reviewSchema],
  rating: {
    type: Number,
    default: 0,
    min: [0, 'Rating must be between 0 and 5'],
    max: [5, 'Rating must be between 0 and 5']
  },
  numReviews: {
    type: Number,
    default: 0
  },
  totalSales: {
    type: Number,
    default: 0
  },
  viewCount: {
    type: Number,
    default: 0
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  shippingClass: {
    type: String,
    enum: ['free', 'standard', 'express', 'overnight'],
    default: 'standard'
  },
  taxClass: {
    type: String,
    default: 'standard'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived', 'out_of_stock'],
    default: 'active'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ price: 1 });
productSchema.index({ rating: -1 });
productSchema.index({ numReviews: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ isFeatured: -1, isActive: 1 });
productSchema.index({ status: 1 });
productSchema.index({ countInStock: 1 });

// Virtual for discount percentage
productSchema.virtual('discountPercentage').get(function() {
  if (this.comparePrice && this.comparePrice > this.price) {
    return Math.round(((this.comparePrice - this.price) / this.comparePrice) * 100);
  }
  return 0;
});

// Virtual for profit margin
productSchema.virtual('profitMargin').get(function() {
  if (this.costPrice && this.price > this.costPrice) {
    return Math.round(((this.price - this.costPrice) / this.price) * 100);
  }
  return 0;
});

// Virtual for stock status
productSchema.virtual('stockStatus').get(function() {
  if (this.countInStock === 0) return 'out_of_stock';
  if (this.countInStock <= this.lowStockThreshold) return 'low_stock';
  return 'in_stock';
});

// Generate slug from name
productSchema.pre('save', function(next) {
  if (this.isModified('name') || this.isNew) {
    this.slug = this.name
      .toLowerCase()
      .replace(/ /g, '-')
      .replace(/[^\w-]+/g, '');
  }
  next();
});

// Update rating when reviews change
productSchema.pre('save', function(next) {
  if (this.reviews && this.reviews.length > 0) {
    const totalRating = this.reviews.reduce((acc, review) => acc + review.rating, 0);
    this.rating = (totalRating / this.reviews.length).toFixed(1);
    this.numReviews = this.reviews.length;
  }
  next();
});

// Static method to get products by category
productSchema.statics.getByCategory = function(category) {
  return this.find({ category: category, isActive: true }).sort({ createdAt: -1 });
};

// Static method to get featured products
productSchema.statics.getFeatured = function(limit = 10) {
  return this.find({ isFeatured: true, isActive: true })
    .sort({ rating: -1, numReviews: -1 })
    .limit(limit);
};

// Static method to search products
productSchema.statics.search = function(query, options = {}) {
  const {
    category,
    brand,
    minPrice,
    maxPrice,
    minRating,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 12
  } = options;

  const filter = { isActive: true };

  if (query) {
    filter.$text = { $search: query };
  }

  if (category) filter.category = category;
  if (brand) filter.brand = brand;
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = minPrice;
    if (maxPrice) filter.price.$lte = maxPrice;
  }
  if (minRating) filter.rating = { $gte: minRating };

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const skip = (page - 1) * limit;

  return this.find(filter)
    .sort(sortOptions)
    .skip(skip)
    .limit(limit)
    .populate('reviews.user', 'name avatar');
};

// Instance method to add review
productSchema.methods.addReview = async function(userId, rating, comment, userName, userAvatar) {
  const existingReview = this.reviews.find(review => review.user.toString() === userId.toString());
  
  if (existingReview) {
    throw new Error('You have already reviewed this product');
  }

  this.reviews.push({
    user: userId,
    name: userName,
    avatar: userAvatar,
    rating: rating,
    comment: comment
  });

  await this.save();
  return this.reviews;
};

// Instance method to update stock
productSchema.methods.updateStock = async function(quantity, operation = 'subtract') {
  if (operation === 'subtract') {
    if (this.countInStock < quantity) {
      throw new Error('Insufficient stock');
    }
    this.countInStock -= quantity;
  } else if (operation === 'add') {
    this.countInStock += quantity;
  }

  // Update status based on stock
  if (this.countInStock === 0) {
    this.status = 'out_of_stock';
  } else if (this.status === 'out_of_stock') {
    this.status = 'active';
  }

  await this.save();
  return this.countInStock;
};

// Instance method to increment view count
productSchema.methods.incrementViews = async function() {
  this.viewCount += 1;
  await this.save({ validateBeforeSave: false });
};

export default mongoose.model('Product', productSchema);