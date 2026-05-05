/**
 * LINE Webhook Bot - น้องกุ้ง 🦐
 * Express.js + Groq API (llama-3.1-8b-instant)
 * 
 * ร้านเกิดการเกษตร - อุปกรณ์การเกษตร & อะไหล่มอเตอร์ไซค์
 */

const express = require('express');
const crypto = require('crypto');

const app = express();

// ============================================================
// CONFIG - LINE, Groq & Local API Credentials
// ============================================================

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || 'YOUR_LINE_CHANNEL_SECRET';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || 'YOUR_LINE_CHANNEL_ACCESS_TOKEN';
const GROQ_API_KEY = process.env.GROQ_API_KEY || 'YOUR_GROQ_API_KEY';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// NEW: Local API Base URL (ngrok)
const LOCAL_API_BASE = process.env.LOCAL_API_BASE || 'https://rephrase-depict-rubber.ngrok-free.dev';

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json());

// Log all requests (debug)
app.use((req, res, next) => {
  console.log('\n========== NEW REQUEST ==========');
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.body) console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('=================================\n');
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('🦐 น้องกุ้ง is ALIVE! - LINE Bot Ready');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'LINE Bot - น้องกุ้ง', timestamp: new Date().toISOString() });
});

// ============================================================
// LINE SIGNATURE VERIFICATION
// ============================================================

function verifyLineSignature(req, res, next) {
  const signature = req.get('x-line-signature');
  const bodyString = JSON.stringify(req.body);
  
  if (!signature) {
    console.error('[VERIFY] ❌ NO signature found!');
    return res.status(401).json({ error: 'No signature' });
  }

  const expectedSignature = crypto
    .createHmac('SHA256', LINE_CHANNEL_SECRET)
    .update(bodyString)
    .digest('base64');

  if (signature !== expectedSignature) {
    console.error('[VERIFY] ❌ Signature MISMATCH!');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  console.log('[VERIFY] ✅ Signature OK');
  next();
}

// ============================================================
// LOCAL API CALL - ดึงข้อมูลร้าน/สินค้า
// ============================================================

async function getStoreInfo() {
  try {
    const res = await fetch(`${LOCAL_API_BASE}/api/shop`);
    if (!res.ok) throw new Error(`Store info error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[LOCAL] ❌ getStoreInfo failed:', err.message);
    return null;
  }
}

async function getProducts(category = null) {
  try {
    const url = category 
      ? `${LOCAL_API_BASE}/api/products?category=${encodeURIComponent(category)}`
      : `${LOCAL_API_BASE}/api/products`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Products error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[LOCAL] ❌ getProducts failed:', err.message);
    return null;
  }
}

async function searchProducts(query) {
  try {
    const res = await fetch(
      `${LOCAL_API_BASE}/api/products/search?q=${encodeURIComponent(query)}`
    );
    if (!res.ok) throw new Error(`Search error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[LOCAL] ❌ searchProducts failed:', err.message);
    return null;
  }
}

// ============================================================
// GROQ API CALL
// ============================================================

async function callGroqAPI(userMessage, storeContext = '') {
  console.log('[GROQ] 📤 Calling Groq API...');

  // Build enhanced system prompt with store context
  const enhancedSystemPrompt = storeContext
    ? `คุณคือน้องกุ้ง 🦐 ผู้หญิงวัยสาว ผู้ช่วยขายของในร้านอุปกรณ์การเกษตรและอะไหล่มอเตอร์ไซค์ชื่อ "เกิดการเกษตร" พูดจาสุภาพ เป็นกันเอง กระชับ มีอัธยาศัยดี เน้นบริการลูกค้าให้ดี ชอบช่วยเหลือ ตอบเป็นผู้หญิงใช้คำลงท้าย "ค่ะ" เท่านั้น ภาษาไทย

ข้อมูลร้าน:
${storeContext}`
    : `คุณคือน้องกุ้ง 🦐 ผู้หญิงวัยสาว ผู้ช่วยขายของในร้านอุปกรณ์การเกษตรและอะไหล่มอเตอร์ไซค์ชื่อ "เกิดการเกษตร" พูดจาสุภาพ เป็นกันเอง กระชับ มีอัธยาศัยดี เน้นบริการลูกค้าให้ดี ชอบช่วยเหลือ ตอบเป็นผู้หญิงใช้คำลงท้าย "ค่ะ" เท่านั้น ภาษาไทย`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: enhancedSystemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.8,
        max_tokens: 500,
      }),
    });

    console.log('[GROQ] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GROQ] ❌ API Error:', response.status, errorText);
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const assistantReply = data.choices?.[0]?.message?.content || 'ขอโทษค่ะ ตอบไม่ได้ในตอนนี้';
    console.log('[GROQ] ✅ Reply:', assistantReply);

    return assistantReply;

  } catch (error) {
    console.error('[GROQ] ❌ Exception:', error.message);
    throw error;
  }
}

