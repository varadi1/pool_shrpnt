"""Tests for guest user management models."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.contract import PartnerCompany
from api.models.guest import GuestGroupAssignment, GuestInvitation, GuestStatus, GuestUser
from api.models.rbac import Group


@pytest.mark.asyncio
async def test_create_guest_user(db_session: AsyncSession):
    """Test creating a guest user."""
    # Create partner company first
    partner = PartnerCompany(
        company_code="PARTNER1",
        name="Partner Company 1",
        short_name="P1",
        contact_email="contact@partner1.com",
    )
    db_session.add(partner)
    await db_session.commit()

    # Create guest user
    guest = GuestUser(
        email="guest@example.com",
        display_name="Guest User",
        partner_company_id=partner.id,
        status=GuestStatus.PENDING,
        created_by="admin@company.com",
    )
    db_session.add(guest)
    await db_session.commit()

    # Verify guest was created
    result = await db_session.execute(
        select(GuestUser).where(GuestUser.email == "guest@example.com")
    )
    saved_guest = result.scalar_one()

    assert saved_guest.id is not None
    assert saved_guest.email == "guest@example.com"
    assert saved_guest.display_name == "Guest User"
    assert saved_guest.partner_company_id == partner.id
    assert saved_guest.status == GuestStatus.PENDING
    assert saved_guest.created_by == "admin@company.com"
    assert saved_guest.azure_ad_id is None
    assert saved_guest.invited_at is None
    assert saved_guest.accepted_at is None


@pytest.mark.asyncio
async def test_guest_status_transitions(db_session: AsyncSession):
    """Test guest status transitions."""
    # Create partner company
    partner = PartnerCompany(
        company_code="PARTNER2",
        name="Partner Company 2",
        short_name="P2",
    )
    db_session.add(partner)
    await db_session.commit()

    # Create guest user
    guest = GuestUser(
        email="guest2@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.PENDING,
    )
    db_session.add(guest)
    await db_session.commit()

    # Update to INVITED status
    guest.status = GuestStatus.INVITED
    guest.invited_at = datetime.now(UTC)
    await db_session.commit()

    # Verify status change
    result = await db_session.execute(
        select(GuestUser).where(GuestUser.email == "guest2@example.com")
    )
    updated_guest = result.scalar_one()

    assert updated_guest.status == GuestStatus.INVITED
    assert updated_guest.invited_at is not None

    # Update to ACCEPTED status
    guest.status = GuestStatus.ACCEPTED
    guest.accepted_at = datetime.now(UTC)
    guest.azure_ad_id = "azure-ad-id-123"
    await db_session.commit()

    # Verify final status
    result = await db_session.execute(
        select(GuestUser).where(GuestUser.email == "guest2@example.com")
    )
    final_guest = result.scalar_one()

    assert final_guest.status == GuestStatus.ACCEPTED
    assert final_guest.accepted_at is not None
    assert final_guest.azure_ad_id == "azure-ad-id-123"


@pytest.mark.asyncio
async def test_guest_invitation_tracking(db_session: AsyncSession):
    """Test tracking guest invitations."""
    # Create partner company
    partner = PartnerCompany(
        company_code="PARTNER3",
        name="Partner Company 3",
        short_name="P3",
    )
    db_session.add(partner)
    await db_session.commit()

    # Create guest user
    guest = GuestUser(
        email="guest3@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.INVITED,
    )
    db_session.add(guest)
    await db_session.commit()

    # Create invitation record
    invitation = GuestInvitation(
        guest_user_id=guest.id,
        invitation_id="inv-123-456",
        sent_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(days=30),
        status="pending",
        redeem_url="https://login.microsoftonline.com/redeem?id=inv-123-456",
    )
    db_session.add(invitation)
    await db_session.commit()

    # Verify invitation was created
    result = await db_session.execute(
        select(GuestInvitation).where(GuestInvitation.invitation_id == "inv-123-456")
    )
    saved_invitation = result.scalar_one()

    assert saved_invitation.id is not None
    assert saved_invitation.guest_user_id == guest.id
    assert saved_invitation.status == "pending"
    assert saved_invitation.redeem_url is not None
    assert saved_invitation.error_details is None


@pytest.mark.asyncio
async def test_guest_group_assignment(db_session: AsyncSession):
    """Test assigning guests to groups."""
    # Create partner company
    partner = PartnerCompany(
        company_code="PARTNER4",
        name="Partner Company 4",
        short_name="P4",
    )
    db_session.add(partner)
    await db_session.commit()

    # Create Azure AD group
    group = Group(
        azure_ad_group_id="group-aad-123",
        display_name="Partner Experts Group",
        description="Group for partner experts",
    )
    db_session.add(group)
    await db_session.commit()

    # Create guest user
    guest = GuestUser(
        email="guest4@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.ACCEPTED,
        azure_ad_id="guest-aad-123",
    )
    db_session.add(guest)
    await db_session.commit()

    # Assign guest to group
    assignment = GuestGroupAssignment(
        guest_user_id=guest.id,
        group_id=group.id,
        assigned_at=datetime.now(UTC),
        assigned_by="admin@company.com",
    )
    db_session.add(assignment)
    await db_session.commit()

    # Verify assignment was created
    result = await db_session.execute(
        select(GuestGroupAssignment).where(GuestGroupAssignment.guest_user_id == guest.id)
    )
    saved_assignment = result.scalar_one()

    assert saved_assignment.id is not None
    assert saved_assignment.group_id == group.id
    assert saved_assignment.assigned_by == "admin@company.com"
    assert saved_assignment.removed_at is None
    assert saved_assignment.removed_by is None


@pytest.mark.asyncio
async def test_guest_unique_email_constraint(db_session: AsyncSession):
    """Test that guest emails must be unique."""
    # Create partner company
    partner = PartnerCompany(
        company_code="PARTNER5",
        name="Partner Company 5",
        short_name="P5",
    )
    db_session.add(partner)
    await db_session.commit()

    # Create first guest
    guest1 = GuestUser(
        email="duplicate@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.PENDING,
    )
    db_session.add(guest1)
    await db_session.commit()

    # Try to create second guest with same email
    guest2 = GuestUser(
        email="duplicate@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.PENDING,
    )
    db_session.add(guest2)

    with pytest.raises(IntegrityError):
        await db_session.commit()

    await db_session.rollback()


@pytest.mark.asyncio
async def test_guest_relationships(db_session: AsyncSession):
    """Test relationships between guest models."""
    # Create partner company
    partner = PartnerCompany(
        company_code="PARTNER6",
        name="Partner Company 6",
        short_name="P6",
    )
    db_session.add(partner)
    await db_session.commit()

    # Create group
    group = Group(
        azure_ad_group_id="group-rel-123",
        display_name="Test Group",
    )
    db_session.add(group)
    await db_session.commit()

    # Create guest with related data
    guest = GuestUser(
        email="guest.rel@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.ACCEPTED,
        azure_ad_id="guest-rel-aad",
    )
    db_session.add(guest)
    await db_session.commit()

    # Add invitation
    invitation = GuestInvitation(
        guest_user_id=guest.id,
        invitation_id="inv-rel-123",
        sent_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(days=30),
        status="accepted",
    )
    db_session.add(invitation)

    # Add group assignment
    assignment = GuestGroupAssignment(
        guest_user_id=guest.id,
        group_id=group.id,
        assigned_at=datetime.now(UTC),
        assigned_by="admin@company.com",
    )
    db_session.add(assignment)
    await db_session.commit()

    # Test relationships through ORM
    result = await db_session.execute(
        select(GuestUser).where(GuestUser.email == "guest.rel@example.com")
    )
    loaded_guest = result.scalar_one()

    # Refresh to load relationships
    await db_session.refresh(loaded_guest, ["invitations", "group_assignments", "partner_company"])

    assert len(loaded_guest.invitations) == 1
    assert loaded_guest.invitations[0].invitation_id == "inv-rel-123"

    assert len(loaded_guest.group_assignments) == 1
    assert loaded_guest.group_assignments[0].group_id == group.id

    assert loaded_guest.partner_company.company_code == "PARTNER6"


@pytest.mark.asyncio
async def test_guest_cascade_delete(db_session: AsyncSession):
    """Test cascade deletion of guest-related records."""
    # Create partner company
    partner = PartnerCompany(
        company_code="PARTNER7",
        name="Partner Company 7",
        short_name="P7",
    )
    db_session.add(partner)
    await db_session.commit()

    # Create group
    group = Group(
        azure_ad_group_id="group-cascade-123",
        display_name="Cascade Test Group",
    )
    db_session.add(group)
    await db_session.commit()

    # Create guest with related data
    guest = GuestUser(
        email="guest.cascade@example.com",
        partner_company_id=partner.id,
        status=GuestStatus.ACCEPTED,
    )
    db_session.add(guest)
    await db_session.commit()

    guest_id = guest.id

    # Add invitation and assignment
    invitation = GuestInvitation(
        guest_user_id=guest.id,
        invitation_id="inv-cascade-123",
        sent_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(days=30),
        status="accepted",
    )
    db_session.add(invitation)

    assignment = GuestGroupAssignment(
        guest_user_id=guest.id,
        group_id=group.id,
        assigned_at=datetime.now(UTC),
        assigned_by="admin@company.com",
    )
    db_session.add(assignment)
    await db_session.commit()

    # Delete the guest user
    await db_session.delete(guest)
    await db_session.commit()

    # Verify cascade deletion
    invitation_result = await db_session.execute(
        select(GuestInvitation).where(GuestInvitation.guest_user_id == guest_id)
    )
    assert invitation_result.scalar_one_or_none() is None

    assignment_result = await db_session.execute(
        select(GuestGroupAssignment).where(GuestGroupAssignment.guest_user_id == guest_id)
    )
    assert assignment_result.scalar_one_or_none() is None
