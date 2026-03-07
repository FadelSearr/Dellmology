"""
AI Narrative Module
Generates human-readable analysis using LLMs
"""

import logging
import os
from typing import Dict
try:
    # Prefer the new package if available
    import google.genai as genai_new  # type: ignore
except Exception:
    genai_new = None
genai = None

logger = logging.getLogger(__name__)


def generate_narrative(analysis_data: Dict, symbol: str = None) -> str:
    """
    Generate AI narrative for trading analysis using Gemini.

    Args:
        analysis_data: Dictionary with analysis results
        symbol: Stock symbol (optional)

    Returns:
        Human-readable narrative
    """
    logger.info(f"Generating AI narrative for {symbol}...")

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY not set, cannot generate narrative")
        return ""  # silent failure

    # configure generative ai client
    stats = analysis_data.get("stats", {})
    top = analysis_data.get("top_pick")
    results = analysis_data.get("results", [])

    prompt_lines = [
        "You are a veteran Indonesian stock market analyst with expertise in bandarmology.",
        f"Provide a concise, human-readable narrative for symbol {symbol or 'N/A'} based on the following summary:",
        "Also perform a sentiment stress test based on recent news headlines and search for historical red flags (fraud, legal, management issues) for this company. If any red flags are found, highlight the risk and recommend lowering the Unified Power Score.",
    ]

    if stats:
        prompt_lines.append("\nStatistics:")
        for k, v in stats.items():
            prompt_lines.append(f"- {k.replace('_',' ').title()}: {v}")

    if top:
        prompt_lines.append("\nTop Pick:")
        prompt_lines.append(f"- Symbol {top.get('symbol')} score {top.get('score')}, reason: {top.get('reason')}")

    prompt = "\n".join(prompt_lines)

    try:
        # Prefer the new GenAI client API if available
        if genai_new is not None:
            client = genai_new.Client(api_key=api_key)  # type: ignore
            response = client.responses.generate(model="gemini-1.5-flash", input=prompt, max_output_tokens=300)
            # Attempt to extract text from response structure
            try:
                text = response.output[0].content[0].text
            except Exception:
                text = getattr(response, 'output_text', '') or ''
        else:
            # If a module-level `genai` (mock) was injected e.g., by tests, use it
            if genai is not None:
                try:
                    genai.configure(api_key=api_key)
                except Exception:
                    pass
                try:
                    response = genai.responses.create(model="gemini-1.5-flash", input=prompt, max_output_tokens=300)
                    text = getattr(response, 'output_text', None) or ''
                except Exception:
                    text = ''
            else:
                # Fallback to older package API. Import lazily and suppress the deprecation warning.
                import warnings
                with warnings.catch_warnings():
                    warnings.filterwarnings("ignore", category=FutureWarning)
                    import google.generativeai as genai_module  # type: ignore
                genai_module.configure(api_key=api_key)
                response = genai_module.responses.create(
                    model="gemini-1.5-flash",
                    input=prompt,
                    max_output_tokens=300
                )
                # response may provide output_text or structured
                text = getattr(response, 'output_text', None) or ''
        return text
    except Exception as exc:
        logger.error(f"Gemini API call failed: {exc}")
        return ""
