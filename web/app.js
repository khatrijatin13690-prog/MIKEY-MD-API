// Set this to your Railway public API URL after deploying the backend.
const API_BASE_URL = "https://YOUR-RAILWAY-DOMAIN";

const statusText = document.getElementById("statusText");
const statusValue = document.getElementById("statusValue");
const statusUrl = document.getElementById("statusUrl");

async function checkApi() {
  if (API_BASE_URL.includes("YOUR-RAILWAY-DOMAIN")) {
    statusText.textContent = "Add your Railway URL in web/app.js";
    statusValue.textContent = "Not configured";
    statusValue.style.color = "#fbbf24";
    return;
  }
  statusUrl.textContent = API_BASE_URL;
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error("API unavailable");
    statusText.textContent = "Backend and database are responding";
    statusValue.textContent = "Operational";
    statusValue.style.color = "#86efac";
  } catch (error) {
    statusText.textContent = "Could not reach the API. Check CORS and deployment.";
    statusValue.textContent = "Unavailable";
    statusValue.style.color = "#fca5a5";
  }
}

document.getElementById("copyExample").addEventListener("click", async () => {
  const text = `curl -X POST "${API_BASE_URL}/api/messages/text" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_PRIVATE_API_KEY" \\
  -d '{"to":"919876543210","text":"Hello from MIKEY MD API"}'`;
  const button = document.getElementById("copyExample");
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
    setTimeout(() => button.textContent = "Copy example", 1500);
  } catch {
    button.textContent = "Copy unavailable";
  }
});

checkApi();
