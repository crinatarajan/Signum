# 📡 Signum

> **AI-powered trading signal engine** — rules-based + ML + Finora AI analysis, built on multi-exchange perpetual swap data (WEEX, Binance, Bybit, OKX) with a React Native mobile frontend.

---

## 🧠 What It Does

Signum fetches live OHLCV market data from supported exchanges via CCXT, runs it through a multi-layer signal engine, and delivers **LONG / SHORT / NEUTRAL signals** with confidence scores directly to your phone.

**Signal layers:**
1. **Rules engine** — RSI, MACD, Bollinger Bands, EMA trend, plus funding rate & open interest filters
2. **ML model** — XGBoost (and optional LSTM) classifier for pattern-based prediction
3. **Finora AI** — Claude-powered natural-language trade analysis with SMC/ICT framing, key levels, and a concrete trade setup (entry zone, TP1, TP2, SL)
4. **Backtester** — simulates the rules engine over historical candles and reports win rate, P&L curve, and individual trades

> ⚠️ **This is an analysis and signal-tracking tool, not a trading bot.**
> Signum does **not** place, modify, or close trades on any exchange. It
> surfaces signals based on technical indicators, ML models, and AI
> commentary — all of which can be wrong. Always validate with the
> Backtest tab, treat Finora AI output as a sanity check rather than a
> trigger, and never risk money you can't afford to lose. Nothing in this
> app is financial advice.

---

## 🏗️ Architecture

```
Exchange (WEEX / Binance / Bybit / OKX — Perpetual Swaps)
    │
    ▼
Python Backend (FastAPI)
  ├── services/data.py            ← OHLCV + ticker + funding rate + open interest (CCXT, multi-exchange)
  │                                  Binance as automatic fallback on network errors
  ├── services/indicators.py      ← RSI, MACD, ATR, Bollinger Bands, EMA, add_all_indicators()
  ├── services/rules.py           ← Rules-based signal engine with funding rate / OI filters
  ├── services/backtest_service.py← Backtest simulation (win rate, P&L curve, trades)
  ├── services/finora_ai.py       ← Finora AI: Claude-powered SMC/ICT trade analysis
  ├── ml/train.py                 ← XGBoost / LSTM model training
  ├── ml/ml_predict.py            ← Live ML predictions
  └── routes/signals.py           ← REST API endpoints (signals, backtest, portfolio)
    │
    ▼
React Native App (Expo)
  ├── DashboardScreen             ← Live signal feed
  ├── DetailScreen                ← Candlestick chart + entry / TP / SL levels
  ├── BacktestScreen              ← Run and view backtest results
  ├── PortfolioScreen             ← Track open positions and P&L
  ├── SettingsScreen              ← App configuration
  ├── SignalCard                  ← LONG/SHORT card with confidence %
  └── FinoraAnalysisCard          ← AI analysis card (trend, bias, key levels, setup)
```

---

## 🗂️ Project Structure

```
Signum/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/
│   │   │   └── signals.py
│   │   ├── services/
│   │   │   ├── data.py             ← multi-exchange (WEEX/Binance/Bybit/OKX) + fallback
│   │   │   ├── indicators.py       ← incl. add_all_indicators()
│   │   │   ├── rules.py            ← funding rate / OI signal filters
│   │   │   ├── backtest_service.py ← backtest engine
│   │   │   └── finora_ai.py        ← Finora AI (Anthropic Claude)
│   │   └── ml/
│   │       ├── train.py
│   │       └── ml_predict.py
│   ├── scripts/
│   │   └── backtest.py             ← CLI backtest runner
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── signals.js              ← API client (all endpoints)
│   │   ├── components/
│   │   │   ├── SignalCard.js
│   │   │   └── FinoraAnalysisCard.js   ← Finora AI UI card
│   │   ├── screens/
│   │   │   ├── DashboardScreen.js
│   │   │   ├── DetailScreen.js         ← Candlestick chart + full signal detail
│   │   │   ├── BacktestScreen.js
│   │   │   ├── PortfolioScreen.js
│   │   │   └── SettingsScreen.js
│   │   └── hooks/
│   │       └── useSignals.js
│   ├── App.js
│   └── package.json
├── env.example                 ← Root env (exchange + Anthropic keys)
└── README.md
```

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Python 3.10+, FastAPI, Uvicorn |
| Exchange Data | CCXT 4.5.x — WEEX, Binance, Bybit, OKX (Binance as automatic fallback) |
| Technical Indicators | RSI, MACD, ATR, Bollinger Bands, EMA (custom pandas implementations) |
| Signal Engine | Rules-based + funding rate/OI filters |
| Backtesting | Custom rules-engine simulation over historical OHLCV |
| ML Model | XGBoost, scikit-learn, joblib (optional LSTM via TensorFlow) |
| AI Analysis | **Finora AI** powered by Anthropic Claude |
| Mobile Frontend | React Native 0.74, Expo 51, React Navigation |
| Charts | Custom SVG candlestick chart (react-native-svg) |

