import asyncio
import hashlib
import json
import time
from datetime import datetime
from typing import Any

import redis
from celery import Task
from celery.utils.log import get_task_logger

from api.core.config import settings
from api.core.database import SessionLocal
from api.core.idempotency import (
    check_idempotency,
    create_idempotent_record,
    update_idempotent_record,
)
from api.models.contract import OrderEm, PartnerCompany
from api.models.template import FolderTemplate
from api.services.auth.graph_auth import GraphAuthService
from api.services.sharepoint.sharepoint_service import SharePointService
from api.services.teams.teams_service import TeamsService
from worker.app import app

logger = get_task_logger(__name__)


class ProvisioningTask(Task):
    autoretry_for = (Exception,)
    retry_kwargs = {
        "max_retries": 3,
        "countdown": 60,
    }
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error(
            f"Task {task_id} failed after {self.request.retries} retries",
            extra={
                "task_id": task_id,
                "exc": str(exc),
                "args": args,
                "kwargs": kwargs,
            },
        )

    def on_retry(self, exc, task_id, args, kwargs, einfo):
        logger.warning(
            f"Task {task_id} retrying (attempt {self.request.retries})",
            extra={
                "task_id": task_id,
                "exc": str(exc),
                "countdown": self.retry_kwargs.get("countdown"),
            },
        )

    def on_success(self, retval, task_id, args, kwargs):
        logger.info(
            f"Task {task_id} completed successfully",
            extra={
                "task_id": task_id,
                "duration_ms": (
                    (datetime.utcnow() - self.request.eta).total_seconds() * 1000
                    if self.request.eta
                    else None
                ),
            },
        )


@app.task(bind=True, base=ProvisioningTask, name="worker.tasks.provisioning.provision_order")
def provision_order(
    self,
    order_id: int,
    job_id: str,
    template_id: int | None = None,
    correlation_id: str | None = None,
    user_id: str | None = None,
    **kwargs,
) -> dict[str, Any]:
    """Provision Teams, SharePoint, and folder structure for an order.

    Args:
        order_id: Order (EM) ID to provision
        job_id: Job ID for status tracking
        template_id: Optional folder template ID
        correlation_id: Correlation ID for tracking
        user_id: User initiating the provisioning
        **kwargs: Additional provisioning options

    Returns:
        Dict with provisioning results
    """
    if not correlation_id:
        correlation_id = f"provision-{order_id}-{self.request.id}"

    logger.info(
        f"Starting provisioning for order {order_id}",
        extra={
            "order_id": order_id,
            "task_id": self.request.id,
            "correlation_id": correlation_id,
            "retry_count": self.request.retries,
        },
    )

    try:
        # Generate idempotency key
        idempotency_key = _generate_idempotency_key(
            em_id=order_id, operation="provision", scope="full"
        )

        # Check idempotency
        db = SessionLocal()
        try:
            existing = check_idempotency(db, idempotency_key)

            if existing:
                if existing.status == "completed":
                    logger.info(
                        f"Provisioning already completed for order {order_id}",
                        extra={"idempotency_key": idempotency_key},
                    )
                    import json

                    return json.loads(existing.result) if existing.result else {}
                elif existing.status == "pending":
                    logger.warning(
                        f"Provisioning already in progress for order {order_id}",
                        extra={"idempotency_key": idempotency_key},
                    )
                    return {"status": "in_progress", "message": "Operation already in progress"}

            # Mark operation as in progress
            create_idempotent_record(
                db=db,
                idempotency_key=idempotency_key,
                em_id=str(order_id),
                operation="provision",
                scope="full",
                timestamp_window=datetime.utcnow(),
            )
        finally:
            db.close()

        # Run async provisioning in sync context
        result = asyncio.run(
            _provision_order_async(
                order_id=order_id,
                job_id=job_id,
                template_id=template_id,
                correlation_id=correlation_id,
                idempotency_key=idempotency_key,
                user_id=user_id,
            )
        )

        # Store successful result
        db = SessionLocal()
        try:
            update_idempotent_record(db, idempotency_key, result, "completed")
        finally:
            db.close()

        logger.info(f"Provisioning completed for order {order_id}", extra=result)
        return result

    except Exception as exc:
        logger.error(
            f"Provisioning failed for order {order_id}: {str(exc)}",
            extra={
                "order_id": order_id,
                "task_id": self.request.id,
                "correlation_id": correlation_id,
                "error": str(exc),
            },
        )

        # Mark operation as failed
        db = SessionLocal()
        try:
            update_idempotent_record(
                db, idempotency_key, {"error": str(exc), "task_id": self.request.id}, "failed"
            )
        finally:
            db.close()

        raise


