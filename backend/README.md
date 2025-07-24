# Complete E-Commerce Backend

A production-ready e-commerce backend built with Node.js, Express, MongoDB, JWT authentication, and payment integration (Stripe & Razorpay).

## 🚀 Features

### Core E-Commerce Functionality
- ✅ **User Authentication & Authorization** - JWT-based with role management
- ✅ **Product Catalog Management** - Full CRUD with categories, brands, reviews
- ✅ **Shopping Cart System** - Persistent cart with coupon support
- ✅ **Order Management** - Complete order lifecycle tracking
- ✅ **Payment Integration** - Stripe (international) + Razorpay (India) + Cash on Delivery
- ✅ **Product Reviews & Ratings** - User review system with 5-star ratings
- ✅ **Multi-Address Support** - Users can manage multiple shipping addresses

### Advanced Features
- ✅ **Admin Dashboard** - Analytics, user management, product management
- ✅ **Real Product Data** - 100+ products with images, descriptions, specifications
- ✅ **Advanced Filtering** - Search by category, price range, rating, keywords
- ✅ **Inventory Management** - Stock tracking with low-stock alerts
- ✅ **Order Status Tracking** - Real-time order status updates
- ✅ **Security Best Practices** - Rate limiting, input validation, CORS, helmet

## 📁 Project Structure

```
ecommerce-backend/
├── config/
│   └── db.js                 # Database connection
├── middleware/
│   ├── authMiddleware.js     # JWT authentication & authorization
│   └── errorMiddleware.js    # Centralized error handling
├── models/
│   ├── User.js               # User authentication & profiles
│   ├── Product.js            # Product catalog with reviews
│   ├── Order.js              # Order management & tracking
│   └── Cart.js               # Shopping cart functionality
├── routes/
│   ├── authRoutes.js         # Authentication endpoints
│   ├── productRoutes.js      # Product CRUD & filtering
│   ├── orderRoutes.js        # Order management
│   ├── cartRoutes.js         # Cart operations
│   ├── paymentRoutes.js      # Payment gateway integration
│   └── adminRoutes.js        # Admin dashboard & management
├── utils/
│   └── seeder.js             # Database seeder with real data
├── uploads/                  # File upload directory
├── server.js                 # Main application entry point
├── package.json              # Dependencies and scripts
└── .env                      # Environment variables
```

## 🛠️ Quick Setup

### Prerequisites
- Node.js 16+ installed
- MongoDB 4.4+ (local or Atlas)
- npm or yarn package manager

### 1. Installation
```bash
# Clone or create project directory
mkdir ecommerce-backend && cd ecommerce-backend

# Copy all the provided files into the project directory
# (server.js, package.json, models/, routes/, config/, etc.)

# Install dependencies
npm install
```

### 2. Environment Configuration
```bash
# Create .env file from the provided template
cp env-example.txt .env

# Edit .env file with your actual configuration
nano .env
```

**Required Environment Variables:**
```env
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/ecommerce
JWT_SECRET=your-super-secret-jwt-key
STRIPE_SECRET_KEY=sk_test_your_stripe_key
RAZORPAY_KEY_ID=rzp_test_your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
CLIENT_URL=http://localhost:3000
```

### 3. Database Setup & Seeding
```bash
# Seed database with real product data and sample users
npm run seed

# This will create:
# - Admin user: admin@ecommerce.com / admin123
# - Test users: john@example.com / user123, jane@example.com / user123
# - 100+ real products with images and reviews
# - Sample orders with different statuses
```

### 4. Start the Server
```bash
# Development mode (with nodemon)
npm run dev

# Production mode
npm start
```

The server will start at `http://localhost:5000`

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/change-password` - Change password
- `POST /api/auth/addresses` - Add address
- `PUT /api/auth/addresses/:id` - Update address
- `DELETE /api/auth/addresses/:id` - Delete address
- `GET /api/auth/wishlist` - Get wishlist
- `POST /api/auth/wishlist/:productId` - Add to wishlist
- `DELETE /api/auth/wishlist/:productId` - Remove from wishlist

### Product Endpoints
- `GET /api/products` - Get all products (with filtering/search)
- `GET /api/products/:id` - Get single product
- `GET /api/products/slug/:slug` - Get product by slug
- `POST /api/products` - Create product (Admin)
- `PUT /api/products/:id` - Update product (Admin)
- `DELETE /api/products/:id` - Delete product (Admin)
- `POST /api/products/:id/reviews` - Add product review
- `GET /api/products/:id/reviews` - Get product reviews
- `GET /api/products/categories/list` - Get all categories
- `GET /api/products/brands/list` - Get all brands
- `GET /api/products/featured/list` - Get featured products

### Order Endpoints
- `POST /api/orders` - Create new order
- `GET /api/orders` - Get user orders
- `GET /api/orders/:id` - Get order by ID
- `PUT /api/orders/:id/pay` - Update order to paid
- `PUT /api/orders/:id/cancel` - Cancel order
- `GET /api/orders/track/:orderNumber` - Track order by number
- `POST /api/orders/:id/reorder` - Reorder from existing order

### Cart Endpoints
- `GET /api/cart` - Get user cart
- `POST /api/cart/add` - Add item to cart
- `PUT /api/cart/update` - Update cart item quantity
- `DELETE /api/cart/remove` - Remove item from cart
- `DELETE /api/cart/clear` - Clear entire cart
- `POST /api/cart/coupon` - Apply coupon
- `DELETE /api/cart/coupon` - Remove coupon
- `POST /api/cart/merge` - Merge guest cart with user cart

### Payment Endpoints
- `POST /api/payments/stripe/create-intent` - Create Stripe payment intent
- `POST /api/payments/stripe/confirm` - Confirm Stripe payment
- `POST /api/payments/razorpay/create-order` - Create Razorpay order
- `POST /api/payments/razorpay/verify` - Verify Razorpay payment
- `GET /api/payments/methods` - Get available payment methods
- `POST /api/payments/refund` - Process refund (Admin)

### Admin Endpoints
- `GET /api/admin/dashboard` - Get dashboard statistics
- `GET /api/admin/users` - Get all users with pagination
- `GET /api/admin/users/:id` - Get user details
- `PUT /api/admin/users/:id` - Update user status
- `GET /api/admin/products` - Get all products for admin
- `PUT /api/admin/products/:id/status` - Update product status
- `GET /api/admin/analytics/products` - Get product analytics
- `GET /api/admin/analytics/sales` - Get sales analytics
- `POST /api/admin/cleanup` - Cleanup old data

## 🔧 API Testing Examples

### User Registration
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "testpass123",
    "phone": "1234567890"
  }'
```

