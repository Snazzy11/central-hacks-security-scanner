from fastapi import APIRouter

from app.api.routes import auth, health, notes

# Everything lives under /api so the Vite dev proxy (and a prod reverse proxy) stay simple.
api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(notes.router)
# New feature? Add its router here.
