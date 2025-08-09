"""API endpoints for lock management."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from api.core.database import get_db
from api.core.errors import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from api.dependencies.auth import AdminUser, CurrentUser, PMUser
from api.models.lock import LockWindowType, PermissionLevel
from api.schemas.lock import (
    LockRuleCreate,
    LockRuleResponse,
    LockRuleUpdate,
    LockStateResponse,
    LockStateStatusResponse,
    ManualLockOperationRequest,
    ManualLockOperationResponse,
    ManualOverrideRequest,
    MetricsResponse,
)
from api.services.locks.lock_rule_service import LockRuleService
from api.services.locks.manual_lock_service import ManualLockService
from api.services.locks.monitoring import LockMonitoringService

router = APIRouter(prefix="/locks", tags=["locks"])


@router.get("/summary")
def get_locks_summary(
    db: Session = Depends(get_db),
) -> dict:
    """Get summary of locks for dashboard.
    
    Returns:
        Summary of time locks, CR unlocks, and manual locks
    """
    # Return mock data for now
    return {
        "timeLocked": 0,
        "crUnlocked": 0,
        "manualLocked": 0
    }


@router.put("/rules/{em_id}")
def configure_lock_rules(
    em_id: int,
    request: LockRuleCreate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> LockRuleResponse:
    """Configure lock rules for an EM.

    Args:
        em_id: Order/EM identifier
        request: Lock rule configuration
        db: Database session

    Returns:
        Created lock rule
    """
    service = LockRuleService(db)

    try:
        rule = service.create_lock_rule(
            order_em_id=em_id,
            rule_name=request.rule_name,
            t_value=request.t_value,
            window_type=LockWindowType(request.window_type),
            start_offset=request.start_offset,
            end_offset=request.end_offset,
            permission_level=PermissionLevel(request.permission_level),
            created_by=request.created_by,
        )

        return LockRuleResponse.from_orm(rule)

    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except BadRequestError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/rules/{em_id}")
def get_lock_rules(
    em_id: int,
    current_user: CurrentUser,
    active_only: bool = Query(True, description="Return only active rules"),
    db: Session = Depends(get_db),
) -> list[LockRuleResponse]:
    """Get lock rules for an EM.

    Args:
        em_id: Order/EM identifier
        active_only: Whether to return only active rules
        db: Database session

    Returns:
        List of lock rules
    """
    service = LockRuleService(db)
    rules = service.get_lock_rules(em_id, active_only)

    return [LockRuleResponse.from_orm(rule) for rule in rules]


@router.patch("/rules/{rule_id}")
def update_lock_rule(
    rule_id: UUID,
    request: LockRuleUpdate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> LockRuleResponse:
    """Update a lock rule.

    Args:
        rule_id: Lock rule identifier
        request: Update data
        db: Database session

    Returns:
        Updated lock rule
    """
    service = LockRuleService(db)

    try:
        rule = service.update_lock_rule(
            rule_id=rule_id,
            rule_name=request.rule_name,
            t_value=request.t_value,
            window_type=LockWindowType(request.window_type) if request.window_type else None,
            start_offset=request.start_offset,
            end_offset=request.end_offset,
            permission_level=(
                PermissionLevel(request.permission_level) if request.permission_level else None
            ),
            is_active=request.is_active,
        )

        return LockRuleResponse.from_orm(rule)

    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.delete("/rules/{rule_id}")
def delete_lock_rule(
    rule_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Delete a lock rule.

    Args:
        rule_id: Lock rule identifier
        db: Database session

    Returns:
        Deletion confirmation
    """
    service = LockRuleService(db)

    try:
        service.delete_lock_rule(rule_id)
        return {"message": f"Lock rule {rule_id} deleted successfully"}

    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/state/{em_id}")
