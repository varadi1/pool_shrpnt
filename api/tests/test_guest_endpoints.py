"""Tests for guest API endpoints."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.contract import PartnerCompany
from api.models.guest import GuestStatus, GuestUser
from api.models.rbac import Group


@pytest.fixture
def mock_current_user():
    """Mock current user for authentication."""
    return {
        "id": str(uuid4()),
        "email": "admin@example.com",
        "name": "Test Admin",
        "roles": ["NEU_Admin"]
    }


@pytest.fixture
async def authenticated_client(async_client: AsyncClient, mock_current_user: dict):
    """Create an authenticated test client."""
    from api.dependencies.auth import get_current_user
    from api.main import app
    
    async def override_get_current_user():
        return mock_current_user
    
    app.dependency_overrides[get_current_user] = override_get_current_user
    yield async_client
    # Clear is handled by async_client fixture


@pytest.mark.asyncio
async def test_invite_guest_endpoint_success(
    authenticated_client: AsyncClient,
    async_test_db: AsyncSession,
    mock_current_user: dict,
):
    """Test successful guest invitation via API endpoint."""
    # Create partner company
    partner = PartnerCompany(
        company_code="API_PARTNER",
        name="API Test Partner",
        short_name="ATP",
    )
    async_test_db.add(partner)
    await async_test_db.commit()

    # Mock the guest service
    with patch("api.routers.guests.GuestService") as MockService:
        mock_service = MockService.return_value
        mock_guest = GuestUser(
            id=uuid4(),
            email="api.guest@example.com",
            display_name="API Guest",
            partner_company_id=partner.id,
            status=GuestStatus.INVITED,
            invited_at=datetime.now(UTC),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        mock_service.invite_guest = AsyncMock(return_value=mock_guest)

        # Make request
        response = await authenticated_client.post(
            "/api/v1/guests",
            json={
                "email": "api.guest@example.com",
                "partner_company_id": partner.id,
                "display_name": "API Guest",
                "role": "partner_viewer",
            },
        )

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["email"] == "api.guest@example.com"
    assert data["status"] == "invited"


@pytest.mark.asyncio
async def test_invite_guest_invalid_email(
    authenticated_client: AsyncClient,
    async_test_db: AsyncSession,
    mock_current_user: dict,
):
    """Test guest invitation with invalid email."""
    # Create partner company
    partner = PartnerCompany(
        company_code="API_PARTNER2",
        name="API Test Partner 2",
        short_name="ATP2",
    )
    async_test_db.add(partner)
    await async_test_db.commit()

    # Make request with invalid email
    response = await authenticated_client.post(
        "/api/guests",
        json={
            "email": "not-an-email",
            "partner_company_id": partner.id,
            "role": "partner_viewer",
        },
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_invite_guest_invalid_role(
    authenticated_client: AsyncClient,
    async_test_db: AsyncSession,
    mock_current_user: dict,
):
    """Test guest invitation with invalid role."""
    # Create partner company
    partner = PartnerCompany(
        company_code="API_PARTNER3",
        name="API Test Partner 3",
        short_name="ATP3",
    )
    async_test_db.add(partner)
    await async_test_db.commit()

    # Make request with invalid role
    response = await authenticated_client.post(
        "/api/guests",
        json={
            "email": "guest@example.com",
            "partner_company_id": partner.id,
            "role": "invalid_role",
        },
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_list_guests(
    authenticated_client: AsyncClient,
    async_test_db: AsyncSession,
    mock_current_user: dict,
):
    """Test listing guest users."""
    # Create partner companies
    partner1 = PartnerCompany(
        company_code="LIST_P1",
        name="List Partner 1",
        short_name="LP1",
    )
    partner2 = PartnerCompany(
        company_code="LIST_P2",
        name="List Partner 2",
        short_name="LP2",
    )
    async_test_db.add_all([partner1, partner2])
    await async_test_db.commit()

    # Create guest users
    guests = [
        GuestUser(
            email="guest1@example.com",
            partner_company_id=partner1.id,
            status=GuestStatus.INVITED,
        ),
        GuestUser(
            email="guest2@example.com",
            partner_company_id=partner1.id,
            status=GuestStatus.ACCEPTED,
        ),
        GuestUser(
            email="guest3@example.com",
            partner_company_id=partner2.id,
            status=GuestStatus.EXPIRED,
        ),
    ]
    async_test_db.add_all(guests)
    await async_test_db.commit()

    # Make request
    response = await authenticated_client.get("/api/v1/guests")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "items" in data
    assert len(data["items"]) >= 3
    assert "total" in data
    assert "page" in data
    assert "page_size" in data


@pytest.mark.asyncio
async def test_get_guest_details(
    authenticated_client: AsyncClient,
    async_test_db: AsyncSession,
    mock_current_user: dict,
):
    """Test getting guest details."""
    # Create partner and guest
    partner = PartnerCompany(
        company_code="DETAIL_P",
        name="Detail Partner",
        short_name="DP",
    )
    async_test_db.add(partner)
    await async_test_db.commit()

    guest = GuestUser(
        email="detail.guest@example.com",
        display_name="Detail Guest",
        partner_company_id=partner.id,
        status=GuestStatus.ACCEPTED,
        azure_ad_id="azure-123",
    )
    async_test_db.add(guest)
    await async_test_db.commit()

    # Make request
    response = await authenticated_client.get(f"/api/guests/{guest.id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["email"] == "detail.guest@example.com"
    assert data["display_name"] == "Detail Guest"
    assert data["status"] == "accepted"


@pytest.mark.asyncio
async def test_check_guest_status_endpoint(
    authenticated_client: AsyncClient,
    async_test_db: AsyncSession,
    mock_current_user: dict,
):
    """Test checking guest invitation status."""
    # Create partner and guest
    partner = PartnerCompany(
        company_code="STATUS_P",
        name="Status Partner",
        short_name="SP",
    )
    async_test_db.add(partner)
    await async_test_db.commit()

    guest = GuestUser(
        email="status.guest@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.INVITED,
    )
    async_test_db.add(guest)
    await async_test_db.commit()

    # Make request
    response = await authenticated_client.get(
        f"/api/v1/guests/status/status.guest@example.com"
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["email"] == "status.guest@example.com"
    assert data["status"] == "invited"


@pytest.mark.asyncio
async def test_update_guest_groups_endpoint(
    authenticated_client: AsyncClient,
    async_test_db: AsyncSession,
    mock_current_user: dict,
):
    """Test updating guest group assignments."""
    # Create partner, guest, and groups
    partner = PartnerCompany(
        company_code="UPDATE_P",
        name="Update Partner",
        short_name="UP",
    )
    async_test_db.add(partner)
    await async_test_db.commit()

    guest = GuestUser(
        email="update.guest@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.ACCEPTED,
    )
    async_test_db.add(guest)

    groups = [
        Group(azure_ad_group_id="group1", display_name="Group 1"),
        Group(azure_ad_group_id="group2", display_name="Group 2"),
    ]
    async_test_db.add_all(groups)
    await async_test_db.commit()

    # Mock the guest service
    with patch("api.routers.guests.GuestService") as MockService:
        mock_service = MockService.return_value
        mock_service.update_guest_groups = AsyncMock(return_value=guest)

        # Make request
        response = await authenticated_client.patch(
            f"/api/v1/guests/{guest.id}/groups",
            json={"group_ids": [str(g.id) for g in groups]},
        )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["email"] == "update.guest@example.com"


@pytest.mark.asyncio
async def test_resend_invitation_endpoint(
    authenticated_client: AsyncClient,
    async_test_db: AsyncSession,
    mock_current_user: dict,
):
    """Test resending guest invitation."""
    # Create partner and guest
    partner = PartnerCompany(
        company_code="RESEND_P",
        name="Resend Partner",
        short_name="RP",
    )
    async_test_db.add(partner)
    await async_test_db.commit()

    guest = GuestUser(
        email="resend.guest@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.INVITED,
    )
    async_test_db.add(guest)
    await async_test_db.commit()

    # Mock the guest service
    with patch("api.routers.guests.GuestService") as MockService:
        mock_service = MockService.return_value
        mock_service.resend_invitation = AsyncMock(return_value=guest)

        # Make request
        response = await authenticated_client.post(
            f"/api/v1/guests/{guest.id}/resend"
        )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["email"] == "resend.guest@example.com"
    assert data["status"] == "invited"


@pytest.mark.asyncio
async def test_guest_endpoints_require_auth(
    async_client: AsyncClient,  # Not authenticated
    async_test_db: AsyncSession,
):
    """Test that guest endpoints require authentication."""
    # Try to access endpoints without authentication
    responses = [
        await async_client.post("/api/v1/guests", json={}),
        await async_client.get("/api/v1/guests"),
        await async_client.get("/api/v1/guests/123"),
        await async_client.get("/api/v1/guests/status/test@example.com"),
        await async_client.patch("/api/v1/guests/123/groups", json={}),
        await async_client.post("/api/v1/guests/123/resend"),
    ]

    # All should return 401 Unauthorized
    for response in responses:
        assert response.status_code == status.HTTP_401_UNAUTHORIZED