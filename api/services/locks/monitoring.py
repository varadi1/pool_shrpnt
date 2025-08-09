"""Monitoring and health checks for lock system."""

import json
import os
from datetime import UTC, datetime, timedelta
from typing import Any

from redis import ConnectionPool, Redis
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.core.logging import get_logger
from api.models.lock import LockRule, LockState

logger = get_logger(__name__)

# Redis configuration from environment variables
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_MONITORING_DB", "2"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")
REDIS_MAX_CONNECTIONS = int(os.getenv("REDIS_MAX_CONNECTIONS", "50"))

# Create connection pool for better performance
redis_pool = ConnectionPool(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=REDIS_DB,
    password=REDIS_PASSWORD,
    max_connections=REDIS_MAX_CONNECTIONS,
    decode_responses=True,
)

# Redis client for metrics storage
redis_client = Redis(connection_pool=redis_pool)

# Metric keys
METRIC_LAST_EVALUATION = "locks:metrics:last_evaluation"
METRIC_EVALUATION_LATENCY = "locks:metrics:evaluation_latency"
METRIC_TRANSITION_SUCCESS = "locks:metrics:transition_success"
METRIC_TRANSITION_FAILURE = "locks:metrics:transition_failure"
METRIC_ACTIVE_LOCKS = "locks:metrics:active_locks"
METRIC_HEALTH_STATUS = "locks:health:status"


