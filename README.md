# 📡 Signum

> **AI-powered crypto trading signal engine** — rules-based + ML + Finora AI analysis, built on WEEX perpetual swap data with a React Native mobile frontend.

---

## 🧠 What It Does

Signum fetches live OHLCV market data from **WEEX** (perpetual swaps) via CCXT, runs it through a multi-layer signal engine, and delivers **LONG / SHORT / NEUTRAL signals** with confidence scores directly to your phone.

**Three signal layers:**
1. **Rules engine** — RSI, MACD, Bollinger Bands, EMA trend, plus WEEX-specific funding rate & open interest filters
2. **ML model** — XGBoost-trained classifier for pattern-based prediction
3. **Finora AI** — Claude-powered natural-language trade analysis with SMC/ICT framing, key levels, and a concrete trade setup (entry zone, TP1, TP2, SL)

**Firebase push notifications** deliver new signals in real time even when the app is in the background.

---

## 🏗️ Architecture

```
WEEX Exchange (Perpetual Swaps)
    │
    ▼
Python Backend (FastAPI)
  ├── services/data.py         ← OHLCV + ticker + funding rate + open interest (WEEX via CCXT)
  │                               Binance as automatic read-only fallback
  ├── services/indicators.py   ← RSI, MACD, ATR, Bollinger Bands, EMA
  ├── services/rules.py        ← Rules-based signal engine with WEEX funding rate / OI filters
  ├── services/finora_ai.py    ← Finora AI: Claude-powered SMC/ICT trade analysis
  ├── ml/train.py              ← XGBoost model training
  ├── ml/predict.py            ← Live ML predictions
  └── routes/signals.py        ← REST API endpoints
    │
    ▼
React Native App (Expo)
  ├── DashboardScreen          ← Live signal feed (rules / ML / both filter)
  ├── DetailScreen             ← Candlestick chart + entry / TP / SL levels
  ├── SignalCard               ← LONG/SHORT card with confidence %
  ├── FinoraAnalysisCard       ← AI analysis card (trend, bias, key levels, setup)
  └── Firebase FCM             ← Background push notifications for new signals
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
│   │   │   ├── data.py           ← WEEX + Binance fallback
│   │   │   ├── indicators.py
│   │   │   ├── rules.py          ← WEEX funding rate / OI signal filters
│   │   │   └── finora_ai.py      ← Finora AI (Anthropic Claude)
│   │   └── ml/
│   │       ├── train.py
│   │       └── predict.py
│   ├── scripts/
│   │   └── backtest.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── signals.js              ← API client (all endpoints)
│   │   │   └── FinoraAnalysisCard.js   ← Finora AI UI card
│   │   ├── components/
│   │   │   └── SignalCard.js
│   │   ├── screens/
│   │   │   ├── DashboardScreen.js      ← Live feed + Firebase FCM
│   │   │   └── DetailScreen.js         ← Candlestick chart + full signal detail
│   │   └── hooks/
│   │       └── useSignals.js
│   ├── App.js
│   └── package.json
├── env.example                 ← Root env (WEEX + Anthropic keys)
└── README.md
```

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Python 3.10+, FastAPI, Uvicorn |
| Exchange Data | CCXT 4.x — **WEEX** (primary), Binance (fallback) |
| Technical Indicators | RSI, MACD, ATR, Bollinger Bands, EMA (pandas-ta) |
| Signal Engine | Rules-based + WEEX funding rate/OI filters |
| ML Model | XGBoost, scikit-learn, joblib |
| AI Analysis | **Finora AI** powered by Anthropic Claude (claude-sonnet) |
| Mobile Frontend | React Native 0.74, Expo 51, React Navigation |
| Push Notifications | **Firebase Cloud Messaging (FCM)** via @react-native-firebase |
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
- A **WEEX account** with API keys → https://www.weex.com → Account → API Management (read-only keys are sufficient)
- An **Anthropic API key** for Finora AI → https://console.anthropic.com

