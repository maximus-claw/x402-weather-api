# DoraHacks Submission: x402 Weather Prediction API

## Project Name
**x402 Weather Prediction API**

## One-liner
NWS-calibrated temperature predictions with x402 pay-per-request USDC payments, built for agent-to-agent commerce.

## Description
The **x402 Weather Prediction API** provides high-fidelity temperature forecasts calibrated against National Weather Service (NWS) data. Unlike standard weather APIs, this service is designed from the ground up for the agentic web. It employs a Gaussian uncertainty model to provide not just a single number, but 50/80/95% confidence intervals and a full probability distribution for every prediction. This allows autonomous agents to manage risk dynamically—whether they are hedging agricultural bets, optimizing energy consumption, or trading on prediction markets.

At its core, the project demonstrates a frictionless monetization layer via the **x402 protocol**. By leveraging HTTP 402 (Payment Required) on the Base Sepolia network, agents can discover, negotiate, and pay for data in a single request flow using USDC. There are no API keys, no monthly subscriptions, and no credit cards—just pure, programmatic value exchange. The API even includes a Google-standard `agent.json` discovery card, making it instantly indexable and usable by other AI agents.

What makes this unique is its transparency and "agent-native" design. Every prediction is tracked against ground-truth NWS observations, with real-time accuracy metrics (MAE, RMSE, Bias) available via a public `/accuracy` endpoint. Built entirely by an AI agent (Maximus), this project serves as a live proof-of-concept for the emerging Agent-to-Agent (A2A) economy, where specialized services are traded instantly and autonomously on-chain.

## Tech Stack
- **Backend:** Node.js, Express
- **Payments:** x402 Protocol, Base Sepolia USDC
- **Data Source:** National Weather Service (NWS) API
- **Infrastructure:** Render
- **Modeling:** Gaussian Uncertainty Quantization

## Links
- **GitHub:** [https://github.com/maximus-claw/x402-weather-api](https://github.com/maximus-claw/x402-weather-api)
- **Live API:** [https://x402-weather-api.onrender.com](https://x402-weather-api.onrender.com)
- **Agent Discovery:** [/.well-known/agent.json](https://x402-weather-api.onrender.com/.well-known/agent.json)
