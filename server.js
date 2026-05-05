/**
 * LINE Webhook Bot - Nong Kung
 * Express.js + Groq API
 * Store: Kerdkarnkaset
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SALES_FILE = '/tmp/sales-inquiries.json';
const ADMIN_MODE_FILE = '/tmp/bot-admin-mode.json';

// Config
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const LOCAL_API_BASE = process.env.LOCAL_API_BASE || '';

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
  res.send('Nong Kung is ALIVE!');
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
function isAdminMode() {
  try {
    if (fs.existsSync(ADMIN_MODE_FILE)) {
      var data = fs.readFileSync(ADMIN_MODE_FILE, 'utf8');
      var info = JSON.parse(data);
      return info && info.on === true;
    }
  } catch (e) {}
  return false;
}

function toggleAdminMode() {
  try {
    var current = isAdminMode();
    fs.writeFileSync(ADMIN_MODE_FILE, JSON.stringify({ on: !current, updatedAt: new Date().toISOString() }), 'utf8');
    return !current;
  } catch (e) {
    return false;
  }
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
    systemPrompt = 'You are Nong Kung, a female shop assistant at Kerdkarnkaset store. Reply in Thai, end every sentence with "ka". Admin mode is ON. Tell customer to wait, admin will contact them back. Ask for their name and phone if not provided.';
  } else if (commandType === 'price') {
    systemPrompt = 'You are Nong Kung, a female shop assistant at Kerdkarnkaset store. Reply in Thai with short answers. When searching price, show product name and price clearly with line breaks. If not found, say "not found ka".';
  } else if (commandType === 'sales') {
    systemPrompt = 'You are Nong Kung, a female shop assistant at Kerdkarnkaset store helping with order. Ask for: name, phone, address, product, quantity. Reply in Thai, end with "ka".';
  } else {
    systemPrompt = 'You are Nong Kung, a female shop assistant at Kerdkarnkaset store selling agricultural equipment, motorcycle parts, and lawn mower parts. Reply in Thai, end every sentence with "ka". Use clear formatting with line breaks. Do not make up information. Use only the store data provided below.\n\nStore info:\n' + storeContext;
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
      : 'Sorry ka, cannot reply right now';
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

// Command handlers - ALL SILENTLY IGNORED for customers
async function handleCommand(msg, replyToken, userId, sourceType) {
  // !admin - toggle admin mode
  if (msg === '!admin') {
    var newState = toggleAdminMode();
    var replyText = newState
      ? 'Admin Mode ON - Bot paused'
      : 'Admin Mode OFF - Bot active';
    await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
    return true;
  }

  // !price - admin only (silent ignore for customers)
  if (msg.indexOf('!price ') === 0) {
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
      replyText += 'ka';
    } else {
      replyText = 'Not found "' + query + '" ka';
    }

    await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
    return true;
  }

  // !order - admin only
  if (msg === '!order') {
    var replyText = await callGroqAPI('Customer wants to order. Collect: name, phone, address, product name, quantity.', '', 'sales');
    await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
    return true;
  }

  // !shop - admin only
  if (msg === '!shop') {
    var storeInfo = await getStoreInfo();
    if (!storeInfo) {
      await replyToLine(replyToken, [{ type: 'text', text: 'Sorry ka, cannot get store info right now' }]);
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
  if (msg === '!help' || msg === '!help') {
    var helpText = 'Commands:\n\n';
    helpText += '!admin - Toggle admin mode\n';
    helpText += '!price [product] - Search price\n';
    helpText += '!order - Place order\n';
    helpText += '!shop - Store info\n';
    helpText += '!help - Show commands';
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
        var sourceType = (event.source && event.source.type) ? event.source.type : 'user';

        console.log('[WEBHOOK] User message:', userMessage, '| Source:', sourceType);

        // Check commands
        var handled = await handleCommand(userMessage, replyToken, userId, sourceType);
        if (handled) continue;

        // If admin mode is ON, tell customer bot is paused
        if (isAdminMode()) {
          await replyToLine(replyToken, [{ type: 'text', text: 'Bot is paused. Please wait ka' }]);
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
          await replyToLine(replyToken, [{ type: 'text', text: 'Type !price [product name] to search ka' }]);
        } else if (data === 'action_order') {
          await replyToLine(replyToken, [{ type: 'text', text: 'Type !order to place order ka' }]);
        } else if (data === 'action_contact') {
          var storeInfo = await getStoreInfo();
          var contactText = 'Contact store:\n';
          if (storeInfo && storeInfo.phone) contactText += 'Phone: ' + storeInfo.phone + '\n';
          if (storeInfo && storeInfo.line) contactText += 'Line: ' + storeInfo.line + '\n';
          contactText += 'ka';
          await replyToLine(replyToken, [{ type: 'text', text: contactText }]);
        } else if (data === 'action_admin') {
          var replyText = await callGroqAPI('Customer wants to contact admin', '', 'admin');
          await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
        } else {
          await replyToLine(replyToken, [{ type: 'text', text: 'Thank you ka' }]);
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
  console.log('Nong Kung LINE Bot started!');
  console.log('PORT:', PORT);
  console.log('Local API:', LOCAL_API_BASE);
});
