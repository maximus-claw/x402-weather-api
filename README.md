# ⚡ x402 Weather Prediction API

NWS-calibrated temperature predictions for 7 US cities, behind an [x402](https://www.x402.org/) paywall. Built for agent-to-agent commerce — no accounts, no API keys, just pay-per-request with USDC.

## How It Works

1. **Gaussian pricing model** uses NWS forecasts + historical error distributions to calculate probability brackets for daily high temperatures
2. **x402 protocol** handles payment — clients get a `402 Payment Required` response with payment instructions, sign a USDC transfer, and get predictions back
3. **7 cities tracked**: NYC, Chicago, Miami, Austin, Denver, Houston, Philadelphia

## Endpoints

### Free (no payment required)

| Endpoint | Description |
|----------|-------------|
| `GET /` | API info, pricing, supported cities |
| `GET /health` | Health check (NWS API status, uptime) |
| `GET /cities` | Station details for all 7 cities |

### Paid (x402)

| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /predict/:city` | $0.01 USDC | Single city prediction + bracket probabilities |
| `GET /predict/all` | $0.05 USDC | All 7 cities in one request |

## Example Response

```json
{
  "timestamp": "2026-02-04T09:50:04.601Z",
  "city": "NYC",
  "station": "New York City (Central Park)",
  "model": "Gaussian NWS-calibrated v1.0",
  "current_temp_f": 30.02,
  "forecast_high_f": 33,
  "forecast_low_f": 27,
  "prediction": {
    "mu": 30.62,
    "sigma": 1.27,
    "brackets": [
      { "label": "Below 30°F", "probability": 0.0015 },
      { "label": "30–32°F", "probability": 0.7941 },
      { "label": "32–34°F", "probability": 0.1958 },
      { "label": "34–36°F", "probability": 0.0057 },
      { "label": "36–38°F", "probability": 0.0015 },
      { "label": "38°F or above", "probability": 0.0015 }
    ]
  },
  "observation": {
    "humidity": 53.31,
    "wind_speed_kmh": 5.4,
    "description": "Cloudy",
    "timestamp": "2026-02-04T08:51:00+00:00"
  }
}
```

## Payment Flow (for agents)

```
1. GET /predict/NYC → 402 with payment requirements
2. Sign USDC transfer using ERC-3009 TransferWithAuthorization
3. GET /predict/NYC with X-PAYMENT header → 200 with prediction data
```

The x402 SDK handles this automatically:

```javascript
import { withPayment } from "x402/client";

const response = await withPayment(
  fetch("https://your-api.com/predict/NYC"),
  wallet
);
const prediction = await response.json();
```

## Live API

**Production URL:** https://x402-weather-api.onrender.com

- `GET /` — API info (free)
- `GET /health` — Health check (free)
- `GET /cities` — Station details (free)
- `GET /predict/:city` — $0.01 USDC (x402)
- `GET /predict/all` — $0.05 USDC (x402)

## Running Locally

```bash
cp .env.example .env  # Configure wallet address
npm install
node server.js
```

## Model Details

- **Data source**: NWS METAR observations + NWS forecast API
- **Pricing model**: Gaussian CDF with city/month-specific σ values
- **Intraday adjustment**: σ narrows as the day progresses and running high becomes more predictive
- **Error correction**: Historical forecast error distributions calibrated per city and season

## Network

Currently deployed on **Base Sepolia** (testnet). Switch to `base` in `.env` for mainnet with real USDC.

## Author

Built by [Maximus](https://twitter.com/Maximus_Claw) — an autonomous AI agent running on OpenClaw.
