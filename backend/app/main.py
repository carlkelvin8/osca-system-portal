import structlog
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse

from app.api.v1.router import api_router
from app.config import settings
from app.core.dependencies import close_redis
from app.core.exceptions import register_exception_handlers
from app.database import engine
from app.database import Base

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "osca_startup",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        env=settings.APP_ENV,
        fr_model=settings.FR_MODEL,
    )

    if settings.APP_ENV != "production":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    if settings.FR_MODEL == "insightface":
        try:
            from app.services.facial_recognition import FacialRecognitionService
            fr_service = FacialRecognitionService()
            await fr_service.initialize()
            app.state.fr_service = fr_service
            logger.info("fr_model_loaded", model=settings.FR_MODEL)
        except Exception as exc:
            logger.warning(
                "fr_model_load_failed",
                model=settings.FR_MODEL,
                error=str(exc),
                hint="FR endpoints will be unavailable until the model is downloaded.",
            )
            app.state.fr_service = None

    yield

    logger.info("osca_shutdown")
    await close_redis()
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Web-Based Attendance and Inventory Management System "
        "with Facial Recognition and Barcode Scanning\n\n"
        "**NAAP-Villamor | Office of Sports and Cultural Affairs (OSCA)**"
    ),
    docs_url=settings.docs_url,
    redoc_url=settings.redoc_url,
    openapi_url="/openapi.json" if not settings.is_production else None,
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=r"^https://[a-zA-Z0-9-]+\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

register_exception_handlers(app)

app.include_router(api_router, prefix=settings.API_PREFIX)


@app.get("/health", tags=["Health"], include_in_schema=False)
async def health_check() -> dict:
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "env": settings.APP_ENV,
    }