---

## 🚀 Getting Started (Local Setup)

### Prerequisites

Install these before starting:

| Tool | Version | Download |
|---|---|---|
| Python | 3.10+ | https://python.org/downloads |
| Node.js | 18+ | https://nodejs.org |
| Git | latest | https://git-scm.com |
| VS Code | latest | https://code.visualstudio.com |
| Expo Go | latest | App Store / Google Play |

You also need:
- An **Anthropic API key** for Finora AI → https://console.anthropic.com
- (Optional) API keys for whichever exchange you want to use (WEEX, Binance, Bybit, OKX). Public market data (OHLCV, ticker) works without keys — keys are only needed for private/account endpoints.

---

### Step 1 — Clone & Open

```bash
git clone https://github.com/crinatarajan/Signum.git
cd Signum
code .
```

---

### Step 2 — Configure Environment Variables

Copy the root env example and fill in your keys:

```bash
# Windows
copy env.example .env

# macOS/Linux
cp env.example .env
```

Then do the same for the backend:

```bash
cd backend
copy .env.example .env      # Windows
cp .env.example .env        # macOS/Linux
```

Open `backend/.env` and fill in at minimum:

```env
EXCHANGE=weex
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

Add exchange API keys only if you need authenticated/private endpoints:

```env
WEEX_API_KEY=
WEEX_SECRET=
BINANCE_API_KEY=
BINANCE_SECRET=
BYBIT_API_KEY=
BYBIT_SECRET=
OKX_API_KEY=
OKX_SECRET=
OKX_PASSPHRASE=
```

> ⚠️ Never commit `.env` files — they are already in `.gitignore`.

---

### Step 3 — Backend Setup

Open a terminal in VS Code (`Ctrl + ` ` `):

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate
# Activate (macOS/Linux)
# source venv/bin/activate

# Install dependencies (tensorflow is optional, only needed for LSTM)
pip install -r requirements.txt

# Start the server
uvicorn app.main:app --reload
```

✅ Backend running at: `http://127.0.0.1:8000`
📖 Interactive API docs: `http://127.0.0.1:8000/docs`

Quick smoke test:

```bash
curl http://127.0.0.1:8000/health
curl "http://127.0.0.1:8000/api/signals/BTC-USDT?timeframe=1h&exchange=weex"
curl -X POST http://127.0.0.1:8000/api/signals/backtest \
  -H "Content-Type: application/json" \
  -d "{\"symbol\":\"BTC/USDT\",\"timeframe\":\"1h\",\"candles\":300}"
```

CLI backtest (alternative):

```bash
python -m scripts.backtest --symbol BTC/USDT --timeframe 1h --candles 500
```

---

### Step 4 — Frontend Setup

Open a **second terminal** in VS Code (click `+` in the terminal panel):

```bash
cd frontend

# Install dependencies
npm install

# Install additional native dependencies
npx expo install react-native-svg

# Start Expo
npx expo start
```

- Scan the QR code with **Expo Go** on your phone
- Press `a` to open Android emulator
- Press `i` to open iOS simulator
- Press `w` to open in browser

---

### Step 5 — Connect Frontend to Backend

In `frontend/src/api/signals.js` the base URL defaults to `http://localhost:8000/api`.

If testing on a **physical phone**, create `frontend/.env` with your machine's local IP:

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:8000/api
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/signals/exchanges` | List supported exchanges |
| `GET` | `/api/signals/symbols?exchange=weex&quote=USDT` | List active symbols on an exchange |
| `GET` | `/api/signals/{symbol}` | Rules-based LONG/SHORT/NEUTRAL signal |
| `GET` | `/api/signals/{symbol}/full` | Combined rules signal + Finora AI analysis |
| `POST` | `/api/signals/ai-analysis` | Finora AI analysis (standalone) |
| `GET` | `/api/signals/ticker/{symbol}` | Live ticker (price, volume, 24h change) |
| `POST` | `/api/signals/backtest` | Run a backtest and return summary, trades, equity curve |
| `GET` | `/api/portfolio` | Get saved portfolio positions with live P&L |
| `POST` | `/api/portfolio` | Add a position |
| `DELETE` | `/api/portfolio/{symbol}` | Remove a position |

**Symbol format:** path parameters use a dash in place of the slash, e.g. `BTC-USDT` for `BTC/USDT` (the backend converts `-` → `/` internally). Note: `encodeURIComponent("BTC/USDT")` does **not** work for path segments — browsers normalize `%2F` back to `/` before sending the request, which 404s against `/{symbol}` routes. Always use the dash form.

Full interactive docs at `http://127.0.0.1:8000/docs` when the backend is running.

---

## 📊 Dashboard Behavior & Watchlist

The Dashboard polls a **watchlist** of pairs every 60 seconds and shows one of two states:

