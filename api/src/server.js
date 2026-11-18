require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { pool, initDb } = require("./db");
const { sendText } = require("./whatsapp");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_NAME = "MIKEY MD API";

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = (process.env.FRONTEND_ORIGIN || "")
      .split(",").map(v => v.trim()).filter(Boolean);
    if (!origin || allowed.length === 0 || allowed.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  }
}));
app.use(express.json({
  limit: "1mb",
  verify: (req, res, buf) => { req.rawBody = Buffer.from(buf); }
}));

app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

function requireApiKey(req, res, next) {
  const configured = process.env.API_KEY;
  if (!configured) return res.status(503).json({ ok: false, error: "API_KEY is not configured on the server." });
  const supplied = req.get("x-api-key") || "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(configured);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: "Invalid or missing API key." });
  }
  next();
}

function verifyMetaSignature(req) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const signature = req.get("x-hub-signature-256") || "";
  if (!signature.startsWith("sha256=") || !req.rawBody) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validPhone(value) {
  return typeof value === "string" && /^\+?[1-9]\d{7,14}$/.test(value);
}

async function handleCommand(message, sender) {
  const text = message.text?.body?.trim();
  if (!text || !text.startsWith(".")) return;

  const [commandRaw, ...rest] = text.split(/\s+/);
  const command = commandRaw.toLowerCase();
  const name = rest.join(" ").trim().toLowerCase();

  if (command === ".store") {
    if (!name) {
      await sendText(sender, "Usage: reply to a text message with .store name");
      return;
    }
    const repliedMessageId = message.context?.id;
    if (!repliedMessageId) {
      await sendText(sender, "Please reply to the text message you want to save, then send .store name.");
      return;
    }
    const found = await pool.query(
      `SELECT from_number, message_type, message_text
       FROM inbound_messages WHERE message_id = $1 AND from_number = $2`,
      [repliedMessageId, sender]
    );
    if (!found.rowCount) {
      await sendText(sender, "I couldn't find that replied-to message in this chat.");
      return;
    }
    const item = found.rows[0];
    if (item.message_type !== "text" || !item.message_text) {
      await sendText(sender, "This v1 release stores text messages and links only. Media storage is not enabled yet.");
      return;
    }
    await pool.query(
      `INSERT INTO saved_messages(from_number, name, content_type, content_text)
       VALUES($1, $2, 'text', $3)
       ON CONFLICT(from_number, name)
       DO UPDATE SET content_type = EXCLUDED.content_type,
                     content_text = EXCLUDED.content_text,
                     created_at = NOW()`,
      [sender, name, item.message_text]
    );
    await sendText(sender, `Saved as "${name}". Use .get ${name} to retrieve it.`);
    return;
  }

  if (command === ".get") {
    if (!name) {
      await sendText(sender, "Usage: .get name");
      return;
    }
    const found = await pool.query(
      "SELECT content_text FROM saved_messages WHERE from_number = $1 AND name = $2",
      [sender, name]
    );
    if (!found.rowCount) {
      await sendText(sender, `Nothing is saved as "${name}".`);
      return;
    }
    await sendText(sender, found.rows[0].content_text);
  }
}

async function processWebhook(payload) {
  const entries = payload.entry || [];
  for (const entry of entries) {
    for (const change of (entry.changes || [])) {
      const value = change.value || {};
      for (const message of (value.messages || [])) {
        const sender = message.from;
        if (!sender) continue;

        let messageText = null;
        if (message.type === "text") messageText = message.text?.body || null;
        else if (message.type === "button") messageText = message.button?.text || null;
        else if (message.type === "interactive") {
          messageText = message.interactive?.button_reply?.title ||
                        message.interactive?.list_reply?.title || null;
        }

        await pool.query(
          `INSERT INTO inbound_messages(message_id, from_number, message_type, message_text, payload)
           VALUES($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT(message_id) DO NOTHING`,
          [message.id, sender, message.type || "unknown", messageText, JSON.stringify(message)]
        );

        try {
          await handleCommand(message, sender);
        } catch (error) {
          console.error("Command processing error:", error.message);
        }
      }
    }
  }
}

