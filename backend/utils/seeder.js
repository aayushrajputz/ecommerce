import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import connectDB from '../config/db.js';

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

// Sample users data
const users = [
  {
    name: 'Admin User',
    email: 'admin@ecommerce.com',
    password: bcrypt.hashSync('admin123', 12),
    isAdmin: true,
    isActive: true,
    phone: '+1234567890',
    addresses: [
      {
        name: 'Admin User',
        address: '123 Admin Street',
        city: 'New York',
        postalCode: '10001',
        country: 'United States',
        phone: '+1234567890',
        isDefault: true
      }
    ]
  },
  {
    name: 'John Doe',
    email: 'john@example.com',
    password: bcrypt.hashSync('user123', 12),
    isAdmin: false,
    isActive: true,
    phone: '+1234567891',
    addresses: [
      {
        name: 'John Doe',
        address: '456 User Avenue',
        city: 'Los Angeles',
        postalCode: '90210',
        country: 'United States',
        phone: '+1234567891',
        isDefault: true
      }
    ]
  },
  {
    name: 'Jane Smith',
    email: 'jane@example.com',
    password: bcrypt.hashSync('user123', 12),
    isAdmin: false,
    isActive: true,
    phone: '+1234567892',
    addresses: [
      {
        name: 'Jane Smith',
        address: '789 Customer Road',
        city: 'Chicago',
        postalCode: '60601',
        country: 'United States',
        phone: '+1234567892',
        isDefault: true
      }
    ]
  }
];

