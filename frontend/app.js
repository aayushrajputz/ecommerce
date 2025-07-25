// ShopHub E-commerce Application - Bug Fixes

/*****************
 * PRODUCT DATA   *
 *****************/
// Remove PRODUCTS_DATA and fetch from backend instead

/*****************
 * GLOBAL STATE   *
 *****************/
class AppState {
  constructor() {
    this.products = [];
    this.cart = [];
    this.filters = {
      category: '',
      brands: [],
      search: '',
      minPrice: 0,
      maxPrice: 3500,
      inStockOnly: false
    };
    this.sortBy = 'name-asc';
    this.currentPage = 'home';
    this.debounceTimer = null;
    this.categories = [];
    this.allBrands = [];
  }

  async fetchProducts() {
    try {
      const response = await fetch("https://ecommerce-6zo5.onrender.com/api/products")
');
      if (!response.ok) throw new Error('Failed to fetch products');
      const data = await response.json();
      console.log('Fetched products data:', data); // DEBUG LOG
      // Try to find the first array property if products/data is not present
      if (Array.isArray(data.products)) {
        this.products = data.products;
      } else if (Array.isArray(data.data)) {
        this.products = data.data;
      } else {
        // Fallback: find the first array property in the object
        const arrProp = Object.values(data).find(v => Array.isArray(v));
        this.products = arrProp || [];
      }
      // After setting this.products, filter to only in-stock products
      if (Array.isArray(this.products)) {
        this.products = this.products.filter(p => p.countInStock > 0);
      }
      this.categories = this.getUniqueCategories();
      this.allBrands = this.getUniqueBrands();
    } catch (error) {
      console.error('Error fetching products:', error);
      showToast('Failed to load products from server', 'error');
    }
  }
  
  getUniqueCategories() {
    const categories = [...new Set(this.products.map(p => p.category))];
    return categories.map(cat => ({
      name: cat,
      count: this.products.filter(p => p.category === cat).length
    }));
  }
  
  getUniqueBrands() {
    return [...new Set(this.products.map(p => p.brand))].sort();
  }
  
  getBrandsByCategory(category) {
    if (!category) return this.allBrands;
    return [...new Set(this.products
      .filter(p => p.category === category)
      .map(p => p.brand))].sort();
  }
  
  getFilteredProducts() {
    let filtered = this.products.filter(product => {
      // Category filter
      if (this.filters.category && product.category !== this.filters.category) {
        return false;
      }
      
      // Brand filter
      if (this.filters.brands.length > 0 && !this.filters.brands.includes(product.brand)) {
        return false;
      }
      
      // Search filter
      if (this.filters.search) {
        const searchLower = this.filters.search.toLowerCase();
        if (!product.name.toLowerCase().includes(searchLower) &&
            !product.brand.toLowerCase().includes(searchLower) &&
            !product.category.toLowerCase().includes(searchLower)) {
          return false;
        }
      }
      
      // Price range filter
      if (product.price < this.filters.minPrice || product.price > this.filters.maxPrice) {
        return false;
      }
      
      // Show all products, do not filter by countInStock
      // if (this.filters.inStockOnly && !product.inStock) {
      //   return false;
      // }
      
      return true;
    });
    
    // Apply sorting
    return this.sortProducts(filtered);
  }
  
  sortProducts(products) {
    const [field, direction] = this.sortBy.split('-');
    return products.sort((a, b) => {
      let aVal, bVal;
      
      switch (field) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'price':
          aVal = a.price;
          bVal = b.price;
          break;
        default:
          return 0;
      }
      
      if (direction === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });
  }
  
  addToCart(productId) {
    const product = this.products.find(p => p._id === productId);
    if (!product) return false;
    const existingItem = this.cart.find(item => item._id === productId);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      this.cart.push({
        _id: productId,
        name: product.name,
        brand: product.brand,
        price: product.price,
        image: product.image,
        quantity: 1
      });
    }
    return true;
  }
  
  removeFromCart(productId) {
    this.cart = this.cart.filter(item => item._id !== productId);
  }
  
  updateCartQuantity(productId, quantity) {
    const item = this.cart.find(item => item._id === productId);
    if (item) {
      if (quantity <= 0) {
        this.removeFromCart(productId);
      } else {
        item.quantity = quantity;
      }
    }
  }
  
  getCartTotal() {
    return this.cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  }
  
  getCartItemCount() {
    return this.cart.reduce((count, item) => count + item.quantity, 0);
  }
}

/*****************
 * APP INSTANCE   *
 *****************/
const app = new AppState();

/*****************
 * UTILITIES      *
 *****************/
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const formatPrice = (price) => `$${price.toFixed(2)}`;

