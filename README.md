# 🚀 Crypto Signal App

A full-stack crypto long/short signal system with a Python backend (rules-based + ML) and React Native mobile frontend.

## Architecture

```
Coinbase API
    │
    ▼
Python Backend (FastAPI)
  ├── /services/data.py       ← OHLCV fetching via CCXT
  ├── /services/indicators.py ← RSI, MACD, ATR, Bollinger Bands
  ├── /services/rules.py      ← Rules-based signal engine
  ├── /ml/train.py            ← XGBoost model training
  ├── /ml/predict.py          ← Live ML predictions
  └── /routes/signals.py      ← REST API endpoints
    │
    ▼
React Native App (Expo)
  ├── SignalCard component    ← LONG/SHORT cards with confidence
  ├── Dashboard screen        ← Live signal feed
  └── Detail screen           ← Entry / Target / Stop-loss
```

## Quick Start

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # Add your Coinbase API keys
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npx expo start
```

## Project Structure
```
crypto-signal-app/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/
│   │   │   └── signals.py
│   │   ├── services/
│   │   │   ├── data.py
│   │   │   ├── indicators.py
│   │   │   └── rules.py
│   │   └── ml/
│   │       ├── train.py
│   │       └── predict.py
│   ├── scripts/
│   │   └── backtest.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── api/
    │   │   └── signals.js
    │   ├── components/
    │   │   └── SignalCard.js
    │   ├── screens/
    │   │   ├── DashboardScreen.js
    │   │   └── DetailScreen.js
    │   └── hooks/
    │       └── useSignals.js
    ├── App.js
    └── package.json
```

## Roadmap
- [ ] Add Firebase push notifications
- [ ] Train and integrate LSTM model
- [ ] Add portfolio tracking screen
- [ ] Backtest dashboard in the app
- [ ] Multi-exchange support (Binance)

## Developing with Claude
This repo is structured to be Claude-friendly. Each file has a clear single responsibility. When asking Claude for help, reference the file path — e.g. *"Help me improve `backend/app/ml/train.py` to add LSTM support"*.
