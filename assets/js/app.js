(() => {
  const cfg = window.LUXE_WEBSITE_CONFIG || {};
  const fallbackSettings = {
    site_name: cfg.SITE_NAME || 'Own Light',
    topbar_text: 'Browse products, inquire online, Instagram, or WhatsApp us directly.',
    hero_title: 'Boutique Styles, Curated by Category',
    hero_text: 'Explore boutique styles by category and send inquiries directly from the website.',
    hero_image: '',
    whatsapp_number: cfg.WHATSAPP_NUMBER || '9779868800001',
    instagram_url: cfg.INSTAGRAM_URL || '',
    default_message: cfg.DEFAULT_MESSAGE || 'Hello, I want to inquire about your boutique products.',
    contact_heading: 'Contact Own Light',
    contact_text: 'Use the inquiry form, Instagram, or WhatsApp for direct messages.',
    fonts: {
      body: 'Poppins, Arial, sans-serif',
      heading: 'Playfair Display, Georgia, serif',
      nav: 'Poppins, Arial, sans-serif',
      button: 'Poppins, Arial, sans-serif',
      body_size: '16px',
      heading_weight: '700'
    },
    colors: {
      ink: '#171515',
      muted: '#6f6a63',
      paper: '#fffaf4',
      soft: '#f5ece1',
      line: '#eadfd1',
      gold: '#b98b47',
      gold_dark: '#8f672e',
      header_background: '#fffaf4',
      footer_background: '#141414',
      whatsapp: '#25d366'
    },
    display: {
      product_card_image_height: '170px',
      category_image_height: '150px',
      product_detail_image_height: '360px',
      product_detail_gallery_width: '380px',
      product_card_min_width: '175px',
      category_card_min_width: '170px',
      thumbnail_image_height: '56px',
      image_fit: 'cover'
    }
  };

  const state = {
    settings: { ...fallbackSettings },
    categories: [],
    products: [],
    blogs: [],
    cart: loadCart(),
    connected: false,
    loading: true,
    error: ''
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  const cleanBase = () => String(cfg.CONTENT_API_BASE || '').trim().replace(/\/+$/, '');
  const contentConfigured = () => {
    const base = cleanBase();
    return /^https?:\/\//i.test(base) && !/your-site/i.test(base);
  };

  function apiUrl(endpoint) {
    return `${cleanBase()}/${String(endpoint || '').replace(/^\/+/, '')}`;
  }

  async function apiGet(endpoint) {
    const res = await fetch(apiUrl(endpoint), { headers: { accept: 'application/json' }, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.message || `Content request failed: ${res.status}`);
    return json;
  }

  function isValidEmail(value) {
    const email = String(value || '').trim();
    if (!email || email.length > 180) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
  }

  function isValidPhone(value) {
    const phone = String(value || '').trim();
    if (!phone || phone.length > 40) return false;
    if (!/^\+?[0-9][0-9\s().-]{5,24}$/.test(phone)) return false;
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }

  function normalizeCheckoutContact(customer) {
    const cleaned = { ...customer };
    cleaned.phone = String(cleaned.phone || '').trim();
    cleaned.email = String(cleaned.email || '').trim();
    if (!isValidPhone(cleaned.phone)) cleaned.phone = '';
    if (!isValidEmail(cleaned.email)) cleaned.email = '';
    return cleaned;
  }

  function requireValidCheckoutContact(customer) {
    const hasValidPhone = isValidPhone(customer.phone);
    const hasValidEmail = isValidEmail(customer.email);
    if (!hasValidPhone && !hasValidEmail) {
      throw new Error('Enter at least one valid contact: a valid phone number or a valid email address.');
    }
    return normalizeCheckoutContact(customer);
  }

  async function apiPost(endpoint, payload) {
    const res = await fetch(apiUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload || {})
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.message || `Content request failed: ${res.status}`);
    return json;
  }

  const trackedOnce = new Set();

  function trackEvent(eventType, product, extra = {}) {
    if (!contentConfigured() || !eventType || !product) return;
    const payload = {
      event_type: eventType,
      product_id: product.id || '',
      product_slug: product.slug || slugify(product.title || product.id || ''),
      product_title: product.title || '',
      page: location.hash || '#home',
      source: 'website',
      ...extra
    };
    fetch(apiUrl('track'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {});
  }

  function trackOnce(key, eventType, product, extra = {}) {
    if (trackedOnce.has(key)) return;
    trackedOnce.add(key);
    trackEvent(eventType, product, extra);
  }

  function arrayFromPayload(payload, key) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.[key])) return payload[key];
    return [];
  }

  async function loadContent() {
    state.loading = true;
    state.error = '';
    if (!contentConfigured()) {
      state.loading = false;
      state.connected = false;
      state.error = 'Website content is not configured yet. Edit config.js and set CONTENT_API_BASE to your live API URL.';
      render();
      return;
    }

    try {
      const [home, productsPayload, blogsPayload] = await Promise.all([apiGet('home'), apiGet('products'), apiGet('blogs')]);
      state.settings = { ...fallbackSettings, ...(home.settings || {}) };
      state.categories = Array.isArray(home.categories) ? home.categories : [];
      state.products = arrayFromPayload(productsPayload, 'products');
      state.blogs = arrayFromPayload(blogsPayload, 'blogs');
      if (!state.blogs.length && Array.isArray(home.blogs)) state.blogs = home.blogs;
      state.connected = true;
    } catch (error) {
      state.connected = false;
      state.error = error.message || 'Could not load website content.';
    }
    state.loading = false;
    render();
  }

  function slugify(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function getRoute() {
    const raw = (location.hash || '#home').replace(/^#\/?/, '');
    const [pathPart, queryPart = ''] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean);
    return { name: parts[0] || 'home', slug: parts[1] || '', params: new URLSearchParams(queryPart) };
  }

  function setTitle(title) {
    document.title = `${title} - ${siteName()}`;
  }

  function brandText(value) {
    return String(value ?? '').replace(new RegExp('\\b' + 'SH' + 'REE' + '\\b', 'g'), 'Own Light');
  }

  function siteName() {
    return brandText(state.settings.site_name || fallbackSettings.site_name || 'Own Light');
  }

  function setting(key, fallback = '') {
    const value = state.settings?.[key] ?? fallbackSettings[key] ?? fallback;
    return typeof value === 'string' ? brandText(value) : value;
  }

  function whatsappNumber() {
    return String(setting('whatsapp_number', cfg.WHATSAPP_NUMBER || '')).replace(/\D+/g, '') || '9779868800001';
  }

  function whatsappLink(message) {
    const text = message || setting('default_message', fallbackSettings.default_message);
    return `https://wa.me/${encodeURIComponent(whatsappNumber())}?text=${encodeURIComponent(text)}`;
  }

  function instagramUrl() {
    let url = String(setting('instagram_url', cfg.INSTAGRAM_URL || '') || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, '')}`;
    return url;
  }

  function normalizeExternalUrl(value) {
    let url = String(value || '').trim();
    if (!url) return '';
    if (/^(https?:|mailto:|tel:|sms:)/i.test(url)) return url;
    return `https://${url.replace(/^\/+/, '')}`;
  }

  function linkLabelFromUrl(url) {
    const lower = String(url || '').toLowerCase();
    if (lower.includes('instagram.com')) return 'Instagram';
    if (lower.includes('tiktok.com')) return 'TikTok';
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
    if (lower.includes('facebook.com')) return 'Facebook';
    if (lower.includes('maps.google') || lower.includes('goo.gl/maps') || lower.includes('maps.app.goo.gl')) return 'Location';
    return 'Open link';
  }

  function productMediaLinks(product) {
    const links = Array.isArray(product?.media_links) ? product.media_links : (Array.isArray(product?.links) ? product.links : []);
    return links.map((link, index) => {
      if (typeof link === 'string') return { label: linkLabelFromUrl(link), url: normalizeExternalUrl(link), hidden: false, sort_order: index + 1 };
      return {
        label: String(link?.label || '').trim() || linkLabelFromUrl(link?.url),
        url: normalizeExternalUrl(link?.url),
        hidden: !!link?.hidden,
        sort_order: Number(link?.sort_order || index + 1)
      };
    }).filter((link) => link.url && !link.hidden).sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
  }

  function productMediaLinksHtml(product, compact = false) {
    const links = productMediaLinks(product);
    if (!links.length) return '';
    const title = compact ? '' : '<h3>Videos & links</h3><p>Open product videos, social posts, location, or other links shared by the boutique.</p>';
    return `<div class="${compact ? 'product-links product-links-compact' : 'product-links'}">${title}<div>${links.map((link) => `<a class="btn btn-outline" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label)}</a>`).join('')}</div></div>`;
  }

  function productImages(product) {
    const images = [];
    if (product?.image) images.push(product.image);
    (product?.gallery || []).forEach((image) => { if (image) images.push(image); });
    const seen = new Set();
    return images.map(String).map((s) => s.trim()).filter(Boolean).filter((src) => {
      if (seen.has(src)) return false;
      seen.add(src);
      return true;
    });
  }

  function imagePlaceholder(label = 'Image coming soon') {
    return `<div class="image-placeholder"><span>${esc(label)}</span></div>`;
  }

  function primaryImage(product) {
    return productImages(product)[0] || '';
  }

  function moneyDisplay(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const numeric = raw.replace(/[^0-9.]/g, '');
    if (numeric && !Number.isNaN(Number(numeric))) {
      const amount = Number(numeric);
      return new Intl.NumberFormat('en-IN', { maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
    }
    return raw;
  }


  function priceHtml(product, large = false) {
    if (product?.price === undefined || product?.price === null || String(product.price).trim() === '') return '';
    const compare = product.compare_price;
    return `<div class="${large ? 'product-price-large' : ''}"><span class="price">NPR ${esc(moneyDisplay(product.price))}${compare ? ` <del>NPR ${esc(moneyDisplay(compare))}</del>` : ''}</span></div>`;
  }

  function numericPrice(value) {
    const raw = String(value ?? '').replace(/[^0-9.]/g, '');
    const amount = Number(raw);
    return Number.isFinite(amount) ? amount : 0;
  }

  function soldQty(product) {
    const base = Math.max(0, Number(product?.sold_qty || product?.quantity_sold || product?.sold || 0) || 0);
    const byVariant = typeof totalVariantSold === 'function' ? totalVariantSold(product) : 0;
    return Math.max(base, byVariant);
  }

  function soldHtml(product) {
    const sold = soldQty(product);
    return `<div class="sold-line"><strong>${esc(sold)}</strong> sold</div>`;
  }

  function productVariants(product) {
    return (Array.isArray(product?.variants) ? product.variants : [])
      .map((variant) => ({
        size: String(variant?.size || '').trim(),
        color: String(variant?.color || variant?.colour || '').trim(),
        stock_qty: Math.max(0, Number(variant?.stock_qty || 0) || 0),
        sold_qty: Math.max(0, Number(variant?.sold_qty || variant?.quantity_sold || 0) || 0)
      }))
      .filter((variant) => variant.size || variant.color);
  }

  function uniqueText(values) {
    const seen = new Set();
    return values.map((value) => String(value || '').trim()).filter(Boolean).filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function sizeOptions(product) {
    return uniqueText([...(Array.isArray(product?.sizes) ? product.sizes : []), ...productVariants(product).map((variant) => variant.size)]);
  }

  function colorOptions(product) {
    const colors = Array.isArray(product?.colors) ? product.colors : [];
    const byName = new Map();
    colors.forEach((color) => {
      const name = String(color?.name || color || '').trim();
      if (name && !byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), { name, hex: color?.hex || '#dddddd' });
    });
    productVariants(product).forEach((variant) => {
      const name = String(variant.color || '').trim();
      if (name && !byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), { name, hex: '#dddddd' });
    });
    return Array.from(byName.values());
  }

  function variantForSelection(product, size = '', color = '') {
    const cleanSize = String(size || '').trim().toLowerCase();
    const cleanColor = String(color || '').trim().toLowerCase();
    if (!cleanSize && !cleanColor) return null;
    return productVariants(product).find((variant) => {
      const sizeOk = !cleanSize || String(variant.size || '').trim().toLowerCase() === cleanSize;
      const colorOk = !cleanColor || String(variant.color || '').trim().toLowerCase() === cleanColor;
      return sizeOk && colorOk;
    }) || null;
  }

  function totalVariantStock(product) {
    const variants = productVariants(product);
    return variants.reduce((sum, variant) => sum + Number(variant.stock_qty || 0), 0);
  }

  function totalVariantSold(product) {
    const variants = productVariants(product);
    return variants.reduce((sum, variant) => sum + Number(variant.sold_qty || 0), 0);
  }

  function variantNoticeText(product, size = '', color = '') {
    const variant = variantForSelection(product, size, color);
    if (variant) {
      const remaining = Math.max(0, Number(variant.stock_qty || 0) - Number(variant.sold_qty || 0));
      return `${variant.sold_qty || 0} sold for selected option${variant.stock_qty ? ` · ${remaining} available` : ''}`;
    }
    const totalStock = totalVariantStock(product);
    const totalSold = totalVariantSold(product) || soldQty(product);
    return totalStock ? `${totalSold} sold · ${Math.max(0, totalStock - totalSold)} available across options` : `${totalSold} sold`;
  }

  function productKey(product) {
    return String(product?.id || product?.slug || slugify(product?.title || 'product'));
  }

  function productByKey(key) {
    const clean = String(key || '');
    const cleanSlug = slugify(clean);
    return state.products.find((item) => String(item.id || '') === clean)
      || state.products.find((item) => String(item.slug || '') === clean)
      || state.products.find((item) => slugify(item.slug || item.title || item.id || '') === cleanSlug)
      || null;
  }

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem('ownlight_cart_v1') || '[]');
      return Array.isArray(saved) ? saved.filter((item) => Number(item.quantity || 0) > 0) : [];
    } catch (error) {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem('ownlight_cart_v1', JSON.stringify(state.cart || []));
    updateCartBadges();
  }

  function cartCount() {
    return (state.cart || []).reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0) || 0), 0);
  }

  function updateCartBadges() {
    $$('[data-cart-count]').forEach((el) => { el.textContent = cartCount(); });
  }

  function cartSubtotal() {
    return (state.cart || []).reduce((sum, item) => sum + (numericPrice(item.price) * Math.max(1, Number(item.quantity || 1) || 1)), 0);
  }

  function showCartToast(message) {
    let toast = $('#cartToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cartToast';
      toast.className = 'cart-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showCartToast._timer);
    showCartToast._timer = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  function selectedValue(root, name) {
    return String(root?.querySelector(`[name="${name}"]`)?.value || '').trim();
  }

  function addCartItem(product, quantity = 1, options = {}) {
    if (!product) return;
    const qty = Math.max(1, Math.min(999, Number.parseInt(quantity, 10) || 1));
    const key = productKey(product);
    const size = String(options.size || '').trim();
    const color = String(options.color || '').trim();
    const sizes = sizeOptions(product);
    const colors = colorOptions(product);
    if (sizes.length && !size) { showCartToast('Please select a size first.'); return; }
    if (colors.length && !color) { showCartToast('Please select a colour first.'); return; }
    const variant = variantForSelection(product, size, color);
    if (productVariants(product).length && !variant) { showCartToast('This size and colour option is not available.'); return; }
    if (variant && variant.stock_qty) {
      const remaining = Math.max(0, Number(variant.stock_qty || 0) - Number(variant.sold_qty || 0));
      if (remaining <= 0) { showCartToast('This size and colour is sold out.'); return; }
      if (qty > remaining) { showCartToast(`Only ${remaining} available for this size and colour.`); return; }
    }
    const existing = state.cart.find((item) => String(item.product_id || item.product_slug || '') === key && String(item.size || '') === size && String(item.color || '') === color);
    if (existing) {
      existing.quantity = Math.min(999, Math.max(1, Number(existing.quantity || 0) + qty));
    } else {
      state.cart.push({
        product_id: product.id || '',
        product_slug: product.slug || slugify(product.title || key),
        product_title: product.title || 'Product',
        price: product.price || '',
        image: primaryImage(product),
        size,
        color,
        quantity: qty
      });
    }
    saveCart();
    trackEvent('add_to_cart', product, { quantity: qty, size, color });
    showCartToast(`${product.title || 'Product'} added to cart.`);
  }

  function purchaseOptionHtml(product) {
    const sizes = sizeOptions(product);
    const colors = colorOptions(product);
    const sizeSelect = sizes.length ? `<label>Size<select name="cart_size" data-variant-watch><option value="">Select size</option>${sizes.map((size) => `<option value="${esc(size)}">${esc(size)}</option>`).join('')}</select></label>` : '';
    const colorSelect = colors.length ? `<label>Colour<select name="cart_color" data-variant-watch><option value="">Select colour</option>${colors.map((color) => `<option value="${esc(color.name || color)}">${esc(color.name || color)}</option>`).join('')}</select></label>` : '';
    return `${sizeSelect}${colorSelect}<label>Quantity<input type="number" name="cart_quantity" min="1" max="999" value="1"></label>`;
  }

  function purchaseBoxHtml(product) {
    return `<div class="purchase-box" data-purchase-box="${esc(productKey(product))}"><h3>Purchase</h3><p>Add this product to cart, then submit customer details on checkout.</p><div class="purchase-options">${purchaseOptionHtml(product)}</div><div class="purchase-actions"><button class="btn btn-gold" type="button" data-add-cart-detail="${esc(productKey(product))}">Add to Cart</button><a class="btn btn-outline" href="#cart">View Cart</a></div><div class="sold-line" data-variant-summary><strong>${esc(soldQty(product))}</strong> sold</div></div>`;
  }

  function discountLabel(item) {
    const label = String(item?.discount_label || '').trim();
    if (label) return label;
    const percent = Number(item?.discount_percent || 0);
    if (percent > 0) return `${percent % 1 ? percent.toFixed(1) : percent}% OFF`;
    const price = Number(String(item?.price || '').replace(/[^0-9.]/g, ''));
    const compare = Number(String(item?.compare_price || '').replace(/[^0-9.]/g, ''));
    if (compare > price && price > 0) return `${Math.round((1 - price / compare) * 100)}% OFF`;
    return '';
  }

  function categoryOfferText(category) {
    if (!category) return '';
    return String(category.offer_text || '').trim() || discountLabel(category);
  }

  function colorHex(hex) {
    const value = String(hex || '').trim();
    return /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#dddddd';
  }

  function productCategorySlugs(product) {
    return (product?.category_slugs || []).map(slugify).filter(Boolean);
  }

  function hasCategory(product, slug) {
    const clean = slugify(slug);
    return clean ? productCategorySlugs(product).includes(clean) : true;
  }

  function categoryCount(slug) {
    return state.products.filter((product) => hasCategory(product, slug)).length;
  }

  function categoryBySlug(slug) {
    const clean = slugify(slug);
    return state.categories.find((cat) => slugify(cat.slug) === clean) || null;
  }

  function productHref(product, categorySlug = '') {
    const slug = product.slug || slugify(product.title || product.id || 'product');
    const params = new URLSearchParams();
    if (product.id) params.set('id', product.id);
    if (categorySlug) params.set('category', slugify(categorySlug));
    const query = params.toString();
    return `#product/${encodeURIComponent(slug)}${query ? `?${query}` : ''}`;
  }

  function inquiryHref(product) {
    if (!product) return '#inquiry';
    const slug = product.slug || slugify(product.title || product.id || 'product');
    const params = new URLSearchParams({ product: slug });
    if (product.id) params.set('id', product.id);
    return `#inquiry?${params.toString()}`;
  }

  function categoryCard(category) {
    const slug = slugify(category.slug || category.name);
    const img = category.image ? `<img src="${esc(category.image)}" alt="${esc(category.name || 'Category')}" loading="lazy">` : imagePlaceholder('Image coming soon');
    const count = category.count ?? categoryCount(slug);
    const discount = discountLabel(category);
    return `<a class="category-tile" href="#products?category=${encodeURIComponent(slug)}">${img}${discount ? `<span class="category-offer">${esc(discount)}</span>` : ''}<span class="tile-label"><strong>${esc(category.name || 'Category')}</strong><small>${esc(count)} items</small></span></a>`;
  }

  function productCard(product, categorySlug = '') {
    const title = product.title || 'Product';
    const image = primaryImage(product);
    const discount = discountLabel(product);
    const sizes = sizeOptions(product).slice(0, 4);
    const colors = colorOptions(product).slice(0, 3);
    const productMessage = `Hello, I want to inquire about ${title}.`;
    const detailsUrl = productHref(product, categorySlug);
    return `<article class="product-card">
      <a class="media" href="${esc(detailsUrl)}">${image ? `<img src="${esc(image)}" alt="${esc(title)}" loading="lazy">` : imagePlaceholder('Image coming soon')}</a>
      <div class="body">
        <div class="badges">
          ${discount ? `<span class="badge badge-sale">${esc(discount)}</span>` : ''}
          ${product.new_arrival ? '<span class="badge">New</span>' : ''}
          ${product.featured ? '<span class="badge">Featured</span>' : ''}
          ${product.stock_label ? `<span class="badge">${esc(product.stock_label)}</span>` : ''}
        </div>
        <h3><a href="${esc(detailsUrl)}">${esc(title)}</a></h3>
        ${product.excerpt ? `<p>${esc(product.excerpt)}</p>` : ''}
        ${priceHtml(product)}
        ${discount ? `<div class="offer-line">Offer: ${esc(discount)}</div>` : ''}
        ${(sizes.length || colors.length) ? `<div class="mini-options">${sizes.map((size) => `<span>${esc(size)}</span>`).join('')}${colors.map((color) => `<span>${esc(color.name || color || '')}</span>`).join('')}</div>` : ''}
        ${productMediaLinksHtml(product, true)}
        ${soldHtml(product)}
        <div class="product-actions">
          <a class="btn btn-outline" href="${esc(detailsUrl)}">View</a>
          ${(sizeOptions(product).length || colorOptions(product).length || productVariants(product).length) ? `<a class="btn btn-gold" href="${esc(detailsUrl)}">Choose Options</a>` : `<button class="btn btn-gold" type="button" data-add-cart="${esc(productKey(product))}">Add to Cart</button>`}
          <a class="btn btn-outline" href="${esc(inquiryHref(product))}" data-track-inquiry-click="${esc(product.id || product.slug || title)}">Inquiry</a>
          <a class="btn btn-whatsapp" href="${esc(whatsappLink(productMessage))}" target="_blank" rel="noopener" data-track-whatsapp-inquiry="${esc(product.id || product.slug || title)}">WhatsApp</a>
        </div>
      </div>
    </article>`;
  }

  function statusNotice() {
    if (state.loading) return '<div class="notice">Loading website content...</div>';
    if (state.error) return `<div class="notice error"><strong>Website notice:</strong> ${esc(state.error)}</div>`;
    return '';
  }

  function renderHome() {
    setTitle('Home');
    const settings = state.settings;
    const heroImage = settings.hero_image || '';
    const featured = state.products.filter((product) => product.featured).slice(0, 8);
    const newArrivals = state.products.filter((product) => product.new_arrival).slice(0, 8);
    const latestBlogs = visibleBlogs().slice(0, 3);
    $('#app').innerHTML = `
      <section class="hero ${heroImage ? '' : 'hero-no-image'}">
        ${heroImage ? `<img src="${esc(heroImage)}" alt="Boutique hero">` : ''}
        <div class="container hero-content">
          <span class="eyebrow">New Collection</span>
          <h1>${esc(settings.hero_title || fallbackSettings.hero_title)}</h1>
          <p>${esc(settings.hero_text || fallbackSettings.hero_text)}</p>
          <a class="btn btn-light" href="#categories">Browse Categories</a>
          <a class="btn btn-gold" href="#products">View Products</a>
        </div>
      </section>
      <section class="section"><div class="container">${statusNotice()}<div class="section-head"><span class="eyebrow">Categories</span><h2>Shop From Category</h2><p>Browse styles by category.</p></div>${state.categories.length ? `<div class="grid grid-4 category-grid">${state.categories.slice(0, 8).map(categoryCard).join('')}</div>` : '<div class="empty">No categories available yet.</div>'}</div></section>
      <section class="section section-soft"><div class="container"><div class="section-head"><span class="eyebrow">Featured</span><h2>Featured Products</h2><p>Explore selected products, pricing, sizes, colours, and offers.</p></div>${featured.length ? `<div class="grid grid-4 product-grid">${featured.map((product) => productCard(product)).join('')}</div>` : '<div class="empty">No featured products yet.</div>'}</div></section>
      <section class="section"><div class="container"><div class="section-head"><span class="eyebrow">New</span><h2>New Arrivals</h2></div>${newArrivals.length ? `<div class="grid grid-4 product-grid">${newArrivals.map((product) => productCard(product)).join('')}</div>` : '<div class="empty">No new arrivals yet.</div>'}</div></section>
      <section class="section section-soft"><div class="container"><div class="section-head"><span class="eyebrow">Journal</span><h2>Latest Blogs</h2><p>Read style notes, care tips, arrivals, and boutique updates.</p></div>${latestBlogs.length ? `<div class="grid grid-3">${latestBlogs.map(blogCard).join('')}</div><div class="section-cta"><a class="btn btn-outline" href="#blogs">View all blogs</a></div>` : '<div class="empty">No blogs published yet.</div>'}</div></section>`;
  }

  function renderCategories() {
    setTitle('Categories');
    $('#app').innerHTML = `<section class="page-hero"><div class="container page-title"><span class="eyebrow">Browse</span><h1>Product Categories</h1><p>Choose a category to see products inside it.</p></div></section><section class="section"><div class="container">${statusNotice()}${state.categories.length ? `<div class="grid grid-4 category-grid category-page-grid">${state.categories.map(categoryCard).join('')}</div>` : '<div class="empty">No categories available yet.</div>'}</div></section>`;
  }

  function renderProducts() {
    const route = getRoute();
    const selectedCategory = slugify(route.params.get('category') || '');
    const q = (route.params.get('q') || '').trim().toLowerCase();
    const selectedCategoryObj = selectedCategory ? categoryBySlug(selectedCategory) : null;
    const selectedCategoryName = selectedCategoryObj?.name || '';
    const categoryOffer = categoryOfferText(selectedCategoryObj);
    let products = state.products.slice();
    if (selectedCategory) products = products.filter((product) => hasCategory(product, selectedCategory));
    if (q) products = products.filter((product) => [product.title, product.excerpt, product.content, product.sku, product.fabric].some((value) => String(value || '').toLowerCase().includes(q)));
    setTitle(selectedCategoryName || 'Products');
    $('#app').innerHTML = `<section class="page-hero"><div class="container page-title"><span class="eyebrow">Catalogue</span><h1>${esc(selectedCategoryName || 'All Products')}</h1><p>${esc(selectedCategoryObj?.description || 'View photos, sizes, colours, prices, and current offers.')}</p>${categoryOffer ? `<div class="category-offer-page">${esc(categoryOffer)}</div>` : ''}</div></section><section class="section"><div class="container">${statusNotice()}<div class="filters"><a class="chip ${selectedCategory ? '' : 'active'}" href="#products">All</a>${state.categories.map((cat) => { const slug = slugify(cat.slug || cat.name); return `<a class="chip ${selectedCategory === slug ? 'active' : ''}" href="#products?category=${encodeURIComponent(slug)}">${esc(cat.name)}</a>`; }).join('')}<input class="search-input" data-search-products placeholder="Search products" value="${esc(route.params.get('q') || '')}"></div>${products.length ? `<div class="grid grid-4 product-grid">${products.map((product) => productCard(product, selectedCategory)).join('')}</div>` : '<div class="empty">No products found in this category.</div>'}</div></section>`;
  }

  function findProduct(slug, id = '') {
    const cleanId = decodeURIComponent(String(id || ''));
    if (cleanId) {
      const byId = state.products.find((product) => String(product.id || '') === cleanId);
      if (byId) return byId;
    }
    const cleanSlug = decodeURIComponent(slug || '');
    const normalized = slugify(cleanSlug);
    return state.products.find((product) => product.slug === cleanSlug) || state.products.find((product) => slugify(product.slug) === normalized) || null;
  }

  async function fetchProductIfNeeded(slug, id = '') {
    if (!contentConfigured() || !slug || findProduct(slug, id)) return;
    try {
      const payload = await apiGet(`products/${encodeURIComponent(slug)}`);
      const product = payload.product || payload;
      if (product?.slug) state.products.push(product);
    } catch (error) {
      state.error = error.message || state.error;
    }
  }

  function renderProduct(product, returnCategory = '') {
    const title = product.title || 'Product';
    const images = productImages(product);
    const main = images[0] || '';
    const discount = discountLabel(product);
    const sizes = sizeOptions(product);
    const colors = colorOptions(product);
    const categoryNames = (product.categories || []).map((cat) => cat.name).join(', ') || productCategorySlugs(product).join(', ');
    const message = `Hello, I want to inquire about ${title}.`;
    const backHref = returnCategory ? `#products?category=${encodeURIComponent(slugify(returnCategory))}` : '#products';
    setTitle(title);
    $('#app').innerHTML = `<section class="page-hero"><div class="container page-title"><span class="eyebrow">Product Detail</span><h1>${esc(title)}</h1><p>${esc(product.excerpt || 'See images, sizes, colours, price, and inquiry options.')}</p></div></section><section class="section product-detail-section"><div class="container product-layout">
      <div class="product-gallery">
        <div class="gallery-main">${main ? `<img src="${esc(main)}" alt="${esc(title)}" data-gallery-main>` : imagePlaceholder('Image coming soon')}</div>
        ${images.length > 1 ? `<div class="thumbs">${images.map((src) => `<button type="button" data-gallery-thumb="${esc(src)}"><img src="${esc(src)}" alt="${esc(title)}"></button>`).join('')}</div>` : ''}
        ${productMediaLinksHtml(product)}
      </div>
      <div class="product-summary">
        <div class="badges">${discount ? `<span class="badge badge-sale">${esc(discount)}</span>` : ''}${product.new_arrival ? '<span class="badge">New</span>' : ''}${product.featured ? '<span class="badge">Featured</span>' : ''}${product.stock_label ? `<span class="badge">${esc(product.stock_label)}</span>` : ''}</div>
        <h1>${esc(title)}</h1>
        ${priceHtml(product, true)}
        ${discount ? `<div class="offer-box"><strong>Offer</strong><span>${esc(discount)}</span></div>` : ''}
        ${product.content ? `<p>${esc(product.content)}</p>` : ''}
        <div class="meta-list">
          ${categoryNames ? `<div class="meta-row"><strong>Category</strong><span>${esc(categoryNames)}</span></div>` : ''}
          ${product.sku ? `<div class="meta-row"><strong>SKU</strong><span>${esc(product.sku)}</span></div>` : ''}
          ${product.fabric ? `<div class="meta-row"><strong>Fabric</strong><span>${esc(product.fabric)}</span></div>` : ''}
          ${sizes.length ? `<div class="meta-row"><strong>Sizes</strong><span class="option-pills">${sizes.map((size) => `<span>${esc(size)}</span>`).join('')}</span></div>` : ''}
          ${colors.length ? `<div class="meta-row"><strong>Colours</strong><span class="option-pills">${colors.map((color) => `<span><i class="color-dot" style="background:${esc(colorHex(color.hex))}"></i>${esc(color.name || '')}</span>`).join('')}</span></div>` : ''}
        </div>
        ${purchaseBoxHtml(product)}
        <div class="product-actions product-actions-large"><a class="btn btn-gold" href="${esc(inquiryHref(product))}" data-track-inquiry-click="${esc(product.id || product.slug || title)}">Send Inquiry</a><a class="btn btn-whatsapp" href="${esc(whatsappLink(message))}" target="_blank" rel="noopener" data-track-whatsapp-inquiry="${esc(product.id || product.slug || title)}">WhatsApp Inquiry</a><a class="btn btn-outline" href="${esc(backHref)}">Back to Products</a></div>
      </div>
    </div></section>`;
    trackOnce(`product_view:${product.id || product.slug || title}`, 'product_view', product);
  }

  async function renderProductRoute(slug) {
    const route = getRoute();
    const id = route.params.get('id') || '';
    const returnCategory = route.params.get('category') || '';
    await fetchProductIfNeeded(slug, id);
    const product = findProduct(slug, id);
    if (!product) {
      setTitle('Product Not Found');
      $('#app').innerHTML = `<section class="page-hero"><div class="container page-title"><span class="eyebrow">Not Found</span><h1>Product not found</h1><p>This product may be hidden or unavailable.</p></div></section><section class="section"><div class="container">${statusNotice()}<a class="btn btn-gold" href="#products">View Products</a></div></section>`;
      return;
    }
    renderProduct(product, returnCategory);
  }

  function visibleBlogs() {
    return (Array.isArray(state.blogs) ? state.blogs : [])
      .filter((blog) => !blog.hidden)
      .sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
  }

  function blogHref(blog) {
    const slug = blog.slug || slugify(blog.title || blog.id || 'blog');
    const params = new URLSearchParams();
    if (blog.id) params.set('id', blog.id);
    const query = params.toString();
    return `#blog/${encodeURIComponent(slug)}${query ? `?${query}` : ''}`;
  }

  function formatDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function blogCard(blog) {
    const title = blog.title || 'Blog';
    const image = blog.image || '';
    const date = formatDate(blog.published_at || blog.created_at || '');
    return `<article class="blog-card">
      <a class="blog-media" href="${esc(blogHref(blog))}">${image ? `<img src="${esc(image)}" alt="${esc(title)}" loading="lazy">` : imagePlaceholder('Blog image coming soon')}</a>
      <div class="blog-body">
        ${date ? `<span class="blog-date">${esc(date)}</span>` : ''}
        <h3><a href="${esc(blogHref(blog))}">${esc(title)}</a></h3>
        ${blog.excerpt ? `<p>${esc(blog.excerpt)}</p>` : ''}
        <a class="read-link" href="${esc(blogHref(blog))}">Read blog</a>
      </div>
    </article>`;
  }

  function findBlog(slug, id = '') {
    const cleanId = decodeURIComponent(String(id || ''));
    if (cleanId) {
      const byId = visibleBlogs().find((blog) => String(blog.id || '') === cleanId);
      if (byId) return byId;
    }
    const cleanSlug = decodeURIComponent(slug || '');
    const normalized = slugify(cleanSlug);
    return visibleBlogs().find((blog) => String(blog.slug || '') === cleanSlug)
      || visibleBlogs().find((blog) => slugify(blog.slug || blog.title || blog.id || '') === normalized)
      || null;
  }

  async function fetchBlogIfNeeded(slug, id = '') {
    if (!contentConfigured() || !slug || findBlog(slug, id)) return;
    try {
      const payload = await apiGet(`blogs/${encodeURIComponent(slug)}`);
      const blog = payload.blog || payload;
      if (blog?.slug || blog?.title) state.blogs.push(blog);
    } catch (error) {
      state.error = error.message || state.error;
    }
  }

  function renderBlogs() {
    setTitle('Blogs');
    const blogs = visibleBlogs();
    $('#app').innerHTML = `<section class="page-hero"><div class="container page-title"><span class="eyebrow">Journal</span><h1>Blogs</h1><p>Style notes, care tips, new arrivals, and Own Light updates.</p></div></section><section class="section"><div class="container">${statusNotice()}${blogs.length ? `<div class="grid grid-3">${blogs.map(blogCard).join('')}</div>` : '<div class="empty">No blogs published yet.</div>'}</div></section>`;
  }

  async function renderBlogRoute(slug) {
    const route = getRoute();
    const id = route.params.get('id') || '';
    await fetchBlogIfNeeded(slug, id);
    const blog = findBlog(slug, id);
    if (!blog) {
      setTitle('Blog Not Found');
      $('#app').innerHTML = `<section class="page-hero"><div class="container page-title"><span class="eyebrow">Not Found</span><h1>Blog not found</h1><p>This blog may be hidden or unavailable.</p></div></section><section class="section"><div class="container">${statusNotice()}<a class="btn btn-gold" href="#blogs">View Blogs</a></div></section>`;
      return;
    }
    const title = blog.title || 'Blog';
    const image = blog.image || '';
    const date = formatDate(blog.published_at || blog.created_at || '');
    setTitle(title);
    $('#app').innerHTML = `<section class="page-hero"><div class="container page-title"><span class="eyebrow">Blog</span><h1>${esc(title)}</h1><p>${esc(blog.excerpt || 'Read the latest update from Own Light.')}</p>${date ? `<div class="blog-date blog-date-large">${esc(date)}</div>` : ''}</div></section><section class="section"><div class="container blog-detail">${statusNotice()}${image ? `<img class="blog-detail-image" src="${esc(image)}" alt="${esc(title)}">` : ''}<article class="blog-content">${String(blog.content || '').split(/\n{2,}/).map((para) => `<p>${esc(para)}</p>`).join('') || '<p>Blog content coming soon.</p>'}</article><a class="btn btn-outline" href="#blogs">Back to Blogs</a></div></section>`;
  }

  function inquiryProductFromRoute() {
    const route = getRoute();
    const slug = route.params.get('product') || '';
    const id = route.params.get('id') || '';
    return slug || id ? findProduct(slug, id) : null;
  }

  function optionSelect(name, options, placeholder) {
    if (!options || !options.length) return '';
    return `<label>${esc(placeholder)}<select name="${esc(name)}"><option value="">Select ${esc(placeholder.toLowerCase())}</option>${options.map((item) => `<option value="${esc(item.name || item)}">${esc(item.name || item)}</option>`).join('')}</select></label>`;
  }

  function renderInquiry() {
    const product = inquiryProductFromRoute();
    const title = product?.title || '';
    const image = product ? primaryImage(product) : '';
    setTitle('Inquiry');
    $('#app').innerHTML = `<section class="page-hero"><div class="container page-title"><span class="eyebrow">Inquiry</span><h1>Send Product Inquiry</h1><p>Your inquiry can also be sent through WhatsApp.</p></div></section><section class="section"><div class="container grid grid-2">${statusNotice()}<div class="form-card"><div id="formNotice" hidden></div><form class="form-grid" data-inquiry-form><input type="hidden" name="product_slug" value="${esc(product?.slug || '')}"><input type="hidden" name="product_title" value="${esc(title)}"><label>Your name<input name="name" required placeholder="Full name"></label><label>Phone / WhatsApp<input name="phone" required placeholder="98XXXXXXXX"></label><label>Email optional<input name="email" type="email" placeholder="you@example.com"></label>${optionSelect('size', product ? sizeOptions(product) : [], 'Size')}${optionSelect('color', product ? colorOptions(product) : [], 'Colour')}<label class="full">Message<textarea name="message" required>${esc(title ? `Hello, I want to inquire about ${title}.` : setting('default_message', fallbackSettings.default_message))}</textarea></label><button class="btn btn-gold" type="submit">Submit Inquiry</button><a class="btn btn-whatsapp" href="${esc(whatsappLink(title ? `Hello, I want to inquire about ${title}.` : undefined))}" target="_blank" rel="noopener" data-track-whatsapp-inquiry="${esc(product?.id || product?.slug || title)}">Send on WhatsApp</a></form></div><aside class="info-card inquiry-side"><h2>${esc(title || 'General Inquiry')}</h2>${image ? `<img src="${esc(image)}" alt="${esc(title)}">` : imagePlaceholder(product ? 'Image coming soon' : 'Select a product for image preview')}<p>${esc(product?.excerpt || 'Choose a product and send size or colour preference.')}</p><div class="social-actions"><a class="btn btn-whatsapp" href="${esc(whatsappLink())}" target="_blank" rel="noopener" ${product ? `data-track-whatsapp-inquiry="${esc(product.id || product.slug || title)}"` : ''}>WhatsApp</a>${instagramUrl() ? `<a class="btn btn-outline" href="${esc(instagramUrl())}" target="_blank" rel="noopener">Instagram</a>` : ''}</div></aside></div></section>`;
    if (product) trackOnce(`inquiry_open:${product.id || product.slug || title}`, 'inquiry_open', product);
  }


  function cartRowsHtml() {
    if (!state.cart.length) return '<div class="empty">Your cart is empty. Add products from the catalogue.</div>';
    return `<div class="cart-list">${state.cart.map((item, index) => {
      const product = productByKey(item.product_id || item.product_slug || item.product_title) || {};
      const title = item.product_title || product.title || 'Product';
      const image = item.image || primaryImage(product);
      const qty = Math.max(1, Number(item.quantity || 1) || 1);
      const lineTotal = numericPrice(item.price) * qty;
      return `<div class="cart-row">
        <div class="cart-product">${image ? `<img src="${esc(image)}" alt="${esc(title)}">` : imagePlaceholder('Image')}<div><strong>${esc(title)}</strong><span>${item.size ? `Size: ${esc(item.size)} ` : ''}${item.color ? `Colour: ${esc(item.color)}` : ''}</span>${item.price ? `<small>NPR ${esc(moneyDisplay(item.price))} each</small>` : ''}</div></div>
        <label class="cart-qty">Qty<input type="number" min="1" max="999" value="${esc(qty)}" data-cart-qty="${index}"></label>
        <strong class="cart-line-total">NPR ${esc(moneyDisplay(lineTotal))}</strong>
        <button class="btn btn-outline cart-remove" type="button" data-remove-cart="${index}">Remove</button>
      </div>`;
    }).join('')}</div>`;
  }

  function renderCart() {
    setTitle('Cart');
    const hasItems = state.cart.length > 0;
    $('#app').innerHTML = `<section class="page-hero"><div class="container page-title"><span class="eyebrow">Checkout</span><h1>Your Cart</h1><p>Review products, quantity, and customer details before submitting the purchase.</p></div></section><section class="section"><div class="container cart-layout">${statusNotice()}<div class="cart-panel"><h2>Selected products</h2>${cartRowsHtml()}${hasItems ? `<div class="cart-total"><span>Total</span><strong>NPR ${esc(moneyDisplay(cartSubtotal()))}</strong></div>` : ''}</div><div class="form-card checkout-card"><div id="checkoutNotice" hidden></div><h2>Customer details</h2><form class="form-grid" data-checkout-form>${hasItems ? '' : '<p class="muted full">Add at least one product before checkout.</p>'}<label>Your name<input name="name" required placeholder="Full name" ${hasItems ? '' : 'disabled'}></label><label>Phone / WhatsApp<input name="phone" inputmode="tel" autocomplete="tel" placeholder="98XXXXXXXX or +977..." ${hasItems ? '' : 'disabled'}></label><label>Email<input name="email" type="text" inputmode="email" autocomplete="email" placeholder="you@example.com" ${hasItems ? '' : 'disabled'}></label><p class="muted full">Checkout needs at least one valid contact method: phone number or email address.</p><label>City / Area<input name="city" placeholder="City or area" ${hasItems ? '' : 'disabled'}></label><label class="full">Delivery address<textarea name="address" required placeholder="Full delivery address" ${hasItems ? '' : 'disabled'}></textarea></label><label class="full">Order note optional<textarea name="note" placeholder="Preferred delivery time, extra message, etc." ${hasItems ? '' : 'disabled'}></textarea></label><button class="btn btn-gold" type="submit" ${hasItems ? '' : 'disabled'}>Submit Purchase</button></form></div></div></section>`;
  }

  function renderOrderSuccess(order) {
    setTitle('Purchase Submitted');
    $('#app').innerHTML = `<section class="page-hero"><div class="container page-title"><span class="eyebrow">Thank you</span><h1>Purchase submitted</h1><p>Your customer details and products were saved in the CMS.</p></div></section><section class="section"><div class="container"><div class="notice"><strong>Order received.</strong> Reference: ${esc(order?.id || 'Saved')}</div><a class="btn btn-gold" href="#products">Continue Shopping</a></div></section>`;
  }

  function renderContact() {
    setTitle('Contact');
    $('#app').innerHTML = `<section class="page-hero"><div class="container page-title"><span class="eyebrow">Contact</span><h1>${esc(setting('contact_heading', 'Contact Own Light'))}</h1><p>${esc(setting('contact_text', 'Use the inquiry form, Instagram, or WhatsApp for direct messages.'))}</p></div></section><section class="section"><div class="container grid grid-3">${statusNotice()}<div class="info-card contact-card"><h2>Direct WhatsApp</h2><p>Press the WhatsApp button and send a pre-filled message to our number.</p><a class="btn btn-whatsapp" target="_blank" rel="noopener" href="${esc(whatsappLink())}">Message on WhatsApp</a></div><div class="info-card contact-card"><h2>Product Inquiry</h2><p>Open a product and press Send Inquiry, or use the general inquiry form.</p><a class="btn btn-gold" href="#inquiry">Send Inquiry</a></div><div class="info-card contact-card"><h2>Instagram</h2><p>${instagramUrl() ? 'Connect with the boutique on Instagram.' : 'Instagram link coming soon.'}</p>${instagramUrl() ? `<a class="btn btn-outline" href="${esc(instagramUrl())}" target="_blank" rel="noopener">Open Instagram</a>` : ''}</div></div></section>`;
  }

  function validCssColor(value, fallback) {
    const textValue = String(value || '').trim();
    if (/^#[0-9a-f]{3,8}$/i.test(textValue) || /^rgba?\(/i.test(textValue) || /^[a-z]+$/i.test(textValue)) return textValue;
    return fallback;
  }

  function validCssSize(value, fallback, minPx = 40, maxPx = 900) {
    const textValue = String(value || '').trim().toLowerCase();
    const numeric = Number.parseFloat(textValue);
    if (/^\d+(\.\d+)?(px|rem|em|vh|vw|%)$/.test(textValue) && numeric > 0) return textValue;
    if (/^\d+$/.test(textValue) && numeric > 0) return `${Math.max(minPx, Math.min(maxPx, numeric))}px`;
    return fallback;
  }

  function applyDisplaySettings(display = {}) {
    const defaults = fallbackSettings.display || {};
    const map = {
      '--product-card-image-height': ['product_card_image_height', 80, 520],
      '--category-image-height': ['category_image_height', 80, 480],
      '--product-detail-image-height': ['product_detail_image_height', 160, 760],
      '--product-detail-gallery-width': ['product_detail_gallery_width', 220, 620],
      '--product-card-min-width': ['product_card_min_width', 130, 360],
      '--category-card-min-width': ['category_card_min_width', 130, 360],
      '--thumbnail-image-height': ['thumbnail_image_height', 36, 140]
    };
    Object.entries(map).forEach(([cssVar, [key, minPx, maxPx]]) => {
      document.documentElement.style.setProperty(cssVar, validCssSize(display[key], defaults[key], minPx, maxPx));
    });
    const fit = String(display.image_fit || defaults.image_fit || 'cover').trim().toLowerCase();
    document.documentElement.style.setProperty('--website-image-fit', fit === 'contain' ? 'contain' : 'cover');
  }

  function applyThemeColors(colors = {}) {
    const defaults = fallbackSettings.colors || {};
    const map = {
      '--ink': 'ink',
      '--muted': 'muted',
      '--paper': 'paper',
      '--soft': 'soft',
      '--line': 'line',
      '--gold': 'gold',
      '--gold-dark': 'gold_dark',
      '--site-header-bg': 'header_background',
      '--footer-bg': 'footer_background',
      '--whatsapp': 'whatsapp'
    };
    Object.entries(map).forEach(([cssVar, key]) => {
      document.documentElement.style.setProperty(cssVar, validCssColor(colors[key], defaults[key] || ''));
    });
  }

  function applyGlobalSettings() {
    const settings = state.settings;
    $$('[data-site-name]').forEach((el) => { el.textContent = siteName(); });
    const topbar = $('#topbar');
    if (topbar) topbar.textContent = setting('topbar_text', fallbackSettings.topbar_text);
    const footerText = $('[data-footer-text]');
    if (footerText) footerText.textContent = setting('hero_text', 'Browse our latest boutique products and offers.');
    const footerWhatsapp = $('[data-footer-whatsapp]');
    if (footerWhatsapp) footerWhatsapp.textContent = `WhatsApp: +${whatsappNumber()}`;
    const wa = whatsappLink();
    $$('[data-whatsapp-nav],[data-whatsapp-float]').forEach((el) => { el.href = wa; });
    const ig = instagramUrl();
    $$('[data-instagram-nav],[data-instagram-footer]').forEach((el) => {
      el.hidden = !ig;
      if (ig) el.href = ig;
    });
    const fonts = settings.fonts || fallbackSettings.fonts;
    document.body.style.fontFamily = fonts.body || fallbackSettings.fonts.body;
    document.body.style.fontSize = fonts.body_size || fallbackSettings.fonts.body_size;
    document.documentElement.style.setProperty('--heading-font', fonts.heading || fallbackSettings.fonts.heading);
    document.documentElement.style.setProperty('--nav-font', fonts.nav || fallbackSettings.fonts.nav);
    document.documentElement.style.setProperty('--button-font', fonts.button || fallbackSettings.fonts.button);
    document.documentElement.style.setProperty('--heading-weight', fonts.heading_weight || fallbackSettings.fonts.heading_weight);
    applyThemeColors(settings.colors || fallbackSettings.colors);
    applyDisplaySettings(settings.display || fallbackSettings.display);
    updateCartBadges();
    $('#year').textContent = new Date().getFullYear();
  }

  async function render() {
    applyGlobalSettings();
    const route = getRoute();
    if (route.name === 'categories') return renderCategories();
    if (route.name === 'products') return renderProducts();
    if (route.name === 'product') return renderProductRoute(route.slug);
    if (route.name === 'blogs') return renderBlogs();
    if (route.name === 'blog') return renderBlogRoute(route.slug);
    if (route.name === 'inquiry') return renderInquiry();
    if (route.name === 'cart') return renderCart();
    if (route.name === 'contact') return renderContact();
    return renderHome();
  }

  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-menu-toggle]');
    if (toggle) $('[data-menu]')?.classList.toggle('open');
    const addCart = event.target.closest('[data-add-cart]');
    if (addCart) {
      const product = productByKey(addCart.getAttribute('data-add-cart'));
      addCartItem(product, 1);
    }
    const addCartDetail = event.target.closest('[data-add-cart-detail]');
    if (addCartDetail) {
      const box = addCartDetail.closest('[data-purchase-box]');
      const product = productByKey(addCartDetail.getAttribute('data-add-cart-detail'));
      addCartItem(product, selectedValue(box, 'cart_quantity') || 1, { size: selectedValue(box, 'cart_size'), color: selectedValue(box, 'cart_color') });
    }
    const removeCart = event.target.closest('[data-remove-cart]');
    if (removeCart) {
      state.cart.splice(Number(removeCart.getAttribute('data-remove-cart')), 1);
      saveCart();
      renderCart();
    }
    const thumb = event.target.closest('[data-gallery-thumb]');
    if (thumb) {
      const main = $('[data-gallery-main]');
      const src = thumb.getAttribute('data-gallery-thumb');
      if (main && src) main.setAttribute('src', src);
    }
    const inquiryClick = event.target.closest('[data-track-inquiry-click]');
    if (inquiryClick) {
      const key = String(inquiryClick.getAttribute('data-track-inquiry-click') || '');
      const product = state.products.find((item) => String(item.id || item.slug || item.title || '') === key) || null;
      if (product) trackEvent('inquiry_click', product);
    }
    const whatsappClick = event.target.closest('[data-track-whatsapp-inquiry]');
    if (whatsappClick) {
      const key = String(whatsappClick.getAttribute('data-track-whatsapp-inquiry') || '');
      const product = state.products.find((item) => String(item.id || item.slug || item.title || '') === key) || null;
      if (product) trackEvent('whatsapp_click', product);
    }
  });

  document.addEventListener('input', (event) => {
    const cartQty = event.target.closest('[data-cart-qty]');
    if (cartQty) {
      const index = Number(cartQty.getAttribute('data-cart-qty'));
      const quantity = Math.max(1, Math.min(999, Number.parseInt(cartQty.value, 10) || 1));
      if (state.cart[index]) state.cart[index].quantity = quantity;
      saveCart();
      renderCart();
      return;
    }
    const variantWatch = event.target.closest('[data-variant-watch]');
    if (variantWatch) {
      const box = variantWatch.closest('[data-purchase-box]');
      const product = productByKey(box?.getAttribute('data-purchase-box') || '');
      const summary = box?.querySelector('[data-variant-summary]');
      if (product && summary) summary.innerHTML = esc(variantNoticeText(product, selectedValue(box, 'cart_size'), selectedValue(box, 'cart_color'))).replace(/^(\d+)/, '<strong>$1</strong>');
    }
    const input = event.target.closest('[data-search-products]');
    if (!input) return;
    clearTimeout(input._timer);
    input._timer = setTimeout(() => {
      const route = getRoute();
      const params = new URLSearchParams(route.params.toString());
      const value = input.value.trim();
      if (value) params.set('q', value); else params.delete('q');
      location.hash = `products${params.toString() ? `?${params.toString()}` : ''}`;
    }, 350);
  });

  document.addEventListener('submit', async (event) => {
    const checkoutForm = event.target.closest('[data-checkout-form]');
    if (checkoutForm) {
      event.preventDefault();
      const notice = $('#checkoutNotice');
      if (notice) {
        notice.hidden = false;
        notice.className = 'notice';
        notice.textContent = 'Submitting purchase...';
      }
      try {
        if (!state.cart.length) throw new Error('Your cart is empty.');
        if (!contentConfigured()) throw new Error('Website content is not configured. Please use WhatsApp for purchase details.');
        const rawCustomer = Object.fromEntries(new FormData(checkoutForm).entries());
        const customer = requireValidCheckoutContact(rawCustomer);
        const payload = { customer, items: state.cart, subtotal: cartSubtotal(), source: 'website-cart' };
        const result = await apiPost('orders', payload);
        state.cart = [];
        saveCart();
        renderOrderSuccess(result.order || {});
      } catch (error) {
        if (notice) {
          notice.className = 'notice error';
          notice.textContent = error.message || 'Purchase could not be submitted. Please use WhatsApp.';
        }
      }
      return;
    }
    const form = event.target.closest('[data-inquiry-form]');
    if (!form) return;
    event.preventDefault();
    const notice = $('#formNotice');
    const data = Object.fromEntries(new FormData(form).entries());
    data.source = 'website';
    if (notice) {
      notice.hidden = false;
      notice.className = 'notice';
      notice.textContent = 'Submitting inquiry...';
    }
    try {
      if (!contentConfigured()) throw new Error('Website content is not configured. Please use WhatsApp for now.');
      await apiPost('inquiries', data);
      const product = data.product_slug ? findProduct(data.product_slug, '') : null;
      if (product) trackEvent('inquiry_submit', product);
      if (notice) notice.textContent = 'Inquiry sent successfully.';
      form.reset();
    } catch (error) {
      if (notice) {
        notice.className = 'notice error';
        notice.textContent = error.message || 'Inquiry could not be sent. Please use WhatsApp.';
      }
    }
  });

  window.addEventListener('hashchange', () => render());
  loadContent();
})();
