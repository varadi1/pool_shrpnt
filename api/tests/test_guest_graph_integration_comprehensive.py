"""
Comprehensive integration tests for Microsoft Graph API operations.
Tests real Graph API interactions with sandbox tenant (when available).
"""

import pytest
import os
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
import httpx
from typing import Optional

from api.services.sharepoint.graph_client import GraphClient
from api.services.guests.guest_service import GuestService
from api.models.guest import GuestUser, GuestStatus


# Skip these tests if no sandbox tenant configured
SKIP_INTEGRATION = not os.getenv("POOLDRV_SANDBOX_TENANT_ID")
INTEGRATION_REASON = "Requires sandbox tenant configuration"


@pytest.fixture
async def graph_client():
    """Create Graph client for integration testing."""
    if SKIP_INTEGRATION:
        client = MagicMock()
        client.get_guest_user = AsyncMock()
        client.invite_guest_user = AsyncMock()
        client.remove_group_member = AsyncMock()
        client.delete_guest_user = AsyncMock()
        return client

    # Real Graph client for integration tests
    client = GraphClient(
        tenant_id=os.getenv("POOLDRV_SANDBOX_TENANT_ID"),
        client_id=os.getenv("POOLDRV_SANDBOX_CLIENT_ID"),
        client_secret=os.getenv("POOLDRV_SANDBOX_CLIENT_SECRET"),
        use_sandbox=True,
    )
    await client.initialize()
    return client


@pytest.fixture
def guest_service(graph_client):
    """Create GuestService with Graph client."""
    service = GuestService()
    service.graph_client = graph_client
    service.audit_service = AsyncMock()
    service.notification_service = AsyncMock()
    return service


