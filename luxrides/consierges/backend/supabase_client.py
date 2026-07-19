import os
from supabase import create_client, Client

_client: Client = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_KEY", "") or os.environ.get("SUPABASE_ANON_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL y SUPABASE_SERVICE_KEY son requeridos")
        _client = create_client(url, key)
    return _client
