# WindFlow — Wind Power Forecasting & Accuracy Dashboard

A full-stack pilot application for the Elexon UK wind generation forecasting assignment.

## Features
- React dashboard with January 2026 date filters
- Actual wind generation and forecast retrieval through the Python API
- Forecast publication-time visibility
- Actual vs forecast chart, MAE, RMSE, and bias metrics
- CSV export
- Demo mode when Elexon is unavailable or returns an unsupported response shape
- Docker Compose setup

## Architecture
- `frontend/`: React + Vite + Recharts
- `backend/`: FastAPI + httpx + pandas
- Elexon datasets: `FUELHH` (actual generation, `fuelType=WIND`) and `WINDFOR` (forecast generation)

## Run locally (Docker)
Requirements: Docker Desktop / Docker Engine with Compose.

```bash
docker compose up --build
```

Open:
- Frontend: http://localhost:5173
- Backend API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health



- WindFlow Website: https://wind-flow-iota.vercel.app
- Backend API: https://windflow-et96.onrender.com
- API Documentation: https://windflow-et96.onrender.com/docs
Stop:
```bash
docker compose down
```

## Run without Docker
Backend:
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Frontend (new terminal):
```bash
cd frontend
npm install
npm run dev
```
The frontend uses `VITE_API_BASE_URL` (defaults to `http://localhost:8000`).

## API
- `GET /health`
- `GET /api/dashboard?start_date=2026-01-01&end_date=2026-01-31&demo=false`
- `GET /api/actuals?start_date=2026-01-01&end_date=2026-01-31&demo=false`
- `GET /api/forecasts?start_date=2026-01-01&end_date=2026-01-31&demo=false`

The backend normalizes several common Elexon response wrappers and field-name variations. If the public API response changes or network access is blocked, use `demo=true` to inspect the UI with clearly labelled synthetic demo data. Demo data is not real Elexon data and must not be presented as measured results.

## Forecast selection and metrics
Each forecast row has a `startTime` (the half-hour period being forecast) and `publishTime` (when that forecast was issued). For a target period, the dashboard selects the latest forecast published before the period starts. This is a practical proxy for decision-time availability; validate the exact day-ahead cutoff policy with the client before using this for operational trading decisions.

Metrics are calculated only on periods where an actual and selected forecast both exist:
- MAE = mean absolute error
- RMSE = square root of mean squared error
- Bias = mean(forecast − actual); positive means forecasts were higher than actuals

## Deployment
- Frontend can be deployed to Vercel with root directory `frontend`, build command `npm run build`, output directory `dist`.
- Backend can be deployed to a Python host that supports Docker or ASGI (for example, a suitable Heroku container setup). Set `CORS_ORIGINS` to the deployed frontend URL.
- Update `VITE_API_BASE_URL` to the deployed backend URL and rebuild the frontend.

Vercel hosts the React frontend; it does not automatically host this FastAPI service. Deploy the backend separately and connect the frontend to it.
