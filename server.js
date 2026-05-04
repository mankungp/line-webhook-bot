const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const CHANNEL_SECRET = proces…RET;
const CHANNEL_ACCESS_TOKEN = proces…KEN;
const GROQ_API_KEY = proces…KEY;

function verifySignature(signature, body) {
  const hmac = crypto.createHmac('SHA256', CHANNEL_SECRET);
  hmac.update(JSON.stringify(body));
  return signature === hmac.digest('base64');
}

async function askGroq(userMessage) {
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer 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",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: "คุณคือน้องกุ้ง เลขาผู้ช่วยขายของในร้านอุปกรณ์การเกษตรและอะไหล่มอเตอร์ไซค์ชื่อ \"เกิดการเกษตร\" ตอบสุภาพ เป็นกันเอง กระชับ เน้นบริการลูกค้าให้ดี ถามตอบเรื่องสินค้า ราคา ขายของได้เลย ภาษาไทย"
          },
          {
            role: "user",
            content: userMessage
          }
        ],
        max_tokens: 300,
        temperature: 0.7
      })
    });

    const data = await response.json();
    console.log("Groq response status:", response.status);

    if (data.error) {
      return `Error: ${data.error.message}`;
    }

    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    }

    return "ขอโทษค่ะ ตอบไม่ได้ตอนนี้";
  } catch (err) {
    console.error("Groq error:", err.message);
    return `ขอโทษค่ะ ตอบไม่ได้ตอนนี้: ${err.message}`;
  }
}

app.post("/webhook", async (req, res) => {
  if (!verifySignature(req.get("x-line-signature"), req.body)) {
    return res.status(403).send("Forbidden");
  }

  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userMessage = event.message.text;
      const replyToken = event.replyToken;
      console.log("User message:", userMessage);

      const replyText = await askGroq(userMessage);
      console.log("Reply:", replyText);

      const replyUrl = "https://api.line.me/v2/bot/message/reply";
      await fetch(replyUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CHANNEL_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          replyToken,
          messages: [{ type: "text", text: replyText }]
        })
      });
    }
  }

  res.status(200).send("OK");
});

app.get("/", (req, res) => res.send("LINE Webhook Ready 🦐"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
