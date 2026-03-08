import os
import pytest


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "supabase: mark test as requiring SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    )


def pytest_collection_modifyitems(config, items):
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')
    if supabase_url and supabase_key:
        return

    skip_reason = "Supabase credentials not set (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)"
    skip_marker = pytest.mark.skip(reason=skip_reason)
    for item in items:
        if 'supabase' in item.keywords:
            item.add_marker(skip_marker)
