const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const CHANNEL_SECRET = process.env.CHANNEL_SECRET;
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function verifySignature(signature, body) {
  const hmac = crypto.createHmac('SHA256', CHANNEL_SECRET);
  hmac.update(JSON.stringify(body));
  return signature === hmac.digest('base64');
}

async function askGemini(userMessage) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `คุณคือน้องกุ้ง เลขาผู้ช่วยขายของในร้านอุปกรณ์การเกษตรและอะไหล่มอเตอร์ไซค์ชื่อ "เกิดการเกษตร" ตอบสุภาพ เป็นกันเอง กระชับ เน้นบริการลูกค้าให้ดี ถามตอบเรื่องสินค้า ราคา ขายของได้เลย ภาษาไทย`
          }, {
            text: userMessage
          }]
        }],
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.7
        }
      })
    });

    const data = await response.json();
    console.log('Gemini response status:', response.status);

    if (data.error) {
      return `Error: ${data.error.message}`;
    }

    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return data.candidates[0].content.parts[0].text;
    }

    return 'ขอโทษค่ะ ตอบไม่ได้ตอนนี้';
  } catch (err) {
    console.error('Gemini error:', err.message);
    return `ขอโทษค่ะ ตอบไม่ได้ตอนนี้: ${err.message}`;
  }
}

app.post('/webhook', async (req, res) => {
  if (!verifySignature(req.get('x-line-signature'), req.body)) {
    return res.status(403).send('Forbidden');
  }

  const events = req.body.events;

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;
      const replyToken = event.replyToken;
      console.log('User message:', userMessage);

      const replyText = await askGemini(userMessage);
      console.log('Reply:', replyText);

      const replyUrl = 'https://api.line.me/v2/bot/message/reply';
      await fetch(replyUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          replyToken,
          messages: [{ type: 'text', text: replyText }]
        })
      });
    }
  }

  res.status(200).send('OK');
});

app.get('/', (req, res) => res.send('LINE Webhook Ready 🦐'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
