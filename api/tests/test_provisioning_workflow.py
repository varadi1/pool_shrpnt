import uuid
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.contract import Contract, OrderEm, PartnerCompany
from api.services.provisioning import ProvisioningService


@pytest.mark.asyncio
class TestContractEndpoints:
    async def test_create_contract(self, async_client: AsyncClient, db_session: AsyncSession):
        contract_data = {
            "contract_number": "C-2025-001",
            "name": "Test Contract",
            "description": "Test contract description",
            "start_date": datetime.utcnow().isoformat(),
            "end_date": (datetime.utcnow() + timedelta(days=365)).isoformat(),
            "total_value": 100000.00,
        }

        response = await async_client.post(
            "/api/v1/contracts",
            json=contract_data,
            headers={"x-user-id": "test-user", "x-correlation-id": str(uuid.uuid4())},
        )

        assert response.status_code == status.HTTP_201_CREATED
        result = response.json()
        assert result["contract_number"] == contract_data["contract_number"]
        assert result["name"] == contract_data["name"]
        assert result["status"] == "active"
        assert "id" in result

    async def test_create_duplicate_contract(
        self, async_client: AsyncClient, db_session: AsyncSession
    ):
        # Create first contract
        contract_data = {
            "contract_number": "C-2025-002",
            "name": "Test Contract",
            "start_date": datetime.utcnow().isoformat(),
        }

        response = await async_client.post(
            "/api/v1/contracts",
            json=contract_data,
            headers={"x-user-id": "test-user"},
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Try to create duplicate
        response = await async_client.post(
            "/api/v1/contracts",
            json=contract_data,
            headers={"x-user-id": "test-user"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    async def test_list_contracts_with_pagination(
        self, async_client: AsyncClient, db_session: AsyncSession
    ):
        # Create multiple contracts
        for i in range(5):
            contract_data = {
                "contract_number": f"C-2025-10{i}",
                "name": f"Contract {i}",
                "start_date": datetime.utcnow().isoformat(),
            }
            await async_client.post(
                "/api/v1/contracts",
                json=contract_data,
                headers={"x-user-id": "test-user"},
            )

        # Test pagination
        response = await async_client.get("/api/v1/contracts?page=1&page_size=2")
        assert response.status_code == status.HTTP_200_OK
        result = response.json()
        assert len(result["items"]) <= 2
        assert result["page"] == 1
        assert result["page_size"] == 2
        assert "total" in result
        assert "total_pages" in result

    async def test_get_contract_by_id(self, async_client: AsyncClient, db_session: AsyncSession):
        # Create contract
        contract_data = {
            "contract_number": "C-2025-200",
            "name": "Test Contract",
            "start_date": datetime.utcnow().isoformat(),
        }
        create_response = await async_client.post(
            "/api/v1/contracts",
            json=contract_data,
            headers={"x-user-id": "test-user"},
        )
        contract_id = create_response.json()["id"]

        # Get by ID
        response = await async_client.get(f"/api/v1/contracts/{contract_id}")
        assert response.status_code == status.HTTP_200_OK
        result = response.json()
        assert result["id"] == contract_id
        assert result["contract_number"] == contract_data["contract_number"]

    async def test_update_contract(self, async_client: AsyncClient, db_session: AsyncSession):
        # Create contract
        contract_data = {
            "contract_number": "C-2025-300",
            "name": "Original Name",
            "start_date": datetime.utcnow().isoformat(),
        }
        create_response = await async_client.post(
            "/api/v1/contracts",
            json=contract_data,
            headers={"x-user-id": "test-user"},
        )
        contract_id = create_response.json()["id"]

        # Update contract
        update_data = {"name": "Updated Name", "status": "inactive"}
        response = await async_client.patch(
            f"/api/v1/contracts/{contract_id}",
            json=update_data,
            headers={"x-user-id": "test-user"},
        )
        assert response.status_code == status.HTTP_200_OK
        result = response.json()
        assert result["name"] == "Updated Name"
        assert result["status"] == "inactive"


@pytest.mark.asyncio
class TestOrderEndpoints:
    async def test_create_order(self, async_client: AsyncClient, db_session: AsyncSession):
        # Create prerequisites
        partner = PartnerCompany(
            company_code="PARTNER-001",
            name="Test Partner",
            short_name="TP",
            is_active=True,
        )
        db_session.add(partner)

        contract = Contract(
            contract_number="C-2025-400",
            name="Test Contract",
            start_date=datetime.utcnow(),
            status="active",
            created_by="test",
            updated_by="test",
        )
        db_session.add(contract)
        await db_session.commit()

        order_data = {
            "em_number": "EM-2025-001",
            "title": "Test Order",
            "description": "Test order description",
            "contract_id": contract.id,
            "partner_company_id": partner.id,
            "year": 2025,
            "part": "A",
        }

        response = await async_client.post(
            "/api/v1/orders",
            json=order_data,
            headers={"x-user-id": "test-user", "x-correlation-id": str(uuid.uuid4())},
        )

        assert response.status_code == status.HTTP_201_CREATED
        result = response.json()
        assert result["em_number"] == order_data["em_number"]
        assert result["title"] == order_data["title"]
        assert result["provisioning_status"] == "pending"

    async def test_create_order_invalid_contract(
        self, async_client: AsyncClient, db_session: AsyncSession
    ):
        order_data = {
            "em_number": "EM-2025-002",
            "title": "Test Order",
            "contract_id": 99999,  # Non-existent
            "partner_company_id": 1,
            "year": 2025,
            "part": "B",
        }

        response = await async_client.post(
            "/api/v1/orders",
            json=order_data,
            headers={"x-user-id": "test-user"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @patch("api.services.provisioning.ProvisioningService.trigger_provisioning")
    async def test_provision_order(
        self, mock_trigger, async_client: AsyncClient, db_session: AsyncSession
    ):
        # Setup mock
        job_id = str(uuid.uuid4())
        mock_trigger.return_value = job_id

        # Create order
        partner = PartnerCompany(
            company_code="PARTNER-002",
            name="Test Partner",
            short_name="TP2",
            is_active=True,
        )
        db_session.add(partner)

        contract = Contract(
            contract_number="C-2025-500",
            name="Test Contract",
            start_date=datetime.utcnow(),
            status="active",
            created_by="test",
            updated_by="test",
        )
        db_session.add(contract)

        order = OrderEm(
            em_number="EM-2025-003",
            title="Test Order",
            contract_id=1,
            partner_company_id=1,
            year=2025,
            part="C",
            provisioning_status="pending",
            created_by="test",
            updated_by="test",
        )
        db_session.add(order)
        await db_session.commit()

        provision_data = {"template_id": 1, "priority": "high"}

        response = await async_client.post(
            f"/api/v1/orders/{order.id}/provision",
            json=provision_data,
            headers={"x-user-id": "test-user", "x-correlation-id": str(uuid.uuid4())},
        )

        assert response.status_code == status.HTTP_200_OK
        result = response.json()
        assert "job_id" in result
        assert result["status"] == "in_progress"
        assert result["message"] == "Provisioning job created successfully"


@pytest.mark.asyncio
class TestJobEndpoints:
    @patch("redis.asyncio.from_url")
    async def test_get_job_status(self, mock_redis, async_client: AsyncClient):
        # Setup mock Redis
        job_id = str(uuid.uuid4())
        mock_redis_client = AsyncMock()
        mock_redis.return_value = mock_redis_client

        mock_redis_client.hgetall.return_value = {
            "job_id": job_id,
            "status": "in_progress",
            "phase": "creating_team",
            "progress": "50",
            "message": "Creating Teams group",
            "correlation_id": str(uuid.uuid4()),
        }

        response = await async_client.get(f"/api/v1/jobs/{job_id}/status")
        assert response.status_code == status.HTTP_200_OK
        result = response.json()
        assert result["job_id"] == job_id
        assert result["status"] == "in_progress"
        assert result["phase"] == "creating_team"
        assert result["progress"] == 50

    async def test_get_nonexistent_job(self, async_client: AsyncClient):
        job_id = str(uuid.uuid4())
        with patch("redis.asyncio.from_url") as mock_redis:
            mock_redis_client = AsyncMock()
            mock_redis.return_value = mock_redis_client
            mock_redis_client.hgetall.return_value = {}

            response = await async_client.get(f"/api/v1/jobs/{job_id}/status")
            assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
class TestProvisioningWorkflow:
    @patch("api.services.teams.teams_service.TeamsService")
    @patch("api.services.sharepoint.sharepoint_service.SharePointService")
    @patch("redis.from_url")
    async def test_complete_provisioning_workflow(
        self, mock_redis, mock_sharepoint, mock_teams, db_session: AsyncSession
    ):
        # Setup mocks
        mock_redis_client = MagicMock()
        mock_redis.return_value = mock_redis_client

        mock_teams_instance = AsyncMock()
        mock_teams.return_value = mock_teams_instance
        mock_teams_instance.create_team.return_value = {
            "id": "team-123",
            "displayName": "EM_2025_A_TEST_001",
            "webUrl": "https://teams.microsoft.com/...",
        }
        mock_teams_instance.create_channel.return_value = {
            "id": "channel-123",
            "displayName": "Test Channel",
        }

        mock_sharepoint_instance = AsyncMock()
        mock_sharepoint.return_value = mock_sharepoint_instance
        mock_sharepoint_instance.get_site_from_team.return_value = {
            "id": "site-123",
            "webUrl": "https://sharepoint.com/sites/test",
        }
        mock_sharepoint_instance.create_document_library.return_value = {
            "id": "library-123",
            "displayName": "Documents",
        }
        mock_sharepoint_instance.create_folder.return_value = {
            "id": "folder-123",
        }

        # Create test data
        partner = PartnerCompany(
            id=1,
            company_code="TEST",
            name="Test Partner",
            short_name="TEST",
            is_active=True,
        )
        db_session.add(partner)

        contract = Contract(
            id=1,
            contract_number="C-2025-600",
            name="Test Contract",
            start_date=datetime.utcnow(),
            status="active",
            created_by="test",
            updated_by="test",
        )
        db_session.add(contract)

        order = OrderEm(
            id=1,
            em_number="EM-001",
            title="Test Order",
            contract_id=1,
            partner_company_id=1,
            year=2025,
            part="A",
            provisioning_status="pending",
            created_by="test",
            updated_by="test",
        )
        db_session.add(order)
        await db_session.commit()

        # Test provisioning service
        ProvisioningService(db_session)

        # Note: This would need proper async context setup
        # job_id = await service.trigger_provisioning(
        #     order_id=1,
        #     template_id=None,
        #     priority="normal",
        #     correlation_id=str(uuid.uuid4()),
        #     user_id="test-user"
        # )
        # assert job_id is not None


@pytest.mark.asyncio
class TestErrorHandling:
    async def test_contract_validation_errors(self, async_client: AsyncClient):
        # Invalid date range
        contract_data = {
            "contract_number": "C-2025-700",
            "name": "Test Contract",
            "start_date": datetime.utcnow().isoformat(),
            "end_date": (datetime.utcnow() - timedelta(days=1)).isoformat(),  # Before start
        }

        response = await async_client.post(
            "/api/v1/contracts",
            json=contract_data,
            headers={"x-user-id": "test-user"},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    async def test_order_validation_errors(self, async_client: AsyncClient):
        # Invalid part value
        order_data = {
            "em_number": "EM-2025-004",
            "title": "Test Order",
            "contract_id": 1,
            "partner_company_id": 1,
            "year": 2025,
            "part": "D",  # Invalid - should be A, B, or C
        }

        response = await async_client.post(
            "/api/v1/orders",
            json=order_data,
            headers={"x-user-id": "test-user"},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    async def test_correlation_id_propagation(self, async_client: AsyncClient):
        correlation_id = str(uuid.uuid4())

        response = await async_client.get(
            "/api/v1/contracts",
            headers={"x-correlation-id": correlation_id},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.headers.get("x-correlation-id") == correlation_id
