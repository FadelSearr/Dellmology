from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
from .xai_explainer import explain_prediction
from .ai_narrative import generate_narrative
from dellmology.utils.db_utils import fetch_ohlc_data

router = APIRouter(prefix="/xai", tags=["xai"])


class XAIRequest(BaseModel):
    symbol: str
    input_data: Optional[Dict[str, Any]] = None
    top_k: Optional[int] = 10


@router.post("/explain")
async def explain(req: XAIRequest):
    try:
        symbol = req.symbol.upper()
        # Gather a small feature payload as fallback if input_data not provided
        input_data = req.input_data or {}
        if not input_data:
            # fetch a few recent candles as a lightweight feature set
            candles = fetch_ohlc_data(symbol, interval_minutes=5, lookback_hours=1)
            input_data = {"recent_candles": candles}

        # call explainer (currently returns placeholder structure)
        explanation = explain_prediction({"symbol": symbol}, input_data)

        return {"success": True, "symbol": symbol, "explanation": explanation}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/narrative")
async def narrative(payload: Dict[str, Any]):
    try:
        symbol = str(payload.get("symbol", "")).upper()
        if not symbol:
            raise HTTPException(status_code=400, detail="symbol required")

        analysis = payload.get("analysis", {})
        text = generate_narrative(analysis, symbol=symbol)
        return {"success": True, "symbol": symbol, "narrative": text}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))



@router.post("/narrative_detailed")
async def narrative_detailed(payload: Dict[str, Any]):
    try:
        symbol = str(payload.get("symbol", "")).upper()
        if not symbol:
            raise HTTPException(status_code=400, detail="symbol required")

        analysis = payload.get("analysis", {})
        detailed = generate_narrative_detailed(analysis, symbol=symbol)
        return {"success": True, "symbol": symbol, "narrative": detailed}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
