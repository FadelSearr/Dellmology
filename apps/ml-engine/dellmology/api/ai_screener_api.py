from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging

from dellmology.intelligence import llm_backend
from dellmology.analysis.unified_power import compute_unified_power

router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger(__name__)


class ScreenerEntry(BaseModel):
    symbol: str
    score: float
    metrics: Optional[Dict[str, float]] = None


class ScreenerRequest(BaseModel):
    entries: List[ScreenerEntry]
    limit: Optional[int] = 5


@router.post('/screener')
async def run_screener(req: ScreenerRequest, request: Request):
    """Simple screener that returns top picks and basic stats.

    Enhancements:
    - Compute a `unified_power` per entry using available `metrics` and the
      provided `score`. If no metrics are present, `unified_power` == `score`.
    - Return `unified_power` in the results and use it for ranking.
    """
    try:
        # convert pydantic models to dicts for analysis
        entries = [e.dict() for e in req.entries]

        # compute unified power if metrics exist
        enriched = compute_unified_power(entries, score_key='score')

        # sort by unified_power
        sorted_entries = sorted(enriched, key=lambda e: e.get('unified_power', 0), reverse=True)
        top = sorted_entries[: req.limit]

        ups_values = [e.get('unified_power', 0) for e in sorted_entries]
        stats = {
            'avg_unified_power': sum(ups_values) / len(ups_values) if ups_values else 0,
            'bullish_count': sum(1 for v in ups_values if v >= 60),
            'bearish_count': sum(1 for v in ups_values if v < 40),
        }
        top_pick = {'symbol': top[0].get('symbol'), 'unified_power': top[0].get('unified_power')} if top else {}

        # Provide a short narrative via the LLM if enabled
        payload = {'stats': stats, 'top_pick': top_pick}
        narrative = llm_backend.call_llm(payload, symbol=top_pick.get('symbol'))

        return {'ok': True, 'stats': stats, 'top_pick': top_pick, 'narrative': narrative, 'entries': sorted_entries}
    except Exception as exc:
        logger.exception('Screener failed')
        raise HTTPException(status_code=500, detail=str(exc))
