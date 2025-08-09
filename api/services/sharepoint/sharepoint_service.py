"""SharePoint provisioning service for document libraries and folder structures."""

import logging
from urllib.parse import quote

import httpx

from api.services.auth import graph_auth_service

logger = logging.getLogger(__name__)


class SharePointService:
    """Service for provisioning SharePoint document libraries and folder structures."""

    def __init__(self):
        """Initialize SharePoint service."""
        self.auth_service = graph_auth_service

    async def create_document_library(
        self,
        site_id: str,
        library_name: str,
        description: str,
        correlation_id: str,
    ) -> dict:
        """Create a document library in SharePoint site.

        Args:
            site_id: SharePoint site ID
            library_name: Name of the document library
            description: Library description
            correlation_id: Correlation ID for tracking

        Returns:
            Dict: Document library object

        Raises:
            Exception: If library creation fails
        """
        async with self.auth_service.get_graph_client() as client:
            # Check if library already exists
            existing_library = await self._find_library_by_name(client, site_id, library_name)
            if existing_library:
                logger.info(
                    f"Document library already exists: {library_name}",
                    extra={"correlation_id": correlation_id},
                )
                return existing_library

            # Create new document library
            logger.info(
                f"Creating document library: {library_name}",
                extra={"correlation_id": correlation_id},
            )

            library_body = {
                "displayName": library_name,
                "description": description,
                "list": {
                    "template": "documentLibrary",
                    "hidden": False,
                },
            }

            request_headers = {"client-request-id": correlation_id}

            response = await client.post(
                f"/sites/{site_id}/lists",
                json=library_body,
                headers=request_headers,
            )

            if response.status_code != 201:
                error_msg = (
                    f"Failed to create document library: {response.status_code} - {response.text}"
                )
                logger.error(error_msg, extra={"correlation_id": correlation_id})
                raise Exception(error_msg)

            library = response.json()
            logger.info(
                f"Successfully created document library: {library_name} (ID: {library['id']})",
                extra={"correlation_id": correlation_id},
            )

            return library

    async def attach_library_to_team(
        self,
        team_id: str,
        site_id: str,
        library_id: str,
        tab_name: str,
        correlation_id: str,
    ) -> dict:
        """Attach a SharePoint document library to a Teams channel as a tab.

        Args:
            team_id: Team ID
            site_id: SharePoint site ID
            library_id: Document library ID
            tab_name: Name for the tab in Teams
            correlation_id: Correlation ID for tracking

        Returns:
            Dict: Tab object

        Raises:
            Exception: If attachment fails
        """
        async with self.auth_service.get_graph_client() as client:
            # Get the default channel (General)
            channels_response = await client.get(f"/teams/{team_id}/channels")
            if channels_response.status_code != 200:
                raise Exception(f"Failed to get channels: {channels_response.status_code}")

            channels = channels_response.json().get("value", [])
            general_channel = next(
                (ch for ch in channels if ch.get("displayName") == "General"),
                channels[0] if channels else None,
            )

            if not general_channel:
                raise Exception("No channels found in team")

            channel_id = general_channel["id"]

            # Create tab configuration
            tab_body = {
                "displayName": tab_name,
                "teamsApp@odata.bind": "https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/com.microsoft.teamspace.tab.files.sharepoint",
                "configuration": {
                    "entityId": "",
                    "contentUrl": f"https://graph.microsoft.com/v1.0/sites/{site_id}/lists/{library_id}",
                    "websiteUrl": f"https://graph.microsoft.com/v1.0/sites/{site_id}/lists/{library_id}",
                    "removeUrl": None,
                },
            }

            request_headers = {"client-request-id": correlation_id}

            response = await client.post(
                f"/teams/{team_id}/channels/{channel_id}/tabs",
                json=tab_body,
                headers=request_headers,
            )

            if response.status_code != 201:
                error_msg = (
                    f"Failed to attach library to team: {response.status_code} - {response.text}"
                )
                logger.error(error_msg, extra={"correlation_id": correlation_id})
                raise Exception(error_msg)

            tab = response.json()
            logger.info(
                f"Successfully attached library as tab: {tab_name}",
                extra={"correlation_id": correlation_id},
            )

            return tab

    async def create_folder_structure(
        self,
        site_id: str,
        library_id: str,
        folder_template: dict,
        parent_path: str = "",
        correlation_id: str = "",
    ) -> list[dict]:
        """Create folder structure from template in document library.

        Args:
            site_id: SharePoint site ID
            library_id: Document library ID
            folder_template: Folder structure template
            parent_path: Parent folder path
            correlation_id: Correlation ID for tracking

        Returns:
            List[Dict]: Created folders

        Raises:
            Exception: If folder creation fails
        """
        created_folders = []

        async with self.auth_service.get_graph_client() as client:
            for folder_name, subfolders in folder_template.items():
                # Apply naming conventions
                formatted_name = self._apply_naming_convention(folder_name)
                full_path = f"{parent_path}/{formatted_name}" if parent_path else formatted_name

                # Create folder
                folder = await self._create_folder(
                    client, site_id, library_id, formatted_name, parent_path, correlation_id
                )
                created_folders.append(folder)

                # Recursively create subfolders
                if isinstance(subfolders, dict) and subfolders:
                    subfolder_results = await self.create_folder_structure(
                        site_id, library_id, subfolders, full_path, correlation_id
                    )
                    created_folders.extend(subfolder_results)

        return created_folders

    async def break_permission_inheritance(
        self,
        site_id: str,
        item_id: str,
        copy_role_assignments: bool = False,
        correlation_id: str = "",
    ) -> bool:
        """Break permission inheritance for a folder.

        Args:
            site_id: SharePoint site ID
            item_id: Folder/item ID
            copy_role_assignments: Whether to copy existing permissions
            correlation_id: Correlation ID for tracking

        Returns:
            bool: Success status

        Raises:
            Exception: If operation fails
        """
        async with self.auth_service.get_graph_client() as client:
            request_headers = {"client-request-id": correlation_id}

            response = await client.post(
                f"/sites/{site_id}/drive/items/{item_id}/permissions/breakInheritance",
                json={"copyRoleAssignments": copy_role_assignments},
                headers=request_headers,
            )

            if response.status_code not in [200, 204]:
                error_msg = f"Failed to break permission inheritance: {response.status_code}"
                logger.error(error_msg, extra={"correlation_id": correlation_id})
                raise Exception(error_msg)

            logger.info(
                f"Successfully broke permission inheritance for item {item_id}",
                extra={"correlation_id": correlation_id},
            )

            return True

    async def _find_library_by_name(
        self, client: httpx.AsyncClient, site_id: str, library_name: str
    ) -> dict | None:
        """Find a document library by name.

        Args:
            client: Authenticated Graph API client
            site_id: SharePoint site ID
            library_name: Library name to search for

        Returns:
            Optional[Dict]: Library object if found, None otherwise
        """
        response = await client.get(
            f"/sites/{site_id}/lists",
            params={
                "$filter": f"displayName eq '{library_name}'",
                "$select": "id,displayName,description",
            },
        )

        if response.status_code != 200:
            logger.warning(f"Failed to search for library: {response.status_code}")
            return None

        data = response.json()
        libraries = data.get("value", [])

        if libraries:
            return libraries[0]
        return None

    async def _create_folder(
        self,
        client: httpx.AsyncClient,
        site_id: str,
        library_id: str,
        folder_name: str,
        parent_path: str,
        correlation_id: str,
    ) -> dict:
        """Create a single folder in the document library.

        Args:
            client: Authenticated Graph API client
            site_id: SharePoint site ID
            library_id: Document library ID
            folder_name: Folder name
            parent_path: Parent folder path
            correlation_id: Correlation ID for tracking

        Returns:
            Dict: Created folder object

        Raises:
            Exception: If folder creation fails
        """
        # Get the drive ID for the library
        drive_response = await client.get(f"/sites/{site_id}/lists/{library_id}/drive")
        if drive_response.status_code != 200:
            raise Exception(f"Failed to get drive: {drive_response.status_code}")

        drive_id = drive_response.json()["id"]

        # Build the parent path URL
        if parent_path:
            parent_item_path = f"/sites/{site_id}/drives/{drive_id}/root:/{quote(parent_path)}"
        else:
            parent_item_path = f"/sites/{site_id}/drives/{drive_id}/root"

        # Create folder
        folder_body = {
            "name": folder_name,
            "folder": {},
            "@microsoft.graph.conflictBehavior": "rename",
        }

        request_headers = {"client-request-id": correlation_id}

        response = await client.post(
            f"{parent_item_path}/children",
            json=folder_body,
            headers=request_headers,
        )

        if response.status_code not in [201, 200]:
            # Check if folder already exists
            if response.status_code == 409:
                logger.info(
                    f"Folder already exists: {folder_name}",
                    extra={"correlation_id": correlation_id},
                )
                # Try to get existing folder
                get_response = await client.get(
                    f"{parent_item_path}:/{quote(folder_name)}",
                    headers=request_headers,
                )
                if get_response.status_code == 200:
                    return get_response.json()

            error_msg = f"Failed to create folder: {response.status_code} - {response.text}"
            logger.error(error_msg, extra={"correlation_id": correlation_id})
            raise Exception(error_msg)

        folder = response.json()
        logger.info(
            f"Successfully created folder: {folder_name}", extra={"correlation_id": correlation_id}
        )

        return folder

    def _apply_naming_convention(self, folder_name: str) -> str:
        """Apply PRD naming conventions to folder names.

        Args:
            folder_name: Original folder name

        Returns:
            str: Formatted folder name
        """
        # Replace placeholders with actual values
        # This would be expanded based on context
        replacements = {
            "{YEAR}": "2025",
            "{PART}": "A",
            "{EM_ID}": "001",
            "{DATE}": "20250115",
        }

        formatted = folder_name
        for placeholder, value in replacements.items():
            formatted = formatted.replace(placeholder, value)

        return formatted

    def generate_folder_template_from_structure(self, structure_definition: str) -> dict:
        """Generate folder template from NEU structure definition.

        Args:
            structure_definition: Folder structure definition string

        Returns:
            Dict: Nested dictionary representing folder structure
        """
        template = {}
        lines = structure_definition.strip().split("\n")
        current_path = []
        current_level = 0

        for line in lines:
            if "📁" in line:
                # Count indentation level
                indent = (len(line) - len(line.lstrip())) // 4
                folder_name = line.split("📁")[-1].strip()

                # Adjust current path based on indentation
                if indent <= current_level:
                    current_path = current_path[:indent]

                current_path.append(folder_name)
                current_level = indent

                # Build nested structure
                self._set_nested_dict(template, current_path, {})

        return template

    def _set_nested_dict(self, d: dict, path: list[str], value: dict) -> None:
        """Set value in nested dictionary using path.

        Args:
            d: Dictionary to modify
            path: List of keys representing path
            value: Value to set
        """
        for key in path[:-1]:
            d = d.setdefault(key, {})
        d[path[-1]] = value


# Singleton instance
sharepoint_service = SharePointService()
