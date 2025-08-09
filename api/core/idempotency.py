import hashlib
import json
from collections.abc import Callable
from datetime import datetime, timedelta
from functools import wraps
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from api.core.config import settings
from api.core.database import SessionLocal
from api.models.idempotency import IdempotentOperation


def generate_idempotency_key(
    em_id: str, operation: str, scope: str, timestamp_window: datetime | None = None
) -> str:
    if timestamp_window is None:
        timestamp_window = datetime.utcnow()

    window_seconds = settings.idempotency_window_seconds
    window_start = timestamp_window - timedelta(
        seconds=timestamp_window.timestamp() % window_seconds
    )

    key_components = {
        "em_id": em_id,
        "operation": operation,
        "scope": scope,
        "timestamp_window": window_start.isoformat(),
    }

    key_string = json.dumps(key_components, sort_keys=True)

    return hashlib.sha256(key_string.encode()).hexdigest()


async def check_idempotency(
    db: AsyncSession | Session, idempotency_key: str, operation_type: str | None = None
) -> bool:
    """Check if an operation has already been processed.

    For async sessions, returns True if operation exists and is completed.
    For sync sessions, returns the IdempotentOperation object.
    """
    if isinstance(db, AsyncSession):
        stmt = select(IdempotentOperation).where(
            IdempotentOperation.idempotency_key == idempotency_key
        )
        result = await db.execute(stmt)
        record = result.scalar_one_or_none()
        return record is not None and record.status == "completed"
    else:
        return check_idempotency_sync(db, idempotency_key)


async def mark_operation_complete(
    db: AsyncSession, idempotency_key: str, operation_type: str
) -> None:
    """Mark an operation as complete in the idempotency store."""
    stmt = select(IdempotentOperation).where(IdempotentOperation.idempotency_key == idempotency_key)
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()

    if not record:
        record = IdempotentOperation(
            idempotency_key=idempotency_key,
            em_id="",
            operation=operation_type,
            scope="",
            timestamp_window=datetime.utcnow(),
            status="completed",
            completed_at=datetime.utcnow(),
        )
        db.add(record)
    else:
        record.status = "completed"
        record.completed_at = datetime.utcnow()

    await db.commit()


def check_idempotency_sync(db: Session, idempotency_key: str) -> IdempotentOperation | None:
    return (
        db.query(IdempotentOperation)
        .filter(IdempotentOperation.idempotency_key == idempotency_key)
        .first()
    )


def create_idempotent_record(
    db: Session,
    idempotency_key: str,
    em_id: str,
    operation: str,
    scope: str,
    timestamp_window: datetime,
) -> IdempotentOperation:
    record = IdempotentOperation(
        idempotency_key=idempotency_key,
        em_id=em_id,
        operation=operation,
        scope=scope,
        timestamp_window=timestamp_window,
        status="pending",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def update_idempotent_record(
    db: Session, idempotency_key: str, result: Any, status: str = "completed"
) -> None:
    record = (
        db.query(IdempotentOperation)
        .filter(IdempotentOperation.idempotency_key == idempotency_key)
        .first()
    )

    if record:
        record.result = json.dumps(result) if not isinstance(result, str) else result
        record.status = status
        record.completed_at = datetime.utcnow()
        db.commit()


def idempotent(
    operation: str,
    scope: str,
    get_em_id: Callable[[tuple, dict[str, Any]], str],
    db: Session | None = None,
):
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            em_id = get_em_id(args, kwargs)

            idempotency_key = generate_idempotency_key(
                em_id=em_id, operation=operation, scope=scope
            )

            # Use provided db or create new session
            should_close = False
            if db is None:
                session = SessionLocal()
                should_close = True
            else:
                session = db

            try:
                existing = check_idempotency_sync(session, idempotency_key)

                if existing:
                    if existing.status == "completed":
                        return json.loads(existing.result) if existing.result else None
                    elif existing.status == "pending":
                        raise Exception(f"Operation {operation} for {em_id} is already in progress")
                    elif existing.status == "failed":
                        pass

                timestamp_window = datetime.utcnow()
                window_seconds = settings.idempotency_window_seconds
                window_start = timestamp_window - timedelta(
                    seconds=timestamp_window.timestamp() % window_seconds
                )

                create_idempotent_record(
                    db=session,
                    idempotency_key=idempotency_key,
                    em_id=em_id,
                    operation=operation,
                    scope=scope,
                    timestamp_window=window_start,
                )

                try:
                    result = func(*args, **kwargs)
                    update_idempotent_record(session, idempotency_key, result, "completed")
                    return result
                except Exception as e:
                    update_idempotent_record(session, idempotency_key, str(e), "failed")
                    raise

            finally:
                if should_close:
                    session.close()

        return wrapper

    return decorator
