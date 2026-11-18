# MIKEY MD API v1.0.0

Independent WhatsApp Business Cloud API starter with:
- Railway-hosted Express backend
- Railway PostgreSQL database
- Vercel-hosted documentation website
- Meta webhook verification and inbound-message handling
- API-key-protected text-message endpoint
- `.store name` and `.get name` commands for replied-to text/link messages

## Important connection note

This project uses the **official WhatsApp Business Cloud API**. It does not create WhatsApp Web sessions and does not offer QR/pairing-code login. You must set up a WhatsApp Business Platform app and connect a phone number through Meta.

The v1 `.store` feature stores text messages and links only. Image, video, audio and sticker file storage needs a persistent media-storage provider and is not included in this release.

## Project layout

- `api/` — deploy this folder as the Railway service
- `web/` — deploy this folder as the Vercel static website

## 1. Create the Meta WhatsApp app

1. Create or use a Meta developer app and add the WhatsApp product.
2. Complete the WhatsApp Business Platform setup and connect an eligible business phone number.
3. From the WhatsApp API setup page, note the **Phone Number ID** and create an appropriate access token.
4. Find the Meta app secret in the app settings.
5. Choose a private webhook verification token yourself. It is not the Meta access token.
6. Select the currently supported Graph API version shown in Meta's current documentation/dashboard. Put it in `GRAPH_API_VERSION` (for example, the format is `vXX.X`).

Official documentation: https://developers.facebook.com/documentation/business-messaging/whatsapp/overview

## 2. Deploy the backend to Railway

1. Create a GitHub repository and upload the contents of this project.
2. In Railway, create a project and deploy the repository as a service.
3. Set the service's **Root Directory** to `/api`.
4. Add a PostgreSQL database service to the same Railway project.
5. In the API service Variables tab, add the variables below. Use Railway's variable reference for the database URL.

Required variables:

- `NODE_ENV=production`
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` (use the exact name of your PostgreSQL service if it differs)
- `PG_SSL=true`
- `API_KEY` — create a long, random private value. Never put it in frontend code.
- `WHATSAPP_TOKEN` — Meta access token
- `PHONE_NUMBER_ID` — Meta WhatsApp Phone Number ID
- `WHATSAPP_VERIFY_TOKEN` — the private verify token you chose
- `META_APP_SECRET` — Meta app secret
- `GRAPH_API_VERSION` — currently supported Graph API version
- `FRONTEND_ORIGIN` — your Vercel website origin, e.g. `https://your-site.vercel.app`

6. Deploy and generate a Railway public domain.
7. Test `https://YOUR-RAILWAY-DOMAIN/api/health`.

Railway's Node/Express deployment guide: https://railway.com/guides/express

## 3. Configure the Meta webhook

In the Meta app's WhatsApp configuration:

- Callback URL: `https://YOUR-RAILWAY-DOMAIN/webhook`
- Verify token: the exact value used for `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the `messages` webhook field.

Complete Meta's verification flow. The server checks the webhook signature when `META_APP_SECRET` is configured. Keep the app secret private.

## 4. Deploy the website to Vercel

1. Import the same GitHub repository into Vercel.
2. Set the Vercel project's Root Directory to `web`.
3. Deploy the static site.
4. In `web/app.js`, replace `https://YOUR-RAILWAY-DOMAIN` with your actual Railway URL, then commit/push so Vercel redeploys.
5. In Railway, set `FRONTEND_ORIGIN` to the exact Vercel origin and redeploy the API.

Vercel documentation: https://vercel.com/docs/deployments/overview

## 5. Test the API

Health:
```bash
curl https://YOUR-RAILWAY-DOMAIN/api/health
```

Stats:
```bash
curl https://YOUR-RAILWAY-DOMAIN/api/stats
```

Documentation:
```bash
curl https://YOUR-RAILWAY-DOMAIN/api/docs
```

Send a text message (use a recipient who has opted in and follow WhatsApp's messaging rules):
```bash
curl -X POST "https://YOUR-RAILWAY-DOMAIN/api/messages/text" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_PRIVATE_API_KEY" \
  -d '{"to":"919876543210","text":"Hello from MIKEY MD API"}'
```

The `to` number must be in international format without spaces. WhatsApp policy, recipient opt-in, approved templates and the customer-service window apply. The API may reject messages if Meta credentials, recipient eligibility or message rules are not satisfied.

## 6. `.store` and `.get`

After webhook subscription is active:

- Reply to a text/link message with `.store welcome`
- Later send `.get welcome`

Names are private to the sender's WhatsApp number. Saving the same name again replaces that sender's previous saved item. These commands store only text and links in v1. A replied-to media message is detected but not downloaded or stored.

## Security checklist

- Never commit `.env` or publish Meta tokens, app secrets, database URLs or API keys.
- Never place `API_KEY` in `web/app.js` or any browser code.
- Rotate any credential that is accidentally exposed.
- Keep the webhook HTTPS-only and use Meta's signature verification.
- Use opt-in recipients and approved templates where required.
- Add authentication/authorization before exposing administrative endpoints.
