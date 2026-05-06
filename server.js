/**
 * LINE Webhook Bot - Kerdkarnkaset
 * Express.js + Groq API
 * Data stored on Mac via Local API
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Config
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const LOCAL_API_BASE = process.env.LOCAL_API_BASE || 'https://rephrase-depict-rubber.ngrok-free.dev';
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || 'Ud75471b7c313436141ce8d09f23472ef';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// Helper: ใส่ admin token ตอนยิง Local API
function adminFetch(url, opts) {
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers || {}, {
    'X-Admin-Token': ADMIN_TOKEN
  });
  return fetch(url, opts);
}

// Welcome message
const WELCOME_MSG = '🌾 สวัสดีค่ะ! ยินดีต้อนรับเข้าสู่ร้านเกิดการเกษตรค่ะ\n\n📍 ที่อยู่ร้าน: อ.โพนทอง จ.ร้อยเอ็ด\n📞 โทร: 091-414-5767\n🗺️ แผนที่: https://maps.app.goo.gl/yq9LvRcEp3xrb7p28\n⏰ เปิดทำการ: ทุกวัน 08:00-17:00 น.\n\n🤖 AI ผู้ช่วยอัจฉริยะ สามารถ:\n• เช็คราคาสินค้าได้ทันที (ราคาปลีก/ราคาส่ง*)\n• สั่งซื้อสินค้าออนไลน์ได้เลย\n• ตอบคำถามทั่วไปเกี่ยวกับสินค้า\n\n*ราคาส่ง ต้องสมัครสมาชิกร้านค้าค่ะ\n\n💬 ติดต่อแอดมิน: 08:00-17:00 น.\n\nมีอะไรให้ช่วยไหมคะ?';

// Middleware
app.use(express.json());

app.use(function(req, res, next) {
  console.log('\n[' + new Date().toISOString() + '] ' + req.method + ' ' + req.path);
  next();
});

app.use('/admin', express.static(path.join(__dirname, 'admin-panel')));
app.get('/', function(req, res) {
  res.send('Kerdkarnkaset is ALIVE!');
});

app.get('/health', function(req, res) {
  res.json({ status: 'ok', service: 'LINE Bot', timestamp: new Date().toISOString() });
});

// LINE signature verification
function verifyLineSignature(req, res, next) {
  var signature = req.get('x-line-signature');
  var bodyString = JSON.stringify(req.body);

  if (!signature) {
    console.error('[VERIFY] No signature found!');
    return res.status(401).json({ error: 'No signature' });
  }

  var expectedSignature = crypto.createHmac('SHA256', LINE_CHANNEL_SECRET).update(bodyString).digest('base64');

  if (signature !== expectedSignature) {
    console.error('[VERIFY] Signature MISMATCH!');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  console.log('[VERIFY] Signature OK');
  next();
}

// ============ LOCAL API CALLS ============

async function getStoreInfo() {
  try {
    var res = await fetch(LOCAL_API_BASE + '/api/shop');
    if (!res.ok) throw new Error('Store info error: ' + res.status);
    return await res.json();
  } catch (err) {
    console.error('[LOCAL] getStoreInfo failed:', err.message);
    return null;
  }
}

async function getProducts() {
  try {
    var res = await fetch(LOCAL_API_BASE + '/api/products');
    if (!res.ok) throw new Error('Products error: ' + res.status);
    return await res.json();
  } catch (err) {
    console.error('[LOCAL] getProducts failed:', err.message);
    return null;
  }
}

async function searchProducts(query) {
  try {
    var res = await fetch(LOCAL_API_BASE + '/api/products/search/' + encodeURIComponent(query));
    if (!res.ok) throw new Error('Search error: ' + res.status);
    return await res.json();
  } catch (err) {
    console.error('[LOCAL] searchProducts failed:', err.message);
    return null;
  }
}

async function getAdminStatus() {
  try {
    var res = await fetch(LOCAL_API_BASE + '/api/admin/status');
    if (!res.ok) throw new Error('Admin status error: ' + res.status);
    return await res.json();
  } catch (err) {
    console.error('[LOCAL] getAdminStatus failed:', err.message);
    return { globalMode: false, customerModes: {}, allCustomers: {} };
  }
}

async function toggleGlobalBot() {
  try {
    var res = await adminFetch(LOCAL_API_BASE + '/api/admin/toggle-global', { method: 'POST' });
    if (!res.ok) throw new Error('Toggle error');
    return await res.json();
  } catch (err) {
    console.error('[LOCAL] toggleGlobalBot failed:', err.message);
    return null;
  }
}

async function toggleCustomerBot(userId, turnOn) {
  try {
    var res = await adminFetch(LOCAL_API_BASE + '/api/admin/toggle-customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId, turnOn: turnOn })
    });
    if (!res.ok) throw new Error('Toggle error');
    return await res.json();
  } catch (err) {
    console.error('[LOCAL] toggleCustomerBot failed:', err.message);
    return null;
  }
}

async function isWelcomeSent(userId) {
  try {
    var sent = await fetch(LOCAL_API_BASE + '/api/welcome-sent');
    if (!sent.ok) return false;
    var data = await sent.json();
    return data[userId] === true;
  } catch (err) {
    return false;
  }
}

async function markWelcomeSent(userId) {
  try {
    await adminFetch(LOCAL_API_BASE + '/api/welcome-sent/' + userId, { method: 'POST' });
  } catch (err) {
    console.error('[LOCAL] markWelcomeSent failed:', err.message);
  }
}

// Fetch LINE user profile (display name)
async function fetchLineUserProfile(userId) {
  try {
    var res = await fetch('https://api.line.me/v2/bot/profile/' + encodeURIComponent(userId), {
      headers: { 'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN }
    });
    if (!res.ok) return null;
    var data = await res.json();
    return { displayName: data.displayName, pictureUrl: data.pictureUrl };
  } catch (err) {
    return null;
  }
}

async function pingCustomer(userId) {
  try {
    // Get LINE profile to store display name
    var profile = await fetchLineUserProfile(userId);
    var body = {};
    if (profile) {
      body.displayName = profile.displayName;
      body.pictureUrl = profile.pictureUrl;
    }
    await adminFetch(LOCAL_API_BASE + '/api/customers/' + userId + '/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {}
}

// ============ GROQ API ============

async function callGroqAPI(userMessage, storeContext, commandType) {
  console.log('[GROQ] Calling Groq API...');

  var systemPrompt = '';
  if (commandType === 'admin') {
    systemPrompt = 'You are an admin assistant at Kerdkarnkaset store. Reply in Thai. Admin mode is ON. Tell customer to wait, admin will contact them back.';
  } else if (commandType === 'price') {
    systemPrompt = 'You are an AI assistant at Kerdkarnkaset store. Reply in Thai with short answers. Show product name and price clearly with line breaks. If not found, say "not found".';
  } else if (commandType === 'sales') {
    systemPrompt = 'You are an AI assistant at Kerdkarnkaset store helping with order. Ask for: name, phone, address, product, quantity. Reply in Thai.';
  } else {
    systemPrompt = 'You are an AI assistant at Kerdkarnkaset store selling agricultural equipment, motorcycle parts, and lawn mower parts. Reply in Thai. Use clear formatting with line breaks. Do not make up information. Use only the store data provided below.\n\nStore info:\n' + storeContext;
  }

  try {
    var response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + GROQ_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    console.log('[GROQ] Response status:', response.status);

    if (!response.ok) {
      var errorText = await response.text();
      console.error('[GROQ] API Error:', response.status, errorText);
      throw new Error('Groq API error: ' + response.status);
    }

    var data = await response.json();
    var reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
      ? data.choices[0].message.content
      : 'ขอโทษค่ะ ตอบไม่ได้ในตอนนี้';
    console.log('[GROQ] Reply:', reply.substring(0, 100));
    return reply;

  } catch (error) {
    console.error('[GROQ] Exception:', error.message);
    throw error;
  }
}

// ============ REPLY TO LINE ============

async function replyToLine(replyToken, messages) {
  try {
    var response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ replyToken: replyToken, messages: messages }),
    });

    if (!response.ok) {
      var err = await response.text();
      console.error('[LINE] Reply failed:', response.status, err);
      throw new Error('LINE reply error: ' + response.status);
    }

    console.log('[LINE] Reply sent successfully');
    return true;
  } catch (error) {
    console.error('[LINE] Reply error:', error.message);
    throw error;
  }
}

// ============ BUILD CONTEXT ============

async function buildStoreContext() {
  var storeInfo = await getStoreInfo().catch(function() { return null; });
  var allProducts = await getProducts().catch(function() { return null; });

  var ctx = '';
  if (storeInfo) {
    ctx += 'Name: ' + (storeInfo.name || 'Kerdkarnkaset') + '\n';
    if (storeInfo.address) ctx += 'Address: ' + storeInfo.address + '\n';
    if (storeInfo.phone) ctx += 'Phone: ' + storeInfo.phone + '\n';
    if (storeInfo.openHours) ctx += 'Hours: ' + storeInfo.openHours + '\n';
  }
  if (allProducts && Array.isArray(allProducts)) {
    ctx += '\nProducts:\n';
    var topProducts = allProducts.slice(0, 20);
    for (var i = 0; i < topProducts.length; i++) {
      var p = topProducts[i];
      ctx += '- ' + p.name + ' | Price: ' + p.price + ' THB';
      if (p.stock !== undefined) ctx += ' | Stock: ' + p.stock;
      if (p.category) ctx += ' | ' + p.category;
      ctx += '\n';
    }
  }

  console.log('[CONTEXT] Length:', ctx.length);
  return ctx;
}

// ============ COMMAND HANDLERS ============

async function handleCommand(msg, replyToken, userId) {
  function isAdmin(uid) {
    return uid === ADMIN_USER_ID;
  }

  // !admin - toggle global bot mode (admin only)
  if (msg === '!admin') {
    if (!isAdmin(userId)) {
      return true;
    }
    var result = await toggleGlobalBot();
    var replyText = result && result.globalMode ? 'Bot OFF' : 'Bot ON';
    await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
    return true;
  }

  // !myid - check user ID
  if (msg === '!myid') {
    await replyToLine(replyToken, [{ type: 'text', text: 'ID: ' + userId }]);
    return true;
  }

  // !price - admin only
  if (msg.indexOf('!price ') === 0) {
    if (!isAdmin(userId)) {
      return true;
    }
    var query = msg.substring(7).trim();
    var results = await searchProducts(query);
    var replyText = '';

    if (results && Array.isArray(results) && results.length > 0) {
      replyText = 'Result for "' + query + '"\n\n';
      for (var i = 0; i < results.length && i < 10; i++) {
        var p = results[i];
        replyText += p.name + '\n';
        replyText += 'Price: ' + p.price + ' THB\n';
        if (p.stock !== undefined) replyText += 'Stock: ' + p.stock + ' units\n';
        replyText += '\n';
      }
    } else {
      replyText = 'Not found "' + query + '"';
    }

    await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
    return true;
  }

  // !order - admin only
  if (msg === '!order') {
    if (!isAdmin(userId)) {
      return true;
    }
    var replyText = await callGroqAPI('Customer wants to order. Collect: name, phone, address, product name, quantity.', '', 'sales');
    await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
    return true;
  }

  // !shop - admin only
  if (msg === '!shop') {
    if (!isAdmin(userId)) {
      return true;
    }
    var storeInfo = await getStoreInfo();
    if (!storeInfo) {
      await replyToLine(replyToken, [{ type: 'text', text: 'Sorry, cannot get store info right now' }]);
      return true;
    }
    var lines = [];
    lines.push({ type: 'text', text: 'Store Info\n' });
    lines.push({ type: 'text', text: 'Name: ' + (storeInfo.name || '-') });
    if (storeInfo.address) lines.push({ type: 'text', text: 'Address: ' + storeInfo.address });
    if (storeInfo.phone) lines.push({ type: 'text', text: 'Phone: ' + storeInfo.phone });
    if (storeInfo.openHours) lines.push({ type: 'text', text: 'Hours: ' + storeInfo.openHours });
    await replyToLine(replyToken, lines);
    return true;
  }

  // !help - admin only
  if (msg === '!help') {
    if (!isAdmin(userId)) {
      return true;
    }
    var helpText = 'Commands:\n\n!admin - Toggle bot\n!price [product] - Search price\n!order - Place order\n!shop - Store info\n!myid - Show your ID\n!help - Show this';
    await replyToLine(replyToken, [{ type: 'text', text: helpText }]);
    return true;
  }

  return false;
}

// ============ WEBHOOK ENDPOINT ============

app.post('/webhook', verifyLineSignature, async function(req, res) {
  console.log('[WEBHOOK] Incoming webhook event');

  try {
    var events = req.body.events;
    if (!events || events.length === 0) {
      return res.status(200).json({ status: 'ok' });
    }

    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      console.log('[WEBHOOK] Event type:', event.type);

      if (event.type === 'message' && event.message.type === 'text') {
        var userMessage = event.message.text;
        var replyToken = event.replyToken;
        var userId = (event.source && event.source.userId) ? event.source.userId : 'unknown';

        console.log('[WEBHOOK] User message:', userMessage, '| User:', userId);

        // Track customer activity
        pingCustomer(userId);

        // Check if first time user - send welcome
        var sent = await isWelcomeSent(userId);
        if (!sent) {
          console.log('[WELCOME] Sending welcome to new user:', userId);
          await replyToLine(replyToken, [{ type: 'text', text: WELCOME_MSG }]);
          await markWelcomeSent(userId);
          continue;
        }

        // Check admin commands
        var handled = await handleCommand(userMessage, replyToken, userId);
        if (handled) continue;

        // Get bot status
        var adminStatus = await getAdminStatus();

        // Check if global bot is OFF
        if (adminStatus.globalMode) {
          console.log('[BOT] Global OFF - not responding');
          continue;
        }

        // Check if customer bot is OFF
        if (adminStatus.customerModes && adminStatus.customerModes[userId] === true) {
          console.log('[BOT] Customer', userId, 'bot OFF - not responding');
          continue;
        }

        // Normal conversation
        var storeContext = await buildStoreContext();
        var replyText = await callGroqAPI(userMessage, storeContext, 'normal');

        await replyToLine(replyToken, [{ type: 'text', text: replyText }]);

      } else if (event.type === 'postback') {
        var replyToken = event.replyToken;
        var data = (event.postback && event.postback.data) ? event.postback.data : '';

        console.log('[WEBHOOK] Postback:', data);

        if (data === 'action_price') {
          await replyToLine(replyToken, [{ type: 'text', text: 'Type !price [product name] to search' }]);
        } else if (data === 'action_order') {
          await replyToLine(replyToken, [{ type: 'text', text: 'Type !order to place order' }]);
        } else if (data === 'action_contact') {
          var storeInfo = await getStoreInfo();
          var contactText = 'Contact:\n';
          if (storeInfo && storeInfo.phone) contactText += 'Phone: ' + storeInfo.phone + '\n';
          if (storeInfo && storeInfo.line) contactText += 'Line: ' + storeInfo.line + '\n';
          await replyToLine(replyToken, [{ type: 'text', text: contactText }]);
        } else if (data === 'action_admin') {
          var replyText = await callGroqAPI('Customer wants to contact admin', '', 'admin');
          await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
        } else {
          await replyToLine(replyToken, [{ type: 'text', text: 'Thank you' }]);
        }
      }
    }

    res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('[WEBHOOK] Error:', error.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ============ ADMIN PROXY ENDPOINTS (proxies to Local API) ============

app.get('/api/admin/status', async function(req, res) {
  try {
    var result = await getAdminStatus();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/toggle-global', async function(req, res) {
  try {
    var result = await toggleGlobalBot();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/toggle-customer', async function(req, res) {
  try {
    var userId = req.body.userId;
    var turnOn = req.body.turnOn;
    var result = await toggleCustomerBot(userId, turnOn);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ CATEGORIES PROXY ============
app.get('/api/categories', async function(req, res) {
  try {
    var r = await fetch(LOCAL_API_BASE + '/api/categories');
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/categories', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/categories/:id', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/categories/' + encodeURIComponent(req.params.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/categories/:id', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/categories/' + encodeURIComponent(req.params.id), {
      method: 'DELETE'
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ PRODUCTS PROXY ============
app.get('/api/products', async function(req, res) {
  try {
    var url = LOCAL_API_BASE + '/api/products?' + (req.url.split('?')[1] || '');
    var r = await fetch(url);
    var data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/products/' + req.params.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/products/' + req.params.id, { method: 'DELETE' });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products/:id/image', async function(req, res) {
  // Multipart upload - pass through as binary (ใส่ admin token ไปด้วย)
  try {
    var https = require('https');
    var http = require('http');
    var urlObj = new URL(LOCAL_API_BASE + '/api/products/' + req.params.id + '/image');
    var isHttps = urlObj.protocol === 'https:';
    var lib = isHttps ? https : http;
    var headers = Object.assign({}, req.headers);
    delete headers.host;
    headers['X-Admin-Token'] = ADMIN_TOKEN;

    var options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: headers
    };
    var proxyReq = lib.request(options, function(proxyRes) {
      var body = '';
      proxyRes.on('data', function(c) { body += c; });
      proxyRes.on('end', function() {
        res.status(proxyRes.statusCode);
        try { res.json(JSON.parse(body)); }
        catch (e) { res.send(body); }
      });
    });
    proxyReq.on('error', function(e) {
      res.status(500).json({ error: e.message });
    });
    req.pipe(proxyReq);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ ORDERS PROXY ============
app.get('/api/orders', async function(req, res) {
  try {
    var url = LOCAL_API_BASE + '/api/orders?' + (req.url.split('?')[1] || '');
    var r = await fetch(url);
    var data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/orders/' + req.params.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/:id/confirm', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/orders/' + req.params.id + '/confirm', { method: 'POST' });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/:id/paid', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/orders/' + req.params.id + '/paid', { method: 'POST' });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/:id/cancel', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/orders/' + req.params.id + '/cancel', { method: 'POST' });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ INVOICE PROXY ============

app.get('/api/orders/:id/invoice', async function(req, res) {
  try {
    var r = await fetch(LOCAL_API_BASE + '/api/orders/' + req.params.id + '/invoice');
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/orders/:id/invoice/issue', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/orders/' + req.params.id + '/invoice/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/orders/:id/invoice/data', async function(req, res) {
  try {
    var r = await fetch(LOCAL_API_BASE + '/api/orders/' + req.params.id + '/invoice/data');
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PDF binary stream
app.get('/api/orders/:id/invoice/pdf', async function(req, res) {
  try {
    var qs = req.url.split('?')[1] || '';
    var url = LOCAL_API_BASE + '/api/orders/' + req.params.id + '/invoice/pdf' + (qs ? '?' + qs : '');
    var r = await fetch(url);
    if (!r.ok) {
      var t = await r.text();
      return res.status(r.status).send(t);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', r.headers.get('content-disposition') || 'inline');
    var buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ CUSTOMERS PROXY ============
app.get('/api/customers', async function(req, res) {
  try {
    var url = LOCAL_API_BASE + '/api/customers?' + (req.url.split('?')[1] || '');
    var r = await fetch(url);
    var data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ MEMBERS PROXY ============
app.get('/api/members', async function(req, res) {
  try {
    var qs = req.url.split('?')[1] || '';
    var r = await fetch(LOCAL_API_BASE + '/api/members' + (qs ? '?' + qs : ''));
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/members/search', async function(req, res) {
  try {
    var qs = req.url.split('?')[1] || '';
    var r = await fetch(LOCAL_API_BASE + '/api/members/search' + (qs ? '?' + qs : ''));
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/members/:id', async function(req, res) {
  try {
    var r = await fetch(LOCAL_API_BASE + '/api/members/' + encodeURIComponent(req.params.id));
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/members/:id/orders', async function(req, res) {
  try {
    var r = await fetch(LOCAL_API_BASE + '/api/members/' + encodeURIComponent(req.params.id) + '/orders');
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/members', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/members/:id', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/members/' + encodeURIComponent(req.params.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/members/:id', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/members/' + encodeURIComponent(req.params.id), {
      method: 'DELETE'
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/members/:id/recalc-stats', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/members/' + encodeURIComponent(req.params.id) + '/recalc-stats', {
      method: 'POST'
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ REPORTS PROXY ============
['/api/reports/dashboard', '/api/reports/sales-trend', '/api/reports/by-channel',
 '/api/reports/by-category', '/api/reports/by-tier', '/api/reports/top-products',
 '/api/reports/top-customers', '/api/reports/stock-alerts', '/api/reports/inactive-members',
 '/api/reports/profit'
].forEach(function(path) {
  app.get(path, async function(req, res) {
    try {
      var qs = req.url.split('?')[1] || '';
      var r = await fetch(LOCAL_API_BASE + path + (qs ? '?' + qs : ''));
      res.json(await r.json());
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
});

// ============ PRODUCTS EXTRA PROXY (Phase 2A) ============
['/api/products/find-duplicates', '/api/products/merge', '/api/products/bulk-import', '/api/products/bulk-edit'].forEach(function(p) {
  app.post(p, async function(req, res) {
    try {
      var r = await adminFetch(LOCAL_API_BASE + p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {})
      });
      res.json(await r.json());
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
});

// Import LINE customers (admin)
app.post('/api/members/import-from-customers', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/members/import-from-customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ STATS PROXY ============
app.get('/api/stats', async function(req, res) {
  try {
    var r = await fetch(LOCAL_API_BASE + '/api/stats');
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ START ============

app.listen(PORT, function() {
  console.log('Kerdkarnkaset LINE Bot started!');
  console.log('PORT:', PORT);
  console.log('Local API:', LOCAL_API_BASE);
  console.log('Admin Panel: https://line-webhook-bot-yniv.onrender.com/admin');
});