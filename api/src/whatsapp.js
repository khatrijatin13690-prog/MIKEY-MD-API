const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

async function sendText(to, body) {
  if (!GRAPH_API_VERSION || !PHONE_NUMBER_ID || !WHATSAPP_TOKEN) {
    throw new Error("WhatsApp Cloud API is not configured. Check GRAPH_API_VERSION, PHONE_NUMBER_ID and WHATSAPP_TOKEN.");
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body }
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result?.error?.message || `WhatsApp API returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return result;
}

module.exports = { sendText };
