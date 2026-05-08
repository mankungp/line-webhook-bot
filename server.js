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
app.use(express.json({ limit: '1mb' }));

app.use(function(req, res, next) {
  console.log('\n[' + new Date().toISOString() + '] ' + req.method + ' ' + req.path);
  next();
});

// Login page (must come before static middleware so /admin/login is served)
app.get('/login', function(req, res) {
  res.sendFile(path.join(__dirname, 'admin-panel', 'login.html'));
});
app.get('/admin/login', function(req, res) {
  res.sendFile(path.join(__dirname, 'admin-panel', 'login.html'));
});

app.use('/admin', express.static(path.join(__dirname, 'admin-panel')));
app.get('/', function(req, res) {
  res.send('Kerdkarnkaset is ALIVE!');
});

app.get('/health', function(req, res) {
  res.json({ status: 'ok', service: 'LINE Bot', timestamp: new Date().toISOString() });
});

// ============ AUTH PROXY (Phase 8) ============

app.get('/auth/login', async function(req, res) {
  try {
    var qs = req.url.split('?')[1] || '';
    var url = LOCAL_API_BASE + '/auth/login' + (qs ? '?' + qs : '');
    var r = await fetch(url, { redirect: 'manual' });
    var loc = r.headers.get('location');
    if (loc) return res.redirect(loc);
    res.status(r.status).send(await r.text());
  } catch (err) {
    console.error('[auth-proxy] login error:', err);
    res.status(500).send('Auth proxy error: ' + err.message);
  }
});

app.get('/auth/line/callback', async function(req, res) {
  try {
    var qs = req.url.split('?')[1] || '';
    var url = LOCAL_API_BASE + '/auth/line/callback' + (qs ? '?' + qs : '');
    var r = await fetch(url, { redirect: 'manual' });

    var setCookie = r.headers.get('set-cookie');
    if (setCookie) res.setHeader('Set-Cookie', setCookie);

    var loc = r.headers.get('location');
    if (loc) return res.redirect(loc);

    res.status(r.status).send(await r.text());
  } catch (err) {
    console.error('[auth-proxy] callback error:', err);
    res.status(500).send('Auth proxy error: ' + err.message);
  }
});