---

### Step 1 — Clone & Open

```bash
git clone https://github.com/crinatarajan/Crypto-Signal-App.git
cd Crypto-Signal-App
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

Open `.env` and fill in:

```env
# WEEX Exchange
WEEX_API_KEY=your_weex_api_key_here
WEEX_SECRET=your_weex_secret_here

# Finora AI (Anthropic)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# App settings
LOG_LEVEL=INFO
DEFAULT_EXCHANGE=weex
DEFAULT_TIMEFRAME=1h
```

> ⚠️ Never commit `.env` — it is already in `.gitignore`.

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

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn app.main:app --reload
```

✅ Backend running at: `http://127.0.0.1:8000`  
📖 Interactive API docs: `http://127.0.0.1:8000/docs`

---

### Step 4 — Frontend Setup

Open a **second terminal** in VS Code (click `+` in the terminal panel):

```bash
cd frontend

# Install dependencies
npm install

# Install additional native dependencies
npx expo install react-native-svg
npm install @react-native-firebase/app @react-native-firebase/messaging

# Start Expo
npx expo start
```

- Scan the QR code with **Expo Go** on your phone
- Press `a` to open Android emulator
- Press `i` to open iOS simulator
- Press `w` to open in browser

---

### Step 5 — Connect Frontend to Backend

In `frontend/src/api/signals.js` the base URL defaults to `http://localhost:8000`.

If testing on a **physical phone**, replace `localhost` with your machine's local IP:

```js
// frontend/src/api/signals.js
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.x.x:8000";
```

Or create `frontend/.env`:
```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:8000
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/signals/weex-symbols` | List active WEEX perpetual swap symbols |
| `GET` | `/api/signals/{symbol}` | Rules-based LONG/SHORT/NEUTRAL signal |
| `GET` | `/api/signals/{symbol}/full` | Combined rules signal + Finora AI analysis |
| `POST` | `/api/signals/ai-analysis` | Finora AI analysis (standalone) |
| `GET` | `/api/signals/ticker/{symbol}` | Live WEEX ticker (price, volume, 24h change) |

**Symbol format:** URL-encoded, e.g. `BTC%2FUSDT` for `BTC/USDT`

Full interactive docs at `http://127.0.0.1:8000/docs` when backend is running.

---

## 🔔 Push Notifications (Firebase)

The Dashboard screen integrates Firebase Cloud Messaging (FCM):

1. Requests notification permissions on launch
2. Registers the device FCM token with the backend via `/signals/push-register`
3. Receives real-time signal alerts in the foreground and background
4. New push signals are merged into the live feed (deduplicated)

To enable Firebase in your own build, add your `google-services.json` (Android) or `GoogleService-Info.plist` (iOS) to the `frontend/` directory.

---

## 🤖 Finora AI Analysis

Each signal can be enriched with a **Finora-style AI analysis** powered by Anthropic Claude. The analysis includes:

- Market structure summary (bullish / bearish / ranging)
- Directional bias with exact invalidation levels
- Key support & resistance levels
- One concrete trade setup: entry zone, TP1, TP2, stop-loss, R:R ratio
- Indicator confluence notes (RSI, MACD, BBands, EMAs)
- Funding rate & open interest context (WEEX perpetuals)

> ⚠️ All AI analysis includes the disclaimer: *"This is not investment advice. Always wait for confirmation and manage your risk."*

---

## 🗺️ Roadmap

- [x] WEEX exchange integration (perpetual swaps)
- [x] Funding rate + open interest signal filters
- [x] Finora AI analysis (Claude-powered)
- [x] Firebase push notifications
- [x] Candlestick chart in detail screen
- [x] FinoraAnalysisCard UI component
- [ ] LSTM model integration
- [ ] Portfolio tracking screen
- [ ] Backtest dashboard in the app
- [ ] Multi-exchange support (Binance as primary option)

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
