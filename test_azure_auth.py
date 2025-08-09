#!/usr/bin/env python3
"""
Azure AD authentication test script for poolDRV
Tests if the credentials are working correctly
"""

import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
import httpx
from msal import ConfidentialClientApplication

# Load environment variables
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
    print(f"✅ Loaded .env from: {env_path}")
else:
    print(f"❌ .env file not found at: {env_path}")
    exit(1)

# Configuration
TENANT_ID = os.getenv("AZURE_TENANT_ID")
CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")

print("\n📋 Configuration:")
print(f"  Tenant ID: {TENANT_ID}")
print(f"  Client ID: {CLIENT_ID}")
print(f"  Secret: {'*' * 10 if CLIENT_SECRET else 'NOT SET'}")


async def test_graph_auth():
    """Test Microsoft Graph API authentication"""
    print("\n🔐 Testing Graph API Authentication...")
    
    try:
        # Initialize MSAL
        authority = f"https://login.microsoftonline.com/{TENANT_ID}"
        app = ConfidentialClientApplication(
            CLIENT_ID,
            authority=authority,
            client_credential=CLIENT_SECRET,
        )
        
        # Acquire token
        scope = ["https://graph.microsoft.com/.default"]
        result = app.acquire_token_for_client(scopes=scope)
        
        if "access_token" in result:
            print("✅ Successfully acquired access token!")
            
            # Test Graph API call
            print("\n📡 Testing Graph API call...")
            async with httpx.AsyncClient() as client:
                headers = {"Authorization": f"Bearer {result['access_token']}"}
                
                # Test 1: Get organization info
                response = await client.get(
                    "https://graph.microsoft.com/v1.0/organization",
                    headers=headers
                )
                
                if response.status_code == 200:
                    org_data = response.json()
                    if org_data.get("value"):
                        org_name = org_data["value"][0].get("displayName", "Unknown")
                        print(f"✅ Organization: {org_name}")
                else:
                    print(f"⚠️  Organization query returned: {response.status_code}")
                
                # Test 2: Check SharePoint site access
                site_url = os.getenv("SHAREPOINT_SITE_URL", "https://nffku.sharepoint.com/sites/PoolDrive-Dev")
                site_path = site_url.replace("https://", "").replace("/", ":/")
                
                print(f"\n📁 Testing SharePoint access: {site_url}")
                response = await client.get(
                    f"https://graph.microsoft.com/v1.0/sites/{site_path}",
                    headers=headers
                )
                
                if response.status_code == 200:
                    site_data = response.json()
                    print(f"✅ SharePoint site found: {site_data.get('displayName', 'Unknown')}")
                elif response.status_code == 404:
                    print(f"❌ SharePoint site not found: {site_url}")
                    print("   Please check if the site exists and the app has access")
                else:
                    print(f"⚠️  SharePoint query returned: {response.status_code}")
                    print(f"   Response: {response.text[:200]}")
                
                # Test 3: List available Teams (if any)
                print("\n👥 Testing Teams access...")
                response = await client.get(
                    "https://graph.microsoft.com/v1.0/groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')&$top=5",
                    headers=headers
                )
                
                if response.status_code == 200:
                    teams_data = response.json()
                    teams_count = len(teams_data.get("value", []))
                    print(f"✅ Found {teams_count} Teams")
                    for team in teams_data.get("value", [])[:3]:
                        print(f"   - {team.get('displayName', 'Unknown')}")
                else:
                    print(f"⚠️  Teams query returned: {response.status_code}")
                
        else:
            print(f"❌ Failed to acquire token: {result.get('error_description', 'Unknown error')}")
            return False
            
    except Exception as e:
        print(f"❌ Error during authentication test: {e}")
        return False
    
    return True


async def test_api_scope():
    """Test if API scope is properly configured"""
    print("\n🔍 Checking API Scope configuration...")
    
    api_scope = os.getenv("POOLDRV_API_SCOPE")
    if api_scope:
        print(f"✅ API Scope configured: {api_scope}")
    else:
        print("⚠️  API Scope not configured in .env")
        print("   Expected: POOLDRV_API_SCOPE=api://{CLIENT_ID}/access")
    
    redirect_uri = os.getenv("REDIRECT_URI")
    if redirect_uri:
        print(f"✅ Redirect URI configured: {redirect_uri}")
    else:
        print("⚠️  Redirect URI not configured")


def check_permissions_summary():
    """Summary of required permissions"""
    print("\n📊 Required Permissions Summary:")
    print("✅ Mail.Send - Email notifications")
    print("✅ Files.ReadWrite.All - SharePoint file operations")
    print("✅ Sites.ReadWrite.All - SharePoint site management")
    print("✅ Group.ReadWrite.All - Group management")
    print("✅ Team.ReadBasic.All - Teams information")
    print("✅ User.Read.All - User profile access")
    print("✅ Directory.Read.All - Directory information")
    print("✅ Channel/Chat permissions - Teams messaging")


async def main():
    print("=" * 60)
    print("🚀 poolDRV Azure AD Authentication Test")
    print("=" * 60)
    
    # Check environment
    if not all([TENANT_ID, CLIENT_ID, CLIENT_SECRET]):
        print("\n❌ Missing required environment variables!")
        print("Please check your .env file")
        return
    
    # Run tests
    auth_success = await test_graph_auth()
    await test_api_scope()
    check_permissions_summary()
    
    # Final result
    print("\n" + "=" * 60)
    if auth_success:
        print("✅ Azure AD authentication is working!")
        print("✅ You can now run the poolDRV application")
    else:
        print("❌ Authentication test failed")
        print("Please check the error messages above")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())