app.get('/auth/me', async function(req, res) {
  try {
    var r = await fetch(LOCAL_API_BASE + '/auth/me', {
      headers: { 'cookie': req.headers.cookie || '' }
    });
    var ct = r.headers.get('content-type') || 'application/json';
    res.status(r.status).set('Content-Type', ct).send(await r.text());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/auth/logout', async function(req, res) {
  try {
    var r = await fetch(LOCAL_API_BASE + '/auth/logout', {
      method: 'POST',
      headers: { 'cookie': req.headers.cookie || '' }
    });
    var setCookie = r.headers.get('set-cookie');
    if (setCookie) res.setHeader('Set-Cookie', setCookie);
    var ct = r.headers.get('content-type') || 'application/json';
    res.status(r.status).set('Content-Type', ct).send(await r.text());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

['/auth/pending','/auth/blocked'].forEach(function(p) {
  app.get(p, async function(req, res) {
    try {
      var r = await fetch(LOCAL_API_BASE + p);
      res.setHeader('Content-Type', r.headers.get('content-type') || 'text/html; charset=utf-8');
      res.status(r.status).send(await r.text());
    } catch (err) { res.status(500).send(err.message); }
  });
});

// Forward request body + cookie to local-api
function forwardWithCookie(method) {
  return async function(req, res) {
    try {
      var qs = req.url.split('?')[1] || '';
      var url = LOCAL_API_BASE + req.path + (qs ? '?' + qs : '');
      var opts = {
        method: method,
        headers: {
          'cookie': req.headers.cookie || '',
          'content-type': 'application/json'
        }
      };
      if (method !== 'GET' && method !== 'DELETE') {
        opts.body = JSON.stringify(req.body || {});
      }
      var r = await fetch(url, opts);
      var ct = r.headers.get('content-type') || 'application/json';
      res.status(r.status).set('Content-Type', ct).send(await r.text());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

app.get('/api/users', forwardWithCookie('GET'));
app.put('/api/users/:lineUserId', forwardWithCookie('PUT'));
app.delete('/api/users/:lineUserId', forwardWithCookie('DELETE'));

// ============ HR / EMPLOYEES / ATTENDANCE PROXIES ============
app.get('/api/employees', forwardWithCookie('GET'));
app.post('/api/employees', forwardWithCookie('POST'));
app.put('/api/employees/:code', forwardWithCookie('PUT'));
app.delete('/api/employees/:code', forwardWithCookie('DELETE'));
app.get('/api/hr/zk/ping', forwardWithCookie('GET'));
app.get('/api/hr/zk/users', forwardWithCookie('GET'));
app.post('/api/hr/zk/sync', forwardWithCookie('POST'));
app.get('/api/hr/zk/status', forwardWithCookie('GET'));
app.get('/api/attendance', forwardWithCookie('GET'));
app.get('/api/advances', forwardWithCookie('GET'));
app.post('/api/advances', forwardWithCookie('POST'));
app.delete('/api/advances/:id', forwardWithCookie('DELETE'));
app.get('/api/tech-jobs', forwardWithCookie('GET'));
app.post('/api/tech-jobs', forwardWithCookie('POST'));
app.put('/api/tech-jobs/:id', forwardWithCookie('PUT'));
app.delete('/api/tech-jobs/:id', forwardWithCookie('DELETE'));

// ============ PAYROLL PROXIES (Phase 3) ============
app.get('/api/holidays', forwardWithCookie('GET'));
app.get('/api/holidays/:yearMonth', forwardWithCookie('GET'));
app.put('/api/holidays/:yearMonth', forwardWithCookie('PUT'));
app.delete('/api/holidays/:yearMonth', forwardWithCookie('DELETE'));
app.get('/api/payroll/preview', forwardWithCookie('GET'));
app.get('/api/payroll/preview-all', forwardWithCookie('GET'));
app.post('/api/payroll/commit', forwardWithCookie('POST'));
app.get('/api/payroll/list', forwardWithCookie('GET'));
app.post('/api/payroll/:id/mark-paid', forwardWithCookie('POST'));
app.post('/api/payroll/:id/send-line', forwardWithCookie('POST'));
// PDF — binary stream (ต้อง forward cookie + arrayBuffer)
app.get('/api/payroll/:id/pdf', async function(req, res) {
  try {
    var url = LOCAL_API_BASE + '/api/payroll/' + req.params.id + '/pdf';
    var r = await fetch(url, {
      method: 'GET',
      headers: { 'cookie': req.headers.cookie || '' }
    });
    if (!r.ok) {
      var t = await r.text();
      return res.status(r.status).send(t);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', r.headers.get('content-disposition') || 'inline');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Attendance (QR check-in)
app.get('/api/attendance/qr-token', forwardWithCookie('GET'));
app.get('/api/attendance/today', forwardWithCookie('GET'));
app.post('/api/attendance/manual', forwardWithCookie('POST'));
app.post('/api/attendance/verify-token', forwardWithCookie('POST'));
app.post('/api/attendance/checkin', forwardWithCookie('POST'));
app.post('/api/attendance/set-pin', forwardWithCookie('POST'));
app.get('/api/attendance/active-employees', forwardWithCookie('GET'));

// Mobile attendance scan page (public — token required in query)
app.get('/attendance/scan', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'admin-panel', 'attendance-scan.html'));
});

// ============ TECH APP PROXIES (Phase A) ============
app.get('/api/tech/me', forwardWithCookie('GET'));
app.get('/api/tech/jobs', forwardWithCookie('GET'));
app.get('/api/tech/jobs/:id', forwardWithCookie('GET'));
app.post('/api/tech/jobs', forwardWithCookie('POST'));
app.put('/api/tech/jobs/:id', forwardWithCookie('PUT'));
app.post('/api/tech/jobs/:id/photos', forwardWithCookie('POST'));
app.delete('/api/tech/jobs/:id/photos/:idx', forwardWithCookie('DELETE'));
app.post('/api/tech/jobs/:id/start-fixing', forwardWithCookie('POST'));
app.post('/api/tech/jobs/:id/done', forwardWithCookie('POST'));
app.post('/api/tech/jobs/:id/deliver', forwardWithCookie('POST'));
app.get('/api/tech/products', forwardWithCookie('GET'));

// Approve
app.get('/api/tech-jobs/pending-approval', forwardWithCookie('GET'));
app.post('/api/tech-jobs/:id/approve', forwardWithCookie('POST'));
app.post('/api/tech-jobs/:id/reject', forwardWithCookie('POST'));
app.post('/api/tech-jobs/:id/return-to-fixing', forwardWithCookie('POST'));
app.post('/api/tech-jobs/:id/cancel', forwardWithCookie('POST'));

// Static mobile app + PWA assets — no-cache HTML to ensure latest version
function sendTechApp(req, res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'admin-panel', 'tech-app.html'));
}
app.get('/tech', sendTechApp);
app.get('/tech/', sendTechApp);
app.get('/tech-manifest.json', function(req, res) {
  res.sendFile(path.join(__dirname, 'admin-panel', 'tech-manifest.json'));
});
app.get('/tech-icon-192.png', function(req, res) {
  res.sendFile(path.join(__dirname, 'admin-panel', 'tech-icon-192.png'));
});
app.get('/tech-icon-512.png', function(req, res) {
  res.sendFile(path.join(__dirname, 'admin-panel', 'tech-icon-512.png'));
});
app.get('/tech-icon-180.png', function(req, res) {
  res.sendFile(path.join(__dirname, 'admin-panel', 'tech-icon-180.png'));
});

// ============ MARKETPLACE PROXIES ============
app.get('/api/marketplace/status', forwardWithCookie('GET'));
app.get('/api/marketplace/lazada/config', forwardWithCookie('GET'));
app.put('/api/marketplace/lazada/config', forwardWithCookie('PUT'));
app.post('/api/marketplace/lazada/sync-orders', forwardWithCookie('POST'));
app.get('/api/marketplace/tiktok/config', forwardWithCookie('GET'));
app.put('/api/marketplace/tiktok/config', forwardWithCookie('PUT'));
app.post('/api/marketplace/tiktok/sync-orders', forwardWithCookie('POST'));
// Webhooks: ไม่ต้อง forward cookie (Lazada/TikTok call ไม่มี session) — raw forward
app.post('/api/marketplace/lazada/webhook', forwardWithCookie('POST'));
app.post('/api/marketplace/tiktok/webhook', forwardWithCookie('POST'));


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

// ============ PUSH FLEX TO LINE ============

// ส่ง LINE Flex message ไปยัง userId เฉพาะ (push)
async function pushFlexToLine(toUserId, altText, flexContents) {
  try {
    var url = 'https://api.line.me/v2/bot/message/push';
    var res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: toUserId,
        messages: [{
          type: 'flex',
          altText: altText,
          contents: flexContents
        }]
      })
    });
    var data = await res.json().catch(function(){return {};});
    if (!res.ok) {
      console.error('[pushFlexToLine] HTTP', res.status, data);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[pushFlexToLine] err:', e.message);
    return false;
  }
}

// Build approve flex bubble
function buildTechJobApproveFlex(job) {
  var amt = (job.amount || 0).toLocaleString();
  var comm = (job.commission_amount || 0).toLocaleString();
  var partsTotal = (job.parts_total || 0).toLocaleString();
  var labor = (job.labor_charge || 0).toLocaleString();
  var rate = job.commission_rate != null ? job.commission_rate : 0;

  // Build base URL สำหรับรูป (LINE บังคับ HTTPS)
  var baseUrl = process.env.RENDER_BASE_URL || 'https://line-webhook-bot-yniv.onrender.com';

  // เลือกรูปหลักมาแสดง (max 1 รูปใน hero)
  var photos = Array.isArray(job.photos) ? job.photos : [];
  var heroPhoto = null;
  if (photos.length > 0) {
    var rawUrl = photos[0].url || '';
    if (rawUrl.indexOf('http') === 0) heroPhoto = rawUrl;
    else if (rawUrl.indexOf('/') === 0) heroPhoto = baseUrl + rawUrl;
  }

  // ช่างซ่อม (fixed_by) — ถ้าไม่มี fallback received_by
  var fixerName = job.fixed_by_name || job.fixed_by || '-';
  var receiverName = job.received_by_name || job.received_by || '-';
  var delivererName = job.delivered_by_name || job.delivered_by || '-';

  // Parts list (max 5 รายการ กันยาวเกิน)
  var parts = Array.isArray(job.parts_used) ? job.parts_used : [];
  var partsContents = [];
  if (parts.length > 0) {
    partsContents.push({
      type: 'text', text: '🔩 อะไหล่ (' + parts.length + ')',
      size: 'sm', weight: 'bold', color: '#0a8855', margin: 'md'
    });
    var displayParts = parts.slice(0, 5);
    displayParts.forEach(function(p) {
      partsContents.push({
        type: 'box', layout: 'horizontal', margin: 'xs', contents: [
          { type: 'text', text: '• ' + (p.name_tech || p.name || p.sku || '-'),
            size: 'xs', color: '#555555', flex: 5, wrap: true },
          { type: 'text', text: '×' + (p.qty || 1),
            size: 'xs', color: '#999999', flex: 1, align: 'center' },
          { type: 'text', text: '฿' + (Number(p.total) || 0).toLocaleString(),
            size: 'xs', color: '#333333', flex: 2, align: 'end' }
        ]
      });
    });
    if (parts.length > 5) {
      partsContents.push({
        type: 'text', text: '… และอีก ' + (parts.length - 5) + ' รายการ',
        size: 'xs', color: '#999999', margin: 'xs', align: 'end'
      });
    }
  }

  var bubble = {
    type: 'bubble', size: 'mega',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        { type: 'text', text: '🔧 งานซ่อมเสร็จ — รออนุมัติ', weight: 'bold', size: 'lg', color: '#e67e22' },
        { type: 'text', text: job.id, size: 'xs', color: '#999999' },
        { type: 'separator', margin: 'md' },

        // ลูกค้า + เครื่อง
        { type: 'box', layout: 'vertical', margin: 'md', spacing: 'xs', contents: [
          { type: 'text', text: '👤 ' + (job.customer_name || '-'), size: 'sm', weight: 'bold' },
          { type: 'text', text: '📞 ' + (job.customer_phone || '-'), size: 'xs', color: '#666666' },
          { type: 'text', text: '🏍️ ' + ((job.device && job.device.brand) || '') + ' ' + ((job.device && job.device.model) || ''),
            size: 'sm', wrap: true },
          (job.device && job.device.problem_description ?
            { type: 'text', text: 'อาการ: ' + job.device.problem_description, size: 'xs', color: '#666666', wrap: true }
            : { type: 'filler' })
        ]},

        { type: 'separator', margin: 'md' },

        // ผู้รับผิดชอบ
        { type: 'text', text: '👨‍🔧 ผู้รับผิดชอบ', size: 'sm', weight: 'bold', color: '#0a8855', margin: 'md' },
        { type: 'box', layout: 'vertical', spacing: 'xs', contents: [
          { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
            { type: 'text', text: 'รับเครื่อง', size: 'xs', color: '#999999', flex: 2 },
            { type: 'text', text: receiverName, size: 'xs', color: '#333333', flex: 5, wrap: true }
          ]},
          { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
            { type: 'text', text: '🔧 ช่างที่ซ่อม', size: 'xs', color: '#999999', flex: 2 },
            { type: 'text', text: fixerName, size: 'xs', color: '#0a8855', weight: 'bold', flex: 5, wrap: true }
          ]},
          { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
            { type: 'text', text: 'ส่งงาน', size: 'xs', color: '#999999', flex: 2 },
            { type: 'text', text: delivererName, size: 'xs', color: '#333333', flex: 5, wrap: true }
          ]}
        ]}
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        // สรุปเงิน
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: 'อะไหล่', flex: 2, color: '#999999', size: 'sm' },
          { type: 'text', text: '฿' + partsTotal, flex: 3, align: 'end', size: 'sm' }
        ]},
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: 'ค่าแรง', flex: 2, color: '#999999', size: 'sm' },
          { type: 'text', text: '฿' + labor, flex: 3, align: 'end', size: 'sm' }
        ]},
        { type: 'separator', margin: 'sm' },
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: 'รวม', flex: 2, color: '#333333', size: 'md', weight: 'bold' },
          { type: 'text', text: '฿' + amt, flex: 3, align: 'end', size: 'md', weight: 'bold' }
        ]},
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: 'คอมช่าง (' + rate + '%)', flex: 2, color: '#0a8855', size: 'sm', weight: 'bold' },
          { type: 'text', text: '฿' + comm, flex: 3, align: 'end', size: 'md', weight: 'bold', color: '#0a8855' }
        ]},
        { type: 'separator', margin: 'sm' },
        { type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'sm', contents: [
          { type: 'button', style: 'primary', color: '#27ae60', height: 'sm', flex: 2,
            action: { type: 'postback', label: '✅ อนุมัติ', data: 'tech_approve:' + job.id, displayText: 'อนุมัติ ' + job.id }}
        ]},
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
          { type: 'button', style: 'secondary', color: '#f39c12', height: 'sm', flex: 1,
            action: { type: 'postback', label: '🔄 ส่งกลับ', data: 'tech_return:' + job.id, displayText: 'ส่งกลับซ่อม ' + job.id }},
          { type: 'button', style: 'secondary', color: '#dc2626', height: 'sm', flex: 1,
            action: { type: 'uri', label: '❌ ยกเลิก', uri: baseUrl + '/admin/?focus=' + encodeURIComponent(job.id) + '#tech-cancel' }}
        ]},
        { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
          { type: 'button', style: 'link', height: 'sm', flex: 1,
            action: { type: 'uri', label: '✏️ แก้ไข / ดูรายละเอียด', uri: baseUrl + '/admin/?focus=' + encodeURIComponent(job.id) + '#tech-edit' }}
        ]}
      ]
    }
  };

  // ถ้ามีรูป→ใส่ hero
  if (heroPhoto) {
    bubble.hero = {
      type: 'image', url: heroPhoto, size: 'full', aspectRatio: '4:3', aspectMode: 'cover',
      action: { type: 'uri', uri: heroPhoto }
    };
  }

  // ถ้ามีอะไหล่ แทรกก่อน separator
  if (partsContents.length > 0) {
    bubble.body.contents.push({ type: 'separator', margin: 'md' });
    bubble.body.contents.push.apply(bubble.body.contents, partsContents);
  }

  return bubble;
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

      // บันทึก customer ทุก event ที่มี source.userId (follow / message / postback / sticker / image)
      var evtUserId = (event.source && event.source.userId) ? event.source.userId : null;
      if (evtUserId) {
        pingCustomer(evtUserId);
      }

      // Handle Follow Event (มีคน Add เพื่อนใหม่)
      if (event.type === 'follow') {
        console.log('[WEBHOOK] 👋 Follow event - userId:', evtUserId);
        if (event.replyToken) {
          try {
            await replyToLine(event.replyToken, [{ type: 'text', text: WELCOME_MSG }]);
            if (evtUserId) await markWelcomeSent(evtUserId);
          } catch (e) {
            console.error('[WEBHOOK] Follow reply error:', e.message);
          }
        }
        continue;
      }

      if (event.type === 'message' && event.message.type === 'text') {
        var userMessage = event.message.text;
        var replyToken = event.replyToken;
        var userId = (event.source && event.source.userId) ? event.source.userId : 'unknown';

        console.log('[WEBHOOK] User message:', userMessage, '| User:', userId);

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
        } else if (data.indexOf('tech_approve:') === 0) {
          var jobId = data.substring('tech_approve:'.length);
          var lineUserId = event.source && event.source.userId;
          try {
            var r = await fetch(LOCAL_API_BASE + '/api/tech-jobs/' + encodeURIComponent(jobId) + '/approve', {
              method: 'POST',
              headers: {'Content-Type':'application/json','X-Admin-Token':process.env.ADMIN_TOKEN || ''},
              body: JSON.stringify({via:'line_button', approved_by_line_user: lineUserId})
            });
            var dd = await r.json().catch(function(){return {};});
            var msg = r.ok ? '✅ อนุมัติงาน ' + jobId + ' แล้ว' : '❌ ' + (dd.error || ('HTTP ' + r.status));
            await replyToLine(replyToken, [{type:'text', text: msg}]);
          } catch (e) {
            await replyToLine(replyToken, [{type:'text', text:'❌ ' + e.message}]);
          }
        } else if (data.indexOf('tech_return:') === 0) {
          var jobIdR = data.substring('tech_return:'.length);
          var lineUserIdR = event.source && event.source.userId;
          try {
            var rR = await fetch(LOCAL_API_BASE + '/api/tech-jobs/' + encodeURIComponent(jobIdR) + '/return-to-fixing', {
              method: 'POST',
              headers: {'Content-Type':'application/json','X-Admin-Token':process.env.ADMIN_TOKEN || ''},
              body: JSON.stringify({via:'line_button', approved_by_line_user: lineUserIdR, reason: '(ส่งกลับผ่าน LINE — ตรวจชิ้นงาน/ซ่อมเพิ่ม)'})
            });
            var ddR = await rR.json().catch(function(){return {};});
            var msgR = rR.ok ? '🔄 ส่งงาน ' + jobIdR + ' กลับไปซ่อมต่อแล้ว (ช่างได้รับแจ้งทาง LINE)' : '❌ ' + (ddR.error || ('HTTP ' + rR.status));
            await replyToLine(replyToken, [{type:'text', text: msgR}]);
          } catch (eR) {
            await replyToLine(replyToken, [{type:'text', text:'❌ ' + eR.message}]);
          }
        } else if (data.indexOf('tech_reject:') === 0) {
          // legacy: reject button → บอกให้ owner ไปที่ admin UI เพราะต้องระบุออปชั่น
          var jobId2 = data.substring('tech_reject:'.length);
          await replyToLine(replyToken, [{type:'text', text: '⚠️ กรุณายกเลิกผ่าน admin panel — ต้องระบุค่าใช้จ่าย + จัดการ stock\n\nลิงก์: ' + (process.env.RENDER_BASE_URL || '') + '/admin/?focus=' + encodeURIComponent(jobId2) + '#tech-cancel'}]);
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

// Helper: push plain text to LINE
async function pushTextToLine(toUserId, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) return false;
  try {
    var res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN
      },
      body: JSON.stringify({
        to: toUserId,
        messages: [{ type: 'text', text: text }]
      })
    });
    if (!res.ok) {
      var data = await res.text().catch(function(){return ''; });
      console.error('[pushTextToLine] HTTP', res.status, data);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[pushTextToLine] err:', e.message);
    return false;
  }
}

