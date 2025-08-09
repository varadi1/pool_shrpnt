#!/usr/bin/env python3
"""
Test script to verify Azure AD and Microsoft Graph API connections
Version 2 - Using actual implemented methods
"""

import asyncio
import os
import sys
import uuid
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def test_graph_auth():
    """Test Graph API authentication using client credentials"""
    from api.services.auth.graph_auth import GraphAuthService
    
    print("\n=== Testing Graph API Authentication ===")
    try:
        auth_service = GraphAuthService()
        token = await auth_service.get_access_token()
        
        if token:
            print("✅ Successfully obtained Graph API token")
            print(f"   Token length: {len(token)} characters")
            print(f"   Token starts with: {str(token)[:20]}...")
            return True
        else:
            print("❌ Failed to obtain Graph API token")
            return False
    except Exception as e:
        print(f"❌ Error during Graph API authentication: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_graph_api_users():
    """Test Graph API by fetching users"""
    from api.services.auth.graph_auth import graph_auth_service
    
    print("\n=== Testing Graph API - List Users ===")
    try:
        async with graph_auth_service.get_graph_client() as client:
            # Try to get first 5 users
            response = await client.get(
                "/users",
                params={"$top": 5, "$select": "displayName,mail,id"}
            )
            
            if response.status_code == 200:
                data = response.json()
                users = data.get('value', [])
                print(f"✅ Successfully fetched users from Graph API")
                print(f"   Found {len(users)} user(s)")
                for user in users[:2]:  # Show first 2 users
                    print(f"   - {user.get('displayName', 'Unknown')} ({user.get('mail', 'No email')})")
                return True
            else:
                print(f"❌ Failed to fetch users: {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return False
                
    except Exception as e:
        print(f"❌ Error during Graph API users test: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_graph_api_groups():
    """Test Graph API by fetching groups"""
    from api.services.auth.graph_auth import graph_auth_service
    
    print("\n=== Testing Graph API - List Groups ===")
    try:
        async with graph_auth_service.get_graph_client() as client:
            # Try to get first 5 groups
            response = await client.get(
                "/groups",
                params={"$top": 5, "$select": "displayName,id,groupTypes"}
            )
            
            if response.status_code == 200:
                data = response.json()
                groups = data.get('value', [])
                print(f"✅ Successfully fetched groups from Graph API")
                print(f"   Found {len(groups)} group(s)")
                for group in groups[:2]:  # Show first 2 groups
                    print(f"   - {group.get('displayName', 'Unknown')} (ID: {group.get('id', 'Unknown')[:8]}...)")
                return True
            else:
                print(f"❌ Failed to fetch groups: {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return False
                
    except Exception as e:
        print(f"❌ Error during Graph API groups test: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_sharepoint_sites():
    """Test SharePoint API by listing sites"""
    from api.services.auth.graph_auth import graph_auth_service
    
    print("\n=== Testing SharePoint - List Sites ===")
    try:
        async with graph_auth_service.get_graph_client() as client:
            # Try to get SharePoint sites
            response = await client.get(
                "/sites",
                params={"$top": 5, "$select": "displayName,id,webUrl"}
            )
            
            if response.status_code == 200:
                data = response.json()
                sites = data.get('value', [])
                print(f"✅ Successfully fetched SharePoint sites")
                print(f"   Found {len(sites)} site(s)")
                for site in sites[:2]:  # Show first 2 sites
                    print(f"   - {site.get('displayName', 'Unknown')}")
                    print(f"     URL: {site.get('webUrl', 'Unknown')}")
                return True
            else:
                print(f"❌ Failed to fetch sites: {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return False
                
    except Exception as e:
        print(f"❌ Error during SharePoint sites test: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_teams_list():
    """Test Teams API by listing teams"""
    from api.services.auth.graph_auth import graph_auth_service
    
    print("\n=== Testing Teams - List Teams ===")
    try:
        async with graph_auth_service.get_graph_client() as client:
            # Try to get teams (filter groups by resourceProvisioningOptions)
            response = await client.get(
                "/groups",
                params={
                    "$filter": "resourceProvisioningOptions/Any(x:x eq 'Team')",
                    "$top": 5,
                    "$select": "displayName,id,resourceProvisioningOptions"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                teams = data.get('value', [])
                print(f"✅ Successfully fetched Teams")
                print(f"   Found {len(teams)} team(s)")
                for team in teams[:2]:  # Show first 2 teams
                    print(f"   - {team.get('displayName', 'Unknown')} (ID: {team.get('id', 'Unknown')[:8]}...)")
                return True
            else:
                print(f"❌ Failed to fetch teams: {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return False
                
    except Exception as e:
        print(f"❌ Error during Teams list test: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_create_test_team():
    """Test creating a test team (if permissions allow)"""
    from api.services.teams.teams_service import TeamsService
    
    print("\n=== Testing Teams - Create Test Team ===")
    try:
        teams_service = TeamsService()
        
        # Generate a unique test team name
        test_name = f"API_Test_Team_{uuid.uuid4().hex[:8]}"
        
        print(f"   Attempting to create team: {test_name}")
        
        team = await teams_service.create_or_get_team(
            display_name=test_name,
            description="Test team created by API test script",
            owner_ids=[],  # Will use app permissions
            correlation_id=f"test-{uuid.uuid4()}"
        )
        
        if team:
            print(f"✅ Successfully created/retrieved team")
            print(f"   Team Name: {team.get('displayName', 'Unknown')}")
            print(f"   Team ID: {team.get('id', 'Unknown')}")
            return True
        else:
            print("❌ Failed to create team")
            return False
            
    except Exception as e:
        error_str = str(e)
        if "403" in error_str or "Forbidden" in error_str:
            print("⚠️  Insufficient permissions to create teams")
            print("   This is expected if Group.ReadWrite.All is not granted")
            return False
        else:
            print(f"❌ Error during team creation test: {e}")
            import traceback
            traceback.print_exc()
            return False

async def test_retry_mechanism():
    """Test the retry mechanism with Graph API"""
    from api.integrations.graph.retry_adapter import GraphRetryAdapter
    import httpx
    
    print("\n=== Testing Retry Mechanism ===")
    try:
        adapter = GraphRetryAdapter()
        
        # Test with a simple Graph API call
        from api.services.auth.graph_auth import graph_auth_service
        token = await graph_auth_service.get_access_token()
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Create an httpx client and make a request through the retry adapter
        async with httpx.AsyncClient() as client:
            response = await adapter.execute_with_retry(
                client=client,
                method="GET",
                url="https://graph.microsoft.com/v1.0/organization",
                headers=headers
            )
            
            if response and response.status_code == 200:
                data = response.json()
                if data.get("value"):
                    print("✅ Retry mechanism working correctly")
                    org_name = data["value"][0].get("displayName", "Unknown")
                    print(f"   Organization: {org_name}")
                    return True
            else:
                print("❌ Retry mechanism test failed")
                return False
            
    except Exception as e:
        print(f"❌ Error during retry mechanism test: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Run all tests"""
    print("=" * 60)
    print("Azure AD & Microsoft Graph API Test Suite v2")
    print("=" * 60)
    
    # Check environment variables
    required_vars = [
        'POOLDRV_AZURE_CLIENT_ID',
        'POOLDRV_AZURE_CLIENT_SECRET', 
        'POOLDRV_AZURE_TENANT_ID'
    ]
    
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        print(f"❌ Missing required environment variables: {missing_vars}")
        print("   Please check your .env file")
        return
    else:
        print("✅ All required environment variables present")
    
    # Run tests
    results = {}
    
    # Basic authentication test
    results['auth'] = await test_graph_auth()
    
    if results['auth']:  # Only proceed if auth works
        # Test various Graph API endpoints
        results['graph_users'] = await test_graph_api_users()
        results['graph_groups'] = await test_graph_api_groups()
        results['sharepoint_sites'] = await test_sharepoint_sites()
        results['teams_list'] = await test_teams_list()
        
        # Test creating resources (may fail due to permissions)
        results['create_team'] = await test_create_test_team()
        
        # Test retry mechanism
        results['retry'] = await test_retry_mechanism()
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name:20} {status}")
    
    total_passed = sum(1 for passed in results.values() if passed)
    total_tests = len(results)
    
    print(f"\nTotal: {total_passed}/{total_tests} tests passed")
    
    if total_passed == total_tests:
        print("\n🎉 All tests passed! Azure APIs are fully functional.")
    elif total_passed >= 4:
        print("\n✅ Core functionality is working! Some advanced features may need additional permissions.")
    elif total_passed > 0:
        print("\n⚠️  Some tests failed. Check the details above.")
    else:
        print("\n❌ Critical failure. Please check your configuration.")

if __name__ == "__main__":
    asyncio.run(main())