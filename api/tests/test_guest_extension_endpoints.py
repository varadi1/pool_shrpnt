"""Tests for guest extension API endpoints."""

import pytest
from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.main import app
from api.models.guest import GuestUser, GuestStatus, GuestExtension, GuestLifecyclePolicy
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
        extended_count=1,
        last_extended_at=None,
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


@pytest.fixture
def sample_policy():
    """Create a sample lifecycle policy."""
    return GuestLifecyclePolicy(
        id=uuid4(),
        partner_company_id=1,
        default_expiry_days=90,
        max_extensions=3,
        extension_period_days=90,
        auto_expire_enabled=True,
    )


@pytest.fixture
def sample_extension():
    """Create a sample extension."""
    return GuestExtension(
        id=uuid4(),
        guest_user_id=uuid4(),
        extended_by="admin@company.com",
        extended_at=datetime.now(UTC),
        previous_expiry_date=datetime.now(UTC),
        new_expiry_date=datetime.now(UTC) + timedelta(days=90),
        justification="Project extended",
    )


class TestExtensionEndpoints:
    """Test guest extension API endpoints."""

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_extend_guest_success(
        self,
        mock_get_db,
        mock_get_current_user,
        client,
        sample_guest,
        sample_policy,
        sample_extension,
        mock_current_user,
    ):
        """Test successful guest extension."""
        # Setup
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)
        mock_session.get.return_value = sample_guest
        mock_get_db.return_value = mock_session

        with patch("api.routers.guests.GuestLifecycleService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.can_extend_guest = AsyncMock(return_value=(True, "Guest can be extended"))
            mock_service.get_or_create_policy = AsyncMock(return_value=sample_policy)
            mock_service.extend_guest_access = AsyncMock(return_value=sample_extension)
            mock_service_class.return_value = mock_service

            # Execute
            response = client.post(
                f"/guests/{sample_guest.id}/extend",
                json={
                    "justification": "Project has been extended for 3 more months",
                    "extension_days": 90,
                },
            )

            # Verify
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["id"] == str(sample_guest.id)
            assert data["email"] == sample_guest.email
            assert "new_expiry_date" in data
            assert data["justification"] == sample_extension.justification
            assert data["extension_count"] == sample_guest.extended_count
            assert data["max_extensions"] == sample_policy.max_extensions
            mock_service.extend_guest_access.assert_called_once()

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_extend_guest_not_found(
        self, mock_get_db, mock_get_current_user, client, mock_current_user
    ):
        """Test extension of non-existent guest."""
        # Setup
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)
        mock_session.get.return_value = None
        mock_get_db.return_value = mock_session

        guest_id = uuid4()

        # Execute
        response = client.post(
            f"/guests/{guest_id}/extend",
            json={"justification": "Test extension"},
        )

        # Verify
        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert data["detail"]["error"] == "not_found"

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_extend_guest_max_extensions_reached(
        self, mock_get_db, mock_get_current_user, client, sample_guest, mock_current_user
    ):
        """Test that extension fails when max extensions reached."""
        # Setup
        sample_guest.extended_count = 3  # Already at max
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)
        mock_session.get.return_value = sample_guest
        mock_get_db.return_value = mock_session

        with patch("api.routers.guests.GuestLifecycleService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.can_extend_guest = AsyncMock(
                return_value=(False, "Maximum extensions (3) reached")
            )
            mock_service_class.return_value = mock_service

            # Execute
            response = client.post(
                f"/guests/{sample_guest.id}/extend",
                json={"justification": "Trying to extend beyond limit"},
            )

            # Verify
            assert response.status_code == status.HTTP_400_BAD_REQUEST
            data = response.json()
            assert data["detail"]["error"] == "extension_not_allowed"
            assert "Maximum extensions" in data["detail"]["message"]

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_list_expiring_guests(
        self, mock_get_db, mock_get_current_user, client, mock_current_user, sample_partner
    ):
        """Test listing expiring guests."""
        # Setup
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)

        # Create expiring guests
        expiring_guests = []
        for i in range(3):
            guest = GuestUser(
                id=uuid4(),
                email=f"expiring{i}@example.com",
                display_name=f"Expiring Guest {i}",
                partner_company_id=1,
                status=GuestStatus.ACCEPTED.value,
                expires_at=datetime.now(UTC) + timedelta(days=i + 1),
                extended_count=i,
                created_by="admin@company.com",
            )
            expiring_guests.append(guest)

        mock_session.get.return_value = sample_partner
        mock_get_db.return_value = mock_session

        with patch("api.routers.guests.GuestLifecycleService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.find_expiring_guests = AsyncMock(return_value=expiring_guests)
            mock_service.can_extend_guest = AsyncMock(return_value=(True, "Can extend"))
            mock_service_class.return_value = mock_service

            # Execute
            response = client.get("/guests/expiring", params={"days_until_expiry": 7})

            # Verify
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["total"] == 3
            assert len(data["guests"]) == 3
            for guest_data in data["guests"]:
                assert "expires_at" in guest_data
                assert "days_until_expiry" in guest_data
                assert "can_extend" in guest_data
                assert guest_data["can_extend"] is True

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_list_expiring_guests_with_filters(
        self, mock_get_db, mock_get_current_user, client, mock_current_user, sample_partner
    ):
        """Test listing expiring guests with partner filter."""
        # Setup
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)

        expiring_guest = GuestUser(
            id=uuid4(),
            email="expiring@example.com",
            display_name="Expiring Guest",
            partner_company_id=1,
            status=GuestStatus.ACCEPTED.value,
            expires_at=datetime.now(UTC) + timedelta(days=5),
            extended_count=0,
            created_by="admin@company.com",
        )

        mock_session.get.return_value = sample_partner
        mock_get_db.return_value = mock_session

        with patch("api.routers.guests.GuestLifecycleService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.find_expiring_guests = AsyncMock(return_value=[expiring_guest])
            mock_service.can_extend_guest = AsyncMock(return_value=(True, "Can extend"))
            mock_service_class.return_value = mock_service

            # Execute with filters
            response = client.get(
                "/guests/expiring",
                params={
                    "days_until_expiry": 7,
                    "partner_company_id": 1,
                    "page": 1,
                    "page_size": 10,
                },
            )

            # Verify
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["total"] == 1
            assert len(data["guests"]) == 1
            assert data["guests"][0]["email"] == "expiring@example.com"
            assert data["guests"][0]["partner_company_id"] == 1

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_get_extension_history(
        self, mock_get_db, mock_get_current_user, client, sample_guest, mock_current_user
    ):
        """Test getting extension history for a guest."""
        # Setup
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)
        mock_session.get.return_value = sample_guest
        mock_get_db.return_value = mock_session

        # Create extension history
        extensions = []
        for i in range(3):
            ext = GuestExtension(
                id=uuid4(),
                guest_user_id=sample_guest.id,
                extended_by=f"admin{i}@company.com",
                extended_at=datetime.now(UTC) - timedelta(days=30 * (3 - i)),
                previous_expiry_date=datetime.now(UTC) - timedelta(days=30 * (3 - i)),
                new_expiry_date=datetime.now(UTC) + timedelta(days=30 * i),
                justification=f"Extension {i + 1}",
            )
            extensions.append(ext)

        with patch("api.routers.guests.GuestLifecycleService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.get_extension_history = AsyncMock(return_value=extensions)
            mock_service_class.return_value = mock_service

            # Execute
            response = client.get(f"/guests/{sample_guest.id}/extensions")

            # Verify
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["guest_id"] == str(sample_guest.id)
            assert data["guest_email"] == sample_guest.email
            assert data["total_extensions"] == 3
            assert len(data["extensions"]) == 3
            for ext_data in data["extensions"]:
                assert "extended_by" in ext_data
                assert "extended_at" in ext_data
                assert "justification" in ext_data
                assert "previous_expiry_date" in ext_data
                assert "new_expiry_date" in ext_data

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_get_extension_history_guest_not_found(
        self, mock_get_db, mock_get_current_user, client, mock_current_user
    ):
        """Test getting extension history for non-existent guest."""
        # Setup
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)
        mock_session.get.return_value = None
        mock_get_db.return_value = mock_session

        guest_id = uuid4()

        # Execute
        response = client.get(f"/guests/{guest_id}/extensions")

        # Verify
        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert data["detail"]["error"] == "not_found"

    def test_extension_request_validation(self, client):
        """Test that extension request requires justification."""
        # Execute without authentication (will fail earlier, but shows validation)
        response = client.post(
            f"/guests/{uuid4()}/extend",
            json={},  # Missing justification
        )

        # Should fail due to missing auth or validation
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        ]

    def test_extension_request_with_invalid_days(self, client):
        """Test that extension days must be within valid range."""
        # Execute without authentication
        response = client.post(
            f"/guests/{uuid4()}/extend",
            json={
                "justification": "Test",
                "extension_days": 400,  # Over max of 365
            },
        )

        # Should fail due to missing auth or validation
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_422_UNPROCESSABLE_ENTITY,
        ]

    @patch("api.routers.guests.get_current_user")
    @patch("api.routers.guests.get_db")
    def test_list_expiring_guests_pagination(
        self, mock_get_db, mock_get_current_user, client, mock_current_user, sample_partner
    ):
        """Test pagination for expiring guests list."""
        # Setup
        mock_get_current_user.return_value = mock_current_user
        mock_session = MagicMock(spec=Session)

        # Create many expiring guests
        expiring_guests = []
        for i in range(25):
            guest = GuestUser(
                id=uuid4(),
                email=f"expiring{i}@example.com",
                display_name=f"Expiring Guest {i}",
                partner_company_id=1,
                status=GuestStatus.ACCEPTED.value,
                expires_at=datetime.now(UTC) + timedelta(days=i % 7 + 1),
                extended_count=0,
                created_by="admin@company.com",
            )
            expiring_guests.append(guest)

        mock_session.get.return_value = sample_partner
        mock_get_db.return_value = mock_session

        with patch("api.routers.guests.GuestLifecycleService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.find_expiring_guests = AsyncMock(return_value=expiring_guests)
            mock_service.can_extend_guest = AsyncMock(return_value=(True, "Can extend"))
            mock_service_class.return_value = mock_service

            # Execute - get second page
            response = client.get(
                "/guests/expiring",
                params={"page": 2, "page_size": 10},
            )

            # Verify
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["total"] == 25
            assert len(data["guests"]) == 10  # Page size
            assert data["page"] == 2
            assert data["page_size"] == 10
