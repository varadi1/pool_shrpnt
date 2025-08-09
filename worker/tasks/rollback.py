"""Rollback and compensation tasks for provisioning failures."""

import asyncio
from datetime import datetime
from typing import Any

from celery import Task
from celery.utils.log import get_task_logger

from api.core.database import SessionLocal
from api.models.contract import OrderEm
from api.services.auth.graph_auth import GraphAuthService
from api.services.sharepoint.sharepoint_service import SharePointService
from api.services.teams.teams_service import TeamsService
from worker.app import app

logger = get_task_logger(__name__)


class RollbackTask(Task):
    """Base task for rollback operations."""

    autoretry_for = (Exception,)
    retry_kwargs = {
        "max_retries": 3,
        "countdown": 30,
    }
    retry_backoff = True
    retry_backoff_max = 300


@app.task(bind=True, base=RollbackTask, name="worker.tasks.rollback.rollback_provisioning")
def rollback_provisioning(
    self,
    order_id: int,
    provisioned_resources: dict[str, Any],
    correlation_id: str,
    reason: str,
) -> dict[str, Any]:
    """Rollback a failed provisioning operation.

    Args:
        order_id: Order ID that failed provisioning
        provisioned_resources: Resources that were created and need cleanup
        correlation_id: Correlation ID for tracking
        reason: Reason for rollback

    Returns:
        Rollback results
    """
    logger.info(
        f"Starting rollback for order {order_id}",
        extra={
            "order_id": order_id,
            "correlation_id": correlation_id,
            "reason": reason,
            "task_id": self.request.id,
        },
    )

    # Run async rollback
    result = asyncio.run(
        _rollback_provisioning_async(
            order_id=order_id,
            provisioned_resources=provisioned_resources,
            correlation_id=correlation_id,
            reason=reason,
        )
    )

    return result


async def _rollback_provisioning_async(
    order_id: int,
    provisioned_resources: dict[str, Any],
    correlation_id: str,
    reason: str,
) -> dict[str, Any]:
    """Async implementation of provisioning rollback.

    Args:
        order_id: Order ID
        provisioned_resources: Resources to clean up
        correlation_id: Correlation ID
        reason: Rollback reason

    Returns:
        Rollback results
    """
    rollback_results = {
        "order_id": order_id,
        "correlation_id": correlation_id,
        "reason": reason,
        "timestamp": datetime.utcnow().isoformat(),
        "cleaned_resources": [],
        "failed_cleanups": [],
        "status": "in_progress",
    }

    try:
        # Initialize services
        auth_service = GraphAuthService()
        teams_service = TeamsService(auth_service)
        sharepoint_service = SharePointService(auth_service)

        # Rollback in reverse order of creation

        # 1. Remove SharePoint permissions if applied
        if "permissions" in provisioned_resources:
            logger.info(f"Rolling back permissions for order {order_id}")
            for permission in provisioned_resources["permissions"].get("details", []):
                try:
                    # Restore inheritance on folders
                    if permission.get("inheritance_broken"):
                        await sharepoint_service.restore_folder_inheritance(
                            site_id=provisioned_resources["sharepoint"]["site_id"],
                            folder_id=permission["folder_id"],
                        )
                        rollback_results["cleaned_resources"].append(
                            {
                                "type": "permission",
                                "id": permission["folder_id"],
                                "action": "inheritance_restored",
                            }
                        )
                except Exception as e:
                    logger.error(f"Failed to rollback permission: {str(e)}")
                    rollback_results["failed_cleanups"].append(
                        {
                            "type": "permission",
                            "id": permission.get("folder_id"),
                            "error": str(e),
                        }
                    )

        # 2. Delete created folders
        if "folders" in provisioned_resources:
            logger.info(f"Rolling back folders for order {order_id}")
            folders = provisioned_resources["folders"].get("folders", [])
            # Delete in reverse order (deepest first)
            for folder in reversed(folders):
                try:
                    await sharepoint_service.delete_folder(
                        site_id=provisioned_resources["sharepoint"]["site_id"],
                        folder_id=folder["id"],
                    )
                    rollback_results["cleaned_resources"].append(
                        {
                            "type": "folder",
                            "id": folder["id"],
                            "name": folder["name"],
                            "action": "deleted",
                        }
                    )
                except Exception as e:
                    logger.error(f"Failed to delete folder {folder['name']}: {str(e)}")
                    rollback_results["failed_cleanups"].append(
                        {
                            "type": "folder",
                            "id": folder["id"],
                            "name": folder["name"],
                            "error": str(e),
                        }
                    )

        # 3. Delete document library
        if "sharepoint" in provisioned_resources and provisioned_resources["sharepoint"].get(
            "library_id"
        ):
            logger.info(f"Rolling back document library for order {order_id}")
            try:
                await sharepoint_service.delete_document_library(
                    site_id=provisioned_resources["sharepoint"]["site_id"],
                    library_id=provisioned_resources["sharepoint"]["library_id"],
                )
                rollback_results["cleaned_resources"].append(
                    {
                        "type": "document_library",
                        "id": provisioned_resources["sharepoint"]["library_id"],
                        "name": provisioned_resources["sharepoint"]["library_name"],
                        "action": "deleted",
                    }
                )
            except Exception as e:
                logger.error(f"Failed to delete document library: {str(e)}")
                rollback_results["failed_cleanups"].append(
                    {
                        "type": "document_library",
                        "id": provisioned_resources["sharepoint"]["library_id"],
                        "error": str(e),
                    }
                )

        # 4. Delete Teams channels
        if "teams" in provisioned_resources and "channels" in provisioned_resources["teams"]:
            logger.info(f"Rolling back Teams channels for order {order_id}")
            for channel in provisioned_resources["teams"]["channels"]:
                try:
                    await teams_service.delete_channel(
                        team_id=provisioned_resources["teams"]["id"],
                        channel_id=channel["id"],
                    )
                    rollback_results["cleaned_resources"].append(
                        {
                            "type": "channel",
                            "id": channel["id"],
                            "name": channel["displayName"],
                            "action": "deleted",
                        }
                    )
                except Exception as e:
                    logger.error(f"Failed to delete channel {channel['displayName']}: {str(e)}")
                    rollback_results["failed_cleanups"].append(
                        {
                            "type": "channel",
                            "id": channel["id"],
                            "name": channel["displayName"],
                            "error": str(e),
                        }
                    )

        # 5. Delete Teams group (this also deletes the associated SharePoint site)
        if "teams" in provisioned_resources and provisioned_resources["teams"].get("id"):
            logger.info(f"Rolling back Teams group for order {order_id}")
            try:
                await teams_service.delete_team(provisioned_resources["teams"]["id"])
                rollback_results["cleaned_resources"].append(
                    {
                        "type": "team",
                        "id": provisioned_resources["teams"]["id"],
                        "name": provisioned_resources["teams"]["displayName"],
                        "action": "deleted",
                    }
                )
            except Exception as e:
                logger.error(f"Failed to delete team: {str(e)}")
                rollback_results["failed_cleanups"].append(
                    {
                        "type": "team",
                        "id": provisioned_resources["teams"]["id"],
                        "error": str(e),
                    }
                )

        # Update order status
        db = SessionLocal()
        try:
            order = db.query(OrderEm).filter(OrderEm.id == order_id).first()
            if order:
                order.provisioning_status = "rollback_completed"
                order.updated_at = datetime.utcnow()
                db.commit()
        finally:
            db.close()

        # Determine final status
        if rollback_results["failed_cleanups"]:
            rollback_results["status"] = "partial_rollback"
            rollback_results["message"] = (
                f"Rollback completed with {len(rollback_results['failed_cleanups'])} failures"
            )
        else:
            rollback_results["status"] = "complete_rollback"
            rollback_results["message"] = "All provisioned resources successfully rolled back"

        logger.info(
            f"Rollback completed for order {order_id}",
            extra={
                "order_id": order_id,
                "correlation_id": correlation_id,
                "status": rollback_results["status"],
                "cleaned": len(rollback_results["cleaned_resources"]),
                "failed": len(rollback_results["failed_cleanups"]),
            },
        )

        return rollback_results

    except Exception as exc:
        rollback_results["status"] = "rollback_failed"
        rollback_results["error"] = str(exc)

        logger.error(
            f"Rollback failed for order {order_id}: {str(exc)}",
            extra={
                "order_id": order_id,
                "correlation_id": correlation_id,
                "error": str(exc),
            },
        )

        # Update order status
        db = SessionLocal()
        try:
            order = db.query(OrderEm).filter(OrderEm.id == order_id).first()
            if order:
                order.provisioning_status = "rollback_failed"
                order.updated_at = datetime.utcnow()
                db.commit()
        finally:
            db.close()

        raise


