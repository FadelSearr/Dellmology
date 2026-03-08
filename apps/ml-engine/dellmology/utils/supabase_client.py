"""Optional Supabase client wrapper.

This module provides a safe, optional wrapper around the `supabase` client
library. It only attempts to initialize a client when `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are provided in the environment. Consumers should
handle the case where the client is not configured.
"""
import os
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

_client = None

def get_client():
    global _client
    if _client is not None:
        return _client

    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        logger.debug('Supabase not configured (SUPABASE_URL/SERVICE_ROLE_KEY missing)')
        return None

    try:
        # Import lazily to avoid adding supabase as a hard dependency for tests
        from supabase import create_client
        _client = create_client(url, key)
        logger.info('Supabase client initialized')
        return _client
    except Exception as e:
        logger.warning(f'Failed to initialize Supabase client: {e}')
        return None


def insert_audit(record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Insert a record into `ml_audit_log` via Supabase if configured.

    Returns the inserted row dict on success, None otherwise.
    """
    client = get_client()
    if not client:
        return None
    try:
        res = client.table('ml_audit_log').insert(record).execute()
        # supabase-py returns .data on success
        return getattr(res, 'data', None)
    except Exception as e:
        logger.exception('Supabase insert failed')
        return None
