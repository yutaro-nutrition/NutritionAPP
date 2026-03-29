from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.routes.menu import router as menu_router
from app.api.routes.meta import router as meta_router
from app.api.routes.recipes import router as recipes_router
from app.core.config import settings
from app.core.errors import ApiError, VALIDATION_ERROR, default_error_code_by_status
from app.db.session import check_db_connection

app = FastAPI(
    title="Recipe API MVP",
    version="0.1.0",
    description="MVP for recipe retrieval and menu generation.",
)

app.include_router(recipes_router)
app.include_router(menu_router)
app.include_router(meta_router)


@app.exception_handler(ApiError)
async def handle_api_error(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": exc.error_code,
            "detail": exc.detail,
        },
    )


@app.exception_handler(RequestValidationError)
async def handle_request_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error_code": VALIDATION_ERROR,
            "detail": exc.errors(),
        },
    )


@app.exception_handler(HTTPException)
async def handle_http_exception(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": default_error_code_by_status(exc.status_code),
            "detail": exc.detail,
        },
    )


@app.get("/health")
def healthcheck() -> dict:
    check_db_connection()
    return {
        "status": "ok",
        "db_target": settings.db_target_label,
    }