@app.task(bind=True, name="worker.tasks.rollback.cleanup_orphaned_resources")
def cleanup_orphaned_resources(
    self,
    older_than_hours: int = 24,
    dry_run: bool = True,
) -> dict[str, Any]:
    """Clean up orphaned resources from failed provisioning attempts.

    Args:
        older_than_hours: Clean resources older than this many hours
        dry_run: If True, only report what would be cleaned

    Returns:
        Cleanup results
    """
    logger.info(
        "Starting orphaned resource cleanup",
        extra={
            "older_than_hours": older_than_hours,
            "dry_run": dry_run,
            "task_id": self.request.id,
        },
    )

    result = asyncio.run(
        _cleanup_orphaned_resources_async(
            older_than_hours=older_than_hours,
            dry_run=dry_run,
        )
    )

    return result


async def _cleanup_orphaned_resources_async(
    older_than_hours: int,
    dry_run: bool,
) -> dict[str, Any]:
    """Async implementation of orphaned resource cleanup.

    Args:
        older_than_hours: Age threshold
        dry_run: Whether to actually delete

    Returns:
        Cleanup results
    """
    results = {
        "timestamp": datetime.utcnow().isoformat(),
        "dry_run": dry_run,
        "orphaned_teams": [],
        "orphaned_sites": [],
        "cleaned_count": 0,
        "errors": [],
    }

    try:
        # Initialize services
        auth_service = GraphAuthService()
        TeamsService(auth_service)
        SharePointService(auth_service)

        # Find teams with poolDRV naming pattern that aren't in the database
        # This would need implementation based on your naming conventions
        # For now, this is a placeholder

        logger.info(
            "Orphaned resource cleanup completed",
            extra={
                "dry_run": dry_run,
                "cleaned": results["cleaned_count"],
            },
        )

        return results

    except Exception as exc:
        logger.error(f"Orphaned resource cleanup failed: {str(exc)}")
        results["error"] = str(exc)
        raise