def get_lock_states(
    em_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[LockStateResponse]:
    """Get current lock states for an EM.

    Args:
        em_id: Order/EM identifier
        db: Database session

    Returns:
        List of lock states
    """
    from api.models.lock import LockState

    states = db.query(LockState).filter(LockState.order_em_id == em_id).all()

    return [LockStateResponse.from_orm(state) for state in states]


@router.post("/evaluate")
def trigger_evaluation(
    current_user: AdminUser,
    force: bool = Query(False, description="Force evaluation even if recently run"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Manually trigger lock evaluation (admin only).

    Args:
        force: Force evaluation
        db: Database session

    Returns:
        Evaluation results
    """
    # Import here to avoid circular dependency
    from scheduler.tasks.lock_scheduler import evaluate_lock_transitions

    # Queue the evaluation task
    task = evaluate_lock_transitions.delay(force=force)

    return {
        "message": "Evaluation triggered",
        "task_id": task.id,
        "force": force,
    }


@router.post("/override")
def apply_manual_override(
    request: ManualOverrideRequest,
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Apply manual override to lock state.

    Args:
        request: Override request
        db: Database session

    Returns:
        Override result
    """
    from uuid import uuid4

    from worker.tasks.lock_application import apply_manual_override

    correlation_id = f"manual_override_{uuid4()}"

    # Queue the override task
    task = apply_manual_override.delay(
        order_em_id=request.order_em_id,
        folder_path=request.folder_path,
        override_state=request.override_state,
        override_permission=request.override_permission,
        override_reason=request.override_reason,
        override_by=request.override_by,
        correlation_id=correlation_id,
    )

    return {
        "message": "Override queued for application",
        "task_id": task.id,
        "correlation_id": correlation_id,
    }


@router.post("/rules/{em_id}/standard")
def create_standard_lock_windows(
    em_id: int,
    t_value: datetime,
    created_by: str,
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> list[LockRuleResponse]:
    """Create standard lock windows for an EM.

    Args:
        em_id: Order/EM identifier
        t_value: T+0 reference date
        created_by: User creating the rules
        db: Database session

    Returns:
        List of created lock rules
    """
    service = LockRuleService(db)

    try:
        rules = service.create_standard_lock_windows(em_id, t_value, created_by)
        return [LockRuleResponse.from_orm(rule) for rule in rules]

    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/health")
def get_health_status(
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Get lock system health status.

    Args:
        db: Database session

    Returns:
        Health status
    """
    monitoring = LockMonitoringService(db)
    return monitoring.check_scheduler_health()


@router.get("/metrics")
def get_metrics(
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> MetricsResponse:
    """Get lock system metrics.

    Args:
        db: Database session

    Returns:
        System metrics
    """
    monitoring = LockMonitoringService(db)
    metrics = monitoring.get_dashboard_metrics()

    return MetricsResponse(**metrics)


@router.get("/reliability")
def get_reliability_metrics(
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Get scheduler reliability metrics.

    Args:
        db: Database session

    Returns:
        Reliability metrics
    """
    monitoring = LockMonitoringService(db)
    return monitoring.get_scheduler_reliability_metrics()


@router.get("/alerts")
def get_alerts(
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Get current system alerts.

    Args:
        db: Database session

    Returns:
        List of alerts
    """
    monitoring = LockMonitoringService(db)
    return monitoring.check_missed_evaluations()


@router.get("/graph-metrics")
async def get_graph_metrics(
    current_user: AdminUser,
    hours: int = Query(1, description="Number of hours to look back"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Get Graph API performance metrics.

    Args:
        hours: Number of hours to analyze
        db: Database session

    Returns:
        Graph API performance metrics
    """
    from api.services.telemetry.graph_metrics import get_metrics_collector

    collector = get_metrics_collector()
    summary = await collector.get_metrics_summary(hours=hours)
    rate_limits = await collector.get_rate_limit_stats(hours=hours)

    return {
        "summary": {
            "total_calls": summary.total_calls,
            "successful_calls": summary.successful_calls,
            "failed_calls": summary.failed_calls,
            "rate_limited_calls": summary.rate_limited_calls,
            "total_retries": summary.total_retries,
            "avg_duration_ms": summary.avg_duration_ms,
            "p50_duration_ms": summary.p50_duration_ms,
            "p95_duration_ms": summary.p95_duration_ms,
            "p99_duration_ms": summary.p99_duration_ms,
            "calls_by_operation": summary.calls_by_operation,
            "errors_by_type": summary.errors_by_type,
            "slowest_endpoints": summary.slowest_endpoints,
        },
        "rate_limiting": rate_limits,
        "time_period_hours": hours,
    }


@router.post("/manual")
def apply_manual_lock(
    request: ManualLockOperationRequest,
    current_user: PMUser,
    db: Session = Depends(get_db),
) -> ManualLockOperationResponse:
    """Apply manual lock or unlock to folder groups (PM only).

    Args:
        request: Manual lock operation request
        current_user: Current authenticated PM user
        db: Database session

    Returns:
        Operation result with correlation ID

    Raises:
        HTTPException: If operation fails or user is not PM
    """
    from uuid import UUID

    service = ManualLockService(db)

    try:
        # Extract user info
        user_id = UUID(current_user.get("user_id"))
        user_role = "PM"  # Already validated by PMUser dependency

        # Apply manual lock/unlock
        result = service.apply_manual_lock(
            em_id=request.em_id,
            scope=request.scope,
            action=request.action,
            reason=request.reason,
            user_id=user_id,
            user_role=user_role,
        )

        # Queue SharePoint permission update
        from worker.tasks.lock_application import apply_manual_lock_permissions

        apply_manual_lock_permissions.delay(
            em_id=request.em_id,
            scope=request.scope,
            action=request.action,
            correlation_id=result["correlation_id"],
        )

        return ManualLockOperationResponse(
            success=result["success"],
            correlation_id=result["correlation_id"],
            applied_at=result["applied_at"],
            message=result["message"],
            affected_folders=result["affected_folders"],
        )

    except ForbiddenError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BadRequestError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@router.get("/manual/state/{em_id}")
def get_manual_lock_state(
    em_id: int,
    current_user: CurrentUser,
    scope: str = Query(..., description="Folder scope: 'experts' or 'deliverables'"),
    db: Session = Depends(get_db),
) -> LockStateStatusResponse:
    """Get current lock state for an EM and scope.

    Args:
        em_id: Order/EM identifier
        scope: Folder scope
        current_user: Current authenticated user
        db: Database session

    Returns:
        Current lock state information
    """
    service = ManualLockService(db)

    try:
        result = service.get_current_lock_state(em_id, scope)
        return LockStateStatusResponse(
            em_id=result["em_id"],
            scope=result["scope"],
            states=result["states"],
        )

    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# CR (Change Request) endpoints


@router.post("/cr/open")
async def open_change_request(
    request: dict,
    current_user: PMUser,
    db: Session = Depends(get_db),
) -> dict:
    """Open a Change Request to temporarily unlock folders for 48 hours.

    Args:
        request: CR open request with em_id, scope, reason, duration_hours
        current_user: Current authenticated PM or Admin user
        db: Database session

    Returns:
        Created CR details
    """
    from uuid import uuid4

    from api.services.locks.cr_service import CRService

    service = CRService(db)

    try:
        # Validate request
        em_id = request.get("em_id")
        scope = request.get("scope")
        reason = request.get("reason")
        duration_hours = request.get("duration_hours", 48)

        if not all([em_id, scope, reason]):
            raise HTTPException(
                status_code=400, detail="Missing required fields: em_id, scope, reason"
            )

        # Create CR
        cr = await service.create_cr(
            em_id=em_id,
            scope=scope,
            reason=reason,
            created_by=UUID(current_user.id),  # Assuming user ID is available
            duration_hours=duration_hours,
            correlation_id=uuid4(),
        )

        return {
            "id": str(cr.id),
            "em_id": cr.em_id,
            "scope": cr.scope,
            "reason": cr.reason,
            "created_at": cr.created_at.isoformat(),
            "expires_at": cr.expires_at.isoformat(),
            "status": cr.status,
            "duration_hours": cr.duration_hours,
        }

    except BadRequestError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@router.post("/cr/close")
async def close_change_request(
    request: dict,
    current_user: PMUser,
    db: Session = Depends(get_db),
) -> dict:
    """Manually close a Change Request before its 48-hour expiry.

    Args:
        request: CR close request with cr_id and optional reason
        current_user: Current authenticated PM or Admin user
        db: Database session

    Returns:
        Closed CR details
    """
    from uuid import uuid4

    from api.services.locks.cr_service import CRService

    service = CRService(db)

    try:
        # Validate request
        cr_id = request.get("cr_id")
        reason = request.get("reason")

        if not cr_id:
            raise HTTPException(status_code=400, detail="Missing required field: cr_id")

        # Close CR
        cr = await service.close_cr(
            cr_id=UUID(cr_id),
            closed_by=UUID(current_user.id),
            reason=reason,
            correlation_id=uuid4(),
        )

        return {
            "id": str(cr.id),
            "em_id": cr.em_id,
            "scope": cr.scope,
            "status": cr.status,
            "closed_at": cr.closed_at.isoformat() if cr.closed_at else None,
            "closed_by": str(cr.closed_by) if cr.closed_by else None,
        }

    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@router.get("/cr/{em_id}")
async def get_active_crs(
    em_id: int,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[dict]:
    """Get all active Change Requests for an EM.

    Args:
        em_id: Order/EM identifier
        current_user: Current authenticated user
        db: Database session

    Returns:
        List of active CRs with expiry countdowns
    """
    from datetime import datetime

    from api.services.locks.cr_service import CRService

    service = CRService(db)

    try:
        crs = await service.get_active_crs(em_id)
        now = datetime.now(UTC)

        return [
            {
                "id": str(cr.id),
                "scope": cr.scope,
                "reason": cr.reason,
                "created_by": str(cr.created_by),
                "created_at": cr.created_at.isoformat(),
                "expires_at": cr.expires_at.isoformat(),
                "status": cr.status,
                "remaining_hours": max(0, int((cr.expires_at - now).total_seconds() / 3600)),
                "remaining_minutes": max(0, int((cr.expires_at - now).total_seconds() / 60)),
            }
            for cr in crs
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")
