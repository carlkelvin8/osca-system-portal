import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import ORJSONResponse
from sqlalchemy.exc import IntegrityError

logger = structlog.get_logger(__name__)


class OSCAException(Exception):
    def __init__(self, status_code: int, detail: str, code: str | None = None):
        self.status_code = status_code
        self.detail = detail
        self.code = code
        super().__init__(detail)


class NotFoundError(OSCAException):
    def __init__(self, resource: str, resource_id: str = ""):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{resource} not found" + (f": {resource_id}" if resource_id else ""),
            code="NOT_FOUND",
        )


class ConflictError(OSCAException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail, code="CONFLICT")


class ForbiddenError(OSCAException):
    def __init__(self, detail: str = "Access denied"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN, detail=detail, code="FORBIDDEN"
        )


class FacialRecognitionError(OSCAException):
    def __init__(self, detail: str):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail,
            code="FR_ERROR",
        )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(OSCAException)
    async def osca_exception_handler(request: Request, exc: OSCAException) -> ORJSONResponse:
        logger.warning("osca_exception", detail=exc.detail, code=exc.code, path=request.url.path)
        return ORJSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> ORJSONResponse:
        errors = []
        for error in exc.errors():
            errors.append({
                "field": ".".join(str(loc) for loc in error["loc"]),
                "message": error["msg"],
                "type": error["type"],
            })
        return ORJSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": "Validation error", "errors": errors},
        )

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(
        request: Request, exc: IntegrityError
    ) -> ORJSONResponse:
        error_msg = str(exc.orig)
        logger.error("db_integrity_error", error=error_msg)
        if "violates foreign key constraint" in error_msg:
            return ORJSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content={
                    "detail": "Cannot delete: this record is referenced by other data. Remove all associated records first.",
                    "code": "FK_CONSTRAINT",
                },
            )
        return ORJSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": "A record with this data already exists.", "code": "DUPLICATE"},
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception) -> ORJSONResponse:
        logger.exception("unhandled_exception", path=request.url.path, exc_info=exc)
        return ORJSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "An internal server error occurred.", "code": "INTERNAL_ERROR"},
        )
