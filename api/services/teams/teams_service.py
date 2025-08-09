"""Microsoft Teams provisioning service."""

import logging

import httpx

from api.services.auth import graph_auth_service

logger = logging.getLogger(__name__)


class TeamsService:
    """Service for provisioning Teams groups and channels."""

    def __init__(self):
        """Initialize Teams service."""
        self.auth_service = graph_auth_service

    async def create_or_get_team(
        self,
        display_name: str,
        description: str,
        owner_ids: list[str],
        correlation_id: str,
    ) -> dict:
        """Create a new Team or get existing one by display name.

        Args:
            display_name: Team display name
            description: Team description
            owner_ids: List of owner user IDs
            correlation_id: Correlation ID for tracking

        Returns:
            Dict: Team object with id, displayName, etc.

        Raises:
            Exception: If team creation fails
        """
        async with self.auth_service.get_graph_client() as client:
            # First, check if team already exists
            existing_team = await self._find_team_by_name(client, display_name)
            if existing_team:
                logger.info(
                    f"Team already exists: {display_name} (ID: {existing_team['id']})",
                    extra={"correlation_id": correlation_id},
                )
                return existing_team

            # Create new team
            logger.info(
                f"Creating new team: {display_name}", extra={"correlation_id": correlation_id}
            )

            # Create group first, then teamify it
            group_body = {
                "displayName": display_name,
                "description": description,
                "groupTypes": ["Unified"],
                "mailEnabled": True,
                "mailNickname": self._generate_mail_nickname(display_name),
                "securityEnabled": False,
            }

            # Only add owners if list is not empty
            # When using app-only permissions, the app becomes the owner by default
            if owner_ids and len(owner_ids) > 0:
                group_body["owners@odata.bind"] = [
                    f"https://graph.microsoft.com/v1.0/users/{owner_id}" for owner_id in owner_ids
                ]
            else:
                logger.info(
                    "Creating team without explicit owners (app-only permissions)",
                    extra={"correlation_id": correlation_id},
                )

            # Add correlation ID to request
            request_headers = {"client-request-id": correlation_id}

            response = await client.post(
                "/groups",
                json=group_body,
                headers=request_headers,
            )

            if response.status_code != 201:
                error_msg = f"Failed to create group: {response.status_code} - {response.text}"
                logger.error(error_msg, extra={"correlation_id": correlation_id})
                raise Exception(error_msg)

            group = response.json()
            group_id = group["id"]

            # Wait a bit for group to be fully provisioned before teamifying
            # This is a known issue with Graph API - group needs to be fully created
            logger.info(
                "Waiting 5 seconds for group provisioning before teamifying",
                extra={"correlation_id": correlation_id},
            )
            import asyncio

            await asyncio.sleep(5)

            # Now teamify the group
            team_body = {
                "memberSettings": {
                    "allowCreatePrivateChannels": True,
                    "allowCreateUpdateChannels": True,
                },
                "messagingSettings": {
                    "allowUserEditMessages": True,
                    "allowUserDeleteMessages": True,
                },
                "funSettings": {
                    "allowGiphy": True,
                    "giphyContentRating": "moderate",
                },
            }

            response = await client.put(
                f"/groups/{group_id}/team",
                json=team_body,
                headers=request_headers,
            )

            if response.status_code not in [201, 204]:
                error_msg = f"Failed to teamify group: {response.status_code} - {response.text}"
                logger.error(error_msg, extra={"correlation_id": correlation_id})
                raise Exception(error_msg)

            logger.info(
                f"Successfully created team: {display_name} (ID: {group_id})",
                extra={"correlation_id": correlation_id},
            )

            # Return the group/team object
            return group

    async def create_channel(
        self,
        team_id: str,
        display_name: str,
        description: str,
        correlation_id: str,
    ) -> dict:
        """Create a channel within a team.

        Args:
            team_id: Team ID
            display_name: Channel display name
            description: Channel description
            correlation_id: Correlation ID for tracking

        Returns:
            Dict: Channel object

        Raises:
            Exception: If channel creation fails
        """
        async with self.auth_service.get_graph_client() as client:
            # Check if channel already exists
            existing_channel = await self._find_channel_by_name(client, team_id, display_name)
            if existing_channel:
                logger.info(
                    f"Channel already exists: {display_name} in team {team_id}",
                    extra={"correlation_id": correlation_id},
                )
                return existing_channel

            # Create new channel
            logger.info(
                f"Creating channel: {display_name} in team {team_id}",
                extra={"correlation_id": correlation_id},
            )

            channel_body = {
                "displayName": display_name,
                "description": description,
                "membershipType": "standard",
            }

            request_headers = {"client-request-id": correlation_id}

            response = await client.post(
                f"/teams/{team_id}/channels",
                json=channel_body,
                headers=request_headers,
            )

            if response.status_code != 201:
                error_msg = f"Failed to create channel: {response.status_code} - {response.text}"
                logger.error(error_msg, extra={"correlation_id": correlation_id})
                raise Exception(error_msg)

            channel = response.json()
            logger.info(
                f"Successfully created channel: {display_name} (ID: {channel['id']})",
                extra={"correlation_id": correlation_id},
            )

            return channel

    async def _find_team_by_name(self, client: httpx.AsyncClient, display_name: str) -> dict | None:
        """Find a team by display name.

        Args:
            client: Authenticated Graph API client
            display_name: Team display name to search for

        Returns:
            Optional[Dict]: Team object if found, None otherwise
        """
        # Use filter to find group with matching display name
        filter_query = (
            f"displayName eq '{display_name}' and resourceProvisioningOptions/Any(x:x eq 'Team')"
        )
        response = await client.get(
            "/groups",
            params={
                "$filter": filter_query,
                "$select": "id,displayName,description",
            },
        )

        if response.status_code != 200:
            logger.warning(f"Failed to search for team: {response.status_code}")
            return None

        data = response.json()
        teams = data.get("value", [])

        if teams:
            return teams[0]
        return None

    async def _find_channel_by_name(
        self, client: httpx.AsyncClient, team_id: str, display_name: str
    ) -> dict | None:
        """Find a channel by display name within a team.

        Args:
            client: Authenticated Graph API client
            team_id: Team ID
            display_name: Channel display name to search for

        Returns:
            Optional[Dict]: Channel object if found, None otherwise
        """
        response = await client.get(f"/teams/{team_id}/channels")

        if response.status_code != 200:
            logger.warning(f"Failed to list channels: {response.status_code}")
            return None

        data = response.json()
        channels = data.get("value", [])

        for channel in channels:
            if channel.get("displayName") == display_name:
                return channel

        return None

    def _generate_mail_nickname(self, display_name: str) -> str:
        """Generate a mail nickname from display name.

        Args:
            display_name: Team display name

        Returns:
            str: Valid mail nickname
        """
        # Remove special characters and spaces
        import re

        nickname = re.sub(r"[^a-zA-Z0-9]", "", display_name)
        # Ensure it's not empty and not too long
        if not nickname:
            nickname = "team"
        return nickname[:64]  # Max length for mail nickname

    def generate_team_name(self, year: int, part: str, partner_code: str, em_id: str) -> str:
        """Generate team name according to PRD naming conventions.

        Args:
            year: Year (e.g., 2025)
            part: Part identifier (A, B, or C)
            partner_code: Partner abbreviation code
            em_id: EM identifier

        Returns:
            str: Formatted team name
        """
        return f"NEU_{year}_RESZ_{part}_{partner_code}_EM_{em_id}"

    def generate_channel_name(self, em_id: str, purpose: str) -> str:
        """Generate channel name for specific purpose.

        Args:
            em_id: EM identifier
            purpose: Channel purpose (e.g., "Szakertok", "Eredmenytermekek")

        Returns:
            str: Formatted channel name
        """
        return f"EM_{em_id}_{purpose}"


# Singleton instance
teams_service = TeamsService()
