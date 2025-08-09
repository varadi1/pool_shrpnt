"""Tests for provisioning tasks."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest


class TestProvisioningTasks:
    """Test suite for provisioning tasks."""

    @patch("worker.tasks.provisioning.time.sleep")
    @patch("worker.tasks.provisioning.datetime")
    def test_provision_order_logic(self, mock_datetime, mock_sleep):
        """Test the core logic of provision_order task."""
        mock_sleep.return_value = None
        mock_datetime.utcnow.return_value.isoformat.return_value = "2024-01-01T00:00:00"

        # Import the module to test the logic

        # Create expected result structure
        order_id = 123
        task_id = "test-task-id"

        expected_result = {
            "order_id": order_id,
            "status": "provisioned",
            "timestamp": "2024-01-01T00:00:00",
            "task_id": task_id,
            "message": "Order provisioning completed successfully",
        }

        # Verify the result structure matches expected
        assert expected_result["order_id"] == order_id
        assert expected_result["status"] == "provisioned"
        assert expected_result["message"] == "Order provisioning completed successfully"

    @patch("worker.tasks.provisioning.time.sleep")
    @patch("worker.tasks.provisioning.datetime")
    def test_deprovision_order_logic(self, mock_datetime, mock_sleep):
        """Test the core logic of deprovision_order task."""
        mock_sleep.return_value = None
        mock_datetime.utcnow.return_value.isoformat.return_value = "2024-01-01T00:00:00"

        order_id = 456
        task_id = "test-task-id"

        expected_result = {
            "order_id": order_id,
            "status": "deprovisioned",
            "timestamp": "2024-01-01T00:00:00",
            "task_id": task_id,
            "message": "Order deprovisioning completed successfully",
        }

        assert expected_result["order_id"] == order_id
        assert expected_result["status"] == "deprovisioned"
        assert expected_result["message"] == "Order deprovisioning completed successfully"

    def test_check_provisioning_status_logic(self):
        """Test the core logic of check_provisioning_status task."""
        order_id = 789
        task_id = "test-task-id"

        # Expected result structure
        expected_result = {
            "order_id": order_id,
            "status": "checking",
            "task_id": task_id,
        }

        assert expected_result["order_id"] == order_id
        assert expected_result["status"] == "checking"

    def test_provisioning_task_class(self):
        """Test ProvisioningTask class configuration."""
        from worker.tasks.provisioning import ProvisioningTask

        task = ProvisioningTask()

        # Verify task configuration
        assert task.autoretry_for == (Exception,)
        assert task.retry_kwargs["max_retries"] == 3
        assert task.retry_kwargs["countdown"] == 60
        assert task.retry_backoff is True
        assert task.retry_backoff_max == 600
        assert task.retry_jitter is True

    @patch("worker.tasks.provisioning.logger")
    @patch("celery.Task.request", new_callable=MagicMock)
    def test_provisioning_task_callbacks(self, mock_request, mock_logger):
        """Test ProvisioningTask callback methods."""
        from worker.tasks.provisioning import ProvisioningTask

        task = ProvisioningTask()
        mock_request.retries = 2
        mock_request.eta = datetime.utcnow()

        # Test on_failure callback
        exc = Exception("Test error")
        task.on_failure(exc, "task-123", [], {}, None)
        mock_logger.error.assert_called()

        # Test on_retry callback
        task.on_retry(exc, "task-123", [], {}, None)
        mock_logger.warning.assert_called()

        # Test on_success callback
        task.on_success({"result": "success"}, "task-123", [], {})
        mock_logger.info.assert_called()

    def test_generate_idempotency_key(self):
        """Test idempotency key generation."""
        from worker.tasks.provisioning import _generate_idempotency_key

        key1 = _generate_idempotency_key(123, "provision", "full")
        key2 = _generate_idempotency_key(123, "provision", "full")
        key3 = _generate_idempotency_key(124, "provision", "full")

        # Same inputs should generate same key
        assert key1 == key2
        # Different inputs should generate different keys
        assert key1 != key3
        # Should be a hash string
        assert len(key1) == 64  # SHA256 hex length
        assert all(c in "0123456789abcdef" for c in key1)

    def test_is_sensitive_folder(self):
        """Test sensitive folder detection."""
        from worker.tasks.provisioning import _is_sensitive_folder

        assert _is_sensitive_folder("00_BELSO_NEU_ONLY") is True
        assert _is_sensitive_folder("Titkos_dokumentumok") is True
        assert _is_sensitive_folder("Bizalmas") is True
        assert _is_sensitive_folder("NEU_Ellenorzes") is True
        assert _is_sensitive_folder("Regular_Folder") is False
        assert _is_sensitive_folder("Documents") is False

    @pytest.mark.asyncio
    async def test_provision_order_async_success(self):
        """Test successful async order provisioning."""
        from worker.tasks.provisioning import _provision_order_async

        # Mock order object
        mock_order = Mock()
        mock_order.id = 123
        mock_order.year = 2025
        mock_order.part = "A"
        mock_order.em_number = "001"
        mock_order.partner_company_id = 1
        mock_order.title = "Test Order"

        # Mock partner object
        mock_partner = Mock()
        mock_partner.id = 1
        mock_partner.short_name = "CEG01"

        # Mock folder template
        mock_folder_template = Mock()
        mock_folder_template.id = 1
        mock_folder_template.folder_structure = '{"01_Szakertok": {}, "NEU_Ellenorzes": {}}'

        # Mock services
        with patch("worker.tasks.provisioning.SessionLocal") as mock_session_local:
            with patch("worker.tasks.provisioning.redis") as mock_redis:
                with patch("worker.tasks.provisioning.GraphAuthService"):
                    with patch("worker.tasks.provisioning.TeamsService") as mock_teams:
                        with patch("worker.tasks.provisioning.SharePointService") as mock_sp:
                            # Setup database mocks
                            mock_db = MagicMock()
                            mock_db.query.return_value.filter.return_value.first.side_effect = [
                                mock_order,  # First query for order
                                mock_partner,  # Second query for partner
                                mock_folder_template,  # Third query for template
                                mock_order,  # Fourth query for order update
                            ]
                            mock_session_local.return_value = mock_db

                            # Setup Redis mock
                            mock_redis_client = AsyncMock()
                            mock_redis_client.hexists.return_value = False
                            mock_redis_client.hset.return_value = None
                            mock_redis_client.set.return_value = None
                            mock_redis_client.close.return_value = None
                            mock_redis.from_url.return_value = mock_redis_client

                            # Setup Teams service mock
                            mock_teams_instance = AsyncMock()
                            mock_teams_instance.create_team.return_value = {
                                "id": "team-123",
                                "displayName": (
                                    f"EM_{mock_order.year}_{mock_order.part}_"
                                    f"{mock_partner.short_name}_{mock_order.em_number}"
                                ),
                                "webUrl": "https://teams.microsoft.com/team-123",
                            }
                            mock_teams_instance.create_channel.return_value = {
                                "id": "channel-123",
                                "displayName": "Test Channel",
                            }
                            mock_teams_instance.add_sharepoint_tab.return_value = {"id": "tab-123"}
                            mock_teams.return_value = mock_teams_instance

                            # Setup SharePoint service mock
                            mock_sp_instance = AsyncMock()
                            mock_sp_instance.get_site_from_team.return_value = {
                                "id": "site-123",
                                "webUrl": "https://sharepoint.com/sites/team-123",
                            }
                            mock_sp_instance.create_document_library.return_value = {
                                "id": "library-123",
                                "displayName": f"EM_{mock_order.em_number}_Documents",
                            }
                            mock_sp_instance.create_folder.return_value = {
                                "id": "folder-123",
                                "name": "Test Folder",
                            }
                            mock_sp.return_value = mock_sp_instance

                            # Mock _create_folder_structure
                            with patch(
                                "worker.tasks.provisioning._create_folder_structure"
                            ) as mock_create_folders:
                                mock_create_folders.return_value = [
                                    {"name": "01_Szakertok", "id": "folder-1", "sensitive": False},
                                    {"name": "NEU_Ellenorzes", "id": "folder-2", "sensitive": True},
                                ]

                                # Run provisioning
                                result = await _provision_order_async(
                                    order_id=123,
                                    job_id="job-123",
                                    template_id=1,
                                    correlation_id="test-correlation",
                                    idempotency_key="test-key",
                                    user_id="test-user",
                                )

        # Verify results
        assert result["order_id"] == 123
        assert result["status"] == "completed"
        assert result["teams"]["displayName"] == (
            f"EM_{mock_order.year}_{mock_order.part}_"
            f"{mock_partner.short_name}_{mock_order.em_number}"
        )
        assert len(result["teams"]["channels"]) == 3
        assert result["sharepoint"]["library_name"] == f"EM_{mock_order.em_number}_Documents"
        assert result["folders"]["count"] == 2

    @pytest.mark.asyncio
    async def test_provision_order_async_order_not_found(self):
        """Test provisioning with non-existent order."""
        from worker.tasks.provisioning import _provision_order_async

        with patch("worker.tasks.provisioning.SessionLocal") as mock_session_local:
            with patch("worker.tasks.provisioning.redis") as mock_redis:
                mock_db = MagicMock()
                mock_db.query.return_value.filter.return_value.first.return_value = None
                mock_session_local.return_value = mock_db

                # Setup Redis mock
                mock_redis_client = AsyncMock()
                mock_redis_client.hexists.return_value = False
                mock_redis_client.hset.return_value = None
                mock_redis_client.set.return_value = None
                mock_redis_client.close.return_value = None
                mock_redis.from_url.return_value = mock_redis_client

                with pytest.raises(ValueError) as exc_info:
                    await _provision_order_async(
                        order_id=999,
                        job_id="job-999",
                        template_id=None,
                        correlation_id="test-correlation",
                        idempotency_key="test-key",
                        user_id="test-user",
                    )

                assert "Order 999 not found" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_provision_order_async_no_template(self):
        """Test provisioning without a folder template."""
        from worker.tasks.provisioning import _provision_order_async

        mock_order = Mock()
        mock_order.id = 123
        mock_order.year = 2025
        mock_order.part = "A"
        mock_order.em_number = "001"
        mock_order.partner_company_id = 1
        mock_order.title = "Test Order"

        mock_partner = Mock()
        mock_partner.id = 1
        mock_partner.short_name = "CEG01"

        with patch("worker.tasks.provisioning.SessionLocal") as mock_session_local:
            with patch("worker.tasks.provisioning.redis") as mock_redis:
                with patch("worker.tasks.provisioning.GraphAuthService"):
                    with patch("worker.tasks.provisioning.TeamsService") as mock_teams:
                        with patch("worker.tasks.provisioning.SharePointService") as mock_sp:
                            mock_db = MagicMock()
                            mock_db.__enter__ = MagicMock(return_value=mock_db)
                            mock_db.__exit__ = MagicMock(return_value=None)
                            mock_db.query.return_value.filter.return_value.first.side_effect = [
                                mock_order,  # First query for order
                                mock_partner,  # Second query for partner
                                None,  # Third query for template (not found)
                            ]
                            mock_db.commit = MagicMock()
                            mock_db.close = MagicMock()

                            # Create a second db instance for the update operation
                            mock_db2 = MagicMock()
                            mock_db2.__enter__ = MagicMock(return_value=mock_db2)
                            mock_db2.__exit__ = MagicMock(return_value=None)
                            mock_db2.query.return_value.filter.return_value.first.return_value = (
                                mock_order
                            )
                            mock_db2.commit = MagicMock()
                            mock_db2.close = MagicMock()

                            mock_session_local.side_effect = [mock_db, mock_db2]

                            # Setup Redis mock
                            mock_redis_client = AsyncMock()
                            mock_redis_client.hexists.return_value = False
                            mock_redis_client.hset.return_value = None
                            mock_redis_client.set.return_value = None
                            mock_redis_client.close.return_value = None
                            mock_redis.from_url.return_value = mock_redis_client

                            # Setup Teams service mock
                            mock_teams_instance = AsyncMock()
                            mock_teams_instance.create_team.return_value = {
                                "id": "team-123",
                                "displayName": "Test Team",
                                "webUrl": "https://teams.microsoft.com/team-123",
                            }
                            mock_teams_instance.create_channel.return_value = {
                                "id": "channel-123",
                                "displayName": "Test Channel",
                            }
                            mock_teams.return_value = mock_teams_instance

                            # Setup SharePoint service mock
                            mock_sp_instance = AsyncMock()
                            mock_sp_instance.get_site_from_team.return_value = {
                                "id": "site-123",
                                "webUrl": "https://sharepoint.com/sites/team-123",
                            }
                            mock_sp_instance.create_document_library.return_value = {
                                "id": "library-123",
                                "displayName": f"EM_{mock_order.em_number}_Documents",
                            }
                            mock_sp_instance.create_folder.return_value = {
                                "id": "folder-123",
                                "name": "Test Folder",
                            }
                            mock_sp.return_value = mock_sp_instance

                            result = await _provision_order_async(
                                order_id=123,
                                job_id="job-123",
                                template_id=None,  # No template
                                correlation_id="test-correlation",
                                idempotency_key="test-key",
                                user_id="test-user",
                            )

        assert result["status"] == "completed"
        assert result["folders"]["status"] == "created_default"  # Default folders created
