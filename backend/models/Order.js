import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Product'
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
    min: 1
  },
  variant: {
    name: String,
    value: String,
    additionalPrice: {
      type: Number,
      default: 0
    }
  }
});

const shippingAddressSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  postalCode: {
    type: String,
    required: true
  },
  country: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  }
});

const paymentResultSchema = new mongoose.Schema({
  id: String,
  status: String,
  update_time: String,
  email_address: String,
  paymentMethod: {
    type: String,
    enum: ['stripe', 'razorpay', 'paypal', 'cash_on_delivery'],
    required: true
  },
  transactionId: String,
  currency: {
    type: String,
    default: 'USD'
  }
});

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  orderItems: [orderItemSchema],
  shippingAddress: {
    type: shippingAddressSchema,
    required: true
  },
  billingAddress: {
    type: shippingAddressSchema
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['stripe', 'razorpay', 'paypal', 'cash_on_delivery']
  },
  paymentResult: paymentResultSchema,
  itemsPrice: {
    type: Number,
    required: true,
    default: 0.0,
    min: 0
  },
  taxPrice: {
    type: Number,
    required: true,
    default: 0.0,
    min: 0
  },
  shippingPrice: {
    type: Number,
    required: true,
    default: 0.0,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0.0,
    min: 0
  },
  couponCode: {
    type: String
  },
  totalPrice: {
    type: Number,
    required: true,
    default: 0.0,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  isPaid: {
    type: Boolean,
    required: true,
    default: false
  },
  paidAt: {
    type: Date
  },
  isDelivered: {
    type: Boolean,
    required: true,
    default: false
  },
  deliveredAt: {
    type: Date
  },
  shippedAt: {
    type: Date
  },
  cancelledAt: {
    type: Date
  },
  refundedAt: {
    type: Date
  },
  cancellationReason: {
    type: String
  },
  refundReason: {
    type: String
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot be more than 1000 characters']
  },
  trackingNumber: {
    type: String
  },
  carrier: {
    type: String
  },
  estimatedDelivery: {
    type: Date
  },
  statusHistory: [{
    status: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
orderSchema.index({ status: 1 });
orderSchema.index({ paymentMethod: 1 });
orderSchema.index({ isPaid: 1 });
orderSchema.index({ isDelivered: 1 });
orderSchema.index({ createdAt: -1 });

// Virtual for order total items
orderSchema.virtual('totalItems').get(function() {
  return this.orderItems.reduce((total, item) => total + item.quantity, 0);
});

// Virtual for estimated delivery if not set
orderSchema.virtual('defaultEstimatedDelivery').get(function() {
  if (this.estimatedDelivery) return this.estimatedDelivery;
  
  const baseDate = this.shippedAt || this.createdAt;
  const deliveryDays = this.shippingPrice === 0 ? 7 : 3; // Free shipping takes longer
  return new Date(baseDate.getTime() + deliveryDays * 24 * 60 * 60 * 1000);
});

// Generate unique order number
orderSchema.pre('save', async function(next) {
  if (this.isNew) {
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    // Find the last order number for today
    const todayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    
    const lastOrder = await this.constructor.findOne({
      createdAt: { $gte: todayStart, $lt: todayEnd }
    }).sort({ createdAt: -1 });
    
    let sequence = 1;
    if (lastOrder && lastOrder.orderNumber) {
      const lastSequence = parseInt(lastOrder.orderNumber.substr(-4));
      sequence = lastSequence + 1;
    }
    
    this.orderNumber = `ORD${year}${month}${day}${sequence.toString().padStart(4, '0')}`;
  }
  next();
});

// Update status history when status changes
orderSchema.pre('save', function(next) {
  if (this.isModified('status') && !this.isNew) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
      note: `Status updated to ${this.status}`
    });

    // Set specific date fields based on status
    switch (this.status) {
      case 'shipped':
        if (!this.shippedAt) this.shippedAt = new Date();
        break;
      case 'delivered':
        if (!this.deliveredAt) this.deliveredAt = new Date();
        this.isDelivered = true;
        break;
      case 'cancelled':
        if (!this.cancelledAt) this.cancelledAt = new Date();
        break;
      case 'refunded':
        if (!this.refundedAt) this.refundedAt = new Date();
        break;
    }
  }
  next();
});

// Initialize status history for new orders
orderSchema.pre('save', function(next) {
  if (this.isNew) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
      note: 'Order created'
    });
  }
  next();
});

// Static method to get orders by user
orderSchema.statics.getOrdersByUser = function(userId, options = {}) {
  const { page = 1, limit = 10, status } = options;
  const filter = { user: userId };
  
  if (status) filter.status = status;
  
  const skip = (page - 1) * limit;
  
  return this.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('orderItems.product', 'name images slug')
    .populate('user', 'name email');
};

// Static method to get order statistics
orderSchema.statics.getOrderStats = async function(startDate, endDate) {
  const matchStage = {};
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$totalPrice' },
        averageOrderValue: { $avg: '$totalPrice' },
        paidOrders: {
          $sum: { $cond: [{ $eq: ['$isPaid', true] }, 1, 0] }
        },
        deliveredOrders: {
          $sum: { $cond: [{ $eq: ['$isDelivered', true] }, 1, 0] }
        }
      }
    }
  ]);

  const statusBreakdown = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        revenue: { $sum: '$totalPrice' }
      }
    }
  ]);

  return {
    summary: stats[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      averageOrderValue: 0,
      paidOrders: 0,
      deliveredOrders: 0
    },
    statusBreakdown
  };
};

// Instance method to update payment status
orderSchema.methods.updatePaymentStatus = async function(paymentResult) {
  this.isPaid = true;
  this.paidAt = new Date();
  this.paymentResult = paymentResult;
  
  if (this.status === 'pending') {
    this.status = 'processing';
  }
  
  await this.save();
  return this;
};

// Instance method to cancel order
orderSchema.methods.cancelOrder = async function(reason, cancelledBy) {
  if (['shipped', 'delivered'].includes(this.status)) {
    throw new Error('Cannot cancel shipped or delivered orders');
  }

  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.cancellationReason = reason;

  this.statusHistory.push({
    status: 'cancelled',
    timestamp: new Date(),
    note: `Order cancelled: ${reason}`,
    updatedBy: cancelledBy
  });

  await this.save();
  return this;
};

// Instance method to calculate shipping cost
orderSchema.methods.calculateShipping = function() {
  const totalWeight = this.orderItems.reduce((total, item) => {
    // Assume average weight per item if not specified
    return total + (item.quantity * 0.5); 
  }, 0);

  if (this.itemsPrice >= 100) {
    return 0; // Free shipping for orders over $100
  }

  if (totalWeight <= 2) {
    return 5.99;
  } else if (totalWeight <= 5) {
    return 9.99;
  } else {
    return 15.99;
  }
};

export default mongoose.model('Order', orderSchema);