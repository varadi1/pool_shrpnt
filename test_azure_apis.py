#!/usr/bin/env python3
"""
Test script to verify Azure AD and Microsoft Graph API connections
"""

import asyncio
import os
import sys
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
            print(f"   Token type: {type(token)}")
            print(f"   Token starts with: {str(token)[:20]}..." if token else "No token")
            return True
        else:
            print("❌ Failed to obtain Graph API token")
            return False
    except Exception as e:
        print(f"❌ Error during Graph API authentication: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_graph_basic_query():
    """Test basic Graph API query"""
    from api.services.auth.graph_auth import GraphAuthService
    import httpx
    
    print("\n=== Testing Basic Graph API Query ===")
    try:
        auth_service = GraphAuthService()
        token = await auth_service.get_access_token()
        
        if not token:
            print("❌ No token available")
            return False
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            # Test getting organization info
            response = await client.get(
                "https://graph.microsoft.com/v1.0/organization",
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                print("✅ Successfully queried Graph API")
                org_data = response.json()
                if org_data.get('value'):
                    org_name = org_data['value'][0].get('displayName', 'Unknown')
                    print(f"   Organization: {org_name}")
                return True
            else:
                print(f"❌ Graph API query failed: {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return False
                
    except Exception as e:
        print(f"❌ Error during Graph API query: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_sharepoint_connection():
    """Test SharePoint API connection"""
    from api.services.sharepoint.sharepoint_service import SharePointService
    
    print("\n=== Testing SharePoint Connection ===")
    try:
        sp_service = SharePointService()
        
        # Try to get site info
        site_info = await sp_service.get_site_info()
        
        if site_info:
            print("✅ Successfully connected to SharePoint")
            print(f"   Site Name: {site_info.get('displayName', 'Unknown')}")
            print(f"   Site ID: {site_info.get('id', 'Unknown')[:50]}...")
            return True
        else:
            print("❌ Failed to get SharePoint site info")
            return False
            
    except Exception as e:
        print(f"❌ Error during SharePoint connection: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_teams_api():
    """Test Teams API"""
    from api.services.teams.teams_service import TeamsService
    
    print("\n=== Testing Teams API ===")
    try:
        teams_service = TeamsService()
        
        # Try to list teams (requires appropriate permissions)
        teams = await teams_service.list_teams(limit=1)
        
        if teams is not None:
            print("✅ Successfully connected to Teams API")
            print(f"   Found {len(teams)} team(s)")
            return True
        else:
            print("⚠️  Teams API responded but no teams found (this might be normal)")
            return True
            
    except Exception as e:
        error_str = str(e)
        if "403" in error_str or "Forbidden" in error_str:
            print("⚠️  Teams API access denied - check permissions")
            print("   This might be expected if Group.ReadWrite.All permission is not granted")
            return False
        else:
            print(f"❌ Error during Teams API test: {e}")
            import traceback
            traceback.print_exc()
            return False

async def test_token_refresh():
    """Test token refresh mechanism"""
    from api.services.auth.graph_auth import GraphAuthService
    import time
    
    print("\n=== Testing Token Refresh Mechanism ===")
    try:
        auth_service = GraphAuthService()
        
        # Get initial token
        token1 = await auth_service.get_access_token()
        if not token1:
            print("❌ Failed to get initial token")
            return False
        
        print("✅ Got initial token")
        
        # Force cache clear (if implemented)
        if hasattr(auth_service, '_token'):
            auth_service._token = None
        
        # Get another token (should be new or from cache)
        token2 = await auth_service.get_access_token()
        if not token2:
            print("❌ Failed to get second token")
            return False
            
        print("✅ Got second token")
        
        # Tokens should work but might be same if cached
        if token1 == token2:
            print("   Tokens are same (likely cached)")
        else:
            print("   Tokens are different (new token acquired)")
            
        return True
        
    except Exception as e:
        print(f"❌ Error during token refresh test: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Run all tests"""
    print("=" * 60)
    print("Azure AD & Microsoft Graph API Test Suite")
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
    
    results['auth'] = await test_graph_auth()
    
    if results['auth']:  # Only proceed if auth works
        results['graph_query'] = await test_graph_basic_query()
        results['sharepoint'] = await test_sharepoint_connection()
        results['teams'] = await test_teams_api()
        results['token_refresh'] = await test_token_refresh()
    
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
        print("\n🎉 All tests passed! Azure APIs are working correctly.")
    elif total_passed > 0:
        print("\n⚠️  Some tests failed. Check the details above.")
    else:
        print("\n❌ All tests failed. Please check your configuration.")

if __name__ == "__main__":
    asyncio.run(main())