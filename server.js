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
  const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_pro?model=abab6.5s-chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'abab6.5s-chat',
      tokens_to_generate: 300,
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'คุณคือผู้ช่วยขายของในร้านอุปกรณ์การเกษตรและอะไหล่มอเตอร์ไซค์ ชื่อน้องกุ้ง ตอบสุภาพ เป็นกันเอง กระชับ เน้นขายของและบริการลูกค้าให้ดี' },
        { role: 'user', content: userMessage }
      ]
    })
  });
  
  const data = await response.json();
  if (data.choices && data.choices[0] && data.choices[0].messages) {
    return data.choices[0].messages[data.choices[0].messages.length - 1].text;
  }
  return 'ขอโทษค่ะ ตอบไม่ได้ตอนนี้';
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

      const replyText = await askMiniMax(userMessage);

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