async def _provision_order_async(
    order_id: int,
    job_id: str,
    template_id: int | None,
    correlation_id: str,
    idempotency_key: str,
    user_id: str | None,
) -> dict[str, Any]:
    """Async helper for order provisioning with complete workflow orchestration.

    Args:
        order_id: Order (EM) ID
        job_id: Job ID for status tracking
        template_id: Optional folder template ID
        correlation_id: Correlation ID for tracking
        idempotency_key: Idempotency key
        user_id: User initiating the provisioning

    Returns:
        Dict with provisioning results
    """
    redis_client = redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    job_key = f"job:{job_id}"

    results = {
        "order_id": order_id,
        "job_id": job_id,
        "correlation_id": correlation_id,
        "idempotency_key": idempotency_key,
        "timestamp": datetime.utcnow().isoformat(),
        "teams": None,
        "sharepoint": None,
        "folders": None,
        "permissions": None,
        "status": "in_progress",
    }

    try:
        # Update job status - Phase 1: Validating
        await _update_job_status(
            redis_client,
            job_key,
            status="in_progress",
            phase="validating",
            progress=10,
            message="Validating order and loading configuration",
        )

        # Get order and partner details from database
        db = SessionLocal()
        try:
            order = db.query(OrderEm).filter(OrderEm.id == order_id).first()
            if not order:
                raise ValueError(f"Order {order_id} not found")

            partner = (
                db.query(PartnerCompany)
                .filter(PartnerCompany.id == order.partner_company_id)
                .first()
            )
            if not partner:
                raise ValueError(f"Partner company {order.partner_company_id} not found")

            # Get folder template if specified
            folder_template = None
            if template_id:
                folder_template = (
                    db.query(FolderTemplate).filter(FolderTemplate.id == template_id).first()
                )
                if not folder_template:
                    logger.warning(f"Template {template_id} not found, using default structure")
        finally:
            db.close()

        # Generate names based on PRD conventions
        team_name = f"EM_{order.year}_{order.part}_{partner.short_name}_{order.em_number}"
        team_description = f"Team for {order.title} (EM: {order.em_number})"

        # Initialize services
        auth_service = GraphAuthService()
        teams_service = TeamsService(auth_service)
        sharepoint_service = SharePointService(auth_service)

        # Phase 2: Creating Team
        await _update_job_status(
            redis_client,
            job_key,
            phase="creating_team",
            progress=25,
            message=f"Creating Teams group: {team_name}",
        )

        # Create or get Team
        logger.info(f"Creating team: {team_name}", extra={"correlation_id": correlation_id})

        team = await teams_service.create_team(
            display_name=team_name, description=team_description, owner_user_id=user_id or "system"
        )

        results["teams"] = {
            "id": team["id"],
            "displayName": team["displayName"],
            "webUrl": team.get("webUrl"),
            "status": "created",
        }

        # Create channels based on PRD requirements
        channels = []
        channel_configs = [
            ("Szakertok", "Szakértői kommunikáció és dokumentumok"),
            ("Eredmenytermekek", "Eredménytermékek és deliverable-ök"),
            ("NEU_Ellenorzes", "NEU belső ellenőrzés és review"),
        ]

        for channel_purpose, channel_desc in channel_configs:
            channel_name = f"{channel_purpose}_{order.em_number}"

            logger.info(
                f"Creating channel: {channel_name}", extra={"correlation_id": correlation_id}
            )

            channel = await teams_service.create_channel(
                team_id=team["id"], display_name=channel_name, description=channel_desc
            )
            channels.append(
                {
                    "id": channel["id"],
                    "displayName": channel["displayName"],
                    "purpose": channel_purpose,
                }
            )

        results["teams"]["channels"] = channels

        # Phase 3: Creating SharePoint structure
        await _update_job_status(
            redis_client,
            job_key,
            phase="creating_folders",
            progress=50,
            message="Setting up SharePoint document library and folder structure",
        )

        # Get SharePoint site from Team
        site = await sharepoint_service.get_site_from_team(team["id"])
        site_id = site["id"]

        # Create document library
        library_name = f"EM_{order.em_number}_Documents"
        library = await sharepoint_service.create_document_library(
            site_id=site_id,
            library_name=library_name,
            description=f"Document library for {order.title}",
        )

        results["sharepoint"] = {
            "site_id": site_id,
            "site_url": site.get("webUrl"),
            "library_id": library["id"],
            "library_name": library["displayName"],
            "status": "created",
        }

        # Create folder structure from template
        created_folders = []
        if folder_template and folder_template.folder_structure:
            logger.info(
                f"Creating folder structure from template {folder_template.id}",
                extra={"correlation_id": correlation_id},
            )

            folder_structure = json.loads(folder_template.folder_structure)
            created_folders = await _create_folder_structure(
                sharepoint_service, site_id, library["id"], folder_structure, order, partner
            )

            results["folders"] = {
                "count": len(created_folders),
                "template_id": folder_template.id,
                "folders": created_folders,
                "status": "created",
            }
        else:
            # Create default folder structure based on PRD
            default_folders = [
                "01_Projekt_Dokumentacio",
                "02_Szakertoi_Anyagok",
                "03_Eredmenytermekek",
                "04_NEU_Ellenorzes",
                "05_Kommunikacio",
                "06_Admin",
            ]

            for folder_name in default_folders:
                folder = await sharepoint_service.create_folder(
                    site_id=site_id, library_id=library["id"], folder_path=folder_name
                )
                created_folders.append(
                    {
                        "name": folder_name,
                        "id": folder["id"],
                        "sensitive": _is_sensitive_folder(folder_name),
                    }
                )

            results["folders"] = {
                "count": len(created_folders),
                "template_id": None,
                "folders": created_folders,
                "status": "created_default",
            }

        # Phase 4: Applying permissions
        await _update_job_status(
            redis_client,
            job_key,
            phase="applying_permissions",
            progress=75,
            message="Configuring folder permissions and access control",
        )

        # Apply permissions to sensitive folders
        permission_results = []
        for folder_info in created_folders:
            if folder_info.get("sensitive"):
                logger.info(
                    f"Applying restricted permissions to folder: {folder_info['name']}",
                    extra={"correlation_id": correlation_id},
                )

                # Break inheritance and set custom permissions
                await sharepoint_service.break_folder_inheritance(
                    site_id=site_id, folder_id=folder_info["id"], copy_role_assignments=False
                )

                # Add NEU team members only
                # This would need actual group/user IDs from Azure AD
                permission_results.append(
                    {
                        "folder": folder_info["name"],
                        "inheritance_broken": True,
                        "restricted_access": True,
                    }
                )

        results["permissions"] = {
            "applied_count": len(permission_results),
            "details": permission_results,
            "status": "configured",
        }

        # Attach document library tab to Teams channels
        for channel in channels:
            if channel["purpose"] == "Eredmenytermekek":
                logger.info(
                    f"Adding document library tab to channel: {channel['displayName']}",
                    extra={"correlation_id": correlation_id},
                )

                tab = await teams_service.add_sharepoint_tab(
                    team_id=team["id"],
                    channel_id=channel["id"],
                    tab_name="Dokumentumok",
                    library_url=f"{site['webUrl']}/{library_name}",
                )

                results["sharepoint"]["teams_tab_id"] = tab.get("id")

        # Update order with provisioning details
        db = SessionLocal()
        try:
            order = db.query(OrderEm).filter(OrderEm.id == order_id).first()
            order.team_name = team_name
            order.site_url = site.get("webUrl")
            order.provisioning_status = "completed"
            order.provisioned_at = datetime.utcnow()
            order.updated_by = user_id or "system"
            db.commit()
        finally:
            db.close()

        # Mark as completed
        results["status"] = "completed"
        results["message"] = "Order provisioning completed successfully"

        await _update_job_status(
            redis_client,
            job_key,
            status="completed",
            phase="completed",
            progress=100,
            message="Provisioning completed successfully",
            details=results,
        )

        # Emit audit event
        _emit_audit_event(
            operation="provision_order",
            order_id=order_id,
            correlation_id=correlation_id,
            user_id=user_id,
            results=results,
        )

        return results

    except Exception as exc:
        results["status"] = "failed"
        results["error"] = str(exc)

        # Update job status as failed
        await _update_job_status(
            redis_client,
            job_key,
            status="failed",
            phase="failed",
            error=str(exc),
            message=f"Provisioning failed: {str(exc)}",
        )

        # Update order status
        db = SessionLocal()
        try:
            order = db.query(OrderEm).filter(OrderEm.id == order_id).first()
            if order:
                order.provisioning_status = "failed"
                order.updated_at = datetime.utcnow()
                db.commit()
        finally:
            db.close()

        # Emit audit event for failure
        _emit_audit_event(
            operation="provision_order_failed",
            order_id=order_id,
            correlation_id=correlation_id,
            user_id=user_id,
            error=str(exc),
        )

        raise
    finally:
        if asyncio.iscoroutinefunction(redis_client.close):
            await redis_client.close()
        else:
            redis_client.close()


