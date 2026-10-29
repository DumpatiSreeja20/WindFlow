from datetime import date, datetime, timedelta, timezone
import math
import os
import random
from typing import Any

import httpx
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

ELEXON_BASE_URL = os.getenv("ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1").rstrip("/")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

app = FastAPI(title="WindFlow API", version="1.0.0",
              description="Wind generation actuals, forecasts, and forecast-error analysis.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in CORS_ORIGINS if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

def parse_dt(value: Any) -> datetime | None:
    if value is None:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None

def first(row: dict, *names: str):
    for name in names:
        if row.get(name) is not None:
            return row[name]
    return None

def unwrap_rows(payload: Any) -> list[dict]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("data", "results", "result", "items", "records"):
            if isinstance(payload.get(key), list):
                return [x for x in payload[key] if isinstance(x, dict)]
        # Some endpoints return one record or a keyed object.
        if any(k in payload for k in ("startTime", "start_time", "generation")):
            return [payload]
    return []

async def fetch_elexon(dataset: str, params: dict[str, str]) -> list[dict]:
    url = f"{ELEXON_BASE_URL}/datasets/{dataset}/stream"
    async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
        response = await client.get(url, params=params, headers={"Accept": "application/json"})
        response.raise_for_status()
        return unwrap_rows(response.json())

def normalize_actuals(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        fuel = str(first(r, "fuelType", "fuel_type") or "WIND").upper()
        if fuel != "WIND":
            continue
        start = parse_dt(first(r, "startTime", "start_time", "settlementDateTime"))
        gen = first(r, "generation", "quantity", "mw")
        try:
            gen = float(gen)
        except (ValueError, TypeError):
            continue
        if start:
            out.append({"startTime": start.isoformat(), "actualGeneration": gen})
    return out

def normalize_forecasts(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        start = parse_dt(first(r, "startTime", "start_time", "settlementDateTime"))
        pub = parse_dt(first(r, "publishTime", "publish_time", "createdAt"))
        gen = first(r, "generation", "quantity", "mw")
        try:
            gen = float(gen)
        except (ValueError, TypeError):
            continue
        if start:
            out.append({
                "startTime": start.isoformat(),
                "publishTime": pub.isoformat() if pub else None,
                "forecastGeneration": gen
            })
    return out

def demo_rows(start: date, end: date):
    # Clearly synthetic values solely for UI demonstration.
    actuals, forecasts = [], []
    current = datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc)
    stop = datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    rng = random.Random(202601)
    while current < stop:
        hour = current.hour + current.minute / 60
        seasonal = 10500 + 3200 * math.sin((hour - 5) * math.pi / 12)
        weather = rng.uniform(-1700, 1700)
        actual = max(1500, seasonal + weather)
        forecast = max(1500, actual + rng.uniform(-1900, 1900))
        actuals.append({"startTime": current.isoformat(), "actualGeneration": round(actual, 2)})
        forecasts.append({
            "startTime": current.isoformat(),
            "publishTime": (current - timedelta(hours=12)).isoformat(),
            "forecastGeneration": round(forecast, 2)
        })
        current += timedelta(minutes=30)
    return actuals, forecasts

async def load_data(start: date, end: date, demo: bool):
    if demo:
        a, f = demo_rows(start, end)
        return a, f, "demo"
    # Query uses common Elexon stream parameters. Confirm current parameter names
    # in official documentation if the API rejects them.
    date_params = {
        "settlementDateFrom": start.isoformat(),
        "settlementDateTo": end.isoformat(),
    }
    try:
        raw_a = await fetch_elexon("FUELHH", {**date_params, "fuelType": "WIND"})
        raw_f = await fetch_elexon("WINDFOR", date_params)
        a = normalize_actuals(raw_a)
        f = normalize_forecasts(raw_f)
        return a, f, "live"
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not retrieve Elexon data ({type(exc).__name__}). Check API availability/parameters or use demo=true."
        ) from exc

def analyse(actuals: list[dict], forecasts: list[dict]) -> dict:
    # Match each target period with the latest forecast published no later than
    # that target period. The publishTime is preserved so the choice is auditable.
    by_start: dict[str, list[dict]] = {}
    for f in forecasts:
        by_start.setdefault(f["startTime"], []).append(f)
    joined = []
    for a in actuals:
        target = parse_dt(a["startTime"])
        candidates = []
        for f in by_start.get(a["startTime"], []):
            published = parse_dt(f.get("publishTime"))
            if published is None or target is None or published <= target:
                candidates.append(f)
        if not candidates:
            continue
        candidates.sort(key=lambda x: parse_dt(x.get("publishTime")) or datetime.min.replace(tzinfo=timezone.utc))
        f = candidates[-1]
        error = f["forecastGeneration"] - a["actualGeneration"]
        joined.append({
            "startTime": a["startTime"],
            "publishTime": f.get("publishTime"),
            "actualGeneration": a["actualGeneration"],
            "forecastGeneration": f["forecastGeneration"],
            "error": round(error, 3),
            "absoluteError": round(abs(error), 3),
        })
    if joined:
        errors = [x["error"] for x in joined]
        mae = sum(abs(x) for x in errors) / len(errors)
        rmse = math.sqrt(sum(x*x for x in errors) / len(errors))
        bias = sum(errors) / len(errors)
    else:
        mae = rmse = bias = None
    return {
        "matchedPeriods": len(joined),
        "mae": round(mae, 2) if mae is not None else None,
        "rmse": round(rmse, 2) if rmse is not None else None,
        "bias": round(bias, 2) if bias is not None else None,
        "rows": joined,
    }

@app.get("/health")
def health():
    return {"status": "ok", "service": "windflow-api"}

@app.get("/api/dashboard")
async def dashboard(
    start_date: date = Query(date(2026, 1, 1)),
    end_date: date = Query(date(2026, 1, 31)),
    demo: bool = Query(False),
):
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")
    if (end_date - start_date).days > 40:
        raise HTTPException(status_code=400, detail="Date range cannot exceed 41 days")
    actuals, forecasts, source = await load_data(start_date, end_date, demo)
    analysis = analyse(actuals, forecasts)
    return {
        "source": source,
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "actualCount": len(actuals),
        "forecastCount": len(forecasts),
        "latestPublishTime": max((f["publishTime"] for f in forecasts if f.get("publishTime")), default=None),
        **analysis,
    }

@app.get("/api/actuals")
async def get_actuals(start_date: date = date(2026, 1, 1), end_date: date = date(2026, 1, 31), demo: bool = False):
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")
    a, _, source = await load_data(start_date, end_date, demo)
    return {"source": source, "data": a}

@app.get("/api/forecasts")
async def get_forecasts(start_date: date = date(2026, 1, 1), end_date: date = date(2026, 1, 31), demo: bool = False):
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")
    _, f, source = await load_data(start_date, end_date, demo)
    return {"source": source, "data": f}
