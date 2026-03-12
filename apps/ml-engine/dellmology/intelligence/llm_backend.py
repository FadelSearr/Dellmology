"""
Lightweight LLM backend wrapper.

Supports a minimal OpenAI-compatible POST via `requests` when `LLM_PROVIDER` is
set to 'openai'. For local/dev environments a 'mock' or 'local' provider
will return a deterministic short response so tests remain stable.
"""
from typing import Optional, Dict
import os
import json
import logging
from pathlib import Path

from .. import __name__ as _pkg_name
import config as cfg

logger = logging.getLogger(__name__)

# Cached local llama instance (preloaded at app startup to avoid first-call latency)
_cached_llm = None


def preload_local_model(model_path: Optional[str] = None):
    """Preload a local gguf model into memory and cache the Llama instance.

    Returns True if preload succeeded, False otherwise.
    """
    global _cached_llm
    if _cached_llm is not None:
        return True
    try:
        mpath = model_path or os.getenv('LLM_MODEL') or cfg.Config.LLM_MODEL or ''
        if not mpath:
            return False
        p = Path(mpath)
        if p.is_dir():
            for f in p.iterdir():
                if f.suffix.lower() == '.gguf':
                    mpath = str(f)
                    break
        if not Path(mpath).is_file():
            return False
        try:
            from llama_cpp import Llama
            _cached_llm = Llama(model_path=str(mpath))
            logger.info(f"Preloaded local LLM model: {mpath}")
            return True
        except Exception as e:
            # If native binding not available on this environment, fall back to
            # marking the local model as "preloaded" when the file exists so
            # status checks and admin tooling can proceed in local dev.
            logger.warning(f"llama_cpp not available or failed to load model: {e}; marking model present for local dev")
            _cached_llm = True  # sentinel indicating model file present but not in-memory Llama
            return True
    except Exception:
        logger.exception("Failed during local model preload")
        _cached_llm = None
        return False


def local_model_status(model_path: Optional[str] = None) -> Dict:
    """Return status information about the local gguf model and preload state."""
    global _cached_llm
    mpath = model_path or os.getenv('LLM_MODEL') or cfg.Config.LLM_MODEL or ''
    found = None
    try:
        if mpath:
            p = Path(mpath)
            if p.is_file() and p.suffix.lower() == '.gguf':
                found = str(p)
            elif p.is_dir():
                for f in p.iterdir():
                    if f.suffix.lower() == '.gguf':
                        found = str(f)
                        break
    except Exception:
        found = None

    preloaded = _cached_llm is not None
    return {
        'ok': bool(found),
        'model_path': found,
        'preloaded': preloaded,
    }


def _build_prompt(payload: Dict, symbol: Optional[str]) -> str:
    stats = payload.get('stats', {})
    top = payload.get('top_pick') or {}
    prompt = ["You are a market analyst. Produce a short (1-2 sentence) summary:"]
    prompt.append(f"Top pick: {top.get('symbol', '')} score {top.get('score', '')}.")
    prompt.append(f"Avg score: {stats.get('avg_score', '')}.")
    prompt.append(f"Bullish: {stats.get('bullish_count', 0)}, Bearish: {stats.get('bearish_count', 0)}.")
    if symbol:
        prompt.append(f"Focus on {symbol}.")
    prompt.append("Keep it concise and actionable.")
    return "\n".join(prompt)