class TestGraphAPIIntegration:
    """Integration tests with Microsoft Graph API."""

    @pytest.mark.asyncio
    @pytest.mark.skipif(SKIP_INTEGRATION, reason=INTEGRATION_REASON)
    async def test_invite_guest_user(self, graph_client):
        """Test inviting a guest user through Graph API."""
        # Generate unique test email
        test_email = f"test_{uuid4().hex[:8]}@testpartner.com"
        display_name = f"Test Guest {datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

        # Invite guest
        result = await graph_client.invite_guest_user(
            email=test_email,
            display_name=display_name,
            redirect_url="https://pooldrv.example.com/welcome",
            send_invitation_message=False,  # Don't send actual email in test
        )

        # Verify invitation created
        assert result["id"] is not None
        assert result["userPrincipalName"] is not None
        assert result["displayName"] == display_name
        assert result["mail"] == test_email
        assert result["userType"] == "Guest"

        # Store for cleanup
        created_user_id = result["id"]

        # Cleanup: Delete test user
        try:
            await graph_client.delete_guest_user(created_user_id)
        except:
            pass  # Best effort cleanup

    @pytest.mark.asyncio
    @pytest.mark.skipif(SKIP_INTEGRATION, reason=INTEGRATION_REASON)
    async def test_get_guest_user(self, graph_client):
        """Test retrieving guest user details from Graph API."""
        # First create a test guest
        test_email = f"test_{uuid4().hex[:8]}@testpartner.com"
        invite_result = await graph_client.invite_guest_user(
            email=test_email,
            display_name="Get Test Guest",
            redirect_url="https://pooldrv.example.com/welcome",
            send_invitation_message=False,
        )

        user_id = invite_result["id"]

        try:
            # Get user details
            user = await graph_client.get_guest_user(user_id)

            # Verify details
            assert user["id"] == user_id
            assert user["displayName"] == "Get Test Guest"
            assert user["mail"] == test_email
            assert user["userType"] == "Guest"

            # Check invitation status
            assert "externalUserState" in user
            assert user["externalUserState"] in ["PendingAcceptance", "Accepted"]

        finally:
            # Cleanup
            await graph_client.delete_guest_user(user_id)

    @pytest.mark.asyncio
    @pytest.mark.skipif(SKIP_INTEGRATION, reason=INTEGRATION_REASON)
    async def test_add_remove_group_member(self, graph_client):
        """Test adding and removing guest from groups."""
        # Create test guest
        test_email = f"test_{uuid4().hex[:8]}@testpartner.com"
        invite_result = await graph_client.invite_guest_user(
            email=test_email,
            display_name="Group Test Guest",
            redirect_url="https://pooldrv.example.com/welcome",
            send_invitation_message=False,
        )

        user_id = invite_result["id"]

        # Get or create test group
        test_group = await graph_client.get_or_create_group(
            display_name=f"TestGroup_{uuid4().hex[:8]}",
            mail_nickname=f"testgroup_{uuid4().hex[:8]}",
            description="Integration test group",
        )

        group_id = test_group["id"]

        try:
            # Add guest to group
            await graph_client.add_group_member(group_id, user_id)

            # Verify membership
            members = await graph_client.get_group_members(group_id)
            member_ids = [m["id"] for m in members]
            assert user_id in member_ids

            # Remove from group
            await graph_client.remove_group_member(group_id, user_id)

            # Verify removal
            members = await graph_client.get_group_members(group_id)
            member_ids = [m["id"] for m in members]
            assert user_id not in member_ids

        finally:
            # Cleanup
            await graph_client.delete_guest_user(user_id)
            await graph_client.delete_group(group_id)

    @pytest.mark.asyncio
    @pytest.mark.skipif(SKIP_INTEGRATION, reason=INTEGRATION_REASON)
    async def test_sharepoint_permissions(self, graph_client):
        """Test SharePoint site permissions for guests."""
        # Create test guest
        test_email = f"test_{uuid4().hex[:8]}@testpartner.com"
        invite_result = await graph_client.invite_guest_user(
            email=test_email,
            display_name="SharePoint Test Guest",
            redirect_url="https://pooldrv.example.com/welcome",
            send_invitation_message=False,
        )

        user_id = invite_result["id"]

        # Get test SharePoint site
        sites = await graph_client.search_sites("Development")
        if not sites:
            pytest.skip("No test SharePoint site available")

        site_id = sites[0]["id"]

        try:
            # Grant permission to site
            await graph_client.grant_site_permission(
                site_id=site_id, user_id=user_id, role="read"  # Read-only access
            )

            # Verify permission granted
            permissions = await graph_client.get_site_permissions(site_id)
            guest_permissions = [
                p
                for p in permissions
                if p.get("grantedTo", {}).get("user", {}).get("id") == user_id
            ]
            assert len(guest_permissions) > 0

            # Revoke permission
            permission_id = guest_permissions[0]["id"]
            await graph_client.revoke_site_permission(site_id, permission_id)

            # Verify revoked
            permissions = await graph_client.get_site_permissions(site_id)
            guest_permissions = [
                p
                for p in permissions
                if p.get("grantedTo", {}).get("user", {}).get("id") == user_id
            ]
            assert len(guest_permissions) == 0

        finally:
            # Cleanup
            await graph_client.delete_guest_user(user_id)

    @pytest.mark.asyncio
    @pytest.mark.skipif(SKIP_INTEGRATION, reason=INTEGRATION_REASON)
    async def test_rate_limit_handling(self, graph_client):
        """Test Graph API rate limit handling."""
        # Create multiple requests rapidly
        requests = []

        for i in range(20):  # Enough to potentially trigger throttling
            test_email = f"ratelimit_{i}_{uuid4().hex[:8]}@test.com"
            requests.append({"email": test_email, "display_name": f"Rate Limit Test {i}"})

        created_users = []
        throttled = False

        try:
            for req in requests:
                try:
                    result = await graph_client.invite_guest_user(
                        email=req["email"],
                        display_name=req["display_name"],
                        redirect_url="https://pooldrv.example.com/welcome",
                        send_invitation_message=False,
                    )
                    created_users.append(result["id"])

                except RateLimitException as e:
                    throttled = True
                    # Verify retry-after header handling
                    assert e.retry_after > 0

                    # Wait and retry
                    import asyncio

                    await asyncio.sleep(e.retry_after)

                    # Retry should succeed
                    result = await graph_client.invite_guest_user(
                        email=req["email"],
                        display_name=req["display_name"],
                        redirect_url="https://pooldrv.example.com/welcome",
                        send_invitation_message=False,
                    )
                    created_users.append(result["id"])

        finally:
            # Cleanup all created users
            for user_id in created_users:
                try:
                    await graph_client.delete_guest_user(user_id)
                except:
                    pass

    @pytest.mark.asyncio
    @pytest.mark.skipif(SKIP_INTEGRATION, reason=INTEGRATION_REASON)
    async def test_batch_operations(self, graph_client):
        """Test Graph API batch operations."""
        # Prepare batch requests
        batch_requests = []

        for i in range(5):
            batch_requests.append(
                {
                    "id": str(i),
                    "method": "POST",
                    "url": "/users",
                    "body": {
                        "displayName": f"Batch Test {i}",
                        "mail": f"batch_{i}_{uuid4().hex[:8]}@test.com",
                        "userType": "Guest",
                    },
                }
            )

        # Execute batch
        results = await graph_client.batch_request(batch_requests)

        # Verify batch results
        assert len(results["responses"]) == 5

        created_users = []
        for response in results["responses"]:
            if response["status"] == 201:  # Created
                created_users.append(response["body"]["id"])

        # Cleanup
        for user_id in created_users:
            try:
                await graph_client.delete_guest_user(user_id)
            except:
                pass

    @pytest.mark.asyncio
    @pytest.mark.skipif(SKIP_INTEGRATION, reason=INTEGRATION_REASON)
    async def test_eventual_consistency(self, graph_client):
        """Test handling of eventual consistency in Graph API."""
        # Create a guest user
        test_email = f"consistency_{uuid4().hex[:8]}@test.com"
        invite_result = await graph_client.invite_guest_user(
            email=test_email,
            display_name="Consistency Test",
            redirect_url="https://pooldrv.example.com/welcome",
            send_invitation_message=False,
        )

        user_id = invite_result["id"]

        try:
            # Immediately try to get user (might fail due to propagation)
            max_retries = 10
            retry_count = 0
            user = None

            while retry_count < max_retries:
                try:
                    user = await graph_client.get_guest_user(user_id)
                    break
                except GraphAPIException as e:
                    if e.status_code == 404:
                        # User not yet propagated
                        retry_count += 1
                        import asyncio

                        await asyncio.sleep(1)  # Wait 1 second
                    else:
                        raise

            # Should eventually succeed
            assert user is not None
            assert user["id"] == user_id

            # Test group membership eventual consistency
            test_group = await graph_client.get_or_create_group(
                display_name=f"ConsistencyGroup_{uuid4().hex[:8]}",
                mail_nickname=f"consistency_{uuid4().hex[:8]}",
                description="Consistency test",
            )

            group_id = test_group["id"]

            # Add to group
            await graph_client.add_group_member(group_id, user_id)

            # Check membership (might take time to propagate)
            retry_count = 0
            member_found = False

            while retry_count < max_retries and not member_found:
                members = await graph_client.get_group_members(group_id)
                member_ids = [m["id"] for m in members]
                if user_id in member_ids:
                    member_found = True
                else:
                    retry_count += 1
                    import asyncio

                    await asyncio.sleep(1)

            assert member_found, "Member not found after retries"

            # Cleanup group
            await graph_client.delete_group(group_id)

        finally:
            # Cleanup user
            await graph_client.delete_guest_user(user_id)

    @pytest.mark.asyncio
    @pytest.mark.skipif(SKIP_INTEGRATION, reason=INTEGRATION_REASON)
    async def test_error_handling(self, graph_client):
        """Test Graph API error handling."""
        # Test 404 - User not found
        with pytest.raises(GraphAPIException) as exc_info:
            await graph_client.get_guest_user(str(uuid4()))
        assert exc_info.value.status_code == 404

        # Test 400 - Invalid request
        with pytest.raises(GraphAPIException) as exc_info:
            await graph_client.invite_guest_user(
                email="invalid-email",  # Invalid email format
                display_name="Test",
                redirect_url="https://example.com",
                send_invitation_message=False,
            )
        assert exc_info.value.status_code == 400

        # Test 403 - Forbidden (if permissions insufficient)
        # This would require a client with limited permissions

        # Test timeout handling
        with patch.object(
            graph_client.http_client, "post", side_effect=httpx.TimeoutException("Timeout")
        ):
            with pytest.raises(httpx.TimeoutException):
                await graph_client.invite_guest_user(
                    email="timeout@test.com",
                    display_name="Timeout Test",
                    redirect_url="https://example.com",
                    send_invitation_message=False,
                )

    @pytest.mark.asyncio
    @pytest.mark.skipif(SKIP_INTEGRATION, reason=INTEGRATION_REASON)
    async def test_compensation_logic(self, guest_service, graph_client):
        """Test compensation when partial operations fail."""
        # Create test guest
        test_email = f"compensation_{uuid4().hex[:8]}@test.com"
        invite_result = await graph_client.invite_guest_user(
            email=test_email,
            display_name="Compensation Test",
            redirect_url="https://pooldrv.example.com/welcome",
            send_invitation_message=False,
        )

        user_id = invite_result["id"]

        # Create multiple groups
        group_ids = []
        for i in range(3):
            group = await graph_client.get_or_create_group(
                display_name=f"CompGroup_{i}_{uuid4().hex[:8]}",
                mail_nickname=f"comp_{i}_{uuid4().hex[:8]}",
                description=f"Compensation test group {i}",
            )
            group_ids.append(group["id"])

            # Add to group
            await graph_client.add_group_member(group["id"], user_id)

        try:
            # Mock partial failure during removal
            original_remove = graph_client.remove_group_member
            call_count = 0

            async def mock_remove(group_id, user_id):
                nonlocal call_count
                call_count += 1
                if call_count == 2:  # Fail on second group
                    raise GraphAPIException("Simulated failure", status_code=500)
                return await original_remove(group_id, user_id)

            graph_client.remove_group_member = mock_remove

            # Attempt to remove from all groups (should handle failure)
            results = []
            for group_id in group_ids:
                try:
                    await graph_client.remove_group_member(group_id, user_id)
                    results.append({"group_id": group_id, "success": True})
                except GraphAPIException:
                    results.append({"group_id": group_id, "success": False})

            # Verify partial success
            success_count = sum(1 for r in results if r["success"])
            assert success_count == 2  # Two should succeed

            # Compensation: Retry failed operations
            for result in results:
                if not result["success"]:
                    graph_client.remove_group_member = original_remove
                    await graph_client.remove_group_member(result["group_id"], user_id)

        finally:
            # Cleanup
            await graph_client.delete_guest_user(user_id)
            for group_id in group_ids:
                try:
                    await graph_client.delete_group(group_id)
                except:
                    pass
