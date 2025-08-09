from typing import Any

from deepdiff import DeepDiff
from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.models.template import FolderTemplateVersion


class TemplateDiffService:
    """Service for comparing template versions."""

    def __init__(self, db: Session):
        self.db = db

    def get_diff(
        self, template_id: int, from_version: str, to_version: str, output_format: str = "json"
    ) -> dict[str, Any]:
        """Compare two template versions and generate diff."""

        # Get both versions
        from_template = self._get_version(template_id, from_version)
        to_template = self._get_version(template_id, to_version)

        if not from_template:
            raise HTTPException(status_code=404, detail=f"Version {from_version} not found")
        if not to_template:
            raise HTTPException(status_code=404, detail=f"Version {to_version} not found")

        # Generate diff
        diff = self._generate_diff(from_template, to_template)

        if output_format == "text":
            return self._format_diff_as_text(diff)
        else:
            return self._format_diff_as_json(diff)

    def _get_version(self, template_id: int, version: str) -> FolderTemplateVersion | None:
        """Get specific template version."""
        return (
            self.db.query(FolderTemplateVersion)
            .filter(
                FolderTemplateVersion.template_id == template_id,
                FolderTemplateVersion.version == version,
            )
            .first()
        )

    def _generate_diff(
        self, from_version: FolderTemplateVersion, to_version: FolderTemplateVersion
    ) -> dict[str, Any]:
        """Generate detailed diff between versions."""

        # Compare folder structures
        folder_diff = self._compare_folder_structures(
            from_version.folder_structure, to_version.folder_structure
        )

        # Compare permissions
        permission_diff = self._compare_permissions(
            from_version.permissions_template or {}, to_version.permissions_template or {}
        )

        # Compare metadata
        metadata_diff = self._compare_metadata(from_version.content, to_version.content)

        return {
            "from_version": from_version.version,
            "to_version": to_version.version,
            "folder_structure": folder_diff,
            "permissions": permission_diff,
            "metadata": metadata_diff,
            "summary": self._generate_summary(folder_diff, permission_diff, metadata_diff),
        }

    def _compare_folder_structures(self, from_struct: dict, to_struct: dict) -> dict[str, Any]:
        """Compare folder structures between versions."""
        diff = DeepDiff(from_struct, to_struct, ignore_order=True)

        result = {
            "added_folders": [],
            "removed_folders": [],
            "modified_folders": [],
            "raw_diff": diff.to_dict() if diff else {},
        }

        # Extract added folders
        if "dictionary_item_added" in diff:
            for path in diff["dictionary_item_added"]:
                if "folders" in path:
                    result["added_folders"].append(self._extract_folder_name(path))

        # Extract removed folders
        if "dictionary_item_removed" in diff:
            for path in diff["dictionary_item_removed"]:
                if "folders" in path:
                    result["removed_folders"].append(self._extract_folder_name(path))

        # Extract modified folders
        if "values_changed" in diff:
            for path in diff["values_changed"]:
                if "folders" in path:
                    result["modified_folders"].append(
                        {
                            "path": self._extract_folder_name(path),
                            "old_value": diff["values_changed"][path]["old_value"],
                            "new_value": diff["values_changed"][path]["new_value"],
                        }
                    )

        return result

    def _compare_permissions(self, from_perms: dict, to_perms: dict) -> dict[str, Any]:
        """Compare permission templates between versions."""
        diff = DeepDiff(from_perms, to_perms, ignore_order=True)

        result = {
            "added_rules": [],
            "removed_rules": [],
            "modified_rules": [],
            "raw_diff": diff.to_dict() if diff else {},
        }

        # Process permission changes
        if "dictionary_item_added" in diff:
            result["added_rules"] = list(diff["dictionary_item_added"])

        if "dictionary_item_removed" in diff:
            result["removed_rules"] = list(diff["dictionary_item_removed"])

        if "values_changed" in diff:
            for path, change in diff["values_changed"].items():
                result["modified_rules"].append(
                    {
                        "rule": path,
                        "old_value": change["old_value"],
                        "new_value": change["new_value"],
                    }
                )

        return result

    def _compare_metadata(self, from_meta: dict, to_meta: dict) -> dict[str, Any]:
        """Compare template metadata."""
        changes = {}

        # Check for changes in basic fields
        for field in ["name", "description", "template_type"]:
            if from_meta.get(field) != to_meta.get(field):
                changes[field] = {"old": from_meta.get(field), "new": to_meta.get(field)}

        return changes

    def _extract_folder_name(self, path: str) -> str:
        """Extract folder name from diff path."""
        # Parse the path to get folder name
        parts = path.replace("root[", "").replace("]", "").replace("'", "").split("[")
        return parts[-1] if parts else path

    def _generate_summary(
        self, folder_diff: dict, perm_diff: dict, meta_diff: dict
    ) -> dict[str, int]:
        """Generate summary statistics for the diff."""
        return {
            "folders_added": len(folder_diff["added_folders"]),
            "folders_removed": len(folder_diff["removed_folders"]),
            "folders_modified": len(folder_diff["modified_folders"]),
            "permissions_added": len(perm_diff["added_rules"]),
            "permissions_removed": len(perm_diff["removed_rules"]),
            "permissions_modified": len(perm_diff["modified_rules"]),
            "metadata_changed": len(meta_diff),
            "total_changes": (
                len(folder_diff["added_folders"])
                + len(folder_diff["removed_folders"])
                + len(folder_diff["modified_folders"])
                + len(perm_diff["added_rules"])
                + len(perm_diff["removed_rules"])
                + len(perm_diff["modified_rules"])
                + len(meta_diff)
            ),
        }

    def _format_diff_as_json(self, diff: dict[str, Any]) -> dict[str, Any]:
        """Format diff as JSON."""
        return diff

    def _format_folder_changes(self, folder_diff: dict, lines: list[str]) -> None:
        """Format folder structure changes."""
        if folder_diff["added_folders"]:
            lines.append("\n📁 Added Folders:")
            for folder in folder_diff["added_folders"]:
                lines.append(f"  + {folder}")

        if folder_diff["removed_folders"]:
            lines.append("\n📁 Removed Folders:")
            for folder in folder_diff["removed_folders"]:
                lines.append(f"  - {folder}")

        if folder_diff["modified_folders"]:
            lines.append("\n📁 Modified Folders:")
            for item in folder_diff["modified_folders"]:
                lines.append(f"  ~ {item['path']}")
                lines.append(f"    Old: {item['old_value']}")
                lines.append(f"    New: {item['new_value']}")

    def _format_permission_changes(self, perm_diff: dict, lines: list[str]) -> None:
        """Format permission changes."""
        if perm_diff["added_rules"]:
            lines.append("\n🔒 Added Permission Rules:")
            for rule in perm_diff["added_rules"]:
                lines.append(f"  + {rule}")

        if perm_diff["removed_rules"]:
            lines.append("\n🔒 Removed Permission Rules:")
            for rule in perm_diff["removed_rules"]:
                lines.append(f"  - {rule}")

        if perm_diff["modified_rules"]:
            lines.append("\n🔒 Modified Permission Rules:")
            for item in perm_diff["modified_rules"]:
                lines.append(f"  ~ {item['rule']}")
                lines.append(f"    Old: {item['old_value']}")
                lines.append(f"    New: {item['new_value']}")

    def _format_metadata_changes(self, meta_diff: dict, lines: list[str]) -> None:
        """Format metadata changes."""
        if meta_diff:
            lines.append("\n📋 Metadata Changes:")
            for field, change in meta_diff.items():
                lines.append(f"  {field}:")
                lines.append(f"    Old: {change['old']}")
                lines.append(f"    New: {change['new']}")

    def _format_diff_as_text(self, diff: dict[str, Any]) -> dict[str, str]:
        """Format diff as human-readable text."""
        lines = []
        lines.append(f"Template Version Diff: {diff['from_version']} → {diff['to_version']}")
        lines.append("=" * 60)

        # Format different sections
        self._format_folder_changes(diff["folder_structure"], lines)
        self._format_permission_changes(diff["permissions"], lines)
        self._format_metadata_changes(diff["metadata"], lines)

        # Summary
        lines.append("\n" + "=" * 60)
        lines.append("Summary:")
        summary = diff["summary"]
        lines.append(f"  Total changes: {summary['total_changes']}")
        lines.append(
            f"  Folders: +{summary['folders_added']} "
            f"-{summary['folders_removed']} ~{summary['folders_modified']}"
        )
        lines.append(
            f"  Permissions: +{summary['permissions_added']} "
            f"-{summary['permissions_removed']} ~{summary['permissions_modified']}"
        )
        lines.append(f"  Metadata fields changed: {summary['metadata_changed']}")

        return {"diff": "\n".join(lines)}