// Function to fetch real product data from DummyJSON
const fetchRealProducts = async () => {
  try {
    console.log('🔄 Fetching real product data from DummyJSON API...');
    const response = await axios.get('https://dummyjson.com/products?limit=100');
    const dummyProducts = response.data.products;
    const products = dummyProducts.map(product => ({
      name: product.title,
      description: product.description,
      shortDescription: product.description.substring(0, 200) + '...',
      price: Math.round(product.price * 100) / 100,
      comparePrice: product.discountPercentage > 0 ? Math.round((product.price / (1 - product.discountPercentage / 100)) * 100) / 100 : null,
      images: product.images.map((url, index) => ({
        url: url,
        altText: `${product.title} image ${index + 1}`,
        isMain: index === 0
      })),
      category: product.category,
      brand: product.brand || 'Generic',
      sku: `SKU-${product.id}-${Date.now()}`,
      countInStock: Math.floor(Math.random() * 100) + 10,
      lowStockThreshold: 5,
      rating: Math.round(product.rating * 10) / 10,
      numReviews: Math.floor(Math.random() * 50) + 5,
      isFeatured: Math.random() > 0.8,
      isActive: true,
      tags: product.tags || [product.category.toLowerCase()],
      specifications: [
        { name: 'Weight', value: `${Math.random() * 5 + 0.5} kg` },
        { name: 'Dimensions', value: `${Math.floor(Math.random() * 50 + 10)} x ${Math.floor(Math.random() * 50 + 10)} x ${Math.floor(Math.random() * 20 + 5)} cm` },
        { name: 'Material', value: 'High Quality Materials' },
        { name: 'Warranty', value: '1 Year Manufacturer Warranty' }
      ],
      metaTitle: product.title,
      metaDescription: product.description.substring(0, 160),
      reviews: Array.from({ length: Math.floor(Math.random() * 3) + 1 }, (_, i) => ({
        user: null,
        name: ['Alice Johnson', 'Bob Wilson', 'Carol Brown', 'David Lee'][Math.floor(Math.random() * 4)],
        rating: Math.floor(Math.random() * 2) + 4,
        comment: [
          'Great product! Excellent quality and fast shipping.',
          'Love this item! Exactly as described.',
          'Good value for money. Recommended!',
          'Nice quality product. Will buy again.',
          'Perfect! Exceeded my expectations.'
        ][Math.floor(Math.random() * 5)]
      })),
      variants: [] // <-- force empty array for all products
    }));
    console.log(`✅ Successfully fetched ${products.length} products`);
    return products;
  } catch (error) {
    console.error('❌ Error fetching products:', error.message);
    console.log('📝 Using sample product data instead...');
    // Fallback: return a larger set of diverse sample products
    const fallbackProducts = [];
    const categories = [
      'Electronics', 'Fashion', 'Home', 'Beauty', 'Sports', 'Books', 'Toys', 'Grocery', 'Automotive', 'Garden',
      'Office', 'Music', 'Health', 'Outdoors', 'Jewelry', 'Shoes', 'Bags', 'Watches', 'Pet Supplies', 'Baby',
      'Furniture', 'Lighting', 'Kitchen', 'Appliances', 'Stationery', 'Art', 'Crafts', 'Photography', 'Travel', 'Fitness',
      'Games', 'Movies', 'TV', 'Smart Home', 'Tools', 'Hardware', 'Cleaning', 'Party', 'Seasonal', 'Collectibles',
      'Luggage', 'Bedding', 'Bath', 'Storage', 'Organization', 'Safety', 'Medical', 'Industrial', 'Building', 'Energy'
    ];
    const sampleImages = [
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8',
      'https://images.unsplash.com/photo-1496181133206-80ce9b88a853',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9',
      'https://images.unsplash.com/photo-1512436991641-6745cdb1723f',
      'https://images.unsplash.com/photo-1519183071298-a2962eadc4c6',
      'https://images.unsplash.com/photo-1567016549371-9fe3d38ec3fb',
      'https://images.unsplash.com/photo-1595433707802-962f2aa0b40e',
      'https://images.unsplash.com/photo-1517649763962-0c623066013b',
      'https://images.unsplash.com/photo-1580894894511-d6d9e6442b98',
      'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf'
    ];
    // Ensure at least 2 products per category
    let prodCount = 1;
    categories.forEach((category, idx) => {
      for (let j = 0; j < 2; j++) {
        const imgUrl = sampleImages[(prodCount + j) % sampleImages.length];
        fallbackProducts.push({
          name: `Sample Product ${prodCount}`,
          category,
          brand: `Brand${((prodCount + j) % 10) + 1}`,
          price: Math.round(Math.random() * 500) + 10,
          countInStock: Math.floor(Math.random() * 100) + 1,
          description: `This is a description for Sample Product ${prodCount} in ${category}.`,
          shortDescription: `Short description for Sample Product ${prodCount}.`,
          images: [
            { url: imgUrl, altText: `Sample Product ${prodCount}`, isMain: true }
          ],
          sku: `SAMPLE-${prodCount.toString().padStart(3, '0')}`,
          rating: (Math.random() * 2 + 3).toFixed(1),
          numReviews: Math.floor(Math.random() * 100),
          isFeatured: prodCount % 10 === 0,
          isActive: true,
          tags: [category.toLowerCase()],
          specifications: [],
          reviews: [],
          variants: []
        });
        prodCount++;
      }
    });
    // Fill up to 100+ products as before
    for (let i = prodCount; i <= 100; i++) {
      const category = categories[i % categories.length];
      const imgUrl = sampleImages[i % sampleImages.length];
      fallbackProducts.push({
        name: `Sample Product ${i}`,
        category,
        brand: `Brand${(i % 10) + 1}`,
        price: Math.round(Math.random() * 500) + 10,
        countInStock: Math.floor(Math.random() * 100) + 1,
        description: `This is a description for Sample Product ${i} in ${category}.`,
        shortDescription: `Short description for Sample Product ${i}.`,
        images: [
          { url: imgUrl, altText: `Sample Product ${i}`, isMain: true }
        ],
        sku: `SAMPLE-${i.toString().padStart(3, '0')}`,
        rating: (Math.random() * 2 + 3).toFixed(1),
        numReviews: Math.floor(Math.random() * 100),
        isFeatured: i % 10 === 0,
        isActive: true,
        tags: [category.toLowerCase()],
        specifications: [],
        reviews: [],
        variants: []
      });
    }
    return fallbackProducts;
  }
};

