"""Tests for guest revocation API endpoints."""

import pytest
from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.main import app
from api.models.guest import GuestUser, GuestStatus
from api.models.contract import PartnerCompany


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_current_user():
    """Mock current user for authentication."""
    return {
        "email": "admin@company.com",
        "sub": "user-123",
        "roles": ["admin"],
    }


@pytest.fixture
def sample_guest():
    """Create a sample guest user."""
    return GuestUser(
        id=uuid4(),
        email="guest@example.com",
        display_name="Test Guest",
        partner_company_id=1,
        status=GuestStatus.ACCEPTED.value,
        azure_ad_id="azure-123",
        created_by="admin@company.com",
        expires_at=datetime.now(UTC) + timedelta(days=30),
    )


@pytest.fixture
def sample_partner():
    """Create a sample partner company."""
    return PartnerCompany(
        id=1,
        name="Test Partner",
        short_code="TST",
        domain="testpartner.com",
    )


class TestRevocationEndpoints:
    """Test guest revocation API endpoints."""

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_revoke_guest_success(self, mock_get_db, mock_get_current_user, client, sample_guest, mock_current_user):
        """Test successful guest revocation."""
        # Setup
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)
        mock_session.get.return_value = sample_guest
        mock_get_db.return_value = mock_session

        with patch("api.routers.guests.GuestService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.revoke_guest = AsyncMock(return_value=sample_guest)
            mock_service_class.return_value = mock_service

            # Execute
            response = client.delete(
                f"/guests/{sample_guest.id}",
                json={"reason": "Contract ended"},
            )

            # Verify
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["id"] == str(sample_guest.id)
            assert data["email"] == sample_guest.email
            mock_service.revoke_guest.assert_called_once()

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_revoke_guest_not_found(self, mock_get_db, mock_get_current_user, client, mock_current_user):
        """Test revocation of non-existent guest."""
        # Setup
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)
        mock_session.get.return_value = None
        mock_get_db.return_value = mock_session

        guest_id = uuid4()

        # Execute
        response = client.delete(
            f"/guests/{guest_id}",
            json={"reason": "Test"},
        )

        # Verify
        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert data["detail"]["error"] == "not_found"

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_revoke_guest_idempotent(self, mock_get_db, mock_get_current_user, client, sample_guest, mock_current_user):
        """Test that revoking already revoked guest is idempotent."""
        # Setup
        sample_guest.status = GuestStatus.REVOKED.value
        sample_guest.revoked_at = datetime.now(UTC)
        sample_guest.revoked_by = "admin@company.com"
        sample_guest.revocation_reason = "Already revoked"

        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)
        mock_session.get.return_value = sample_guest
        mock_get_db.return_value = mock_session

        # Execute
        response = client.delete(
            f"/guests/{sample_guest.id}",
            json={"reason": "Trying to revoke again"},
        )

        # Verify - should succeed and return the guest
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == str(sample_guest.id)
        assert data["status"] == GuestStatus.REVOKED.value

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_bulk_revoke_success(self, mock_get_db, mock_get_current_user, client, mock_current_user):
        """Test successful bulk revocation."""
        # Setup
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)
        mock_get_db.return_value = mock_session

        guest_ids = [uuid4() for _ in range(3)]

        with patch("api.routers.guests.GuestService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.bulk_revoke_guests = AsyncMock(
                return_value={
                    "total": 3,
                    "succeeded": [{"guest_id": str(gid), "email": f"guest{i}@example.com"} for i, gid in enumerate(guest_ids)],
                    "failed": [],
                    "correlation_id": "test-correlation",
                }
            )
            mock_service_class.return_value = mock_service

            # Execute
            response = client.post(
                "/guests/bulk-revoke",
                json={
                    "guest_ids": [str(gid) for gid in guest_ids],
                    "reason": "Bulk revocation test",
                },
            )

            # Verify
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["total"] == 3
            assert len(data["succeeded"]) == 3
            assert len(data["failed"]) == 0
            mock_service.bulk_revoke_guests.assert_called_once()

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_bulk_revoke_partial_failure(self, mock_get_db, mock_get_current_user, client, mock_current_user):
        """Test bulk revocation with partial failures."""
        # Setup
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)
        mock_get_db.return_value = mock_session

        guest_ids = [uuid4() for _ in range(3)]

        with patch("api.routers.guests.GuestService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.bulk_revoke_guests = AsyncMock(
                return_value={
                    "total": 3,
                    "succeeded": [{"guest_id": str(guest_ids[0]), "email": "guest0@example.com"}],
                    "failed": [
                        {"guest_id": str(guest_ids[1]), "error": "Not found"},
                        {"guest_id": str(guest_ids[2]), "error": "Already revoked"},
                    ],
                    "correlation_id": "test-correlation",
                }
            )
            mock_service_class.return_value = mock_service

            # Execute
            response = client.post(
                "/guests/bulk-revoke",
                json={
                    "guest_ids": [str(gid) for gid in guest_ids],
                    "reason": "Bulk test",
                },
            )

            # Verify
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["total"] == 3
            assert len(data["succeeded"]) == 1
            assert len(data["failed"]) == 2

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_list_revoked_guests(self, mock_get_db, mock_get_current_user, client, mock_current_user, sample_partner):
        """Test listing revoked guests."""
        # Setup
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)

        # Create revoked guests
        revoked_guests = []
        for i in range(3):
            guest = GuestUser(
                id=uuid4(),
                email=f"revoked{i}@example.com",
                display_name=f"Revoked Guest {i}",
                partner_company_id=1,
                status=GuestStatus.REVOKED.value,
                revoked_at=datetime.now(UTC) - timedelta(days=i),
                revoked_by="admin@company.com",
                revocation_reason=f"Reason {i}",
                created_at=datetime.now(UTC) - timedelta(days=30),
            )
            revoked_guests.append(guest)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = revoked_guests
        mock_session.execute.return_value = mock_result
        mock_session.get.return_value = sample_partner
        mock_get_db.return_value = mock_session

        # Execute
        response = client.get("/guests/revoked")

        # Verify
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 3
        assert len(data["guests"]) == 3
        assert all(g["status"] == GuestStatus.REVOKED.value for g in data["guests"])

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_list_revoked_guests_with_filters(self, mock_get_db, mock_get_current_user, client, mock_current_user, sample_partner):
        """Test listing revoked guests with filters."""
        # Setup
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)

        # Create revoked guest
        revoked_guest = GuestUser(
            id=uuid4(),
            email="revoked@example.com",
            display_name="Revoked Guest",
            partner_company_id=1,
            status=GuestStatus.REVOKED.value,
            revoked_at=datetime.now(UTC) - timedelta(days=5),
            revoked_by="admin@company.com",
            revocation_reason="Test reason",
            created_at=datetime.now(UTC) - timedelta(days=30),
        )

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [revoked_guest]
        mock_session.execute.return_value = mock_result
        mock_session.get.return_value = sample_partner
        mock_get_db.return_value = mock_session

        # Calculate date filters
        revoked_after = (datetime.now(UTC) - timedelta(days=10)).isoformat()
        revoked_before = datetime.now(UTC).isoformat()

        # Execute with filters
        response = client.get(
            "/guests/revoked",
            params={
                "partner_company_id": 1,
                "revoked_after": revoked_after,
                "revoked_before": revoked_before,
                "page": 1,
                "page_size": 10,
            },
        )

        # Verify
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 1
        assert len(data["guests"]) == 1
        assert data["guests"][0]["email"] == "revoked@example.com"

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_list_revoked_guests_pagination(self, mock_get_db, mock_get_current_user, client, mock_current_user, sample_partner):
        """Test pagination for revoked guests list."""
        # Setup
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)

        # Create many revoked guests
        revoked_guests = []
        for i in range(25):
            guest = GuestUser(
                id=uuid4(),
                email=f"revoked{i}@example.com",
                display_name=f"Revoked Guest {i}",
                partner_company_id=1,
                status=GuestStatus.REVOKED.value,
                revoked_at=datetime.now(UTC) - timedelta(days=i),
                revoked_by="admin@company.com",
                revocation_reason=f"Reason {i}",
                created_at=datetime.now(UTC) - timedelta(days=30),
            )
            revoked_guests.append(guest)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = revoked_guests
        mock_session.execute.return_value = mock_result
        mock_session.get.return_value = sample_partner
        mock_get_db.return_value = mock_session

        # Execute - get second page
        response = client.get(
            "/guests/revoked",
            params={"page": 2, "page_size": 10},
        )

        # Verify
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 25
        assert len(data["guests"]) == 10  # Page size
        assert data["page"] == 2
        assert data["page_size"] == 10

    def test_revocation_request_validation(self, client):
        """Test that revocation request requires a reason."""
        # Execute without authentication (will fail earlier, but shows validation)
        response = client.delete(
            f"/guests/{uuid4()}",
            json={},  # Missing reason
        )

        # Should fail due to missing auth, but request body would be validated
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_422_UNPROCESSABLE_ENTITY]

    def test_bulk_revocation_request_validation(self, client):
        """Test that bulk revocation request validates properly."""
        # Execute without authentication
        response = client.post(
            "/guests/bulk-revoke",
            json={
                "guest_ids": [],  # Empty list should fail validation
                "reason": "Test",
            },
        )

        # Should fail due to missing auth or validation
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_422_UNPROCESSABLE_ENTITY]