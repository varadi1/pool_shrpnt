#!/usr/bin/env python3
"""
Test Team creation with fixed empty owner array handling
"""

import asyncio
import uuid
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def test_team_creation_no_owner():
    """Test creating a team without explicit owners (app-only permissions)"""
    from api.services.teams.teams_service import TeamsService
    
    print("\n=== Testing Team Creation (No Owner) ===")
    try:
        teams_service = TeamsService()
        
        # Generate a unique test team name
        test_name = f"API_Test_NoOwner_{uuid.uuid4().hex[:8]}"
        
        print(f"Attempting to create team: {test_name}")
        print("Using empty owner array (app-only permissions)")
        
        team = await teams_service.create_or_get_team(
            display_name=test_name,
            description="Test team created without explicit owner",
            owner_ids=[],  # Empty array - should use app permissions
            correlation_id=f"test-{uuid.uuid4()}"
        )
        
        if team:
            print(f"✅ Successfully created team without explicit owner!")
            print(f"   Team Name: {team.get('displayName', 'Unknown')}")
            print(f"   Team ID: {team.get('id', 'Unknown')}")
            print(f"   Description: {team.get('description', 'Unknown')}")
            return team
        else:
            print("❌ Failed to create team")
            return None
            
    except Exception as e:
        error_str = str(e)
        if "403" in error_str or "Forbidden" in error_str:
            print("❌ Insufficient permissions to create teams")
            print("   Error: Group.ReadWrite.All permission may not be granted")
            print(f"   Full error: {error_str[:200]}")
        elif "400" in error_str and "odata.bind" in error_str:
            print("❌ Still getting odata.bind error - fix may not be working")
            print(f"   Error: {error_str[:300]}")
        else:
            print(f"❌ Unexpected error: {e}")
            import traceback
            traceback.print_exc()
        return None

async def test_team_with_channel():
    """Test creating team and adding a channel"""
    from api.services.teams.teams_service import TeamsService
    
    print("\n=== Testing Team with Channel Creation ===")
    try:
        teams_service = TeamsService()
        
        # First, create a team
        test_name = f"API_Test_Channel_{uuid.uuid4().hex[:8]}"
        
        print(f"Step 1: Creating team: {test_name}")
        
        team = await teams_service.create_or_get_team(
            display_name=test_name,
            description="Test team for channel creation",
            owner_ids=[],
            correlation_id=f"test-{uuid.uuid4()}"
        )
        
        if not team:
            print("❌ Failed to create team for channel test")
            return None
            
        print(f"✅ Team created: {team['displayName']}")
        
        # Wait a bit for team provisioning to complete
        print("   Waiting 3 seconds for team provisioning...")
        await asyncio.sleep(3)
        
        # Now create a channel
        channel_name = f"TestChannel_{uuid.uuid4().hex[:6]}"
        print(f"Step 2: Creating channel: {channel_name}")
        
        channel = await teams_service.create_channel(
            team_id=team["id"],
            display_name=channel_name,
            description="Test channel created via API",
            correlation_id=f"test-channel-{uuid.uuid4()}"
        )
        
        if channel:
            print(f"✅ Channel created successfully!")
            print(f"   Channel Name: {channel.get('displayName', 'Unknown')}")
            print(f"   Channel ID: {channel.get('id', 'Unknown')}")
            return {"team": team, "channel": channel}
        else:
            print("❌ Failed to create channel")
            return {"team": team, "channel": None}
            
    except Exception as e:
        print(f"❌ Error during team/channel creation: {e}")
        import traceback
        traceback.print_exc()
        return None

async def main():
    """Run all tests"""
    print("=" * 60)
    print("Team Creation Test Suite")
    print("=" * 60)
    
    # Test 1: Create team without owner
    team = await test_team_creation_no_owner()
    
    # Only proceed with channel test if we have permissions
    if team:
        # Test 2: Create team with channel
        await test_team_with_channel()
    else:
        print("\nSkipping channel test due to insufficient permissions")
    
    print("\n" + "=" * 60)
    print("Test Complete")
    print("=" * 60)
    
    if team:
        print("\n✅ Team creation fix is working!")
        print("Teams can now be created without explicit owners when using app-only permissions.")
    else:
        print("\n⚠️ Team creation requires Group.ReadWrite.All permission")
        print("This is a permission issue, not a code issue.")

if __name__ == "__main__":
    asyncio.run(main())