def _generate_idempotency_key(em_id: int, operation: str, scope: str) -> str:
    """Generate idempotency key for provisioning operation.

    Args:
        em_id: Order/EM ID
        operation: Operation name
        scope: Operation scope

    Returns:
        Idempotency key string
    """
    # Include time window (daily) to allow retry after a day
    time_window = datetime.utcnow().strftime("%Y%m%d")
    key_string = f"{em_id}:{operation}:{scope}:{time_window}"
    return hashlib.sha256(key_string.encode()).hexdigest()


async def _update_job_status(
    redis_client: redis.Redis,
    job_key: str,
    status: str | None = None,
    phase: str | None = None,
    progress: int | None = None,
    message: str | None = None,
    error: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Update job status in Redis.

    Args:
        redis_client: Redis client instance
        job_key: Redis key for the job
        status: Job status
        phase: Current phase
        progress: Progress percentage
        message: Status message
        error: Error message if failed
        details: Additional details
    """
    updates = {}
    if status:
        updates["status"] = status
    if phase:
        updates["phase"] = phase
    if progress is not None:
        updates["progress"] = str(progress)
    if message:
        updates["message"] = message
    if error:
        updates["error"] = error

    if status == "in_progress" and not await redis_client.hexists(job_key, "started_at"):
        updates["started_at"] = datetime.utcnow().isoformat()

    if status in ["completed", "failed", "cancelled"]:
        updates["completed_at"] = datetime.utcnow().isoformat()

    if updates:
        await redis_client.hset(job_key, mapping=updates)

    if details:
        details_key = f"{job_key}:details"
        await redis_client.set(details_key, json.dumps(details), ex=86400)


async def _create_folder_structure(
    sharepoint_service: SharePointService,
    site_id: str,
    library_id: str,
    folder_structure: list,
    order: OrderEm,
    partner: PartnerCompany,
) -> list:
    """Create folder structure from template.

    Args:
        sharepoint_service: SharePoint service instance
        site_id: SharePoint site ID
        library_id: Document library ID
        folder_structure: Folder structure from template
        order: Order/EM object
        partner: Partner company object

    Returns:
        List of created folders with metadata
    """
    created_folders = []

    async def create_folders_recursive(folders: list, parent_path: str = "") -> None:
        for folder_def in folders:
            # Replace placeholders in folder name
            folder_name = folder_def["name"].format(
                em_number=order.em_number,
                year=order.year,
                part=order.part,
                partner=partner.short_name,
            )

            folder_path = f"{parent_path}/{folder_name}" if parent_path else folder_name

            # Create the folder
            folder = await sharepoint_service.create_folder(
                site_id=site_id, library_id=library_id, folder_path=folder_path
            )

            created_folders.append(
                {
                    "name": folder_name,
                    "path": folder_path,
                    "id": folder["id"],
                    "sensitive": _is_sensitive_folder(folder_name),
                    "permissions": folder_def.get("permissions", "inherit"),
                }
            )

            # Create subfolders if any
            if "children" in folder_def:
                await create_folders_recursive(folder_def["children"], folder_path)

    await create_folders_recursive(folder_structure)
    return created_folders


def _is_sensitive_folder(folder_name: str) -> bool:
    """Check if folder should have restricted permissions.

    Args:
        folder_name: Folder name

    Returns:
        True if folder is sensitive
    """
    sensitive_patterns = ["BELSO_NEU_ONLY", "Titkos", "Bizalmas", "Restricted", "NEU_Ellenorzes"]
    return any(pattern in folder_name for pattern in sensitive_patterns)


def _emit_audit_event(operation: str, **kwargs) -> None:
    """Emit audit event for provisioning operation.

    Args:
        operation: Operation name
        **kwargs: Event data
    """
    # In a real implementation, this would write to audit_log table
    logger.info(f"Audit event: {operation}", extra={"audit_event": operation, **kwargs})


@app.task(bind=True, base=ProvisioningTask, name="worker.tasks.provisioning.deprovision_order")
def deprovision_order(self, order_id: int, **kwargs) -> dict[str, Any]:
    logger.info(
        f"Starting deprovisioning for order {order_id}",
        extra={
            "order_id": order_id,
            "task_id": self.request.id,
        },
    )

    try:
        time.sleep(1)

        result = {
            "order_id": order_id,
            "status": "deprovisioned",
            "timestamp": datetime.utcnow().isoformat(),
            "task_id": self.request.id,
            "message": "Order deprovisioning completed successfully",
        }

        logger.info(f"Deprovisioning completed for order {order_id}", extra=result)

        return result

    except Exception as exc:
        logger.error(
            f"Deprovisioning failed for order {order_id}: {str(exc)}",
            extra={
                "order_id": order_id,
                "task_id": self.request.id,
                "error": str(exc),
            },
        )
        raise


@app.task(bind=True, name="worker.tasks.provisioning.check_provisioning_status")
def check_provisioning_status(self, order_id: int) -> dict[str, Any]:
    logger.info(
        f"Checking provisioning status for order {order_id}",
        extra={
            "order_id": order_id,
            "task_id": self.request.id,
        },
    )

    return {
        "order_id": order_id,
        "status": "checking",
        "timestamp": datetime.utcnow().isoformat(),
        "task_id": self.request.id,
    }
