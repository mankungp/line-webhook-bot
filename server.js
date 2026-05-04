const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const CHANNEL_SECRET = process.env.CHANNEL_SECRET;
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

function verifySignature(signature, body) {
  const hmac = crypto.createHmac('SHA256', CHANNEL_SECRET);
  hmac.update(JSON.stringify(body));
  return signature === hmac.digest('base64');
}

app.post('/webhook', (req, res) => {
  if (!verifySignature(req.get('x-line-signature'), req.body)) {
    return res.status(403).send('Forbidden');
  }

  const events = req.body.events;
  
  Promise.all(events.map(async (event) => {
    if (event.type === 'message') {
      const userMessage = event.message.text;
      const replyToken = event.replyToken;

      let replyText = `ได้รับข้อความ: ${userMessage}`;

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
  }));

  res.status(200).send('OK');
});

app.get('/', (req, res) => res.send('LINE Webhook Ready 🦐'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