// Fallback sample products
const getSampleProducts = () => {
  return [
    {
      name: 'iPhone 15 Pro Max',
      description: 'The latest iPhone with advanced camera system, A17 Pro chip, and titanium design. Features ProRAW photography, 5G connectivity, and exceptional battery life.',
      shortDescription: 'Latest iPhone with A17 Pro chip and titanium design.',
      price: 999.99,
      comparePrice: 1099.99,
      images: [
        { url: 'https://images.unsplash.com/photo-1592286634296-02c07406b966', altText: 'iPhone 15 Pro Max', isMain: true },
        { url: 'https://images.unsplash.com/photo-1565849904461-04a58ad377e0', altText: 'iPhone side view', isMain: false }
      ],
      category: 'Electronics',
      brand: 'Apple',
      sku: 'IPHONE-15-PM-001',
      countInStock: 50,
      rating: 4.8,
      numReviews: 125,
      isFeatured: true,
      tags: ['smartphone', 'apple', 'premium'],
      specifications: [
        { name: 'Display', value: '6.7-inch Super Retina XDR' },
        { name: 'Chip', value: 'A17 Pro' },
        { name: 'Camera', value: '48MP Main + 12MP Ultra Wide' },
        { name: 'Storage', value: '256GB' }
      ],
      reviews: [],
      variants: [],
    },
    {
      name: 'Samsung Galaxy S24 Ultra',
      description: 'Premium Android smartphone with S Pen, 200MP camera, and AI-powered features. Perfect for productivity and creativity.',
      shortDescription: 'Premium Android smartphone with S Pen and 200MP camera.',
      price: 899.99,
      comparePrice: 1199.99,
      images: [
        { url: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf', altText: 'Samsung Galaxy S24 Ultra', isMain: true }
      ],
      category: 'Electronics',
      brand: 'Samsung',
      sku: 'GALAXY-S24-U-001',
      countInStock: 35,
      rating: 4.7,
      numReviews: 89,
      isFeatured: true,
      tags: ['smartphone', 'android', 'samsung'],
      specifications: [
        { name: 'Display', value: '6.8-inch Dynamic AMOLED' },
        { name: 'Camera', value: '200MP + 12MP + 10MP + 10MP' },
        { name: 'Battery', value: '5000mAh' },
        { name: 'Storage', value: '512GB' }
      ],
      reviews: [],
      variants: [],
    },
    {
      name: 'Sony WH-1000XM5 Headphones',
      description: 'Industry-leading noise canceling headphones with premium sound and comfort.',
      shortDescription: 'Noise canceling headphones with premium sound.',
      price: 399.99,
      comparePrice: 499.99,
      images: [
        { url: 'https://images.unsplash.com/photo-1580894894511-d6d9e6442b98', altText: 'Sony WH-1000XM5', isMain: true }
      ],
      category: 'Electronics',
      brand: 'Sony',
      sku: 'SONY-WH1000XM5-001',
      countInStock: 20,
      rating: 4.9,
      numReviews: 200,
      isFeatured: false,
      tags: ['headphones', 'sony', 'audio'],
      specifications: [
        { name: 'Type', value: 'Over-ear' },
        { name: 'Battery Life', value: '30 hours' },
        { name: 'Noise Canceling', value: 'Yes' }
      ],
      reviews: [],
      variants: [],
    },
    {
      name: 'Nike Air Max 270',
      description: 'Popular lifestyle sneakers with a large Air unit for comfort and style.',
      shortDescription: 'Lifestyle sneakers with Air Max cushioning.',
      price: 150.00,
      comparePrice: 180.00,
      images: [
        { url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9', altText: 'Nike Air Max 270', isMain: true }
      ],
      category: 'Fashion',
      brand: 'Nike',
      sku: 'NIKE-AM270-001',
      countInStock: 40,
      rating: 4.6,
      numReviews: 75,
      isFeatured: false,
      tags: ['shoes', 'nike', 'fashion'],
      specifications: [
        { name: 'Material', value: 'Mesh & Synthetic' },
        { name: 'Sole', value: 'Rubber' }
      ],
      reviews: [],
      variants: [],
    },
    {
      name: 'Instant Pot Duo 7-in-1',
      description: 'Multi-use programmable pressure cooker for fast and easy meals.',
      shortDescription: '7-in-1 programmable pressure cooker.',
      price: 129.99,
      comparePrice: 149.99,
      images: [
        { url: 'https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38', altText: 'Instant Pot Duo', isMain: true }
      ],
      category: 'Home',
      brand: 'Instant Pot',
      sku: 'INSTANTPOT-DUO-001',
      countInStock: 25,
      rating: 4.7,
      numReviews: 60,
      isFeatured: false,
      tags: ['kitchen', 'appliance', 'home'],
      specifications: [
        { name: 'Functions', value: 'Pressure Cooker, Slow Cooker, Rice Cooker, Steamer, Sauté, Yogurt Maker, Warmer' }
      ],
      reviews: [],
      variants: [],
    }
  ];
};

// Function to generate sample orders
const generateSampleOrders = (users, products) => {
  const orders = [];
  const statuses = ['pending', 'processing', 'shipped', 'delivered'];
  const paymentMethods = ['stripe', 'razorpay', 'cash_on_delivery'];

  for (let i = 0; i < 20; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const orderItems = [];
    const numItems = Math.floor(Math.random() * 3) + 1; // 1-3 items per order

    for (let j = 0; j < numItems; j++) {
      const product = products[Math.floor(Math.random() * products.length)];
      const quantity = Math.floor(Math.random() * 3) + 1;
      
      orderItems.push({
        product: product._id,
        name: product.name,
        image: product.images[0]?.url || '',
        price: product.price,
        quantity: quantity
      });
    }

    const itemsPrice = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const taxPrice = itemsPrice * 0.08;
    const shippingPrice = itemsPrice > 100 ? 0 : 10;
    const totalPrice = itemsPrice + taxPrice + shippingPrice;
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    orders.push({
      orderNumber: `ORD-${Date.now()}-${i}`,
      user: user._id,
      orderItems,
      shippingAddress: user.addresses[0],
      billingAddress: user.addresses[0],
      paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
      status,
      isPaid: status !== 'pending',
      paidAt: status !== 'pending' ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) : null,
      isDelivered: status === 'delivered',
      deliveredAt: status === 'delivered' ? new Date(Date.now() - Math.random() * 15 * 24 * 60 * 60 * 1000) : null,
      createdAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000) // Orders from last 60 days
    });
  }

  return orders;
};