### User Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@ecommerce.com",
    "password": "admin123"
  }'
```

### Get Products with Filters
```bash
curl "http://localhost:5000/api/products?category=Electronics&minPrice=100&maxPrice=500&sortBy=price&sortOrder=asc&page=1&limit=12"
```

### Add Item to Cart (Authenticated)
```bash
curl -X POST http://localhost:5000/api/cart/add \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "productId": "PRODUCT_ID",
    "quantity": 2
  }'
```

### Create Order (Authenticated)
```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "orderItems": [{"product": "PRODUCT_ID", "quantity": 2}],
    "shippingAddress": {
      "name": "Test User",
      "address": "123 Test St",
      "city": "Test City",
      "postalCode": "12345",
      "country": "USA",
      "phone": "1234567890"
    },
    "paymentMethod": "stripe"
  }'
```

## 🔐 Security Features

- **Password Hashing**: bcrypt with 12 salt rounds
- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: Comprehensive validation using express-validator
- **CORS Protection**: Configured for specific origins
- **Security Headers**: Helmet middleware for HTTP security
- **Injection Prevention**: MongoDB injection and XSS protection

## 📊 Database Schema

### Users Collection
- Authentication info (email, password hash)
- Profile data (name, phone, avatar, addresses)
- Wishlist and account settings
- Role-based permissions (user/admin)

### Products Collection
- Product information (name, description, price, images)
- Inventory tracking (stock, low-stock alerts)
- Categories, brands, and specifications
- Reviews and ratings system
- SEO fields (meta title, description)

### Orders Collection
- Order items with product references
- Shipping and billing addresses
- Payment information and status
- Order status tracking with history
- Pricing breakdown (items, tax, shipping)

### Cart Collection
- User-specific cart items
- Quantity and pricing calculations
- Coupon support and discounts
- Automatic cleanup of old carts

## 🚀 Deployment

### Environment Variables for Production
```env
NODE_ENV=production
PORT=5000
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/ecommerce
JWT_SECRET=production-secret-key-very-long-and-secure
STRIPE_SECRET_KEY=sk_live_your_live_stripe_key
RAZORPAY_KEY_ID=rzp_live_your_live_razorpay_key
CLIENT_URL=https://your-frontend-domain.com
```

### Deployment Options
- **Heroku**: Simple git-based deployment
- **DigitalOcean App Platform**: Automatic scaling
- **Railway**: GitHub integration
- **AWS/GCP**: Full cloud deployment with managed databases

### Production Checklist
- [ ] MongoDB Atlas cluster setup
- [ ] SSL certificate installation
- [ ] Payment gateway webhook configuration
- [ ] Environment variables configured
- [ ] Database indexing optimization
- [ ] Monitoring and logging setup
- [ ] Error tracking (e.g., Sentry)
- [ ] Backup strategy implementation

## 🧪 Testing

### Manual Testing
1. Register a new user
2. Login with admin credentials
3. Browse and filter products
4. Add items to cart
5. Create an order
6. Test payment integration
7. Check admin dashboard

### Automated Testing (Future Enhancement)
```bash
# Install testing dependencies
npm install --save-dev jest supertest mongodb-memory-server

# Run tests
npm test
```

## 📈 Performance Optimization

- Database indexing on frequently queried fields
- Pagination for large datasets
- Image optimization and CDN integration
- Caching strategy with Redis (optional)
- Rate limiting to prevent abuse
- Efficient aggregation pipelines for analytics

## 🛟 Troubleshooting

### Common Issues

**MongoDB Connection Error**
```bash
# Check if MongoDB is running
mongod --version
# For Windows:
net start MongoDB
```

**JWT Token Invalid**
- Ensure JWT_SECRET is set correctly in .env
- Check token format in Authorization header
- Verify user account status

**Payment Gateway 401 Error**
- Confirm API keys are correctly configured
- Use test keys for development
- Check webhook endpoint accessibility

**Port Already in Use**
```bash
# Kill process using port 5000
npx kill-port 5000
# Or change PORT in .env file
```

## 📝 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the documentation for common solutions
- Review the API examples provided

---

**Ready to build your e-commerce empire! 🛍️**