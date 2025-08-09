import json
import logging
import sys
import uuid
from datetime import UTC, datetime
from typing import Any

from api.core.config import settings


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_obj: dict[str, Any] = {
            "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "level": record.levelname,
            "service": settings.app_name,
            "logger": record.name,
            "message": record.getMessage(),
        }

        if hasattr(record, "correlation_id"):
            log_obj["correlation_id"] = record.correlation_id

        if hasattr(record, "actor"):
            log_obj["actor"] = record.actor

        if hasattr(record, "route"):
            log_obj["route"] = record.route

        if hasattr(record, "status"):
            log_obj["status"] = record.status

        if hasattr(record, "duration_ms"):
            log_obj["duration_ms"] = record.duration_ms

        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_obj)


def setup_logging():
    log_level = getattr(logging, settings.log_level.upper())

    handler = logging.StreamHandler(sys.stdout)

    if settings.log_format == "json":
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        )

    logging.basicConfig(
        level=log_level,
        handlers=[handler],
    )

    logging.getLogger("uvicorn.access").disabled = True
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_correlation_id() -> str:
    return str(uuid.uuid4())


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance with the given name."""
    return logging.getLogger(name)


logger = logging.getLogger(__name__)
