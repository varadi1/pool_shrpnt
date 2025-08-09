import json
from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from api.core.idempotency import (
    check_idempotency_sync,
    create_idempotent_record,
    generate_idempotency_key,
    idempotent,
    update_idempotent_record,
)


def test_generate_idempotency_key():
    timestamp = datetime(2024, 1, 1, 12, 0, 0)

    key1 = generate_idempotency_key("EM001", "provision", "sharepoint", timestamp)
    key2 = generate_idempotency_key("EM001", "provision", "sharepoint", timestamp)
    key3 = generate_idempotency_key("EM002", "provision", "sharepoint", timestamp)

    assert key1 == key2
    assert key1 != key3
    assert len(key1) == 64


def test_idempotency_window():
    base_time = datetime(2024, 1, 1, 12, 0, 0)

    key1 = generate_idempotency_key("EM001", "provision", "sharepoint", base_time)

    key2 = generate_idempotency_key(
        "EM001", "provision", "sharepoint", base_time + timedelta(seconds=30)
    )

    key3 = generate_idempotency_key(
        "EM001", "provision", "sharepoint", base_time + timedelta(hours=25)
    )

    assert key1 == key2
    assert key1 != key3


def test_create_and_check_idempotent_record(test_db: Session):
    timestamp = datetime.utcnow()
    idempotency_key = generate_idempotency_key("EM001", "provision", "sharepoint", timestamp)

    existing = check_idempotency_sync(test_db, idempotency_key)
    assert existing is None

    record = create_idempotent_record(
        test_db, idempotency_key, "EM001", "provision", "sharepoint", timestamp
    )

    assert record.id is not None
    assert record.idempotency_key == idempotency_key
    assert record.status == "pending"

    found = check_idempotency_sync(test_db, idempotency_key)
    assert found is not None
    assert found.id == record.id


def test_update_idempotent_record(test_db: Session):
    timestamp = datetime.utcnow()
    idempotency_key = generate_idempotency_key("EM001", "provision", "sharepoint", timestamp)

    create_idempotent_record(
        test_db, idempotency_key, "EM001", "provision", "sharepoint", timestamp
    )

    result_data = {"status": "success", "resource_id": "12345"}
    update_idempotent_record(test_db, idempotency_key, result_data, "completed")

    updated = check_idempotency_sync(test_db, idempotency_key)
    assert updated.status == "completed"
    assert updated.completed_at is not None
    assert json.loads(updated.result) == result_data


def test_idempotent_decorator_success(test_db: Session):
    call_count = 0

    @idempotent(
        operation="test_operation",
        scope="test_scope",
        get_em_id=lambda args, kwargs: kwargs.get("em_id", "EM001"),
        db=test_db,
    )
    def test_function(em_id: str):
        nonlocal call_count
        call_count += 1
        return {"result": "success", "em_id": em_id}

    result1 = test_function(em_id="EM001")
    assert result1 == {"result": "success", "em_id": "EM001"}
    assert call_count == 1

    result2 = test_function(em_id="EM001")
    assert result2 == {"result": "success", "em_id": "EM001"}
    assert call_count == 1

    result3 = test_function(em_id="EM002")
    assert result3 == {"result": "success", "em_id": "EM002"}
    assert call_count == 2


def test_idempotent_decorator_failure(test_db: Session):
    @idempotent(
        operation="failing_operation",
        scope="test_scope",
        get_em_id=lambda args, kwargs: "EM001",
        db=test_db,
    )
    def failing_function():
        raise ValueError("Test error")

    with pytest.raises(ValueError):
        failing_function()

    idempotency_key = generate_idempotency_key("EM001", "failing_operation", "test_scope")
    record = check_idempotency_sync(test_db, idempotency_key)
    assert record is not None
    assert record.status == "failed"
    assert "Test error" in record.result
