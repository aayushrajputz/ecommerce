import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js'

// Route imports
import authRoutes from './routes/routes-authRoutes.js';
import productRoutes from './routes/routes-productRoutes.js';
import orderRoutes from './routes/routes-orderRoutes.js';
import cartRoutes from './routes/routes-cartRoutes.js';
import paymentRoutes from './routes/routes-paymentRoutes.js';
import adminRoutes from './routes/routes-adminRoutes.js';

// Load environment variables
dotenv.config();

// Connect to Database
connectDB();

const app = express();

// Trust proxy - important for rate limiting behind proxies
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all requests
app.use(limiter);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:8080',
  'http://localhost:8080',
  'https://ecommerce-ibevxepjm-aayushrajputzs-projects.vercel.app' // <-- User's actual Vercel frontend URL
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Logging middleware
app.use(morgan('combined'));

// Static files
app.use('/uploads', express.static('uploads'));

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'E-commerce Backend API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/payments', paymentRoutes);
console.log('Payment routes mounted');
app.use('/api/admin', adminRoutes);

// Welcome route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to E-commerce Backend API',
    version: '1.0.0',
    documentation: '/api/docs',
    status: 'Active',
    features: [
      'User Authentication & Authorization',
      'Product Management & Search',
      'Shopping Cart & Wishlist',
      'Order Management & Tracking',
      'Payment Integration (Stripe & Razorpay)',
      'Admin Dashboard & Analytics',
      'Real Product Data with Reviews'
    ],
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      orders: '/api/orders',
      cart: '/api/cart',
      payments: '/api/payments',
      admin: '/api/admin'
    }
  });
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`
🚀 E-commerce Backend Server Started Successfully!
📍 Server running on port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'}
🔗 Health Check: http://localhost:${PORT}/health
📚 API Documentation: http://localhost:${PORT}/
⚡ Ready to handle requests...
  `);
});

export default app;