from fastapi import APIRouter

from app.api.endpoints import assistant, auth, dashboard, notifications, tasks, uploads, users

api_router = APIRouter()
api_router.include_router(assistant.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(tasks.router)
api_router.include_router(dashboard.router)
api_router.include_router(notifications.router)
api_router.include_router(uploads.router)
