from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging

from dellmology.intelligence import llm_backend

router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger(__name__)


class ScreenerEntry(BaseModel):
    symbol: str
    score: float


class ScreenerRequest(BaseModel):
    entries: List[ScreenerEntry]
    limit: Optional[int] = 5


@router.post('/screener')
async def run_screener(req: ScreenerRequest, request: Request):
    """Simple screener that returns top picks and basic stats.

    This is intentionally lightweight: accepts a list of {symbol, score}
    and returns top N picks plus summary stats that can be fed to the
    AI Narrative endpoint.
    """
    try:
        entries = sorted(req.entries, key=lambda e: e.score, reverse=True)
        top = entries[: req.limit]
        scores = [e.score for e in entries]
        stats = {
            'avg_score': sum(scores) / len(scores) if scores else 0,
            'bullish_count': sum(1 for s in scores if s >= 60),
            'bearish_count': sum(1 for s in scores if s < 40),
        }
        top_pick = {'symbol': top[0].symbol, 'score': top[0].score} if top else {}

        # Provide a short narrative via the LLM if enabled
        payload = {'stats': stats, 'top_pick': top_pick}
        narrative = llm_backend.call_llm(payload, symbol=top_pick.get('symbol'))

        return {'ok': True, 'stats': stats, 'top_pick': top_pick, 'narrative': narrative}
    except Exception as exc:
        logger.exception('Screener failed')
        raise HTTPException(status_code=500, detail=str(exc))
