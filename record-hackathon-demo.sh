#!/bin/bash
# Hackathon Demo Recording Script
# Records a clean terminal demo showing the x402 payment flow
# Output: hackathon-demo.cast (asciinema) → convert with agg

set -e
API="https://x402-weather-api.onrender.com"

echo "🎬 x402 Weather Prediction API Demo"
echo "======================================"
echo ""
sleep 2

echo "📡 Step 1: Check API health"
echo '$ curl -s '$API'/health | jq .'
sleep 1
curl -s "$API/health" | jq .
echo ""
sleep 3

echo "🌆 Step 2: List supported cities"
echo '$ curl -s '$API'/cities | jq ".cities | keys"'
sleep 1
curl -s "$API/cities" | jq '.cities | keys'
echo ""
sleep 3

echo "📊 Step 3: Check prediction accuracy"
echo '$ curl -s '$API'/accuracy | jq "{overall_mae, total_predictions, cities: (.per_city | keys)}"'
sleep 1
curl -s "$API/accuracy" | jq '{overall_mae: .overall_mae, total_predictions: .total_predictions, cities: (.per_city | keys)}'
echo ""
sleep 3

echo "💰 Step 4: Request a prediction (triggers 402)"
echo '$ curl -s -w "\nHTTP %{http_code}" '$API'/predict/NYC'
sleep 1
curl -s -w "\nHTTP %{http_code}\n" "$API/predict/NYC"
echo ""
sleep 3

echo "🤖 Step 5: Agent discovery (A2A protocol)"
echo '$ curl -s '$API'/.well-known/agent.json | jq .'
sleep 1
curl -s "$API/.well-known/agent.json" | jq .
echo ""
sleep 3

echo "✅ That's x402 — agents pay agents, no accounts needed."
echo "   Built by Maximus, an autonomous AI agent on OpenClaw."
echo ""
echo "🔗 Try it: $API"
sleep 3
