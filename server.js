/**
 * LINE Webhook Bot - Kerdkarnkaset
 * Express.js + Groq API + AI Welcome
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SALES_FILE = '/tmp/sales-inquiries.json';
const ADMIN_MODE_FILE = '/tmp/bot-admin-mode.json';
const WELCOME_FILE = '/tmp/welcome-sent.json';
const CUSTOMER_MODE_FILE = '/tmp/customer-bot-mode.json';

// Config
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const LOCAL_API_BASE = process.env.LOCAL_API_BASE || '';
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || 'Ud75471b7c313436141ce8d09f23472ef';

// Welcome message
const WELCOME_MSG = '🌾 สวัสดีค่ะ! ยินดีต้อนรับเข้าสู่ร้านเกิดการเกษตรค่ะ\n\n📍 ที่อยู่ร้าน: อ.โพนทอง จ.ร้อยเอ็ด\n📞 โทร: 091-414-5767\n🗺️ แผนที่: https://maps.app.goo.gl/yq9LvRcEp3xrb7p28\n⏰ เปิดทำการ: ทุกวัน 08:00-17:00 น.\n\n🤖 AI ผู้ช่วยอัจฉริยะ สามารถ:\n• เช็คราคาสินค้าได้ทันที (ราคาปลีก/ราคาส่ง*)\n• สั่งซื้อสินค้าออนไลน์ได้เลย\n• ตอบคำถามทั่วไปเกี่ยวกับสินค้า\n\n*ราคาส่ง ต้องสมัครสมาชิกร้านค้าค่ะ\n\n💬 ติดต่อแอดมิน: 08:00-17:00 น.\n\nมีอะไรให้ช่วยไหมคะ?';

// Middleware
app.use(express.json());

app.use(function(req, res, next) {
  console.log('\n========== NEW REQUEST ==========');
  console.log('[' + new Date().toISOString() + '] ' + req.method + ' ' + req.path);
  if (req.body) console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('=================================\n');
  next();
});

// Health check
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

// Local API calls
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
    var res = await fetch(LOCAL_API_BASE + '/api/products/search?q=' + encodeURIComponent(query));
    if (!res.ok) throw new Error('Search error: ' + res.status);
    return await res.json();
  } catch (err) {
    console.error('[LOCAL] searchProducts failed:', err.message);
    return null;
  }
}

// Admin mode helpers
function isGlobalBotOff() {
  try {
    if (fs.existsSync(ADMIN_MODE_FILE)) {
      var data = fs.readFileSync(ADMIN_MODE_FILE, 'utf8');
      var info = JSON.parse(data);
      return info && info.on === true;
    }
  } catch (e) {}
  return false;
}

function toggleGlobalBotMode() {
  try {
    var current = isGlobalBotOff();
    fs.writeFileSync(ADMIN_MODE_FILE, JSON.stringify({ on: !current, updatedAt: new Date().toISOString() }), 'utf8');
    return !current;
  } catch (e) {
    return false;
  }
}

// Per-customer bot mode
function isCustomerBotOff(userId) {
  try {
    if (fs.existsSync(CUSTOMER_MODE_FILE)) {
      var data = fs.readFileSync(CUSTOMER_MODE_FILE, 'utf8');
      var modeInfo = JSON.parse(data);
      return modeInfo[userId] === true;
    }
  } catch (e) {}
  return false;
}

function toggleCustomerBotMode(userId) {
  try {
    var modeInfo = {};
    if (fs.existsSync(CUSTOMER_MODE_FILE)) {
      var data = fs.readFileSync(CUSTOMER_MODE_FILE, 'utf8');
      modeInfo = JSON.parse(data);
    }
    modeInfo[userId] = !modeInfo[userId];
    fs.writeFileSync(CUSTOMER_MODE_FILE, JSON.stringify(modeInfo, null, 2), 'utf8');
    return modeInfo[userId];
  } catch (e) {
    return false;
  }
}

function getCustomerBotModes() {
  try {
    if (fs.existsSync(CUSTOMER_MODE_FILE)) {
      return JSON.parse(fs.readFileSync(CUSTOMER_MODE_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

// Welcome message helpers
function isWelcomeSent(userId) {
  try {
    if (fs.existsSync(WELCOME_FILE)) {
      var data = fs.readFileSync(WELCOME_FILE, 'utf8');
      var sent = JSON.parse(data);
      return sent[userId] === true;
    }
  } catch (e) {}
  return false;
}

function markWelcomeSent(userId) {
  try {
    var sent = {};
    if (fs.existsSync(WELCOME_FILE)) {
      var data = fs.readFileSync(WELCOME_FILE, 'utf8');
      sent = JSON.parse(data);
    }
    sent[userId] = true;
    fs.writeFileSync(WELCOME_FILE, JSON.stringify(sent, null, 2), 'utf8');
  } catch (e) {}
}

// Save sales inquiry
function saveSalesInquiry(inquiry) {
  try {
    var inquiries = [];
    if (fs.existsSync(SALES_FILE)) {
      var data = fs.readFileSync(SALES_FILE, 'utf8');
      inquiries = JSON.parse(data);
    }
    inquiries.push({ ...inquiry, timestamp: new Date().toISOString() });
    fs.writeFileSync(SALES_FILE, JSON.stringify(inquiries, null, 2), 'utf8');
    console.log('[SALES] Inquiry saved:', inquiry.product);
  } catch (err) {
    console.error('[SALES] Save failed:', err.message);
  }
}

// Groq API call
async function callGroqAPI(userMessage, storeContext, commandType) {
  console.log('[GROQ] Calling Groq API...');

  var systemPrompt = '';
  if (commandType === 'admin') {
    systemPrompt = 'You are an admin assistant at Kerdkarnkaset store. Reply in Thai. Admin mode is ON. Tell customer to wait, admin will contact them back. Ask for their name and phone if not provided.';
  } else if (commandType === 'price') {
    systemPrompt = 'You are an AI assistant at Kerdkarnkaset store. Reply in Thai with short answers. When searching price, show product name and price clearly with line breaks. If not found, say "not found".';
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
    console.log('[GROQ] Reply:', reply);
    return reply;

  } catch (error) {
    console.error('[GROQ] Exception:', error.message);
    throw error;
  }
}

// Reply to LINE
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

// Build store context
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

  console.log('[CONTEXT] Store context length:', ctx.length);
  return ctx;
}

// Command handlers
async function handleCommand(msg, replyToken, userId) {
  function isAdmin(uid) {
    return uid === ADMIN_USER_ID;
  }

  // !admin - toggle global bot mode (admin only)
  if (msg === '!admin') {
    if (!isAdmin(userId)) {
      return true; // silent ignore
    }
    var newState = toggleGlobalBotMode();
    var replyText = newState
      ? 'Bot OFF'
      : 'Bot ON';
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
      return true; // silent ignore
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
      return true; // silent ignore
    }
    var replyText = await callGroqAPI('Customer wants to order. Collect: name, phone, address, product name, quantity.', '', 'sales');
    await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
    return true;
  }

  // !shop - admin only
  if (msg === '!shop') {
    if (!isAdmin(userId)) {
      return true; // silent ignore
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
    if (storeInfo.line) lines.push({ type: 'text', text: 'Line: ' + storeInfo.line });
    await replyToLine(replyToken, lines);
    return true;
  }

  // !help - admin only
  if (msg === '!help') {
    if (!isAdmin(userId)) {
      return true; // silent ignore
    }
    var helpText = 'Commands:\n\n!admin - Toggle bot\n!price [product] - Search price\n!order - Place order\n!shop - Store info\n!myid - Show your ID\n!help - Show this';
    await replyToLine(replyToken, [{ type: 'text', text: helpText }]);
    return true;
  }

  return false;
}

// Webhook endpoint
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

        // Check if this is first time user - send welcome
        if (!isWelcomeSent(userId)) {
          console.log('[WELCOME] Sending welcome to new user:', userId);
          await replyToLine(replyToken, [{ type: 'text', text: WELCOME_MSG }]);
          markWelcomeSent(userId);
          continue;
        }

        // Check commands
        var handled = await handleCommand(userMessage, replyToken, userId);
        if (handled) continue;

        // Check if global bot is OFF
        if (isGlobalBotOff()) {
          console.log('[BOT] Global OFF - not responding');
          continue;
        }

        // Check if customer bot is OFF
        if (isCustomerBotOff(userId)) {
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

// Start server
app.listen(PORT, function() {
  console.log('Kerdkarnkaset LINE Bot started!');
  console.log('PORT:', PORT);
  console.log('Local API:', LOCAL_API_BASE);
});
