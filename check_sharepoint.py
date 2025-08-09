#!/usr/bin/env python3
"""
Check available SharePoint sites
"""

import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
import httpx
from msal import ConfidentialClientApplication

# Load environment variables
load_dotenv(Path(__file__).parent / ".env")

async def list_sharepoint_sites():
    """List all SharePoint sites accessible by the app"""
    
    # Get credentials
    tenant_id = os.getenv("AZURE_TENANT_ID")
    client_id = os.getenv("AZURE_CLIENT_ID")
    client_secret = os.getenv("AZURE_CLIENT_SECRET")
    
    # Get token
    app = ConfidentialClientApplication(
        client_id,
        authority=f"https://login.microsoftonline.com/{tenant_id}",
        client_credential=client_secret,
    )
    
    result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
    
    if "access_token" not in result:
        print(f"❌ Failed to get token: {result.get('error_description')}")
        return
    
    # List sites
    async with httpx.AsyncClient() as client:
        headers = {"Authorization": f"Bearer {result['access_token']}"}
        
        print("🔍 Searching for SharePoint sites...\n")
        
        # 1. List all sites
        response = await client.get(
            "https://graph.microsoft.com/v1.0/sites?$top=20",
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 200:
            sites = response.json().get("value", [])
            print(f"📁 Found {len(sites)} SharePoint sites:\n")
            
            for site in sites:
                name = site.get("displayName", site.get("name", "Unknown"))
                web_url = site.get("webUrl", "")
                site_id = site.get("id", "")
                
                print(f"📌 {name}")
                print(f"   URL: {web_url}")
                print(f"   ID: {site_id[:50]}...")
                
                # Check if it's a Pool-related site
                if "pool" in name.lower() or "pool" in web_url.lower():
                    print("   ⭐ This might be the PoolDrive site!")
                print()
        else:
            print(f"❌ Failed to list sites: {response.status_code}")
            print(f"   {response.text[:200]}")
        
        # 2. Search for Pool-related sites
        print("\n🔍 Searching for 'Pool' in site names...")
        search_response = await client.get(
            "https://graph.microsoft.com/v1.0/sites?search=pool",
            headers=headers,
            timeout=30
        )
        
        if search_response.status_code == 200:
            pool_sites = search_response.json().get("value", [])
            if pool_sites:
                print(f"✅ Found {len(pool_sites)} Pool-related sites:")
                for site in pool_sites:
                    print(f"   - {site.get('displayName')}: {site.get('webUrl')}")
            else:
                print("⚠️  No sites found with 'Pool' in the name")
        
        # 3. Try specific tenant root
        print(f"\n🏢 Checking tenant root site...")
        root_response = await client.get(
            "https://graph.microsoft.com/v1.0/sites/nffku.sharepoint.com",
            headers=headers,
            timeout=30
        )
        
        if root_response.status_code == 200:
            root_site = root_response.json()
            print(f"✅ Tenant root: {root_site.get('webUrl')}")
        else:
            print(f"⚠️  Could not access tenant root")

if __name__ == "__main__":
    print("=" * 60)
    print("SharePoint Sites Discovery")
    print("=" * 60 + "\n")
    asyncio.run(list_sharepoint_sites())