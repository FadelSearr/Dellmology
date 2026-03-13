"""
Minimal AI narrative generator for Screener.
This is a light-weight deterministic helper used by the Screener when
the full LLM integration is not available in local/dev environments.
"""
from typing import Dict, Optional
from datetime import datetime
import logging
import os

import config as cfg
import dellmology.intelligence.llm_backend as llm_backend

logger = logging.getLogger(__name__)
genai = None


def generate_narrative(payload: Dict, symbol: Optional[str] = None, use_llm: Optional[bool] = None) -> str:
    """Generate a short narrative summary for the screener results.

    If LLM integration is enabled via configuration, attempt to call the
    configured LLM provider. On any failure, fall back to the deterministic
    generator so behavior is stable for local/dev use and tests.
    """
    # Determine if module is used as packaged `dellmology` module or loaded standalone.
    packaged = bool(__package__ and __package__.startswith('dellmology'))

    # If the module is used standalone (tests load it directly), preserve
    # legacy behavior: require GEMINI_API_KEY to generate LLM narrative and
    # otherwise return empty string. When used as package, use deterministic
    # fallback for local/dev stability.
    if not packaged:
        # Legacy path used by direct module loads in tests
        api_key = os.environ.get('GEMINI_API_KEY')
        if not api_key:
            return ""
        # Try to use injected/mocked `genai` client
        try:
            if genai is not None:
                try:
                    genai.configure(api_key=api_key)
                except Exception:
                    pass
                resp = genai.responses.create(model="gemini-1.5-flash", input={}, max_output_tokens=300)
                return getattr(resp, 'output_text', '') or ''
        except Exception:
            logger.exception('Legacy Gemini call failed')
            return ""

    # Try LLM first if enabled (packaged path)
    try:
        # Only call the LLM if explicitly requested via `use_llm=True` and
        # the global config also enables LLMs. This avoids non-deterministic
        # behavior during tests and local/dev runs where LLM_PROVIDER may be
        # configured at runtime by other tests.
        attempt_llm = bool(use_llm) and bool(cfg.Config.LLM_ENABLED)
        if attempt_llm:
            text = llm_backend.call_llm(payload, symbol)
            if text:
                return text
    except Exception:
        logger.exception("LLM narrative generation failed; falling back to deterministic generator")

    # Deterministic fallback
    stats = payload.get('stats', {})
    top_pick = payload.get('top_pick') or {}

    parts = []
    ts = stats.get('timestamp') or datetime.utcnow().isoformat() + 'Z'
    parts.append(f"Screener summary at {ts}.")

    kill = stats.get('kill_switch_triggered')
    if kill:
        parts.append("Golden-record validation failed — live signals are paused.")

    avg = stats.get('avg_score')
    if avg is not None:
        parts.append(f"Average score: {avg:.1f}.")

    if top_pick:
        tp_sym = getattr(top_pick, 'symbol', None) or (top_pick.get('symbol') if isinstance(top_pick, dict) else None)
        tp_score = getattr(top_pick, 'score', None) or (top_pick.get('score') if isinstance(top_pick, dict) else None)
        if tp_sym and tp_score is not None:
            parts.append(f"Top pick: {tp_sym} (score {tp_score:.1f}).")

    bullish = stats.get('bullish_count') or 0
    bearish = stats.get('bearish_count') or 0
    parts.append(f"Market sentiment: {bullish} bullish vs {bearish} bearish picks.")

    if avg is not None and avg > 75:
        parts.append("Overall market looks strong — favor long setups with tight stops.")
    elif avg is not None and avg < 45:
        parts.append("Market breadth looks weak — consider reducing exposure or hedging.")
    else:
        parts.append("Mixed signals — prefer selective entries aligned with flow and patterns.")

    return " ".join(parts)
