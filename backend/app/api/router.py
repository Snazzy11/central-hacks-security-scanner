from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.api.routes import auth, health, redact

# Everything lives under /api so the Vite dev proxy (and a prod reverse proxy) stay simple.
api_router = APIRouter(prefix="/api")

# Open on purpose: health checks, and login/register (the only way to get a token).
api_router.include_router(health.router)
api_router.include_router(auth.router)

# Login required for everything below. Applying it here means a new router can't forget it;
# routes still take `user: CurrentUser` when they need to know who is calling.
protected = [Depends(get_current_user)]
api_router.include_router(redact.router, dependencies=protected)

# New feature? Add its router above, with dependencies=protected unless it must be public.
