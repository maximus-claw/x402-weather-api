import express from "express";
import { paymentMiddleware } from "x402-express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4022;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const NETWORK = process.env.NETWORK || "base-sepolia";
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://x402.org/facilitator";

// ═══════════════════════════════════════════════════════════════
// NWS Weather Oracle — ported from Python
// ═══════════════════════════════════════════════════════════════

const STATIONS = {
  NYC: { station: "KNYC", name: "New York City (Central Park)", lat: 40.7831, lon: -73.9712 },
  Chicago: { station: "KMDW", name: "Chicago (Midway Airport)", lat: 41.7868, lon: -87.7522 },
  Miami: { station: "KMIA", name: "Miami (MIA Airport)", lat: 25.7959, lon: -80.287 },
  Austin: { station: "KAUS", name: "Austin (Bergstrom Airport)", lat: 30.1945, lon: -97.6699 },
  Denver: { station: "KDEN", name: "Denver (DEN Airport)", lat: 39.8561, lon: -104.6737 },
  Houston: { station: "KHOU", name: "Houston (Hobby Airport)", lat: 29.6454, lon: -95.2789 },
  Philadelphia: { station: "KPHL", name: "Philadelphia (PHL Airport)", lat: 39.8721, lon: -75.2411 },
};

const NWS_HEADERS = {
  "User-Agent": "(protogen-weather-api, max@northlakelabs.com)",
  Accept: "application/geo+json",
};

// Historical forecast error std dev (°F) by city and month [Jan..Dec]
const HISTORICAL_SIGMA = {
  NYC: [3.0, 3.0, 3.2, 3.0, 2.8, 2.5, 2.2, 2.2, 2.5, 2.8, 3.0, 3.0],
  Chicago: [3.5, 3.5, 3.8, 3.5, 3.0, 2.8, 2.5, 2.5, 2.8, 3.2, 3.5, 3.5],
  Miami: [2.0, 2.0, 2.0, 2.2, 2.5, 2.5, 2.2, 2.2, 2.5, 2.5, 2.2, 2.0],
  Austin: [3.0, 3.0, 3.2, 3.0, 2.8, 2.5, 2.0, 2.0, 2.5, 3.0, 3.0, 3.0],
  Denver: [4.0, 4.0, 4.5, 4.0, 3.5, 3.0, 2.5, 2.5, 3.0, 3.5, 4.0, 4.0],
  Houston: [2.8, 2.8, 3.0, 2.8, 2.5, 2.2, 2.0, 2.0, 2.5, 2.8, 2.8, 2.8],
  Philadelphia: [3.0, 3.0, 3.2, 3.0, 2.8, 2.5, 2.2, 2.2, 2.5, 2.8, 3.0, 3.0],
};

function cToF(c) { return c * 9.0 / 5.0 + 32.0; }

function normalCdf(x, mu, sigma) {
  if (sigma <= 0) return x >= mu ? 1.0 : 0.0;
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.sqrt(2))));
}

// Error function approximation (Abramowitz and Stegun)
function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