// ============================================================
// LINE REPLY API
// ============================================================

async function replyToLine(replyToken, messages) {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        replyToken: replyToken,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[LINE] ❌ Reply failed:', response.status, err);
      throw new Error(`LINE reply error: ${response.status}`);
    }

    console.log('[LINE] ✅ Reply sent successfully');
    return true;
  } catch (error) {
    console.error('[LINE] ❌ Reply error:', error.message);
    throw error;
  }
}

// ============================================================
// WEBHOOK ENDPOINT
// ============================================================

app.post('/webhook', verifyLineSignature, async (req, res) => {
  console.log('[WEBHOOK] 📥 Incoming webhook event');

  try {
    const events = req.body.events;

    if (!events || events.length === 0) {
      console.log('[WEBHOOK] ℹ️ No events in body');
      return res.status(200).json({ status: 'ok', message: 'No events' });
    }

    // Process each event
    for (const event of events) {
      console.log('[WEBHOOK] Processing event type:', event.type);

      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text;
        const replyToken = event.replyToken;

        console.log('[WEBHOOK] 💬 User message:', userMessage);

        // Fetch store context from local API
        console.log('[LOCAL] 📡 Fetching store info...');
        const [storeInfo, allProducts] = await Promise.all([
          getStoreInfo().catch(() => null),
          getProducts().catch(() => null)
        ]);

        // Build context string
        let storeContext = '';
        if (storeInfo) {
          storeContext += `ชื่อร้าน: ${storeInfo.name || 'เกิดการเกษตร'}\n`;
          if (storeInfo.address) storeContext += `ที่อยู่: ${storeInfo.address}\n`;
          if (storeInfo.phone) storeContext += `โทร: ${storeInfo.phone}\n`;
          if (storeInfo.openHours) storeContext += `เปิด: ${storeInfo.openHours}\n`;
        }
        if (allProducts && Array.isArray(allProducts)) {
          const topProducts = allProducts.slice(0, 20);
          storeContext += '\nสินค้าในร้าน:\n';
          for (const p of topProducts) {
            storeContext += `- ${p.name} ราคา ${p.price} บาท`;
            if (p.category) storeContext += ` (${p.category})`;
            storeContext += '\n';
          }
        }

        console.log('[CONTEXT] Store context length:', storeContext.length);

        // Call Groq API with store context
        const replyText = await callGroqAPI(userMessage, storeContext);

        // Reply to LINE
        await replyToLine(replyToken, [
          {
            type: 'text',
            text: replyText
          }
        ]);
      }
    }

    res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('[WEBHOOK] ❌ Error:', error.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🦐 น้องกุ้ง LINE Bot started!`);
  console.log(`📡 PORT: ${PORT}`);
  console.log(`🔗 Local API: ${LOCAL_API_BASE}`);
  console.log(`🌐 ngrok URL: ${LOCAL_API_BASE}`);
  console.log(`\nReady to receive LINE webhooks!\n`);
});