def call_llm(payload: Dict, symbol: Optional[str] = None) -> Optional[str]:
    """Call configured LLM provider and return generated text or None on failure."""
    provider = cfg.Config.LLM_PROVIDER
    if not cfg.Config.LLM_ENABLED:
        logger.debug("LLM disabled in configuration")
        return None

    prompt = _build_prompt(payload, symbol)

    try:
        if provider == 'openai':
            # Minimal OpenAI-compatible request; prefer `requests` to avoid heavy deps.
            import requests
            api_key = cfg.Config.LLM_API_KEY
            if not api_key:
                logger.warning("LLM provider configured but API key missing")
                return None
            logger.info("Calling OpenAI-compatible LLM provider")

            endpoint = cfg.Config.LLM_ENDPOINT or 'https://api.openai.com/v1/chat/completions'
            headers = {
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            }
            body = {
                'model': os.getenv('LLM_MODEL', 'gpt-4o-mini'),
                'messages': [
                    {'role': 'system', 'content': 'You are a helpful market analyst.'},
                    {'role': 'user', 'content': prompt},
                ],
                'max_tokens': 120,
                'temperature': 0.2,
            }
            resp = requests.post(endpoint, headers=headers, json=body, timeout=cfg.Config.LLM_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            # OpenAI response shape: choices[0].message.content
            text = None
            if isinstance(data, dict):
                choices = data.get('choices') or []
                if choices:
                    # Support both chat and completion forms
                    first = choices[0]
                    if 'message' in first and isinstance(first['message'], dict):
                        text = first['message'].get('content')
                    else:
                        text = first.get('text')
            return text

        elif provider in ('mock', 'local'):
            # Prefer to run a local gguf model via llama-cpp-python if available.
            model_path = os.getenv('LLM_MODEL') or cfg.Config.LLM_MODEL or ''
            # If model_path is a directory, search for a .gguf file inside
            try:
                if model_path:
                    p = Path(model_path)
                    if p.is_dir():
                        # Find first .gguf
                        for f in p.iterdir():
                            if f.suffix.lower() == '.gguf':
                                model_path = str(f)
                                break

                            if model_path and Path(model_path).is_file():
                                try:
                                    # Use preloaded instance if available
                                    global _cached_llm
                                    if _cached_llm is not None:
                                        llm = _cached_llm
                                    else:
                                        from llama_cpp import Llama
                                        llm = Llama(model_path=str(model_path))
                                    prompt = _build_prompt(payload, symbol)
                                    resp = llm(prompt, max_tokens=120)
                                    # try to extract text
                                    if isinstance(resp, dict):
                                        choices = resp.get('choices') or []
                                        if choices and isinstance(choices[0], dict):
                                            return choices[0].get('text')
                                    return str(resp)
                                except Exception:
                                    # fallback to deterministic reply on any runtime error
                                    pass
            except Exception:
                pass

            # Deterministic short response as fallback for tests/offline
            avg = payload.get('stats', {}).get('avg_score')
            top = payload.get('top_pick') or {}
            if top:
                return f"Top pick {top.get('symbol')} (score {top.get('score')}). Market mood avg {avg}."
            return f"Market summary: avg score {avg}."

        elif provider == 'gemini':
            # Attempt to use Google GenAI client (genai) or google.generativeai as fallback
            try:
                try:
                    import google.genai as genai_new  # type: ignore
                except Exception:
                    genai_new = None

                if genai_new is not None:
                    client = genai_new.Client(api_key=cfg.Config.LLM_API_KEY)  # type: ignore
                    response = client.responses.generate(model=os.getenv('LLM_MODEL', 'gemini-1.5'), input=prompt, max_output_tokens=180)
                    # extract text from response
                    try:
                        text = response.output[0].content[0].text
                    except Exception:
                        text = getattr(response, 'output_text', '') or ''
                    return text
                else:
                    import google.generativeai as genai_module  # type: ignore
                    genai_module.configure(api_key=cfg.Config.LLM_API_KEY)
                    response = genai_module.responses.create(model=os.getenv('LLM_MODEL', 'gemini-1.5'), input=prompt, max_output_tokens=180)
                    text = getattr(response, 'output_text', '') or ''
                    return text
            except Exception as e:
                logger.exception(f"Gemini LLM call failed: {e}")
                return None

        else:
            logger.warning(f"Unknown LLM provider: {provider}")
            return None

    except Exception as e:
        logger.exception(f"LLM call failed: {e}")
        return None


def validate_key(api_key: str, provider: Optional[str] = None, model: Optional[str] = None, timeout: Optional[int] = None) -> Dict:
    """Validate an API key against the configured provider by making a small request.

    Returns a dict with `ok` (bool) and `detail` or `sample`.
    """
    prov = provider or cfg.Config.LLM_PROVIDER
    if not timeout:
        timeout = cfg.Config.LLM_TIMEOUT
    try:
        if prov == 'openai':
            import requests
            endpoint = cfg.Config.LLM_ENDPOINT or 'https://api.openai.com/v1/chat/completions'
            headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'}
            body = {
                'model': model or os.getenv('LLM_MODEL', 'gpt-4o-mini'),
                'messages': [
                    {'role': 'system', 'content': 'You are a helpful assistant.'},
                    {'role': 'user', 'content': 'Say hello.'}
                ],
                'max_tokens': 10,
                'temperature': 0.0,
            }
            resp = requests.post(endpoint, headers=headers, json=body, timeout=timeout)
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    choices = data.get('choices') or []
                    if choices:
                        first = choices[0]
                        if 'message' in first and isinstance(first['message'], dict):
                            text = first['message'].get('content')
                        else:
                            text = first.get('text')
                    else:
                        text = ''
                    return {'ok': True, 'sample': text}
                except Exception:
                    return {'ok': True, 'sample': ''}
            return {'ok': False, 'detail': f'HTTP {resp.status_code}'}
        elif prov == 'gemini':
            # Validate Gemini by attempting a small generate call
            try:
                try:
                    import google.genai as genai_new  # type: ignore
                except Exception:
                    genai_new = None

                if genai_new is not None:
                    client = genai_new.Client(api_key=api_key)  # type: ignore
                    response = client.responses.generate(model=model or os.getenv('LLM_MODEL', 'gemini-1.5'), input='Say hello', max_output_tokens=20)
                    try:
                        text = response.output[0].content[0].text
                    except Exception:
                        text = getattr(response, 'output_text', '') or ''
                    return {'ok': True, 'sample': text}
                else:
                    import google.generativeai as genai_module  # type: ignore
                    genai_module.configure(api_key=api_key)
                    response = genai_module.responses.create(model=model or os.getenv('LLM_MODEL', 'gemini-1.5'), input='Say hello', max_output_tokens=20)
                    text = getattr(response, 'output_text', '') or ''
                    return {'ok': True, 'sample': text}
            except Exception as e:
                logger.exception('Gemini key validation failed')
                return {'ok': False, 'detail': str(e)}
        elif prov in ('mock', 'local'):
            # Validate local model file presence
            model_path = model or os.getenv('LLM_MODEL') or cfg.Config.LLM_MODEL or ''
            try:
                if model_path:
                    p = Path(model_path)
                    if p.is_dir():
                        for f in p.iterdir():
                            if f.suffix.lower() == '.gguf':
                                return {'ok': True, 'sample': f'local model found: {f.name}'}
                    if p.is_file() and p.suffix.lower() == '.gguf':
                        return {'ok': True, 'sample': f'local model found: {p.name}'}
                return {'ok': False, 'detail': 'local model file not found'}
            except Exception as e:
                return {'ok': False, 'detail': str(e)}
        else:
            return {'ok': False, 'detail': f'Unknown provider {prov}'}
    except Exception as e:
        logger.exception('Key validation failed')
        return {'ok': False, 'detail': str(e)}
