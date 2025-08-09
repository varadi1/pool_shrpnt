"""
Tests for the guest status checker background task.
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch, ANY
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.guest import GuestUser, GuestInvitation, GuestStatus, GuestGroupAssignment
from scheduler.tasks.guest_status_checker import GuestStatusChecker, check_guest_status


@pytest.mark.asyncio
async def test_check_pending_invitations():
    """Test checking pending invitations."""
    # Create mock database session
    db = AsyncMock(spec=AsyncSession)
    
    # Create test data
    invitation1 = MagicMock(
        id="inv1",
        guest_user_id="guest1",
        status=GuestStatus.INVITED,
        sent_at=datetime.now(timezone.utc) - timedelta(days=5)
    )
    invitation2 = MagicMock(
        id="inv2",
        guest_user_id="guest2",
        status=GuestStatus.PENDING,
        sent_at=datetime.now(timezone.utc) - timedelta(days=2)
    )
    
    # Mock database query
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [invitation1, invitation2]
    db.execute.return_value = mock_result
    db.get.side_effect = [
        MagicMock(  # Guest 1
            id="guest1",
            email="guest1@example.com",
            azure_ad_id="azure-id-1",
            status=GuestStatus.INVITED,
            partner_company_id="partner1",
            role="partner_viewer"
        ),
        MagicMock(  # Guest 2
            id="guest2",
            email="guest2@example.com",
            azure_ad_id=None,
            status=GuestStatus.PENDING,
            partner_company_id="partner2",
            role="partner_expert"
        )
    ]
    
    # Create checker and mock Graph client
    checker = GuestStatusChecker(db)
    checker.graph_client = AsyncMock()
    checker.guest_service = AsyncMock()
    checker.audit_service = AsyncMock()
    
    # Mock Graph API response - guest1 accepted
    checker.graph_client.users.by_user_id.return_value.get.return_value = {
        "id": "azure-id-1",
        "mail": "guest1@example.com"
    }
    
    # Initialize and run check
    await checker.initialize()
    processed = await checker.check_pending_invitations()
    
    # Assertions
    assert processed == 2
    assert db.execute.called
    assert db.commit.called


@pytest.mark.asyncio
async def test_handle_accepted_invitation():
    """Test handling an accepted invitation."""
    db = AsyncMock(spec=AsyncSession)
    
    # Create test data
    invitation = MagicMock(
        id="inv1",
        status=GuestStatus.INVITED,
        sent_at=datetime.now(timezone.utc) - timedelta(days=1)
    )
    guest = MagicMock(
        id="guest1",
        email="guest@example.com",
        azure_ad_id="azure-123",
        status=GuestStatus.INVITED,
        partner_company_id="partner1",
        role="partner_expert"
    )
    
    # Create checker
    checker = GuestStatusChecker(db)
    checker.audit_service = AsyncMock()
    
    # Mock group assignment
    with patch.object(checker, 'assign_guest_groups', new_callable=AsyncMock) as mock_assign:
        await checker.handle_accepted_invitation(invitation, guest)
        
        # Verify status updates
        assert invitation.status == GuestStatus.ACCEPTED
        assert invitation.accepted_at is not None
        assert guest.status == GuestStatus.ACCEPTED
        assert guest.accepted_at == invitation.accepted_at
        
        # Verify group assignment was triggered
        mock_assign.assert_called_once_with(guest)
        
        # Verify audit log
        checker.audit_service.log_guest_event.assert_called_once()
        
        # Verify commit
        db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_handle_expired_invitation():
    """Test handling an expired invitation."""
    db = AsyncMock(spec=AsyncSession)
    
    # Create test data - invitation sent 31 days ago
    invitation = MagicMock(
        id="inv1",
        status=GuestStatus.INVITED,
        sent_at=datetime.now(timezone.utc) - timedelta(days=31),
        expires_at=None
    )
    guest = MagicMock(
        id="guest1",
        email="guest@example.com",
        status=GuestStatus.INVITED,
        partner_company_id="partner1"
    )
    
    # Create checker
    checker = GuestStatusChecker(db)
    checker.audit_service = AsyncMock()
    
    # Handle expiry
    await checker.handle_expired_invitation(invitation, guest)
    
    # Verify status updates
    assert invitation.status == GuestStatus.EXPIRED
    assert invitation.expires_at is not None
    assert guest.status == GuestStatus.EXPIRED
    
    # Verify audit log
    checker.audit_service.log_guest_event.assert_called_once_with(
        event_type="GUEST_INVITATION_EXPIRED",
        guest_id=guest.id,
        actor_id="system",
        metadata=ANY
    )
    
    # Verify commit
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_process_invitation_expired():
    """Test processing an expired invitation."""
    db = AsyncMock(spec=AsyncSession)
    
    # Create expired invitation (31 days old)
    invitation = MagicMock(
        id="inv1",
        guest_user_id="guest1",
        status=GuestStatus.INVITED,
        sent_at=datetime.now(timezone.utc) - timedelta(days=31)
    )
    
    guest = MagicMock(
        id="guest1",
        email="expired@example.com",
        azure_ad_id="azure-123",
        status=GuestStatus.INVITED
    )
    
    db.get.return_value = guest
    
    # Create checker
    checker = GuestStatusChecker(db)
    checker.audit_service = AsyncMock()
    
    # Mock handle_expired_invitation
    with patch.object(checker, 'handle_expired_invitation', new_callable=AsyncMock) as mock_expired:
        await checker.process_invitation(invitation)
        
        # Verify expired handler was called
        mock_expired.assert_called_once_with(invitation, guest)


@pytest.mark.asyncio
async def test_assign_guest_groups():
    """Test assigning groups to a guest."""
    db = AsyncMock(spec=AsyncSession)
    
    guest = MagicMock(
        id="guest1",
        email="guest@example.com",
        azure_ad_id="azure-123",
        partner_company_id="partner1",
        role="partner_expert"
    )
    
    # Mock database query for existing assignments
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None  # No existing assignment
    db.execute.return_value = mock_result
    
    # Create checker
    checker = GuestStatusChecker(db)
    checker.audit_service = AsyncMock()
    checker.graph_client = AsyncMock()
    
    # Mock add_user_to_azure_group
    with patch.object(checker, 'add_user_to_azure_group', new_callable=AsyncMock) as mock_add:
        await checker.assign_guest_groups(guest)
        
        # Verify groups were assigned
        assert db.add.called  # New assignments created
        assert mock_add.called  # Azure AD group assignments
        assert checker.audit_service.log_guest_event.called
        assert db.commit.called


@pytest.mark.asyncio
async def test_add_user_to_azure_group():
    """Test adding a user to an Azure AD group."""
    db = AsyncMock(spec=AsyncSession)
    
    # Create checker with mock Graph client
    checker = GuestStatusChecker(db)
    
    # Mock the Graph client properly
    mock_ref = AsyncMock()
    mock_ref.post = AsyncMock()
    mock_members = MagicMock()
    mock_members.ref = mock_ref
    mock_group = MagicMock()
    mock_group.members = mock_members
    
    checker.graph_client = MagicMock()
    checker.graph_client.groups.by_group_id.return_value = mock_group
    
    # Test successful addition
    await checker.add_user_to_azure_group("user-123", "group-456")
    
    # Verify Graph API call
    checker.graph_client.groups.by_group_id.assert_called_with("group-456")
    mock_ref.post.assert_called_once()
    
    # Test when user is already a member
    mock_ref.post.side_effect = Exception("One or more added object references already exist")
    
    # Should not raise exception
    await checker.add_user_to_azure_group("user-123", "group-456")


def test_get_groups_for_assignment():
    """Test getting groups for assignment based on role."""
    db = AsyncMock(spec=AsyncSession)
    checker = GuestStatusChecker(db)
    
    # Test partner expert
    groups = checker.get_groups_for_assignment("partner1", "partner_expert")
    assert "experts_group" in groups
    assert "partner_partner1_experts" in groups
    
    # Test partner admin
    groups = checker.get_groups_for_assignment("partner2", "partner_admin")
    assert "partner_admins" in groups
    assert "partner_partner2_admins" in groups
    
    # Test partner viewer
    groups = checker.get_groups_for_assignment("partner3", "partner_viewer")
    assert "partner_partner3_viewers" in groups
    
    # Test NEU PM
    groups = checker.get_groups_for_assignment("neu", "neu_pm")
    assert "neu_project_managers" in groups
    
    # Test unknown role
    groups = checker.get_groups_for_assignment("partner4", "unknown_role")
    assert groups == []


@patch('scheduler.tasks.guest_status_checker.acquire_scheduler_lock')
@patch('scheduler.tasks.guest_status_checker.AsyncSessionLocal')
@patch('scheduler.tasks.guest_status_checker.redis.from_url')
def test_check_guest_status_task(mock_redis, mock_session, mock_lock):
    """Test the Celery task wrapper."""
    # Mock Redis client
    redis_client = AsyncMock()
    mock_redis.return_value = redis_client
    
    # Mock lock acquisition
    mock_lock.return_value = True
    
    # Mock database session
    db_session = AsyncMock()
    mock_session.return_value.__aenter__.return_value = db_session
    
    # Mock task
    task = MagicMock()
    task.request.id = "task-123"
    
    # Run task with mocked async implementation
    with patch('scheduler.tasks.guest_status_checker._check_guest_status_async', 
               new_callable=AsyncMock) as mock_async:
        mock_async.return_value = {
            "status": "success",
            "invitations_processed": 5
        }
        
        result = check_guest_status()
        
        assert result["status"] == "success"
        assert result["invitations_processed"] == 5


@patch('scheduler.tasks.guest_status_checker.acquire_scheduler_lock')
@patch('scheduler.tasks.guest_status_checker.redis.from_url')
def test_check_guest_status_lock_not_acquired(mock_redis, mock_lock):
    """Test task when lock cannot be acquired."""
    # Mock Redis client
    redis_client = AsyncMock()
    mock_redis.return_value = redis_client
    
    # Mock lock not acquired
    mock_lock.return_value = False
    
    # Mock task
    task = MagicMock()
    task.request.id = "task-123"
    
    # Run task
    with patch('scheduler.tasks.guest_status_checker._check_guest_status_async',
               new_callable=AsyncMock) as mock_async:
        mock_async.return_value = {
            "status": "skipped",
            "reason": "lock_not_acquired"
        }
        
        result = check_guest_status()
        
        assert result["status"] == "skipped"
        assert result["reason"] == "lock_not_acquired"