// Helper: หาชื่อผู้ approve จาก lineUserId ของ user
function lookupUserName(lineUserId) {
  if (!lineUserId || lineUserId === 'admin-token') return 'Admin (token)';
  try {
    var fs2 = require('fs');
    // ลองอ่าน users.json จาก NAS-mounted path ไม่ได้ — fallback ใช้ lineUserId snippet
  } catch (e) {}
  return 'Owner ' + String(lineUserId).slice(-6);
}

// ============ INTERNAL: NOTIFY TECH (job returned to fixing) ============
app.post('/api/_internal/notify-tech-return', async function(req, res) {
  try {
    var token = req.headers['x-internal-token'] || '';
    var expected = process.env.INTERNAL_TOKEN || '';
    if (expected && token !== expected) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    var body = req.body || {};
    var job = body.job;
    var techLineId = body.tech_line_id;
    var reason = body.reason || '';
    if (!job || !job.id || !techLineId) return res.status(400).json({ error: 'missing fields' });
    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      return res.json({ ok: true, skipped: true });
    }

    var msgLines = [
      '🔄 งานซ่อมถูกส่งกลับ',
      '',
      '📝 ' + job.id,
      '👤 ' + (job.customer_name || '-'),
      '🏍️ ' + ((job.device && job.device.brand) || '') + ' ' + ((job.device && job.device.model) || ''),
      ''
    ];
    if (reason) msgLines.push('รายละเอียด: ' + reason);
    msgLines.push('');
    msgLines.push('กรุณาตรวจชิ้นงานและซ่อมต่อ');
    var msg = msgLines.join('\n');

    var ok = await pushTextToLine(techLineId, msg);
    res.json({ ok: ok });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ INTERNAL: NOTIFY OWNER (TECH JOB DECISION: approve/reject) ============
app.post('/api/_internal/notify-tech-decision', async function(req, res) {
  try {
    var token = req.headers['x-internal-token'] || '';
    var expected = process.env.INTERNAL_TOKEN || '';
    if (expected && token !== expected) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    var body = req.body || {};
    var action = body.action; // 'approved' | 'rejected'
    var job = body.job;
    var fixerName = body.fixer_name || '-';
    var approver = body.approver || {};
    var ownerIds = Array.isArray(body.owner_line_ids) ? body.owner_line_ids : [];
    if (!job || !job.id || !action) return res.status(400).json({ error: 'missing fields' });
    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      console.warn('[notify-tech-decision] no LINE token, skip');
      return res.json({ ok: true, skipped: true });
    }

    var approverName = approver.displayName || approver.name || lookupUserName(approver.lineUserId);
    var emoji = action === 'approved' ? '✅' : '❌';
    var label = action === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ';

    var msgLines = [
      emoji + ' งานซ่อม ' + label,
      '',
      '📝 ' + job.id,
      '👤 ' + (job.customer_name || '-'),
      '🏍️ ' + ((job.device && job.device.brand) || '') + ' ' + ((job.device && job.device.model) || ''),
      '🔧 ช่าง: ' + fixerName,
      '💰 รวม ฿' + (Number(job.amount)||0).toLocaleString() + ' / คอม ฿' + (Number(job.commission_amount)||0).toLocaleString(),
      '',
      '👍 โดย: ' + approverName
    ];
    if (action === 'rejected' && approver.reason) {
      msgLines.push('เหตุผล: ' + approver.reason);
    }
    var msg = msgLines.join('\n');

    var sent = 0;
    for (var i = 0; i < ownerIds.length; i++) {
      var ok = await pushTextToLine(ownerIds[i], msg);
      if (ok) sent++;
    }
    res.json({ ok: true, sent: sent, total: ownerIds.length, action: action });
  } catch (e) {
    console.error('[notify-tech-decision] err:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============ INTERNAL: NOTIFY OWNER (TECH JOB DELIVERED) ============
// Called by local-api after marking job delivered. Best-effort push to LINE owners.
app.post('/api/_internal/notify-tech-delivered', async function(req, res) {
  try {
    var token = req.headers['x-internal-token'] || '';
    var expected = process.env.INTERNAL_TOKEN || '';
    if (expected && token !== expected) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    var body = req.body || {};
    var job = body.job;
    var ownerIds = Array.isArray(body.owner_line_ids) ? body.owner_line_ids : [];
    if (!job || !job.id) return res.status(400).json({ error: 'missing job' });
    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      console.warn('[notify-tech-delivered] no LINE token, skip');
      return res.json({ ok: true, skipped: true, reason: 'no LINE token' });
    }
    var flex = buildTechJobApproveFlex(job);
    var alt = 'งานซ่อมเสร็จ ' + job.id + ' รออนุมัติคอม';
    var sent = 0;
    for (var i = 0; i < ownerIds.length; i++) {
      var ok = await pushFlexToLine(ownerIds[i], alt, flex);
      if (ok) sent++;
    }
    res.json({ ok: true, sent: sent, total: ownerIds.length });
  } catch (e) {
    console.error('[notify-tech-delivered] err:', e.message);
    res.status(500).json({ error: e.message });
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
 '/api/reports/profit', '/api/reports/sales-leaderboard'
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

// ============ SURVEILLANCE PROXY ============
app.get('/api/cameras', async function(req, res) {
  try {
    var r = await fetch(LOCAL_API_BASE + '/api/cameras');
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/cameras/:id/snapshot', async function(req, res) {
  try {
    var r = await fetch(LOCAL_API_BASE + '/api/cameras/' + encodeURIComponent(req.params.id) + '/snapshot');
    if (!r.ok) return res.status(r.status).send('snapshot failed');
    res.setHeader('Content-Type', 'image/jpeg');
    var buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/orders/:id/videos', async function(req, res) {
  try {
    var qs = req.url.split('?')[1] || '';
    var r = await fetch(LOCAL_API_BASE + '/api/orders/' + req.params.id + '/videos' + (qs ? '?' + qs : ''));
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/videos/:recordingId/stream', async function(req, res) {
  try {
    var r = await fetch(LOCAL_API_BASE + '/api/videos/' + req.params.recordingId + '/stream');
    if (!r.ok) return res.status(r.status).send('Stream failed');
    res.setHeader('Content-Type', r.headers.get('content-type') || 'video/mp4');
    res.setHeader('Content-Disposition', 'inline');
    var lenHdr = r.headers.get('content-length');
    if (lenHdr) res.setHeader('Content-Length', lenHdr);
    var reader = r.body.getReader();
    res.on('close', function() { try { reader.cancel(); } catch (e) {} });
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      res.write(Buffer.from(chunk.value));
    }
    res.end();
  } catch (err) { if (!res.headersSent) res.status(500).json({ error: err.message }); }
});

app.get('/snapshots/:filename', async function(req, res) {
  try {
    var r = await fetch(LOCAL_API_BASE + '/snapshots/' + encodeURIComponent(req.params.filename));
    if (!r.ok) return res.status(404).send('not found');
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (err) { res.status(500).send('error'); }
});

// Tech app photos: /snapshots/tech/JOB-xxx/file.jpg + attendance: /snapshots/att/...
// ถ้าไม่พบ (404) → fallback ไปลองขอจาก archive (รูปเก่าที่ archive ไป NAS แล้ว)
app.get('/snapshots/:type/:dir/:filename', async function(req, res) {
  try {
    var paths = [
      '/snapshots/' + encodeURIComponent(req.params.type) + '/' +
        encodeURIComponent(req.params.dir) + '/' +
        encodeURIComponent(req.params.filename),
      '/snapshots-archive/' + encodeURIComponent(req.params.type) + '/' +
        encodeURIComponent(req.params.dir) + '/' +
        encodeURIComponent(req.params.filename)
    ];
    for (var i = 0; i < paths.length; i++) {
      var r = await fetch(LOCAL_API_BASE + paths[i]);
      if (r.ok) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        if (i > 0) res.setHeader('X-Snapshot-Source', 'archive');
        return res.send(Buffer.from(await r.arrayBuffer()));
      }
    }
    return res.status(404).send('not found');
  } catch (err) { res.status(500).send('error'); }
});

app.post('/api/orders/:id/snapshot', async function(req, res) {
  try {
    var r = await adminFetch(LOCAL_API_BASE + '/api/orders/' + req.params.id + '/snapshot', { method: 'POST' });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single order (helper for video modal)
app.get('/api/orders/:id', async function(req, res) {
  try {
    var r = await fetch(LOCAL_API_BASE + '/api/orders/' + req.params.id);
    res.status(r.status).json(await r.json());
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