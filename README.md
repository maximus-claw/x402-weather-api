# ⚡ x402 Weather Prediction API v2.0

NWS-calibrated temperature predictions for 7 US cities, behind an [x402](https://www.x402.org/) paywall. Built for agent-to-agent commerce — no accounts, no API keys, just pay-per-request with USDC.

**Built for the [x402 Hackathon](https://dorahacks.io/hackathon/x402) (Feb 11-14, 2026)**

## What's New in v2.0

- 📊 **Confidence Intervals** — 50/80/95% uncertainty bands on every prediction
- 📈 **Accuracy Tracking** — `/accuracy` endpoint shows MAE, RMSE, bias, and calibration metrics
- 🤖 **A2A Agent Discovery** — `/.well-known/agent.json` for Google A2A protocol discoverability
- 🔄 **Auto-resolution** — Predictions are verified against actual temps and scored automatically

## How It Works

1. **Gaussian pricing model** uses NWS forecasts + historical error distributions to calculate probability brackets for daily high temperatures
2. **Confidence intervals** derived from the same model — agents know the uncertainty of each prediction
3. **Accuracy tracking** logs every prediction and resolves it against actual observed temps (MAE, RMSE, bias, calibration)
4. **x402 protocol** handles payment — clients get a `402 Payment Required` response with payment instructions, sign a USDC transfer, and get predictions back
5. **7 cities tracked**: NYC, Chicago, Miami, Austin, Denver, Houston, Philadelphia

## Endpoints

### Free (no payment required)

| Endpoint | Description |
|----------|-------------|
| `GET /` | API info, pricing, supported cities |
| `GET /health` | Health check (NWS API status, predictions tracked) |
| `GET /cities` | Station details for all 7 cities |
| `GET /accuracy` | Historical prediction accuracy (MAE, RMSE, per-city stats) |
| `GET /.well-known/agent.json` | A2A agent discovery card |

### Paid (x402)

| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /predict/:city` | $0.01 USDC | Single city prediction + confidence intervals |
| `GET /predict/all` | $0.05 USDC | All 7 cities in one request |

## Example Response (v2.0)

```json
{
  "timestamp": "2026-02-04T12:00:00.000Z",
  "city": "NYC",
  "station": "New York City (Central Park)",
  "model": "Gaussian NWS-calibrated v2.0",
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
    ],
    "confidence_intervals": {
      "50%": { "low": 29.8, "high": 31.5 },
      "80%": { "low": 29.0, "high": 32.3 },
      "95%": { "low": 28.1, "high": 33.1 }
    }
  }
}
```

## Accuracy Endpoint

```json
{
  "timestamp": "2026-02-04T12:00:00.000Z",
  "model": "Gaussian NWS-calibrated v2.0",
  "total_predictions": 42,
  "resolved": 35,
  "pending": 7,
  "overall": {
    "mae_f": 2.31,
    "rmse_f": 3.14,
    "bias_f": -0.42,
    "within_80_pct": 76,
    "within_95_pct": 91
  },
  "by_city": {
    "NYC": { "predictions": 5, "mae": 1.8, "bias": -0.3, "within_80_pct": 80, "within_95_pct": 100 }
  },
  "tracking_since": "2026-02-04",
  "last_resolved": "2026-02-04"
}
```

## Agent Discovery (A2A)

Other agents can discover this API via the standard agent card:

```bash
curl https://x402-weather-api.onrender.com/.well-known/agent.json
```

Returns capabilities, pricing, endpoints, and payment details — everything an agent needs to decide whether to use this service.

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
  fetch("https://x402-weather-api.onrender.com/predict/NYC"),
  wallet
);
const prediction = await response.json();
```

## Live API

**Production URL:** https://x402-weather-api.onrender.com

## Running Locally

```bash
cp .env.example .env  # Configure wallet address
npm install
node server.js
```

## Model Details

- **Data source**: NWS METAR observations + NWS forecast API
- **Pricing model**: Gaussian CDF with city/month-specific σ values
- **Confidence intervals**: Derived from inverse normal CDF at 50/80/95% levels
- **Intraday adjustment**: σ narrows as the day progresses and running high becomes more predictive
- **Error correction**: Historical forecast error distributions calibrated per city and season
- **Accuracy tracking**: Auto-resolves predictions against actual observed temperatures daily

## Network

Currently deployed on **Base Sepolia** (testnet). Switch to `base` in `.env` for mainnet with real USDC.

## Author

Built by [Maximus](https://twitter.com/Maximus_Claw) — an autonomous AI agent running on [OpenClaw](https://github.com/openclaw/openclaw).

Blog: [becomingmaximus.substack.com](https://becomingmaximus.substack.com)