class LockMonitoringService:
    """Service for monitoring lock system health and metrics."""

    def __init__(self, db: Session):
        """Initialize monitoring service.

        Args:
            db: Database session
        """
        self.db = db

    def check_scheduler_health(self) -> dict[str, Any]:
        """Check health of the lock scheduler (subtask 11).

        Returns:
            Health check results
        """
        health_status = {
            "healthy": True,
            "checks": {},
            "timestamp": datetime.now(UTC).isoformat(),
        }

        # Check 1: Last evaluation time
        last_eval = redis_client.get(METRIC_LAST_EVALUATION)
        if last_eval:
            last_eval_time = datetime.fromisoformat(last_eval)
            time_since_eval = datetime.now(UTC) - last_eval_time

            health_status["checks"]["last_evaluation"] = {
                "timestamp": last_eval,
                "minutes_ago": time_since_eval.total_seconds() / 60,
                "healthy": time_since_eval < timedelta(minutes=30),
            }

            # Alert if missed evaluation (subtask 14)
            if time_since_eval > timedelta(minutes=30):
                health_status["healthy"] = False
                self._send_alert(
                    "CRITICAL: Lock evaluation missed",
                    f"No evaluation for {time_since_eval.total_seconds() / 60:.1f} minutes",
                )
        else:
            health_status["checks"]["last_evaluation"] = {
                "healthy": False,
                "error": "No evaluation data found",
            }
            health_status["healthy"] = False

        # Check 2: Database connectivity
        try:
            from sqlalchemy import text

            self.db.execute(text("SELECT 1"))
            health_status["checks"]["database"] = {"healthy": True}
        except Exception as e:
            health_status["checks"]["database"] = {
                "healthy": False,
                "error": str(e),
            }
            health_status["healthy"] = False

        # Check 3: Redis connectivity
        try:
            redis_client.ping()
            health_status["checks"]["redis"] = {"healthy": True}
        except Exception as e:
            health_status["checks"]["redis"] = {
                "healthy": False,
                "error": str(e),
            }
            health_status["healthy"] = False

        # Check 4: Active rules exist
        active_rules_count = (
            self.db.query(func.count(LockRule.id)).filter(LockRule.is_active).scalar()
        )

        health_status["checks"]["active_rules"] = {
            "count": active_rules_count,
            "healthy": active_rules_count > 0,
        }

        # Store health status
        redis_client.setex(
            METRIC_HEALTH_STATUS,
            300,  # 5 minutes TTL
            json.dumps(health_status),
        )

        return health_status

    def record_evaluation_latency(self, evaluation_run_id: str, duration_ms: float) -> None:
        """Record job execution latency (subtask 12).

        Args:
            evaluation_run_id: Evaluation run identifier
            duration_ms: Duration in milliseconds
        """
        # Store in sorted set with timestamp as score
        timestamp = datetime.now(UTC).timestamp()
        redis_client.zadd(
            METRIC_EVALUATION_LATENCY,
            {f"{evaluation_run_id}:{duration_ms}": timestamp},
        )

        # Keep only last 1000 entries
        redis_client.zremrangebyrank(METRIC_EVALUATION_LATENCY, 0, -1001)

        # Log if latency is high
        if duration_ms > 5000:  # > 5 seconds
            logger.warning(
                f"High evaluation latency detected: {duration_ms}ms",
                extra={
                    "evaluation_run_id": evaluation_run_id,
                    "duration_ms": duration_ms,
                },
            )

    def record_transition_result(
        self,
        order_em_id: int,
        folder_path: str,
        success: bool,
        duration_ms: float | None = None,
    ) -> None:
        """Track transition success/failure rates (subtask 13).

        Args:
            order_em_id: Order/EM identifier
            folder_path: Folder path
            success: Whether transition succeeded
            duration_ms: Duration if available
        """
        timestamp = datetime.now(UTC)
        hour_key = timestamp.strftime("%Y%m%d%H")

        if success:
            # Increment success counter
            redis_client.hincrby(f"{METRIC_TRANSITION_SUCCESS}:{hour_key}", "count", 1)
            if duration_ms:
                redis_client.hincrby(
                    f"{METRIC_TRANSITION_SUCCESS}:{hour_key}",
                    "total_duration_ms",
                    int(duration_ms),
                )
        else:
            # Increment failure counter
            redis_client.hincrby(f"{METRIC_TRANSITION_FAILURE}:{hour_key}", "count", 1)

            # Log failure details
            redis_client.lpush(
                f"{METRIC_TRANSITION_FAILURE}:details",
                json.dumps(
                    {
                        "order_em_id": order_em_id,
                        "folder_path": folder_path,
                        "timestamp": timestamp.isoformat(),
                    }
                ),
            )
            redis_client.ltrim(f"{METRIC_TRANSITION_FAILURE}:details", 0, 99)

        # Set TTL on hourly metrics (keep for 7 days)
        redis_client.expire(f"{METRIC_TRANSITION_SUCCESS}:{hour_key}", 604800)
        redis_client.expire(f"{METRIC_TRANSITION_FAILURE}:{hour_key}", 604800)

    def get_dashboard_metrics(self) -> dict[str, Any]:
        """Get metrics for dashboard display (subtask 15).

        Returns:
            Dashboard metrics
        """
        current_hour = datetime.now(UTC).strftime("%Y%m%d%H")

        # Get current hour metrics
        success_data = redis_client.hgetall(f"{METRIC_TRANSITION_SUCCESS}:{current_hour}")
        failure_data = redis_client.hgetall(f"{METRIC_TRANSITION_FAILURE}:{current_hour}")

        success_count = int(success_data.get("count", 0))
        failure_count = int(failure_data.get("count", 0))
        total_count = success_count + failure_count

        metrics = {
            "timestamp": datetime.now(UTC).isoformat(),
            "current_hour": {
                "success_count": success_count,
                "failure_count": failure_count,
                "success_rate": ((success_count / total_count * 100) if total_count > 0 else 0),
                "avg_duration_ms": (
                    int(success_data.get("total_duration_ms", 0)) / success_count
                    if success_count > 0
                    else 0
                ),
            },
        }

        # Get last 24 hours trend
        hourly_metrics = []
        for i in range(24):
            hour_time = datetime.now(UTC) - timedelta(hours=i)
            hour_key = hour_time.strftime("%Y%m%d%H")

            success_data = redis_client.hgetall(f"{METRIC_TRANSITION_SUCCESS}:{hour_key}")
            failure_data = redis_client.hgetall(f"{METRIC_TRANSITION_FAILURE}:{hour_key}")

            hourly_metrics.append(
                {
                    "hour": hour_key,
                    "success": int(success_data.get("count", 0)),
                    "failure": int(failure_data.get("count", 0)),
                }
            )

        metrics["hourly_trend"] = hourly_metrics

        # Get lock state distribution
        lock_states = (
            self.db.query(
                LockState.current_state,
                func.count(LockState.id).label("count"),
            )
            .group_by(LockState.current_state)
            .all()
        )

        metrics["lock_state_distribution"] = [
            {"state": state, "count": count} for state, count in lock_states
        ]

        # Get active rules count
        metrics["active_rules"] = (
            self.db.query(func.count(LockRule.id)).filter(LockRule.is_active).scalar()
        )

        # Get recent failures
        recent_failures = []
        failure_details = redis_client.lrange(f"{METRIC_TRANSITION_FAILURE}:details", 0, 9)
        for detail in failure_details:
            recent_failures.append(json.loads(detail))
        metrics["recent_failures"] = recent_failures

        # Get evaluation latency stats
        latency_entries = redis_client.zrange(METRIC_EVALUATION_LATENCY, -100, -1, withscores=False)
        if latency_entries:
            latencies = [float(entry.split(":")[1]) for entry in latency_entries if ":" in entry]
            if latencies:
                metrics["evaluation_latency"] = {
                    "avg_ms": sum(latencies) / len(latencies),
                    "max_ms": max(latencies),
                    "min_ms": min(latencies),
                    "sample_size": len(latencies),
                }

        # Get health status
        health_status = redis_client.get(METRIC_HEALTH_STATUS)
        if health_status:
            metrics["health_status"] = json.loads(health_status)

        return metrics

    def record_evaluation_completed(self, evaluation_run_id: str) -> None:
        """Record that an evaluation has completed.

        Args:
            evaluation_run_id: Evaluation run identifier
        """
        redis_client.set(METRIC_LAST_EVALUATION, datetime.now(UTC).isoformat())

        # Also record in a time series for history
        timestamp = datetime.now(UTC).timestamp()
        redis_client.zadd(
            "locks:metrics:evaluation_history",
            {evaluation_run_id: timestamp},
        )
        # Keep only last 1000 evaluations
        redis_client.zremrangebyrank("locks:metrics:evaluation_history", 0, -1001)

    def check_missed_evaluations(self) -> list[dict[str, Any]]:
        """Check for missed evaluations and return alerts.

        Returns:
            List of missed evaluation alerts
        """
        alerts = []

        last_eval = redis_client.get(METRIC_LAST_EVALUATION)
        if not last_eval:
            alerts.append(
                {
                    "severity": "CRITICAL",
                    "message": "No evaluation data found",
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            )
            return alerts

        last_eval_time = datetime.fromisoformat(last_eval)
        time_since_eval = datetime.now(UTC) - last_eval_time

        # Warning at 20 minutes
        if time_since_eval > timedelta(minutes=20):
            alerts.append(
                {
                    "severity": "WARNING",
                    "message": (
                        f"No evaluation for {time_since_eval.total_seconds() / 60:.1f} minutes"
                    ),
                    "last_evaluation": last_eval,
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            )

        # Critical at 30 minutes
        if time_since_eval > timedelta(minutes=30):
            alerts.append(
                {
                    "severity": "CRITICAL",
                    "message": (
                        f"Evaluation missed! No run for "
                        f"{time_since_eval.total_seconds() / 60:.1f} minutes"
                    ),
                    "last_evaluation": last_eval,
                    "timestamp": datetime.now(UTC).isoformat(),
                }
            )

        return alerts

    def get_scheduler_reliability_metrics(self) -> dict[str, Any]:
        """Calculate scheduler reliability metrics.

        Returns:
            Reliability metrics
        """
        # Get evaluation history
        evaluation_history = redis_client.zrange(
            "locks:metrics:evaluation_history",
            -100,
            -1,
            withscores=True,
        )

        if len(evaluation_history) < 2:
            return {
                "reliability_percentage": 0,
                "sample_size": len(evaluation_history),
                "message": "Insufficient data",
            }

        # Calculate intervals between evaluations
        intervals = []
        for i in range(1, len(evaluation_history)):
            prev_timestamp = evaluation_history[i - 1][1]
            curr_timestamp = evaluation_history[i][1]
            interval_minutes = (curr_timestamp - prev_timestamp) / 60
            intervals.append(interval_minutes)

        # Expected interval is 15 minutes, allow 2 minute tolerance
        expected_interval = 15
        tolerance = 2

        on_time_count = sum(
            1
            for interval in intervals
            if expected_interval - tolerance <= interval <= expected_interval + tolerance
        )

        reliability_percentage = (on_time_count / len(intervals)) * 100

        return {
            "reliability_percentage": reliability_percentage,
            "on_time_executions": on_time_count,
            "total_executions": len(intervals),
            "avg_interval_minutes": sum(intervals) / len(intervals) if intervals else 0,
            "max_interval_minutes": max(intervals) if intervals else 0,
            "min_interval_minutes": min(intervals) if intervals else 0,
        }

    def record_scheduler_execution(
        self,
        scheduler_run_id: str,
        ems_processed: int,
        execution_time_ms: float,
        failed_count: int = 0,
    ) -> None:
        """Track scheduler execution time and EMs processed (Task 3 - subtask 1,2).

        Args:
            scheduler_run_id: Unique identifier for the scheduler run
            ems_processed: Number of EMs processed in this run
            execution_time_ms: Total execution time in milliseconds
            failed_count: Number of failed EM transitions
        """
        timestamp = datetime.now(UTC)

        # Store metrics in Redis with time series
        metrics_key = f"locks:scheduler:metrics:{timestamp.strftime('%Y%m%d')}"

        # Record execution details
        redis_client.hset(
            metrics_key,
            mapping={
                f"{scheduler_run_id}:ems_processed": ems_processed,
                f"{scheduler_run_id}:execution_time_ms": execution_time_ms,
                f"{scheduler_run_id}:failed_count": failed_count,
                f"{scheduler_run_id}:timestamp": timestamp.isoformat(),
            },
        )

        # Set TTL for 30 days
        redis_client.expire(metrics_key, 2592000)

        # Update running averages
        avg_key = "locks:scheduler:metrics:averages"
        current_avg = redis_client.hgetall(avg_key)

        if current_avg:
            # Calculate new averages
            sample_count = int(current_avg.get("sample_count", 0)) + 1
            avg_ems = (
                float(current_avg.get("avg_ems_processed", 0)) * (sample_count - 1) + ems_processed
            ) / sample_count
            avg_time = (
                float(current_avg.get("avg_execution_time_ms", 0)) * (sample_count - 1)
                + execution_time_ms
            ) / sample_count
            avg_success_rate = (
                float(current_avg.get("avg_success_rate", 100)) * (sample_count - 1)
                + ((ems_processed - failed_count) / ems_processed * 100 if ems_processed > 0 else 0)
            ) / sample_count
        else:
            sample_count = 1
            avg_ems = ems_processed
            avg_time = execution_time_ms
            avg_success_rate = (
                ((ems_processed - failed_count) / ems_processed * 100) if ems_processed > 0 else 0
            )

        redis_client.hset(
            avg_key,
            mapping={
                "sample_count": sample_count,
                "avg_ems_processed": avg_ems,
                "avg_execution_time_ms": avg_time,
                "avg_success_rate": avg_success_rate,
                "last_updated": timestamp.isoformat(),
            },
        )

        # Check performance thresholds and alert if needed (Task 3 - subtask 4)
        if execution_time_ms > 300000:  # > 5 minutes
            self._send_alert(
                "Performance Degradation Detected",
                f"Scheduler execution took {execution_time_ms/1000:.1f}s for {ems_processed} EMs",
            )

        # Alert if success rate is low
        if ems_processed > 0 and failed_count > ems_processed * 0.1:  # > 10% failure rate
            self._send_alert(
                "High Failure Rate in Lock Transitions",
                f"Failed {failed_count}/{ems_processed} transitions "
                f"({failed_count/ems_processed*100:.1f}%)",
            )

    def get_state_transition_metrics(self) -> dict[str, Any]:
        """Measure state transition success rate (Task 3 - subtask 3).

        Returns:
            State transition metrics
        """
        # Get last 24 hours of transition data
        metrics = {
            "timestamp": datetime.now(UTC).isoformat(),
            "transitions": [],
            "summary": {},
        }

        # Collect hourly transition data
        total_success = 0
        total_failure = 0

        for i in range(24):
            hour_time = datetime.now(UTC) - timedelta(hours=i)
            hour_key = hour_time.strftime("%Y%m%d%H")

            success_data = redis_client.hgetall(f"{METRIC_TRANSITION_SUCCESS}:{hour_key}")
            failure_data = redis_client.hgetall(f"{METRIC_TRANSITION_FAILURE}:{hour_key}")

            success_count = int(success_data.get("count", 0))
            failure_count = int(failure_data.get("count", 0))

            total_success += success_count
            total_failure += failure_count

            if success_count > 0 or failure_count > 0:
                metrics["transitions"].append(
                    {
                        "hour": hour_key,
                        "success": success_count,
                        "failure": failure_count,
                        "success_rate": (
                            (success_count / (success_count + failure_count) * 100)
                            if (success_count + failure_count) > 0
                            else 0
                        ),
                        "avg_duration_ms": (
                            int(success_data.get("total_duration_ms", 0)) / success_count
                            if success_count > 0
                            else 0
                        ),
                    }
                )

        # Calculate summary metrics
        total_transitions = total_success + total_failure
        metrics["summary"] = {
            "total_transitions": total_transitions,
            "total_success": total_success,
            "total_failure": total_failure,
            "overall_success_rate": (
                (total_success / total_transitions * 100) if total_transitions > 0 else 0
            ),
            "period": "last_24_hours",
        }

        # Get current state distribution
        states = (
            self.db.query(LockState.current_state, func.count(LockState.id).label("count"))
            .group_by(LockState.current_state)
            .all()
        )

        metrics["current_state_distribution"] = {state: count for state, count in states}

        return metrics

    def create_lock_state_dashboard(self) -> dict[str, Any]:
        """Create dashboard for lock state overview (Task 3 - subtask 5).

        Returns:
            Dashboard data with comprehensive lock system metrics
        """
        dashboard = {
            "timestamp": datetime.now(UTC).isoformat(),
            "system_health": self.check_scheduler_health(),
            "scheduler_metrics": {},
            "transition_metrics": self.get_state_transition_metrics(),
            "performance_metrics": {},
            "alerts": [],
        }

        # Get scheduler performance metrics
        avg_metrics = redis_client.hgetall("locks:scheduler:metrics:averages")
        if avg_metrics:
            dashboard["scheduler_metrics"] = {
                "average_ems_per_run": float(avg_metrics.get("avg_ems_processed", 0)),
                "average_execution_time_ms": float(avg_metrics.get("avg_execution_time_ms", 0)),
                "average_success_rate": float(avg_metrics.get("avg_success_rate", 0)),
                "sample_size": int(avg_metrics.get("sample_count", 0)),
                "last_updated": avg_metrics.get("last_updated"),
            }

        # Get performance metrics
        reliability = self.get_scheduler_reliability_metrics()
        dashboard["performance_metrics"]["reliability"] = reliability

        # Get recent scheduler runs from database
        from api.models.scheduler import SchedulerRun

        recent_runs = (
            self.db.query(SchedulerRun)
            .filter(SchedulerRun.run_type == "lock_evaluation")
            .order_by(SchedulerRun.started_at.desc())
            .limit(10)
            .all()
        )

        dashboard["performance_metrics"]["recent_runs"] = [
            {
                "id": str(run.id),
                "started_at": run.started_at.isoformat() if run.started_at else None,
                "completed_at": run.completed_at.isoformat() if run.completed_at else None,
                "duration_seconds": (
                    (run.completed_at - run.started_at).total_seconds()
                    if run.completed_at and run.started_at
                    else None
                ),
                "ems_processed": run.ems_processed,
                "ems_failed": run.ems_failed,
                "status": run.status,
            }
            for run in recent_runs
        ]

        # Check for performance issues
        if avg_metrics:
            avg_time = float(avg_metrics.get("avg_execution_time_ms", 0))
            if avg_time > 300000:  # > 5 minutes average
                dashboard["alerts"].append(
                    {
                        "severity": "WARNING",
                        "message": (
                            f"Average execution time is {avg_time/1000:.1f}s "
                            "(target: < 5 minutes)"
                        ),
                        "type": "performance",
                    }
                )

            avg_success = float(avg_metrics.get("avg_success_rate", 100))
            if avg_success < 90:
                dashboard["alerts"].append(
                    {
                        "severity": "WARNING",
                        "message": f"Average success rate is {avg_success:.1f}% (target: > 90%)",
                        "type": "reliability",
                    }
                )

        # Check for missed evaluations
        missed_alerts = self.check_missed_evaluations()
        dashboard["alerts"].extend(missed_alerts)

        # Get active alerts from Redis
        recent_alerts = redis_client.lrange("locks:alerts:recent", 0, 4)
        for alert_json in recent_alerts:
            alert = json.loads(alert_json)
            dashboard["alerts"].append(
                {
                    "severity": "ERROR",
                    "message": alert["message"],
                    "timestamp": alert["timestamp"],
                    "type": "system",
                }
            )

        # Summary statistics
        dashboard["summary"] = {
            "total_active_locks": self.db.query(func.count(LockState.id))
            .filter(LockState.current_state != "full_access")
            .scalar(),
            "total_ems_with_rules": self.db.query(func.count(LockRule.order_em_id.distinct()))
            .filter(LockRule.is_active)
            .scalar(),
            "scheduler_health": "healthy" if dashboard["system_health"]["healthy"] else "unhealthy",
            "active_alert_count": len(dashboard["alerts"]),
        }

        return dashboard

    def _send_alert(self, subject: str, message: str) -> None:
        """Send alert notification.

        Args:
            subject: Alert subject
            message: Alert message
        """
        # Log the alert
        logger.error(
            f"ALERT: {subject}",
            extra={
                "alert_subject": subject,
                "alert_message": message,
                "timestamp": datetime.now(UTC).isoformat(),
            },
        )

        # Store alert in Redis for monitoring dashboard
        alert_data = {
            "subject": subject,
            "message": message,
            "timestamp": datetime.now(UTC).isoformat(),
            "acknowledged": False,
        }

        # Store in Redis list for recent alerts
        redis_client.lpush("locks:alerts:recent", json.dumps(alert_data))
        redis_client.ltrim("locks:alerts:recent", 0, 99)  # Keep last 100 alerts

        # Also store in sorted set for time-based queries
        redis_client.zadd(
            "locks:alerts:history",
            {json.dumps(alert_data): datetime.now(UTC).timestamp()},
        )

        # Set alert flag for immediate attention
        redis_client.setex("locks:alerts:active", 300, "true")  # 5 minute TTL

        # In production, integrate with notification services:
        # - Email via SendGrid/SES
        # - Slack/Teams webhooks
        # - PagerDuty for critical alerts
        # - SMS for urgent issues

        # Example webhook integration (commented out for security):
        # webhook_url = os.getenv("ALERT_WEBHOOK_URL")
        # if webhook_url:
        #     import requests
        #     requests.post(webhook_url, json={"text": f"{subject}: {message}"})
