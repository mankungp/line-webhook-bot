const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const CHANNEL_SECRET = process.env.CHANNEL_SECRET;
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;

function verifySignature(signature, body) {
  const hmac = crypto.createHmac('SHA256', CHANNEL_SECRET);
  hmac.update(JSON.stringify(body));
  return signature === hmac.digest('base64');
}

async function askMiniMax(userMessage) {
  try {
    console.log('MiniMax API call with key:', MINIMAX_API_KEY ? 'present' : 'missing');
    
    const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'abab6.5s-chat',
        max_tokens: 300,
        temperature: 0.7,
        messages: [
          { role: 'system', content: 'คุณคือผู้ช่วยขายของในร้านอุปกรณ์การเกษตรและอะไหล่มอเตอร์ไซค์ ชื่อน้องกุ้ง ตอบสุภาพ เป็นกันเอง กระชับ เน้นขายของและบริการลูกค้าให้ดี' },
          { role: 'user', content: userMessage }
        ]
      })
    });
    
    console.log('MiniMax response status:', response.status);
    const data = await response.json();
    console.log('MiniMax response:', JSON.stringify(data).substring(0, 500));
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    }
    if (data.error) {
      return `MiniMax error: ${data.error.message || JSON.stringify(data.error)}`;
    }
    return 'ขอโทษค่ะ ตอบไม่ได้ตอนนี้';
  } catch (err) {
    console.error('MiniMax error:', err.message);
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

      const replyText = await askMiniMax(userMessage);
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
