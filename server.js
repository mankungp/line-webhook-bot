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
// CONFIG - LINE & Groq Credentials
// ============================================================

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || 'YOUR_LINE_CHANNEL_SECRET';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || 'YOUR_LINE_CHANNEL_ACCESS_TOKEN';
const GROQ_API_KEY = 'gsk_C7…ONfH';  // Groq API Key
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// System Prompt - กำหนดบทบาทน้องกุ้ง
const SYSTEM_PROMPT = 'คุณคือน้องกุ้ง 🦐 ผู้หญิงวัยสาว ผู้ช่วยขายของในร้านอุปกรณ์การเกษตรและอะไหล่มอเตอร์ไซค์ชื่อ "เกิดการเกษตร" พูดจาสุภาพ เป็นกันเอง กระชับ มีอัธยาศัยดี เน้นบริการลูกค้าให้ดี ชอบช่วยเหลือ ตอบเป็นผู้หญิงใช้คำลงท้าย "ค่ะ" เท่านั้น ภาษาไทย';

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
// GROQ API CALL
// ============================================================

async function callGroqAPI(userMessage) {
  console.log('[GROQ] 📤 Calling Groq API...');

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
          { role: 'system', content: SYSTEM_PROMPT },
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