const showToast = (message, type = 'success') => {
  const container = $('#toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 3000);
};

const debounce = (func, delay) => {
  return function (...args) {
    clearTimeout(app.debounceTimer);
    app.debounceTimer = setTimeout(() => func.apply(this, args), delay);
  };
};

/*****************
 * RENDERING      *
 *****************/
class Renderer {
  static showPage(pageId) {
    $$('.page').forEach(page => page.classList.add('hidden'));
    const targetPage = $(`#${pageId}`);
    if (targetPage) {
      targetPage.classList.remove('hidden');
    }
    app.currentPage = pageId.replace('-page', '');
    this.updateNavigation();
  }
  
  static updateNavigation() {
    // Update main navigation
    $$('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === app.currentPage);
    });
    
    // Update mobile navigation
    $$('.mobile-nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === app.currentPage);
    });
  }
  
  static renderProductCard(product) {
    // Always show 'In Stock' and enable Add to Cart
    const stockText = 'In Stock';
    const badge = '<div class="product-card__badge in-stock">In Stock</div>';
    return `
      <div class="product-card">
        <div class="product-card__image">
          <img src="${product.image}" alt="${product.name}" loading="lazy" onerror="this.style.backgroundColor='#f0f0f0';">
          ${badge}
        </div>
        <div class="product-card__content">
          <div class="product-card__category">${product.category}</div>
          <div class="product-card__brand">${product.brand}</div>
          <h3 class="product-card__title">${product.name}</h3>
          <div class="product-card__price">
            <span class="product-card__price-current">${formatPrice(product.price)}</span>
          </div>
          <div class="product-card__stock">${stockText}</div>
          <div class="product-card__actions">
            <button class="btn btn--primary" 
                    onclick="handleAddToCart('${product._id}')">
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  static renderHome() {
    // Update total products count
    const totalProductsEl = $('#total-products');
    if (totalProductsEl) {
      totalProductsEl.textContent = app.products.length;
    }
    
    // Render featured products (first 6 in stock products)
    const featuredProducts = app.products.filter(p => p.inStock).slice(0, 6);
    const featuredContainer = $('#featured-products');
    if (featuredContainer) {
      featuredContainer.innerHTML = featuredProducts
        .map(product => this.renderProductCard(product))
        .join('');
    }
    
    // Render categories
    const categoriesContainer = $('#categories-grid');
    if (categoriesContainer) {
      categoriesContainer.innerHTML = app.categories
        .map(category => `
          <div class="category-card" onclick="handleCategoryClick('${category.name}')">
            <img src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400" 
                 alt="${category.name}" class="category-card__image">
            <div class="category-card__overlay">
              <h3 class="category-card__title">${category.name}</h3>
              <p class="category-card__count">${category.count} products</p>
            </div>
          </div>
        `).join('');
    }
  }
  
  static renderProducts() {
    const filteredProducts = app.getFilteredProducts();
    const productsGrid = $('#products-grid');
    const noResults = $('#no-results');
    const productsCount = $('#products-count');
    
    // Update products count
    if (productsCount) {
      productsCount.textContent = `${filteredProducts.length} products found`;
    }
    
    if (filteredProducts.length === 0) {
      if (productsGrid) productsGrid.innerHTML = '';
      if (noResults) noResults.classList.remove('hidden');
    } else {
      if (noResults) noResults.classList.add('hidden');
      if (productsGrid) {
        productsGrid.innerHTML = filteredProducts
          .map(product => this.renderProductCard(product))
          .join('');
      }
    }
    
    // Update filters UI
    this.updateFiltersUI();
  }
  
  static updateFiltersUI() {
    // Update category filters
    const categoryFilters = $('#category-filters');
    if (categoryFilters) {
      categoryFilters.innerHTML = app.categories
        .map(category => `
          <label>
            <input type="radio" 
                   name="category" 
                   value="${category.name}"
                   ${app.filters.category === category.name ? 'checked' : ''}
                   onchange="handleCategoryFilter('${category.name}')">
            ${category.name} (${category.count})
          </label>
        `).join('') + `
          <label>
            <input type="radio" 
                   name="category" 
                   value=""
                   ${app.filters.category === '' ? 'checked' : ''}
                   onchange="handleCategoryFilter('')">
            All Categories
          </label>
        `;
    }
    
    // Update brand filters based on selected category
    const availableBrands = app.getBrandsByCategory(app.filters.category);
    const brandFilters = $('#brand-filters');
    if (brandFilters) {
      brandFilters.innerHTML = availableBrands
        .map(brand => `
          <label>
            <input type="checkbox" 
                   value="${brand}"
                   ${app.filters.brands.includes(brand) ? 'checked' : ''}
                   onchange="handleBrandFilter('${brand}', this.checked)">
            ${brand}
          </label>
        `).join('');
    }
    
    // Update price range
    const priceMin = $('#price-min');
    const priceMax = $('#price-max');
    const priceMinDisplay = $('#price-min-display');
    const priceMaxDisplay = $('#price-max-display');
    
    if (priceMin) priceMin.value = app.filters.minPrice;
    if (priceMax) priceMax.value = app.filters.maxPrice;
    if (priceMinDisplay) priceMinDisplay.textContent = app.filters.minPrice;
    if (priceMaxDisplay) priceMaxDisplay.textContent = app.filters.maxPrice;
    
    // Update in stock filter
    const inStockOnly = $('#in-stock-only');
    if (inStockOnly) inStockOnly.checked = app.filters.inStockOnly;
    
    // Update search
    const productSearch = $('#product-search');
    if (productSearch) productSearch.value = app.filters.search;
    
    // Update sort
    const sortSelect = $('#sort-select');
    if (sortSelect) sortSelect.value = app.sortBy;
  }
  
  static renderCart() {
    const cartItems = $('#cart-items');
    const emptyCart = $('#empty-cart');
    const cartSummary = $('#cart-summary');
    
    if (app.cart.length === 0) {
      if (emptyCart) emptyCart.classList.remove('hidden');
      if (cartSummary) cartSummary.style.display = 'none';
      if (cartItems) cartItems.innerHTML = '';
    } else {
      if (emptyCart) emptyCart.classList.add('hidden');
      if (cartSummary) cartSummary.style.display = 'block';
      
      if (cartItems) {
        cartItems.innerHTML = app.cart
          .map(item => `
            <div class="cart-item">
              <div class="cart-item__image">
                <img src="${item.image}" alt="${item.name}">
              </div>
              <div class="cart-item__info">
                <h4>${item.name}</h4>
                <div class="brand">${item.brand}</div>
                <div class="price">${formatPrice(item.price)} each</div>
              </div>
              <div class="cart-item__quantity">
                <button class="quantity-btn" onclick="handleQuantityChange('${item._id}', ${item.quantity - 1})">-</button>
                <input type="number" class="quantity-input" value="${item.quantity}" 
                       onchange="handleQuantityChange('${item._id}', parseInt(this.value))"
                       min="1" max="99">
                <button class="quantity-btn" onclick="handleQuantityChange('${item._id}', ${item.quantity + 1})">+</button>
              </div>
              <div class="cart-item__total">${formatPrice(item.price * item.quantity)}</div>
              <button class="remove-btn" onclick="handleRemoveFromCart('${item._id}')" title="Remove item">×</button>
            </div>
          `).join('');
      }
      
      // Update cart summary
      const subtotal = app.getCartTotal();
      const tax = subtotal * 0.08; // 8% tax
      const total = subtotal + tax;
      
      const cartSubtotal = $('#cart-subtotal');
      const cartTax = $('#cart-tax');
      const cartTotal = $('#cart-total');
      
      if (cartSubtotal) cartSubtotal.textContent = formatPrice(subtotal);
      if (cartTax) cartTax.textContent = formatPrice(tax);
      if (cartTotal) cartTotal.textContent = formatPrice(total);
    }
    
    this.updateCartBadge();
  }
  
  static updateCartBadge() {
    const cartCount = $('#cart-count');
    const itemCount = app.getCartItemCount();
    
    if (cartCount) {
      cartCount.textContent = itemCount;
      cartCount.classList.toggle('visible', itemCount > 0);
    }
  }
}

/*****************
 * EVENT HANDLERS *
 *****************/
function handleAddToCart(productId) {
  const success = app.addToCart(productId);
  if (success) {
    showToast('Product added to cart!', 'success');
    Renderer.updateCartBadge();
  } else {
    showToast('Could not add product to cart', 'error');
  }
}

function handleRemoveFromCart(productId) {
  app.removeFromCart(productId);
  showToast('Item removed from cart', 'success');
  Renderer.renderCart();
}

function handleQuantityChange(productId, newQuantity) {
  app.updateCartQuantity(productId, newQuantity);
  Renderer.renderCart();
}

function handleCategoryClick(categoryName) {
  app.filters.category = categoryName;
  app.filters.brands = []; // Reset brand filters when category changes
  
  // Navigate to products page
  window.location.hash = '#products';
}

function handleCategoryFilter(category) {
  app.filters.category = category;
  app.filters.brands = []; // Reset brand filters when category changes
  Renderer.renderProducts();
}

function handleBrandFilter(brand, checked) {
  if (checked) {
    if (!app.filters.brands.includes(brand)) {
      app.filters.brands.push(brand);
    }
  } else {
    app.filters.brands = app.filters.brands.filter(b => b !== brand);
  }
  Renderer.renderProducts();
}

function handlePriceFilter() {
  const priceMinEl = $('#price-min');
  const priceMaxEl = $('#price-max');
  
  if (!priceMinEl || !priceMaxEl) return;
  
  const minPrice = parseInt(priceMinEl.value);
  const maxPrice = parseInt(priceMaxEl.value);
  
  // Ensure min is not greater than max
  if (minPrice > maxPrice) {
    priceMinEl.value = maxPrice;
    app.filters.minPrice = maxPrice;
  } else {
    app.filters.minPrice = minPrice;
  }
  app.filters.maxPrice = maxPrice;
  
  const priceMinDisplay = $('#price-min-display');
  const priceMaxDisplay = $('#price-max-display');
  if (priceMinDisplay) priceMinDisplay.textContent = app.filters.minPrice;
  if (priceMaxDisplay) priceMaxDisplay.textContent = app.filters.maxPrice;
  
  Renderer.renderProducts();
}

function handleStockFilter(checked) {
  app.filters.inStockOnly = checked;
  Renderer.renderProducts();
}

function handleSearch(query) {
  app.filters.search = query.trim();
  if (app.currentPage === 'products') {
    Renderer.renderProducts();
  }
}

function handleSort(sortBy) {
  app.sortBy = sortBy;
  Renderer.renderProducts();
}

function handleClearFilters() {
  app.filters = {
    category: '',
    brands: [],
    search: '',
    minPrice: 0,
    maxPrice: 3500,
    inStockOnly: false
  };
  Renderer.renderProducts();
}

function handleResetSearch() {
  handleClearFilters();
}

async function handleCheckout() {
  if (app.cart.length === 0) {
    showToast('Your cart is empty', 'error');
    return;
  }

  // Calculate total amount
  const amount = app.getCartTotal();

  // Call backend to create Razorpay order
  try {
    const response = await fetch('http://localhost:5000/api/payments/razorpay/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount })
    });
    if (!response.ok) throw new Error('Failed to create Razorpay order');
    const data = await response.json();
    const { orderId, key } = data;

    // Open Razorpay checkout
    const options = {
      key: key, // Razorpay key_id
      amount: amount * 100, // in paise
      currency: 'INR',
      name: 'ShopHub',
      description: 'Order Payment',
      order_id: orderId,
      handler: function (response) {
        showToast('Payment successful!', 'success');
        // Optionally, call backend to verify payment and complete order
      },
      prefill: {},
      theme: { color: '#3399cc' }
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
  } catch (error) {
    showToast('Payment failed: ' + error.message, 'error');
  }
}

/*****************
 * ROUTER         *
 *****************/
function router() {
  const hash = window.location.hash.replace('#', '') || 'home';
  
  switch (hash) {
    case 'home':
      Renderer.showPage('home-page');
      Renderer.renderHome();
      break;
    case 'products':
      Renderer.showPage('products-page');
      Renderer.renderProducts();
      break;
    case 'cart':
      Renderer.showPage('cart-page');
      Renderer.renderCart();
      break;
    default:
      window.location.hash = '#home';
  }
}

/*****************
 * APP INIT      *
 *****************/
async function initializeApp() {
  await app.fetchProducts();
  if (typeof Renderer !== 'undefined' && Renderer.renderHome) {
    Renderer.renderHome();
  }
  // Hide loading screen
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.classList.add('fade-out');
    setTimeout(() => {
      if (loadingScreen.parentNode) {
        loadingScreen.parentNode.removeChild(loadingScreen);
      }
    }, 300);
  }
}

function updateAuthButtons() {
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  if (loginBtn && logoutBtn) {
    if (isLoggedIn) {
      loginBtn.style.display = 'none';
      logoutBtn.style.display = '';
    } else {
      loginBtn.style.display = '';
      logoutBtn.style.display = 'none';
    }
  }
}

// Auth modal logic
function showAuthModal() {
  document.getElementById('auth-modal').style.display = 'block';
}
function hideAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
  document.getElementById('auth-error').textContent = '';
}

/*****************
 * INITIALIZATION *
 *****************/
document.addEventListener('DOMContentLoaded', () => {
  updateAuthButtons();
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const authModal = document.getElementById('auth-modal');
  const closeAuthModal = document.getElementById('close-auth-modal');
  const authForm = document.getElementById('auth-form');
  if (loginBtn) {
    loginBtn.addEventListener('click', showAuthModal);
  }
  if (closeAuthModal) {
    closeAuthModal.addEventListener('click', hideAuthModal);
  }
  if (authModal) {
    authModal.addEventListener('click', (e) => {
      if (e.target === authModal) hideAuthModal();
    });
  }
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;
      const errorDiv = document.getElementById('auth-error');
      errorDiv.textContent = '';
      try {
        const response = await fetch('http://localhost:5000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.message || 'Login failed');
        }
        const data = await response.json();
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('jwt', data.token); // Store JWT
        hideAuthModal();
        updateAuthButtons();
        showToast('Login successful!', 'success');
      } catch (err) {
        errorDiv.textContent = err.message;
      }
    });
  }
  initializeApp();

  // Set up navigation - Fix for navigation links
  $$("[data-page]").forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      window.location.hash = `#${page}`;
    });
  });

  // Set up search with debouncing
  const debouncedSearch = debounce(handleSearch, 300);

  const globalSearch = $('#global-search');
  if (globalSearch) {
    globalSearch.addEventListener('input', (e) => {
      debouncedSearch(e.target.value);
    });
  }

  const productSearch = $('#product-search');
  if (productSearch) {
    productSearch.addEventListener('input', (e) => {
      debouncedSearch(e.target.value);
    });
  }

  const heroSearch = $('#hero-search');
  if (heroSearch) {
    heroSearch.addEventListener('input', (e) => {
      debouncedSearch(e.target.value);
    });
  }

  // Set up hero search button
  const heroSearchBtn = $('#hero-search-btn');
  if (heroSearchBtn) {
    heroSearchBtn.addEventListener('click', () => {
      const heroSearchInput = $('#hero-search');
      const query = heroSearchInput ? heroSearchInput.value : '';
      if (query.trim()) {
        app.filters.search = query.trim();
        window.location.hash = '#products';
      }
    });
  }

  // Set up cart button
  const cartButton = $('#cart-button');
  if (cartButton) {
    cartButton.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = '#cart';
    });
  }

  // Set up mobile menu
  const mobileMenuToggle = $('#mobile-menu-toggle');
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => {
      const overlay = $('#mobile-menu-overlay');
      if (overlay) overlay.classList.add('active');
    });
  }

  const mobileMenuClose = $('#mobile-menu-close');
  const mobileMenuOverlay = $('#mobile-menu-overlay');
  if (mobileMenuClose) {
    mobileMenuClose.addEventListener('click', () => {
      if (mobileMenuOverlay) mobileMenuOverlay.classList.remove('active');
    });
  }
  if (mobileMenuOverlay) {
    mobileMenuOverlay.addEventListener('click', (e) => {
      if (e.target.id === 'mobile-menu-overlay') {
        mobileMenuOverlay.classList.remove('active');
      }
    });
  }

  // Set up filter controls
  const clearFilters = $('#clear-filters');
  if (clearFilters) clearFilters.addEventListener('click', handleClearFilters);

  const resetSearch = $('#reset-search');
  if (resetSearch) resetSearch.addEventListener('click', handleResetSearch);

  // Set up price range sliders
  const priceMin = $('#price-min');
  if (priceMin) priceMin.addEventListener('input', handlePriceFilter);

  const priceMax = $('#price-max');
  if (priceMax) priceMax.addEventListener('input', handlePriceFilter);

  // Set up stock filter
  const inStockOnly = $('#in-stock-only');
  if (inStockOnly) {
    inStockOnly.addEventListener('change', (e) => {
      handleStockFilter(e.target.checked);
    });
  }

  // Set up sort
  const sortSelect = $('#sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      handleSort(e.target.value);
    });
  }

  // Set up checkout
  const checkoutBtn = $('#checkout-btn');
  if (checkoutBtn) checkoutBtn.addEventListener('click', handleCheckout);

  // Set up hash routing
  window.addEventListener('hashchange', router);

  // Initialize cart badge
  Renderer.updateCartBadge();

  // Initial route
  router();

  // Global functions for inline event handlers
  window.handleAddToCart = handleAddToCart;
  window.handleRemoveFromCart = handleRemoveFromCart;
  window.handleQuantityChange = handleQuantityChange;
  window.handleCategoryClick = handleCategoryClick;
  window.handleCategoryFilter = handleCategoryFilter;
  window.handleBrandFilter = handleBrandFilter;
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.setItem('isLoggedIn', 'false');
      localStorage.removeItem('jwt');
      updateAuthButtons();
      window.location.reload();
    });
  }
});
