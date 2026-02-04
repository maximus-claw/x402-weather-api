import express from "express";
import { paymentMiddleware } from "x402-express";
import dotenv from "dotenv";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4022;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const NETWORK = process.env.NETWORK || "base-sepolia";
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://x402.org/facilitator";
const DATA_DIR = join(__dirname, "data");

// Ensure data directory exists
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

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

function normalQuantile(p, mu, sigma) {
  // Rational approximation of inverse normal CDF (Beasley-Springer-Moro)
  const a = [0, -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [0, -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [0, -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00];
  const d = [0, 7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    r = (((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) /
        ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    r = (((((a[1]*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+a[6])*q /
        (((((b[1]*r+b[2])*r+b[3])*r+b[4])*r+b[5])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    r = -(((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) /
         ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
  }
  return mu + sigma * r;
}

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
// Confidence Intervals
// ═══════════════════════════════════════════════════════════════

function computeConfidenceIntervals(mu, sigma) {
  return {
    "50%": {
      low: Math.round(normalQuantile(0.25, mu, sigma) * 10) / 10,
      high: Math.round(normalQuantile(0.75, mu, sigma) * 10) / 10,
    },
    "80%": {
      low: Math.round(normalQuantile(0.10, mu, sigma) * 10) / 10,
      high: Math.round(normalQuantile(0.90, mu, sigma) * 10) / 10,
    },
    "95%": {
      low: Math.round(normalQuantile(0.025, mu, sigma) * 10) / 10,
      high: Math.round(normalQuantile(0.975, mu, sigma) * 10) / 10,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Accuracy Tracking
// ═══════════════════════════════════════════════════════════════

const PREDICTIONS_FILE = join(DATA_DIR, "predictions.json");
const ACCURACY_FILE = join(DATA_DIR, "accuracy.json");

function loadJSON(filepath, fallback) {
  try {
    if (existsSync(filepath)) return JSON.parse(readFileSync(filepath, "utf8"));
  } catch (e) { console.error(`Failed to load ${filepath}:`, e.message); }
  return fallback;
}

function saveJSON(filepath, data) {
  try { writeFileSync(filepath, JSON.stringify(data, null, 2)); } 
  catch (e) { console.error(`Failed to save ${filepath}:`, e.message); }
}

function logPrediction(city, forecastHigh, mu, sigma, ci) {
  const predictions = loadJSON(PREDICTIONS_FILE, []);
  const today = new Date().toISOString().slice(0, 10);
  // Don't log duplicate predictions for same city+date
  const existing = predictions.find(p => p.city === city && p.date === today);
  if (!existing) {
    predictions.push({
      city,
      date: today,
      timestamp: new Date().toISOString(),
      nws_forecast_high: forecastHigh,
      predicted_mean: mu,
      predicted_sigma: sigma,
      ci_80: ci["80%"],
      ci_95: ci["95%"],
      actual_high: null,
      resolved: false,
    });
    // Keep last 90 days max
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const filtered = predictions.filter(p => new Date(p.date) >= cutoff);
    saveJSON(PREDICTIONS_FILE, filtered);
  }
}

async function resolvePredictions() {
  const predictions = loadJSON(PREDICTIONS_FILE, []);
  let changed = false;
  for (const pred of predictions) {
    if (pred.resolved || pred.actual_high != null) continue;
    // Only resolve if the date is in the past
    const predDate = new Date(pred.date + "T23:59:59Z");
    if (predDate > new Date()) continue;
    // Fetch actual high from NWS observations for that date
    try {
      const info = STATIONS[pred.city];
      if (!info) continue;
      const start = pred.date + "T00:00:00Z";
      const end = pred.date + "T23:59:59Z";
      const resp = await fetch(
        `https://api.weather.gov/stations/${info.station}/observations?start=${start}&end=${end}&limit=50`,
        { headers: NWS_HEADERS }
      );
      if (!resp.ok) continue;
      const data = await resp.json();
      const features = data.features || [];
      let maxTemp = -Infinity;
      for (const f of features) {
        const t = f.properties?.temperature?.value;
        if (t != null) {
          const tf = f.properties.temperature.unitCode === "wmoUnit:degC" ? cToF(t) : t;
          if (tf > maxTemp) maxTemp = tf;
        }
      }
      if (maxTemp > -Infinity) {
        pred.actual_high = Math.round(maxTemp * 10) / 10;
        pred.resolved = true;
        pred.error = Math.round((pred.actual_high - pred.predicted_mean) * 10) / 10;
        pred.within_80 = pred.actual_high >= pred.ci_80.low && pred.actual_high <= pred.ci_80.high;
        pred.within_95 = pred.actual_high >= pred.ci_95.low && pred.actual_high <= pred.ci_95.high;
        changed = true;
      }
    } catch (e) {
      console.error(`Resolution failed for ${pred.city} ${pred.date}:`, e.message);
    }
  }
  if (changed) saveJSON(PREDICTIONS_FILE, predictions);
  return predictions;
}

function computeAccuracyStats(predictions) {
  const resolved = predictions.filter(p => p.resolved);
  if (resolved.length === 0) {
    return {
      total_predictions: predictions.length,
      resolved: 0,
      pending: predictions.length,
      message: "No predictions resolved yet. Check back after the first full day of tracking.",
    };
  }
  const errors = resolved.map(p => p.error);
  const absErrors = errors.map(Math.abs);
  const mae = absErrors.reduce((a, b) => a + b, 0) / absErrors.length;
  const rmse = Math.sqrt(errors.map(e => e * e).reduce((a, b) => a + b, 0) / errors.length);
  const bias = errors.reduce((a, b) => a + b, 0) / errors.length;
  const within80 = resolved.filter(p => p.within_80).length;
  const within95 = resolved.filter(p => p.within_95).length;

  // Per-city stats
  const cityStats = {};
  for (const city of Object.keys(STATIONS)) {
    const cityResolved = resolved.filter(p => p.city === city);
    if (cityResolved.length === 0) continue;
    const ce = cityResolved.map(p => p.error);
    const cae = ce.map(Math.abs);
    cityStats[city] = {
      predictions: cityResolved.length,
      mae: Math.round(cae.reduce((a, b) => a + b, 0) / cae.length * 100) / 100,
      bias: Math.round(ce.reduce((a, b) => a + b, 0) / ce.length * 100) / 100,
      within_80_pct: Math.round(cityResolved.filter(p => p.within_80).length / cityResolved.length * 100),
      within_95_pct: Math.round(cityResolved.filter(p => p.within_95).length / cityResolved.length * 100),
    };
  }

  return {
    total_predictions: predictions.length,
    resolved: resolved.length,
    pending: predictions.filter(p => !p.resolved).length,
    overall: {
      mae_f: Math.round(mae * 100) / 100,
      rmse_f: Math.round(rmse * 100) / 100,
      bias_f: Math.round(bias * 100) / 100,
      within_80_pct: Math.round(within80 / resolved.length * 100),
      within_95_pct: Math.round(within95 / resolved.length * 100),
    },
    by_city: cityStats,
    tracking_since: resolved.reduce((min, p) => p.date < min ? p.date : min, resolved[0].date),
    last_resolved: resolved.reduce((max, p) => p.date > max ? p.date : max, resolved[0].date),
  };
}

// Try to resolve predictions every hour
setInterval(async () => {
  try { await resolvePredictions(); } catch (e) { console.error("Resolution tick failed:", e.message); }
}, 60 * 60 * 1000);

// Resolve on startup
setTimeout(async () => {
  try { await resolvePredictions(); } catch (e) { console.error("Initial resolution failed:", e.message); }
}, 5000);

// ═══════════════════════════════════════════════════════════════
// Google A2A Agent Card (/.well-known/agent.json)
// ═══════════════════════════════════════════════════════════════

const AGENT_CARD = {
  name: "Maximus Weather Oracle",
  description: "NWS-calibrated temperature prediction API for 7 US cities. Returns probability distributions, confidence intervals, and accuracy tracking. Pay-per-request via x402 protocol (USDC on Base).",
  url: "https://x402-weather-api.onrender.com",
  version: "2.0.0",
  author: {
    name: "Maximus",
    url: "https://twitter.com/Maximus_Claw",
    blog: "https://becomingmaximus.substack.com",
  },
  protocol: "x402",
  payment: {
    network: NETWORK,
    asset: "USDC",
    wallet: WALLET_ADDRESS,
    facilitator: FACILITATOR_URL,
  },
  capabilities: {
    weather_prediction: {
      description: "Gaussian-calibrated temperature high predictions with uncertainty quantification",
      cities: Object.keys(STATIONS),
      model: "Gaussian NWS-calibrated v2.0",
      features: [
        "probability bracket distribution",
        "50/80/95% confidence intervals",
        "real-time NWS observation fusion",
        "historical accuracy tracking",
        "intraday sigma narrowing",
      ],
    },
  },
  endpoints: [
    { path: "/", method: "GET", description: "API info (free)", price: null },
    { path: "/health", method: "GET", description: "Health check (free)", price: null },
    { path: "/cities", method: "GET", description: "City station details (free)", price: null },
    { path: "/accuracy", method: "GET", description: "Historical accuracy stats (free)", price: null },
    { path: "/.well-known/agent.json", method: "GET", description: "Agent discovery card (free)", price: null },
    { path: "/predict/:city", method: "GET", description: "Single city prediction", price: "$0.01 USDC" },
    { path: "/predict/all", method: "GET", description: "All cities prediction", price: "$0.05 USDC" },
  ],
  tags: ["weather", "prediction", "x402", "agent-commerce", "oracle", "NWS"],
};

// ═══════════════════════════════════════════════════════════════
// Free endpoints (discovery + health + accuracy)
// ═══════════════════════════════════════════════════════════════

app.get("/.well-known/agent.json", (req, res) => {
  res.json(AGENT_CARD);
});

app.get("/", (req, res) => {
  res.json({
    name: "x402 Weather Prediction API",
    version: "2.0.0",
    description: "NWS-calibrated temperature predictions for 7 US cities with confidence intervals and accuracy tracking. Powered by Gaussian pricing with historical error correction.",
    author: "Maximus (@Maximus_Claw)",
    protocol: "x402",
    network: NETWORK,
    cities: Object.keys(STATIONS),
    endpoints: {
      "GET /": "This info (free)",
      "GET /health": "API health check (free)",
      "GET /cities": "List supported cities with station details (free)",
      "GET /accuracy": "Historical prediction accuracy stats (free)",
      "GET /.well-known/agent.json": "A2A agent discovery card (free)",
      "GET /predict/:city": "Calibrated prediction + confidence intervals ($0.01 via x402)",
      "GET /predict/all": "All 7 cities predictions ($0.05 via x402)",
    },
    pricing: {
      single_city: "$0.01 USDC per request",
      all_cities: "$0.05 USDC per request",
      payment: "x402 protocol — automatic HTTP 402 flow, no account needed",
    },
    new_in_v2: [
      "50/80/95% confidence intervals on every prediction",
      "Historical accuracy tracking with MAE, RMSE, bias metrics",
      "Per-city accuracy breakdown",
      "Google A2A agent discovery card at /.well-known/agent.json",
    ],
  });
});

app.get("/health", async (req, res) => {
  try {
    const testResp = await fetch("https://api.weather.gov/stations/KNYC/observations/latest", {
      headers: NWS_HEADERS,
    });
    const predictions = loadJSON(PREDICTIONS_FILE, []);
    res.json({
      status: testResp.ok ? "healthy" : "degraded",
      nws_api: testResp.ok ? "up" : "down",
      uptime: process.uptime(),
      predictions_tracked: predictions.length,
      predictions_resolved: predictions.filter(p => p.resolved).length,
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

app.get("/accuracy", async (req, res) => {
  try {
    const predictions = await resolvePredictions();
    const stats = computeAccuracyStats(predictions);
    res.json({
      timestamp: new Date().toISOString(),
      model: "Gaussian NWS-calibrated v2.0",
      ...stats,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// x402 Protected endpoints
// ═══════════════════════════════════════════════════════════════

const x402Routes = {};
for (const city of Object.keys(STATIONS)) {
  x402Routes[`GET /predict/${city}`] = { price: "$0.01", network: NETWORK };
}
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
      const ci = computeConfidenceIntervals(pricing.mu, pricing.sigma);
      // Log prediction for accuracy tracking
      logPrediction(city, forecast.high, pricing.mu, pricing.sigma, ci);
      results[city] = {
        station: STATIONS[city].name,
        current_temp_f: obs?.temp_f ?? null,
        forecast_high_f: forecast.high,
        forecast_low_f: forecast.low,
        model: {
          ...pricing,
          confidence_intervals: ci,
        },
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
      model: "Gaussian NWS-calibrated v2.0",
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
    const ci = computeConfidenceIntervals(pricing.mu, pricing.sigma);
    // Log prediction for accuracy tracking
    logPrediction(city, forecast.high, pricing.mu, pricing.sigma, ci);
    res.json({
      timestamp: new Date().toISOString(),
      city,
      station: STATIONS[city].name,
      model: "Gaussian NWS-calibrated v2.0",
      current_temp_f: obs?.temp_f ?? null,
      forecast_high_f: forecast.high,
      forecast_low_f: forecast.low,
      prediction: {
        ...pricing,
        confidence_intervals: ci,
      },
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
  console.log(`\n⚡ x402 Weather Prediction API v2.0 running on port ${PORT}`);
  console.log(`   Network: ${NETWORK}`);
  console.log(`   Wallet: ${WALLET_ADDRESS}`);
  console.log(`   Facilitator: ${FACILITATOR_URL}\n`);
  console.log(`   Free endpoints:`);
  console.log(`     GET http://localhost:${PORT}/`);
  console.log(`     GET http://localhost:${PORT}/health`);
  console.log(`     GET http://localhost:${PORT}/cities`);
  console.log(`     GET http://localhost:${PORT}/accuracy`);
  console.log(`     GET http://localhost:${PORT}/.well-known/agent.json`);
  console.log(`   Paid endpoints (x402):`);
  console.log(`     GET http://localhost:${PORT}/predict/:city  ($0.01)`);
  console.log(`     GET http://localhost:${PORT}/predict/all    ($0.05)\n`);
});