// Import data function
const importData = async () => {
  try {
    console.log('🧹 Cleaning existing data...');
    await Order.deleteMany({});
    await Cart.deleteMany({});
    await Product.deleteMany({});
    await User.deleteMany({});

    console.log('👥 Creating users...');
    const createdUsers = await User.insertMany(users);
    console.log(`✅ ${createdUsers.length} users created`);

    console.log('📦 Creating products...');
    const productsData = await fetchRealProducts();
    
    // Update reviews with actual user IDs
    productsData.forEach(product => {
      product.reviews.forEach(review => {
        review.user = createdUsers[Math.floor(Math.random() * createdUsers.length)]._id;
      });
    });

    // Ensure every product has a unique, non-null slug
    const slugify = (str) =>
      str && typeof str === 'string'
        ? str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        : '';
    const usedSlugs = new Set();
    productsData.forEach(product => {
      let baseSlug = slugify(product.slug || product.name);
      let slug = baseSlug;
      let i = 1;
      while (!slug || usedSlugs.has(slug)) {
        slug = baseSlug + '-' + i;
        i++;
      }
      product.slug = slug;
      usedSlugs.add(slug);
    });

    // Ensure all products have valid variants (no null sku)
    productsData.forEach(product => {
      if (!Array.isArray(product.variants) || product.variants.length === 0) {
        product.variants = [];
      } else {
        product.variants = product.variants.filter(v => v && v.sku);
        product.variants.forEach((v, idx) => {
          if (!v.sku) v.sku = `${product.sku}-VAR${idx+1}`;
        });
      }
    });

    // Final patch: clean up variants for all products before insert
    productsData.forEach(product => {
      if (!Array.isArray(product.variants)) {
        product.variants = [];
      }
      product.variants = product.variants.filter(
        v => v && typeof v === 'object' && v.sku !== null && v.sku !== undefined
      );
    });

    const createdProducts = await Product.insertMany(productsData);
    console.log(`✅ ${createdProducts.length} products created`);

    console.log('🛒 Creating sample orders...');
    const ordersData = generateSampleOrders(createdUsers, createdProducts);
    const createdOrders = await Order.insertMany(ordersData);
    console.log(`✅ ${createdOrders.length} orders created`);

    console.log('🎉 Data seeding completed successfully!');
    console.log(`
📊 Summary:
- Users: ${createdUsers.length}
- Products: ${createdProducts.length}  
- Orders: ${createdOrders.length}

🔑 Admin Credentials:
Email: admin@ecommerce.com
Password: admin123

👤 Test User Credentials:
Email: john@example.com
Password: user123
    `);

    process.exit();
    
  } catch (error) {
    console.error('❌ Error during data seeding:', error);
    process.exit(1);
  }
};

// Destroy data function
const destroyData = async () => {
  try {
    console.log('🧹 Destroying all data...');
    
    await Order.deleteMany({});
    await Cart.deleteMany({});
    await Product.deleteMany({});
    await User.deleteMany({});

    console.log('✅ All data destroyed successfully!');
    process.exit();
    
  } catch (error) {
    console.error('❌ Error destroying data:', error);
    process.exit(1);
  }
};

// Check command line arguments
if (process.argv[2] === '-d') {
  destroyData();
} else {
  importData();
}