async function fetchObservation(city) {
  const info = STATIONS[city];
  if (!info) return null;
  try {
    const resp = await fetch(`https://api.weather.gov/stations/${info.station}/observations/latest`, {
      headers: NWS_HEADERS,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const props = data.properties || {};
    const tempData = props.temperature || {};
    let tempC = tempData.value;
    let tempF = null;
    if (tempC != null) {
      tempF = tempData.unitCode === "wmoUnit:degC" ? cToF(tempC) : tempC;
    }
    return {
      station: info.station,
      city,
      timestamp: props.timestamp,
      temp_f: tempF,
      temp_c: tempC,
      humidity: props.relativeHumidity?.value ?? null,
      wind_speed_kmh: props.windSpeed?.value ?? null,
      description: props.textDescription || "",
    };
  } catch (e) {
    console.error(`Failed to fetch ${city}:`, e.message);
    return null;
  }
}

async function fetchForecast(city) {
  const info = STATIONS[city];
  if (!info) return { high: null, low: null };
  try {
    const pointsResp = await fetch(`https://api.weather.gov/points/${info.lat},${info.lon}`, {
      headers: NWS_HEADERS,
    });
    if (!pointsResp.ok) return { high: null, low: null };
    const pointsData = await pointsResp.json();
    const forecastUrl = pointsData.properties.forecast;
    const forecastResp = await fetch(forecastUrl, { headers: NWS_HEADERS });
    if (!forecastResp.ok) return { high: null, low: null };
    const forecastData = await forecastResp.json();
    const periods = forecastData.properties.periods;
    let high = null, low = null;
    for (const p of periods.slice(0, 4)) {
      if (p.isDaytime && high === null) high = p.temperature;
      if (!p.isDaytime && low === null) low = p.temperature;
    }
    return { high, low };
  } catch (e) {
    console.error(`Failed to fetch forecast for ${city}:`, e.message);
    return { high: null, low: null };
  }
}

function getSigma(city, month) {
  return (HISTORICAL_SIGMA[city] || [])[month - 1] || 3.0;
}

function adjustedSigma(baseSigma, hoursRemaining, currentHigh, forecastHigh) {
  const totalHours = 12.0;
  const fractionRemaining = Math.max(0.05, Math.min(1.0, hoursRemaining / totalHours));
  let adjusted = baseSigma * Math.sqrt(fractionRemaining);
  if (currentHigh != null) {
    const overshoot = currentHigh - forecastHigh;
    if (overshoot > 0) {
      adjusted *= Math.max(0.3, 1.0 - overshoot / (baseSigma * 2));
    }
  }
  return Math.max(0.5, adjusted);
}

function adjustedMean(forecastHigh, currentHigh, hoursRemaining) {
  if (currentHigh == null) return forecastHigh;
  const fractionElapsed = 1.0 - Math.max(0, Math.min(1.0, hoursRemaining / 12.0));
  if (currentHigh >= forecastHigh) {
    const buffer = Math.max(0, forecastHigh - currentHigh) * (1 - fractionElapsed);
    return currentHigh + buffer * 0.5 + 0.5;
  }
  if (fractionElapsed > 0.7) {
    const weight = Math.min(0.8, fractionElapsed);
    return currentHigh * weight + forecastHigh * (1 - weight);
  }
  return forecastHigh - (forecastHigh - currentHigh) * fractionElapsed * 0.3;
}

function generateBrackets(forecastHigh) {
  let center = Math.round(forecastHigh);
  if (center % 2 !== 0) center += 1;
  const bottom = center - 4;
  const top = center + 4;
  const brackets = [[-Infinity, bottom]];
  for (let i = 0; i < 4; i++) {
    brackets.push([bottom + i * 2, bottom + (i + 1) * 2]);
  }
  brackets.push([top, Infinity]);
  return brackets;
}

function priceBrackets(city, forecastHigh, currentHigh, hoursRemaining) {
  const month = new Date().getMonth() + 1;
  const baseSigma = getSigma(city, month);
  if (hoursRemaining == null) {
    const nowUTC = new Date();
    const hourUTC = nowUTC.getUTCHours() + nowUTC.getUTCMinutes() / 60;
    hoursRemaining = hourUTC >= 12 ? Math.max(0, 24.0 - hourUTC) : Math.max(0, 12.0 - hourUTC);
    hoursRemaining = Math.min(12.0, hoursRemaining);
  }
  const sigma = adjustedSigma(baseSigma, hoursRemaining, currentHigh, forecastHigh);
  const mu = adjustedMean(forecastHigh, currentHigh, hoursRemaining);
  const rawBrackets = generateBrackets(forecastHigh);
  const results = [];
  for (const [lo, hi] of rawBrackets) {
    let prob;
    if (lo === -Infinity) prob = normalCdf(hi, mu, sigma);
    else if (hi === Infinity) prob = 1.0 - normalCdf(lo, mu, sigma);
    else prob = normalCdf(hi, mu, sigma) - normalCdf(lo, mu, sigma);
    prob = Math.max(0.001, Math.min(0.999, prob));
    if (currentHigh != null && hi !== Infinity && hi <= currentHigh) prob = 0.001;
    const label = lo === -Infinity ? `Below ${hi}°F` : hi === Infinity ? `${lo}°F or above` : `${lo}–${hi}°F`;
    results.push({ label, low: lo === -Infinity ? null : lo, high: hi === Infinity ? null : hi, probability: prob });
  }
  const total = results.reduce((s, b) => s + b.probability, 0);
  results.forEach(b => b.probability = Math.round((b.probability / total) * 10000) / 10000);
  return { mu: Math.round(mu * 100) / 100, sigma: Math.round(sigma * 100) / 100, brackets: results };
}

// ═══════════════════════════════════════════════════════════════
// Free endpoints (discovery + health)
// ═══════════════════════════════════════════════════════════════

app.get("/", (req, res) => {
  res.json({
    name: "x402 Weather Prediction API",
    version: "1.0.0",
    description: "NWS-calibrated temperature predictions for 7 US cities. Powered by Gaussian pricing with historical error correction.",
    author: "Maximus (@Maximus_Claw)",
    protocol: "x402",
    network: NETWORK,
    cities: Object.keys(STATIONS),
    endpoints: {
      "GET /": "This info (free)",
      "GET /health": "API health check (free)",
      "GET /cities": "List supported cities with station details (free)",
      "GET /predict/:city": "Calibrated temperature prediction + bracket probabilities ($0.01 per request via x402)",
      "GET /predict/all": "All 7 cities predictions ($0.05 per request via x402)",
    },
    pricing: {
      single_city: "$0.01 USDC per request",
      all_cities: "$0.05 USDC per request",
      payment: "x402 protocol — automatic HTTP 402 flow, no account needed",
    },
  });
});

app.get("/health", async (req, res) => {
  try {
    const testResp = await fetch("https://api.weather.gov/stations/KNYC/observations/latest", {
      headers: NWS_HEADERS,
    });
    res.json({
      status: testResp.ok ? "healthy" : "degraded",
      nws_api: testResp.ok ? "up" : "down",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.json({ status: "degraded", nws_api: "down", error: e.message });
  }
});

app.get("/cities", (req, res) => {
  const cities = {};
  for (const [key, info] of Object.entries(STATIONS)) {
    cities[key] = { name: info.name, station: info.station, lat: info.lat, lon: info.lon };
  }
  res.json({ cities });
});

// ═══════════════════════════════════════════════════════════════
// x402 Protected endpoints
// ═══════════════════════════════════════════════════════════════

// Apply x402 paywall to prediction endpoints
// x402 route matching uses regex, not Express params.
// /predict/* matches /predict/NYC, /predict/all, etc.
// We handle /predict/all first as a separate route with higher price.
const x402Routes = {};
// Individual city predictions
for (const city of Object.keys(STATIONS)) {
  x402Routes[`GET /predict/${city}`] = { price: "$0.01", network: NETWORK };
}
// All-cities endpoint
x402Routes["GET /predict/all"] = { price: "$0.05", network: NETWORK };

app.use(
  paymentMiddleware(
    WALLET_ADDRESS,
    x402Routes,
    { url: FACILITATOR_URL }
  )
);

app.get("/predict/all", async (req, res) => {
  try {
    const results = {};
    const cities = Object.keys(STATIONS);
    const promises = cities.map(async (city) => {
      const [obs, forecast] = await Promise.all([fetchObservation(city), fetchForecast(city)]);
      if (!forecast.high) return;
      const pricing = priceBrackets(city, forecast.high, obs?.temp_f ?? null, null);
      results[city] = {
        station: STATIONS[city].name,
        current_temp_f: obs?.temp_f ?? null,
        forecast_high_f: forecast.high,
        forecast_low_f: forecast.low,
        model: pricing,
        observation: obs ? {
          humidity: obs.humidity,
          wind_speed_kmh: obs.wind_speed_kmh,
          description: obs.description,
          timestamp: obs.timestamp,
        } : null,
      };
    });
    await Promise.all(promises);
    res.json({
      timestamp: new Date().toISOString(),
      model: "Gaussian NWS-calibrated v1.0",
      cities: results,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/predict/:city", async (req, res) => {
  const city = req.params.city;
  if (!STATIONS[city]) {
    return res.status(404).json({
      error: `Unknown city: ${city}`,
      available: Object.keys(STATIONS),
    });
  }
  try {
    const [obs, forecast] = await Promise.all([fetchObservation(city), fetchForecast(city)]);
    if (!forecast.high) {
      return res.status(503).json({ error: `NWS forecast unavailable for ${city}` });
    }
    const pricing = priceBrackets(city, forecast.high, obs?.temp_f ?? null, null);
    res.json({
      timestamp: new Date().toISOString(),
      city,
      station: STATIONS[city].name,
      model: "Gaussian NWS-calibrated v1.0",
      current_temp_f: obs?.temp_f ?? null,
      forecast_high_f: forecast.high,
      forecast_low_f: forecast.low,
      prediction: pricing,
      observation: obs ? {
        humidity: obs.humidity,
        wind_speed_kmh: obs.wind_speed_kmh,
        description: obs.description,
        timestamp: obs.timestamp,
      } : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// Start
// ═══════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`\n⚡ x402 Weather Prediction API running on port ${PORT}`);
  console.log(`   Network: ${NETWORK}`);
  console.log(`   Wallet: ${WALLET_ADDRESS}`);
  console.log(`   Facilitator: ${FACILITATOR_URL}\n`);
  console.log(`   Free endpoints:`);
  console.log(`     GET http://localhost:${PORT}/`);
  console.log(`     GET http://localhost:${PORT}/health`);
  console.log(`     GET http://localhost:${PORT}/cities`);
  console.log(`   Paid endpoints (x402):`);
  console.log(`     GET http://localhost:${PORT}/predict/:city  ($0.01)`);
  console.log(`     GET http://localhost:${PORT}/predict/all    ($0.05)\n`);
});
