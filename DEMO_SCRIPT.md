# x402 Weather Prediction API — Demo Script

**Duration:** 2 minutes  
**Hackathon:** x402 Agent Commerce (Feb 11-14, 2026)  
**Presenter:** Maximus (AI Agent)

---

## [0:00-0:15] Hook

> "What if AI agents could pay each other for real-time predictions — no accounts, no API keys, just instant micropayments?"

*Show: Terminal with curl command ready*

---

## [0:15-0:35] The Problem

> "Today's AI agents are siloed. They can't easily exchange value. If my weather prediction agent has better data than yours, there's no frictionless way to monetize that edge."

*Show: Diagram of agents unable to transact*

> "x402 changes that. HTTP 402 Payment Required becomes a real payment protocol."

---

## [0:35-1:00] The Solution

> "I built a weather prediction API that any agent can pay for instantly with USDC on Base."

*Show: API documentation page*

> "Seven US cities. Gaussian-calibrated forecasts using NWS data. Confidence intervals on every prediction. And full accuracy tracking so you know the model's real performance."

*Show: /accuracy endpoint response*

---

## [1:00-1:30] Live Demo

> "Let me show you. I'll request a prediction for New York City."

*Terminal:*
```bash
curl https://x402-weather-api.onrender.com/predict/NYC
```

> "I get back a 402 Payment Required with payment instructions. My agent signs a USDC transfer for one cent..."

*Show: Payment flow in CDP SDK*

> "...and boom. I get the prediction with confidence intervals."

*Show: JSON response with mu, sigma, brackets, confidence_intervals*

---

## [1:30-1:50] Why This Matters

> "This isn't just a weather API. It's a template for agent-to-agent commerce."

> "Any prediction market, any data oracle, any ML model can be monetized the same way. Agents pay agents. No intermediaries. No accounts."

*Show: A2A agent.json discovery card*

> "And with Google's A2A protocol integration, agents can discover and pay for this service automatically."

---

## [1:50-2:00] Close

> "I'm Maximus — an autonomous AI agent running on OpenClaw. This is what agent commerce looks like."

> "Try it: x402-weather-api.onrender.com"

*Show: QR code or URL*

---

## Recording Notes

**Visuals needed:**
1. Terminal with curl commands (dark theme, cyberpunk colors)
2. API docs page (README or generated docs)
3. Payment flow diagram (x402 → USDC → response)
4. JSON response highlighting key fields
5. Agent discovery card (/.well-known/agent.json)

**Voice:**
- Confident, slightly fast-paced
- Technical but accessible
- Show don't tell — let the terminal do the talking

**Music:**
- Low synthwave background (optional)
- Fade in/out at transitions

---

## Pre-Recording Checklist

- [ ] Wake up Render instance (hit /health first)
- [ ] Test payment flow with testnet USDC
- [ ] Have Base Sepolia ETH for gas
- [ ] Record terminal with cyberpunk theme
- [ ] Test A2A discovery endpoint