- **✅ Active setups** — any pair where the rules engine's bullish/bearish
  confluence score crosses the activation threshold (≥ 1.5 out of 4) gets a
  LONG or SHORT card with confidence %, entry/target/stop, and the reasons
  behind the signal.
- **🔎 Watch list** — markets are NEUTRAL most of the time. When *no* pair
  currently qualifies as an active setup, the Dashboard instead shows the
  top-ranked NEUTRAL pairs — the ones **closest** to crossing the threshold —
  labeled `WATCH · LONG` or `WATCH · SHORT` based on which side of the
  confluence they're leaning toward, with a "Setup score" bar instead of
  "Confidence". This means there's always something useful to look at, even
  when nothing is "ready" yet.

### Customizing the watchlist

By default the Dashboard checks `BTC/USDT, ETH/USDT, SOL/USDT, BNB/USDT`.
Override this in `frontend/.env`:

```env
EXPO_PUBLIC_WATCH_PAIRS=BTC/USDT,ETH/USDT,SOL/USDT,BNB/USDT,CRV/USDT,XRP/USDT,CVX/USDT,XPIN/USDT
```

Restart `npx expo start` after changing this (env vars are read at build time).

### Symbol picker

The Backtest and Add Position screens use a **symbol picker** —
a text field with a filterable dropdown of common WEEX perpetual pairs
(`frontend/src/constants/pairs.js`). You can also type any symbol manually
if it's not in the curated list (e.g. a newly-listed pair).

---

## 💼 Portfolio (Manual Tracking Only)

The Portfolio tab is a **trade journal**, not an order-execution feature.
You log positions you've taken on your own exchange account — symbol,
direction, entry price, quantity, notes — and Signum polls live ticker
prices to show real-time unrealized P&L.

This closes the feedback loop: it lets you compare what Signum suggested
against what actually happened to a position you took, which is the best
way to evaluate (and tune) the signal engine over time.

**Position size calculator** — when adding a position, expand "Position
size calculator" to compute a suggested quantity from:
- Account balance (USD)
- Risk per trade (%) — common guidance is 0.5–2% per trade
- Stop-loss price

It returns the risk amount in USD, stop distance, suggested quantity, and
total position value, with a one-tap "Use this quantity" button.

---

## 🤖 Finora AI Analysis

Each signal can be enriched with a **Finora-style AI analysis** powered by Anthropic Claude. The analysis includes:

- Market structure summary (bullish / bearish / ranging)
- Directional bias with exact invalidation levels
- Key support & resistance levels
- One concrete trade setup: entry zone, TP1, TP2, stop-loss, R:R ratio
- Indicator confluence notes (RSI, MACD, BBands, EMAs)
- Funding rate & open interest context (perpetual swaps)

> ⚠️ All AI analysis includes the disclaimer: *"This is not investment advice. Always wait for confirmation and manage your risk."*

Requires `ANTHROPIC_API_KEY` to be set in `backend/.env`.

---

## 🧠 ML Models (Optional)

Train a model for a symbol/timeframe before live ML predictions will return non-neutral signals:

```bash
cd backend
python -m app.ml.train --symbol BTC/USDT --timeframe 1h
# or, for an LSTM model (requires tensorflow):
python -m app.ml.train --symbol BTC/USDT --timeframe 1h --model lstm
```

Models are saved to `backend/app/ml/models/` (excluded from git via `.gitignore`).

---

## 🗺️ Roadmap

- [x] Multi-exchange integration (WEEX, Binance, Bybit, OKX)
- [x] Funding rate + open interest signal filters
- [x] Finora AI analysis (Claude-powered)
- [x] Candlestick chart in detail screen
- [x] FinoraAnalysisCard UI component
- [x] Backtest engine (API + CLI) with equity curve and trade list
- [x] Portfolio tracking screen with position-size calculator
- [x] Watchlist ranking — always-on "active setup" or "closest to watch" feed
- [x] Symbol picker with curated pair list across Backtest / Add Position
- [ ] LSTM model packaging and pretrained models
- [ ] Push notifications
- [ ] Live ML signal endpoint (currently rules-only; ML toggle in Settings is UI-only until trained model is wired up)

---

## 🛠️ Recommended VS Code Extensions

Search in the Extensions panel (`Ctrl+Shift+X`):

- `Python` (Microsoft)
- `Pylance`
- `ES7+ React/Redux/React-Native snippets`
- `Prettier - Code formatter`
- `REST Client` — test API endpoints directly in VS Code

---

## 🧩 Developing with Claude

This repo is structured to be Claude-friendly — each file has a single, clear responsibility. When asking for help, reference the file path directly:

> *"Help me improve `backend/app/services/finora_ai.py` to add multi-timeframe analysis"*
> *"Update `frontend/src/screens/DetailScreen.js` to show Finora AI levels on the chart"*

---

## 📄 License

MIT License — free to use and adapt with attribution.
