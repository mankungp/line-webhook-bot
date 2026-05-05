/**
 * LINE Webhook Bot - น้องกุ้ง 🦐
 * Express.js + Groq API (llama-3.1-8b-instant)
 *
 * ร้านเกิดการเกษตร - อุปกรณ์การเกษตร & อะไหล่มอเตอร์ไซค์
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SALES_FILE = '/tmp/sales-inquiries.json';

// ============================================================
// CONFIG - LINE, Groq & Local API Credentials
// ============================================================

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || 'YOUR_LINE_CHANNEL_SECRET';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || 'YOUR_LINE_CHANNEL_ACCESS_TOKEN';
const GROQ_API_KEY = process.env.GROQ_API_KEY || 'YOUR_GROQ_API_KEY';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const LOCAL_API_BASE = process.env.LOCAL_API_BASE || 'https://rephrase-depict-rubber.ngrok-free.dev';

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json());

app.use((req, res, next) => {
  console.log('\n========== NEW REQUEST ==========');
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.body) console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('=================================\n');
  next();
});

// Health check
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
// LOCAL API CALL
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

async function getProducts() {
  try {
    const res = await fetch(`${LOCAL_API_BASE}/api/products`);
    if (!res.ok) throw new Error(`Products error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[LOCAL] ❌ getProducts failed:', err.message);
    return null;
  }
}

async function searchProducts(query) {
  try {
    const res = await fetch(`${LOCAL_API_BASE}/api/products/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`Search error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[LOCAL] ❌ searchProducts failed:', err.message);
    return null;
  }
}

// ============================================================
// SALES INQUIRY LOG
// ============================================================

function saveSalesInquiry(inquiry) {
  try {
    let inquiries = [];
    if (fs.existsSync(SALES_FILE)) {
      const data = fs.readFileSync(SALES_FILE, 'utf8');
      inquiries = JSON.parse(data);
    }
    inquiries.push({
      ...inquiry,
      timestamp: new Date().toISOString()
    });
    fs.writeFileSync(SALES_FILE, JSON.stringify(inquiries, null, 2), 'utf8');
    console.log('[SALES] ✅ Inquiry saved:', inquiry.product);
  } catch (err) {
    console.error('[SALES] ❌ Save failed:', err.message);
  }
}

// ============================================================
// GROQ API CALL
// ============================================================

async function callGroqAPI(userMessage, storeContext = '', commandType = 'normal') {
  console.log('[GROQ] 📤 Calling Groq API...');

  const styleGuide = `
## รูปแบบคำตอบ:
- ขึ้นบรรทัดใหม่ชัดเจน ทุกหัวข้อ
- ใช้ emoji ประกอบแต่ไม่มากเกินไป
- เน้นข้อมูลสำคัญด้วยตัวหนา หรือขีดเส้นใต้
- ราคาให้แสดงชัดเจน ปัดเศษหรือไม่ก็ไม่ต้อง
- ตอบกระชับ ไม่ยืดเยื้อ

## คำลงท้าย:
- ทุกประโยคลงท้ายด้วย "ค่ะ" เท่านั้น
`;

  let systemInstruction = '';
  if (commandType === 'admin') {
    systemInstruction = `คุณคือน้องกุ้ง 🦐 ผู้ช่วยขายของร้านเกิดการเกษตร ตอบเป็นผู้หญิงใช้คำลงท้าย "ค่ะ" เท่านั้น ภาษาไทย

⚠️ โหมดแอดมิน: บอทกำลังหยุดทำงานชั่วคราว
- บอกลูกค้าว่า "ขอบคุณที่ติดต่อมาค่ะ ทางร้านจะติดต่อกลับเร็วๆ นี้นะคะ"
- จดข้อมูล: ชื่อลูกค้า, เบอร์โทร, สินค้าที่สนใจ, จำนวน ถ้ามี
${styleGuide}`;
  } else if (commandType === 'price') {
    systemInstruction = `คุณคือน้องกุ้ง 🦐 ผู้ช่วยขายของร้านเกิดการเกษตร ตอบเป็นผู้หญิงใช้คำลงท้าย "ค่ะ" เท่านั้น ภาษาไทย

📋 คำสั่งราคา: ตอบราคาสินค้าที่ค้นหาเท่านั้น ไม่ต้องอธิบายเพิ่ม
- แสดงชื่อสินค้า ราคา สถานะสต็อก (ถ้ามี)
- ถ้าไม่พบสินค้า บอกว่า "ไม่พบสินค้าที่ค้นหาค่ะ"
${styleGuide}`;
  } else if (commandType === 'sales') {
    systemInstruction = `คุณคือน้องกุ้ง 🦐 ผู้ช่วยขายของร้านเกิดการเกษตร ตอบเป็นผู้หญิงใช้คำลงท้าย "ค่ะ" เท่านั้น ภาษาไทย

🛒 ข้อมูลการสั่งซื้อ: จดบันทึกข้อมูลลูกค้า
- ถามชื่อ, เบอร์โทร, ที่อยู่จัดส่ง, สินค้าที่ต้องการ, จำนวน
- ยืนยันคำสั่งซื้อกลับไป
- เก็บข้อมูลไว้ในระบบ
${styleGuide}`;
  } else {
    systemInstruction = `คุณคือน้องกุ้ง 🦐 ผู้ช่วยขายของร้านเกิดการเกษตร ตอบเป็นผู้หญิงใช้คำลงท้าย "ค่ะ" เท่านั้น ภาษาไทย

## คำสั่งสำคัญ:
- ห้ามแต่งข้อมูลใดๆ ขึ้นมาเองเด็ดขาด!
- ตอบคำถามเกี่ยวกับร้าน สินค้า ราคา โดยใช้ข้อมูลที่ให้เท่านั้น
- ถ้าถามเรื่องที่ไม่มีในข้อมูล ให้ตอบว่า "ข้อมูลนี้ยังไม่มีในระบบค่ะ ติดต่อร้านได้โดยตรงนะคะ"
${styleGuide}

ข้อมูลร้าน:
${storeContext}`;
  }

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
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
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
// BUILD CONTEXT
// ============================================================

async function buildStoreContext() {
  const [storeInfo, allProducts] = await Promise.all([
    getStoreInfo().catch(() => null),
    getProducts().catch(() => null)
  ]);

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
      storeContext += `- ${p.name} | ราคา ${p.price} บาท`;
      if (p.stock !== undefined) storeContext += ` | สต็อก: ${p.stock}`;
      if (p.category) storeContext += ` | ${p.category}`;
      storeContext += '\n';
    }
  }

  console.log('[CONTEXT] Store context length:', storeContext.length);
  return storeContext;
}

// ============================================================
// COMMAND HANDLERS
// ============================================================

async function handleCommand(message, replyToken, userId) {
  const msg = message.trim();

  // ===== !แอดมิน =====
  if (msg === '!แอดมิน') {
    const replyText = await callGroqAPI('ลูกค้าต้องการติดต่อแอดมิน ขอข้อมูลเบื้องต้น', '', 'admin');
    await replyToLine(replyToken, [
      { type: 'text', text: replyText }
    ]);
    return true;
  }

  // ===== !ราคา =====
  if (msg.startsWith('!ราคา ')) {
    const query = msg.slice(4).trim();
    const results = await searchProducts(query);
    let replyText = '';

    if (results && Array.isArray(results) && results.length > 0) {
      replyText = `🔍 ผลการค้นหา "${query}"\n\n`;
      for (const p of results.slice(0, 10)) {
        replyText += `📦 ${p.name}\n`;
        replyText += `   💰 ราคา ${p.price} บาท\n`;
        if (p.stock !== undefined) {
          replyText += `   📊 สต็อก: ${p.stock} ชิ้น\n`;
        }
        replyText += '\n';
      }
      replyText += 'ค่ะ';
    } else {
      replyText = `❌ ไม่พบสินค้าที่ค้นหา "${query}" ค่ะ\n\nลองใช้คำค้นอื่น หรือติดต่อร้านโดยตรงนะคะ';
    }

    await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
    return true;
  }

  // ===== !สั่งซื้อ =====
  if (msg === '!สั่งซื้อ') {
    const replyText = await callGroqAPI('ลูกค้าต้องการสั่งซื้อ ขอข้อมูลการสั่งซื้อ', '', 'sales');
    await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
    return true;
  }

  // ===== !ข้อมูลร้าน =====
  if (msg === '!ข้อมูลร้าน') {
    const storeInfo = await getStoreInfo();
    if (!storeInfo) {
      await replyToLine(replyToken, [{ type: 'text', text: 'ขอโทษค่ะ ดึงข้อมูลร้านไม่ได้ในตอนนี้' }]);
      return true;
    }
    let replyText = `🏪 ข้อมูลร้านเกิดการเกษตร\n\n`;
    replyText += `📍 ที่อยู่: ${storeInfo.address || '-'}\n`;
    replyText += `📞 โทร: ${storeInfo.phone || '-'}\n`;
    replyText += `⏰ เปิด: ${storeInfo.openHours || '-'} (${storeInfo.openDays || ''})\n`;
    if (storeInfo.line) replyText += `💬 Line: ${storeInfo.line}\n`;
    if (storeInfo.facebook) replyText += `📱 Facebook: ${storeInfo.facebook}\n`;
    replyText += '\nค่ะ';
    await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
    return true;
  }

  // ===== !ช่วย =====
  if (msg === '!ช่วย' || msg === '!help') {
    const replyText = `🦐 คำสั่งน้องกุ้ง\n\n` +
      `📋 !ราคา [ชื่อสินค้า] - ค้นหาราคา\n` +
      `🛒 !สั่งซื้อ - สั่งซื้อสินค้า\n` +
      `📍 !ข้อมูลร้าน - ดูข้อมูลร้าน\n` +
      `👤 !แอดมิน - ติดต่อแอดมิน\n` +
      `❓ !ช่วย - แสดงคำสั่งนี้\n\n` +
      `หรือพิมพ์ถามตรงได้เลยค่ะ 🦐`;
    await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
    return true;
  }

  return false;
}

// ============================================================
// WEBHOOK ENDPOINT
// ============================================================

app.post('/webhook', verifyLineSignature, async (req, res) => {
  console.log('[WEBHOOK] 📥 Incoming webhook event');

  try {
    const events = req.body.events;

    if (!events || events.length === 0) {
      return res.status(200).json({ status: 'ok', message: 'No events' });
    }

    for (const event of events) {
      console.log('[WEBHOOK] Processing event type:', event.type);

      // ===== TEXT MESSAGE =====
      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text;
        const replyToken = event.replyToken;
        const userId = event.source?.userId || 'unknown';

        console.log('[WEBHOOK] 💬 User message:', userMessage);

        // Check for commands first
        const handled = await handleCommand(userMessage, replyToken, userId);
        if (handled) continue;

        // Normal conversation with context
        const storeContext = await buildStoreContext();
        const replyText = await callGroqAPI(userMessage, storeContext, 'normal');

        await replyToLine(replyToken, [
          {
            type: 'text',
            text: replyText
          }
        ]);
        continue;
      }

      // ===== POSTBACK (Quick Reply buttons) =====
      if (event.type === 'postback') {
        const replyToken = event.replyToken;
        const postbackData = event.postback?.data || '';

        console.log('[WEBHOOK] 📌 Postback:', postbackData);

        if (postbackData === 'action_price') {
          const replyText = '🔍 พิมพ์ !ราคา [ชื่อสินค้า] เช่น !ราคา ยางมอเตอร์ไซค์\n\nแล้วน้องกุ้งจะหาราคาให้ทันทีค่ะ 🦐';
          await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
        } else if (postbackData === 'action_order') {
          const replyText = '🛒 พิมพ์ !สั่งซื้อ เพื่อสั่งสินค้าค่ะ';
          await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
        } else if (postbackData === 'action_contact') {
          const storeInfo = await getStoreInfo();
          let replyText = `📞 ติดต่อร้านได้เลยค่ะ\n\n`;
          if (storeInfo?.phone) replyText += `โทร: ${storeInfo.phone}\n`;
          if (storeInfo?.line) replyText += `Line: ${storeInfo.line}\n`;
          replyText += '\nยินดีให้บริการค่ะ 🦐';
          await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
        } else if (postbackData === 'action_admin') {
          const replyText = await callGroqAPI('ลูกค้าต้องการติดต่อแอดมิน', '', 'admin');
          await replyToLine(replyToken, [{ type: 'text', text: replyText }]);
        } else {
          // Echo back
          await replyToLine(replyToken, [{ type: 'text', text: 'ขอบคุณค่ะ 🦐' }]);
        }
        continue;
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

app.listen(PORT, () => {
  console.log(`\n🦐 น้องกุ้ง LINE Bot started!`);
  console.log(`📡 PORT: ${PORT}`);
  console.log(`🔗 Local API: ${LOCAL_API_BASE}`);
  console.log(`🌐 ngrok URL: ${LOCAL_API_BASE}`);
  console.log(`\nReady to receive LINE webhooks!\n`);
});