app.get("/", (req, res) => {
  res.json({
    name: APP_NAME,
    description: "WhatsApp Business Cloud API service",
    status: "online",
    documentation: "/api/docs",
    endpoints: {
      health: "GET /api/health",
      stats: "GET /api/stats",
      sendText: "POST /api/messages/text",
      webhook: "GET/POST /webhook"
    }
  });
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, status: "online", service: APP_NAME, database: "connected", timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ ok: false, status: "degraded", service: APP_NAME, database: "disconnected" });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const [inbound, saved, sent] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS total FROM inbound_messages"),
      pool.query("SELECT COUNT(*)::int AS total FROM saved_messages"),
      pool.query("SELECT COUNT(*)::int AS total FROM api_message_logs WHERE status = 'sent'")
    ]);
    res.json({
      ok: true,
      service: APP_NAME,
      totalInboundMessages: inbound.rows[0].total,
      savedItems: saved.rows[0].total,
      apiMessagesSent: sent.rows[0].total
    });
  } catch (error) {
    res.status(503).json({ ok: false, error: "Statistics are temporarily unavailable." });
  }
});

app.get("/api/docs", (req, res) => {
  res.json({
    name: APP_NAME,
    version: "1.0.0",
    authentication: "Send your private API key in the x-api-key header.",
    endpoints: [
      { method: "GET", path: "/api/health", auth: false, description: "API and database status." },
      { method: "GET", path: "/api/stats", auth: false, description: "Aggregate usage statistics." },
      { method: "POST", path: "/api/messages/text", auth: true, description: "Send a WhatsApp text message." },
      { method: "GET", path: "/webhook", auth: false, description: "Meta webhook verification." },
      { method: "POST", path: "/webhook", auth: false, description: "Receive WhatsApp webhook events; Meta signature is checked when configured." }
    ],
    sendTextExample: {
      method: "POST",
      path: "/api/messages/text",
      headers: { "Content-Type": "application/json", "x-api-key": "YOUR_API_KEY" },
      body: { to: "919876543210", text: "Hello from MIKEY MD API" }
    },
    notes: [
      "Use a WhatsApp Business phone number registered with Meta.",
      "Business-initiated conversations may require approved message templates.",
      "The .store command saves a replied-to text message or link. Media storage is not included in v1."
    ]
  });
});

app.post("/api/messages/text", requireApiKey, async (req, res) => {
  const { to, text } = req.body || {};
  if (!validPhone(to) || typeof text !== "string" || !text.trim() || text.length > 4096) {
    return res.status(400).json({
      ok: false,
      error: "Provide 'to' as an international phone number (digits, optional leading +) and 'text' (1-4096 characters)."
    });
  }

  try {
    const result = await sendText(to.replace(/^\+/, ""), text.trim());
    await pool.query(
      "INSERT INTO api_message_logs(recipient, status) VALUES($1, 'sent')",
      [to]
    );
    res.status(200).json({ ok: true, message: "Message accepted by WhatsApp API.", result });
  } catch (error) {
    console.error("Send message error:", error.message);
    res.status(502).json({ ok: false, error: "WhatsApp message could not be sent.", details: error.message });
  }
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  if (!verifyMetaSignature(req)) {
    return res.status(401).json({ ok: false, error: "Invalid webhook signature." });
  }
  // Acknowledge quickly; process the event asynchronously.
  res.sendStatus(200);
  processWebhook(req.body).catch(error => console.error("Webhook processing error:", error.message));
});

app.use((err, req, res, next) => {
  console.error(err.message);
  if (res.headersSent) return next(err);
  res.status(400).json({ ok: false, error: "Request could not be processed." });
});

async function start() {
  await initDb();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`${APP_NAME} listening on port ${PORT}`);
  });
}

start().catch(error => {
  console.error("Startup failed:", error);
  process.exit(1);
});
