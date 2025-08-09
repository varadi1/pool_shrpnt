"""Guest lifecycle notification templates."""

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from api.core.config import settings

# Base URL for the application
BASE_URL = getattr(settings, "app_base_url", "https://pooldrv.example.com")


class GuestNotificationTemplates:
    """Templates for guest lifecycle notifications."""
    
    @staticmethod
    def get_expiry_warning_email(
        guest_name: str,
        guest_email: str,
        partner_company: str,
        days: int,
        expiry_date: str,
        guest_id: str,
        locale: str = "en"
    ) -> Dict[str, str]:
        """Get expiry warning email template.
        
        Args:
            guest_name: Guest user display name
            guest_email: Guest user email
            partner_company: Partner company name
            days: Days until expiry
            expiry_date: Expiry date formatted string
            guest_id: Guest user ID for action links
            locale: Language locale (en/hu)
            
        Returns:
            Dictionary with subject and body
        """
        if locale == "hu":
            subject = f"Vendég hozzáférés lejár {days} nap múlva - {guest_name}"
            body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #ff9800;">⚠️ Vendég hozzáférés hamarosan lejár</h2>
                    
                    <p>Tisztelt Adminisztrátor!</p>
                    
                    <p>Értesítjük, hogy az alábbi vendég felhasználó hozzáférése hamarosan lejár:</p>
                    
                    <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>Vendég neve:</strong> {guest_name}</p>
                        <p><strong>Email címe:</strong> {guest_email}</p>
                        <p><strong>Partner cég:</strong> {partner_company}</p>
                        <p><strong>Lejárat dátuma:</strong> {expiry_date}</p>
                        <p><strong>Hátralévő napok:</strong> <span style="color: #ff9800; font-weight: bold;">{days} nap</span></p>
                    </div>
                    
                    <p><strong>Szükséges intézkedés:</strong> Kérjük, tekintse át és hosszabbítsa meg a hozzáférést, ha szükséges.</p>
                    
                    <div style="margin: 30px 0;">
                        <a href="{BASE_URL}/guests/{guest_id}/extend" 
                           style="background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            Hozzáférés meghosszabbítása
                        </a>
                        <a href="{BASE_URL}/guests/{guest_id}" 
                           style="background: #757575; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-left: 10px;">
                            Részletek megtekintése
                        </a>
                    </div>
                    
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                    
                    <p style="font-size: 12px; color: #666;">
                        Ez egy automatikus értesítés a poolDRV rendszerből. Kérjük, ne válaszoljon erre az emailre.
                    </p>
                </div>
            </body>
            </html>
            """
        else:
            subject = f"Guest Access Expiring in {days} Days - {guest_name}"
            body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #ff9800;">⚠️ Guest Access Expiring Soon</h2>
                    
                    <p>Dear Administrator,</p>
                    
                    <p>This is a notification that the following guest user's access is expiring soon:</p>
                    
                    <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>Guest Name:</strong> {guest_name}</p>
                        <p><strong>Email Address:</strong> {guest_email}</p>
                        <p><strong>Partner Company:</strong> {partner_company}</p>
                        <p><strong>Expiry Date:</strong> {expiry_date}</p>
                        <p><strong>Days Remaining:</strong> <span style="color: #ff9800; font-weight: bold;">{days} days</span></p>
                    </div>
                    
                    <p><strong>Action Required:</strong> Please review and extend access if needed.</p>
                    
                    <div style="margin: 30px 0;">
                        <a href="{BASE_URL}/guests/{guest_id}/extend" 
                           style="background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            Extend Access
                        </a>
                        <a href="{BASE_URL}/guests/{guest_id}" 
                           style="background: #757575; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-left: 10px;">
                            View Details
                        </a>
                    </div>
                    
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                    
                    <p style="font-size: 12px; color: #666;">
                        This is an automated notification from the poolDRV system. Please do not reply to this email.
                    </p>
                </div>
            </body>
            </html>
            """
        
        return {
            "subject": subject,
            "body": body,
            "template_key": "GUEST_EXPIRY_WARNING"
        }
    
    @staticmethod
    def get_revocation_notification(
        guest_name: str,
        guest_email: str,
        partner_company: str,
        revocation_reason: str,
        admin_name: str,
        revocation_date: str,
        locale: str = "en",
        recipient_type: str = "admin"  # admin or guest
    ) -> Dict[str, str]:
        """Get revocation notification template.
        
        Args:
            guest_name: Guest user display name
            guest_email: Guest user email
            partner_company: Partner company name
            revocation_reason: Reason for revocation
            admin_name: Admin who revoked access
            revocation_date: Revocation date formatted string
            locale: Language locale (en/hu)
            recipient_type: Type of recipient (admin/guest)
            
        Returns:
            Dictionary with subject and body
        """
        if locale == "hu":
            subject = f"Vendég hozzáférés visszavonva - {guest_name}"
            
            if recipient_type == "guest":
                body = f"""
                <html>
                <body style="font-family: Arial, sans-serif; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #f44336;">🚫 Hozzáférése visszavonásra került</h2>
                        
                        <p>Tisztelt {guest_name}!</p>
                        
                        <p>Sajnálattal értesítjük, hogy a poolDRV rendszerhez való hozzáférése visszavonásra került.</p>
                        
                        <div style="background: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f44336;">
                            <p><strong>Visszavonás dátuma:</strong> {revocation_date}</p>
                            <p><strong>Indok:</strong> {revocation_reason}</p>
                        </div>
                        
                        <p>A visszavonás azonnal életbe lépett, és a következőket jelenti:</p>
                        <ul>
                            <li>Nem fér hozzá a SharePoint dokumentumokhoz</li>
                            <li>Nem fér hozzá a Teams csatornákhoz</li>
                            <li>Minden korábbi jogosultsága megszűnt</li>
                        </ul>
                        
                        <p>Ha úgy gondolja, hogy ez tévedés, kérjük, lépjen kapcsolatba a partner koordinátorával.</p>
                        
                        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                        
                        <p style="font-size: 12px; color: #666;">
                            Ez egy automatikus értesítés a poolDRV rendszerből.
                        </p>
                    </div>
                </body>
                </html>
                """
            else:  # admin
                body = f"""
                <html>
                <body style="font-family: Arial, sans-serif; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #f44336;">🚫 Vendég hozzáférés visszavonva</h2>
                        
                        <p>Tisztelt Adminisztrátor!</p>
                        
                        <p>Értesítjük, hogy az alábbi vendég felhasználó hozzáférése visszavonásra került:</p>
                        
                        <div style="background: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f44336;">
                            <p><strong>Vendég neve:</strong> {guest_name}</p>
                            <p><strong>Email címe:</strong> {guest_email}</p>
                            <p><strong>Partner cég:</strong> {partner_company}</p>
                            <p><strong>Visszavonás indoka:</strong> {revocation_reason}</p>
                            <p><strong>Visszavonta:</strong> {admin_name}</p>
                            <p><strong>Visszavonás időpontja:</strong> {revocation_date}</p>
                        </div>
                        
                        <p>A következő műveletek kerültek végrehajtásra:</p>
                        <ul>
                            <li>✓ Eltávolítva minden Azure AD csoportból</li>
                            <li>✓ SharePoint jogosultságok visszavonva</li>
                            <li>✓ Teams hozzáférés megszüntetve</li>
                        </ul>
                        
                        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                        
                        <p style="font-size: 12px; color: #666;">
                            Ez egy automatikus értesítés a poolDRV rendszerből.
                        </p>
                    </div>
                </body>
                </html>
                """
        else:  # English
            subject = f"Guest Access Revoked - {guest_name}"
            
            if recipient_type == "guest":
                body = f"""
                <html>
                <body style="font-family: Arial, sans-serif; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #f44336;">🚫 Your Access Has Been Revoked</h2>
                        
                        <p>Dear {guest_name},</p>
                        
                        <p>We regret to inform you that your access to the poolDRV system has been revoked.</p>
                        
                        <div style="background: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f44336;">
                            <p><strong>Revocation Date:</strong> {revocation_date}</p>
                            <p><strong>Reason:</strong> {revocation_reason}</p>
                        </div>
                        
                        <p>This revocation takes effect immediately and means:</p>
                        <ul>
                            <li>You no longer have access to SharePoint documents</li>
                            <li>You no longer have access to Teams channels</li>
                            <li>All previous permissions have been removed</li>
                        </ul>
                        
                        <p>If you believe this is an error, please contact your partner coordinator.</p>
                        
                        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                        
                        <p style="font-size: 12px; color: #666;">
                            This is an automated notification from the poolDRV system.
                        </p>
                    </div>
                </body>
                </html>
                """
            else:  # admin
                body = f"""
                <html>
                <body style="font-family: Arial, sans-serif; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #f44336;">🚫 Guest Access Revoked</h2>
                        
                        <p>Dear Administrator,</p>
                        
                        <p>This is a notification that the following guest user's access has been revoked:</p>
                        
                        <div style="background: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f44336;">
                            <p><strong>Guest Name:</strong> {guest_name}</p>
                            <p><strong>Email Address:</strong> {guest_email}</p>
                            <p><strong>Partner Company:</strong> {partner_company}</p>
                            <p><strong>Revocation Reason:</strong> {revocation_reason}</p>
                            <p><strong>Revoked By:</strong> {admin_name}</p>
                            <p><strong>Revocation Date:</strong> {revocation_date}</p>
                        </div>
                        
                        <p>The following actions have been completed:</p>
                        <ul>
                            <li>✓ Removed from all Azure AD groups</li>
                            <li>✓ SharePoint permissions revoked</li>
                            <li>✓ Teams access removed</li>
                        </ul>
                        
                        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                        
                        <p style="font-size: 12px; color: #666;">
                            This is an automated notification from the poolDRV system.
                        </p>
                    </div>
                </body>
                </html>
                """
        
        return {
            "subject": subject,
            "body": body,
            "template_key": f"GUEST_REVOKED_{recipient_type.upper()}"
        }
    
    @staticmethod
    def get_extension_confirmation(
        guest_name: str,
        guest_email: str,
        partner_company: str,
        new_expiry_date: str,
        justification: str,
        admin_name: str,
        extension_count: int,
        locale: str = "en",
        recipient_type: str = "admin"  # admin or guest
    ) -> Dict[str, str]:
        """Get extension confirmation template.
        
        Args:
            guest_name: Guest user display name
            guest_email: Guest user email
            partner_company: Partner company name
            new_expiry_date: New expiry date formatted string
            justification: Justification for extension
            admin_name: Admin who extended access
            extension_count: Number of extensions used
            locale: Language locale (en/hu)
            recipient_type: Type of recipient (admin/guest)
            
        Returns:
            Dictionary with subject and body
        """
        if locale == "hu":
            subject = f"Vendég hozzáférés meghosszabbítva - {guest_name}"
            
            if recipient_type == "guest":
                body = f"""
                <html>
                <body style="font-family: Arial, sans-serif; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #4CAF50;">✅ Hozzáférése meghosszabbításra került</h2>
                        
                        <p>Tisztelt {guest_name}!</p>
                        
                        <p>Örömmel értesítjük, hogy a poolDRV rendszerhez való hozzáférése meghosszabbításra került.</p>
                        
                        <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #4CAF50;">
                            <p><strong>Új lejárati dátum:</strong> {new_expiry_date}</p>
                            <p><strong>Indoklás:</strong> {justification}</p>
                        </div>
                        
                        <p>Továbbra is hozzáfér minden korábban engedélyezett erőforráshoz.</p>
                        
                        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                        
                        <p style="font-size: 12px; color: #666;">
                            Ez egy automatikus értesítés a poolDRV rendszerből.
                        </p>
                    </div>
                </body>
                </html>
                """
            else:  # admin
                body = f"""
                <html>
                <body style="font-family: Arial, sans-serif; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #4CAF50;">✅ Vendég hozzáférés meghosszabbítva</h2>
                        
                        <p>Tisztelt Adminisztrátor!</p>
                        
                        <p>Értesítjük, hogy az alábbi vendég felhasználó hozzáférése meghosszabbításra került:</p>
                        
                        <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #4CAF50;">
                            <p><strong>Vendég neve:</strong> {guest_name}</p>
                            <p><strong>Email címe:</strong> {guest_email}</p>
                            <p><strong>Partner cég:</strong> {partner_company}</p>
                            <p><strong>Új lejárati dátum:</strong> {new_expiry_date}</p>
                            <p><strong>Indoklás:</strong> {justification}</p>
                            <p><strong>Meghosszabbította:</strong> {admin_name}</p>
                            <p><strong>Meghosszabbítások száma:</strong> {extension_count}/3</p>
                        </div>
                        
                        {"<p style='color: #ff9800;'><strong>Figyelem:</strong> Ez volt az utolsó lehetséges meghosszabbítás!</p>" if extension_count >= 3 else ""}
                        
                        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                        
                        <p style="font-size: 12px; color: #666;">
                            Ez egy automatikus értesítés a poolDRV rendszerből.
                        </p>
                    </div>
                </body>
                </html>
                """
        else:  # English
            subject = f"Guest Access Extended - {guest_name}"
            
            if recipient_type == "guest":
                body = f"""
                <html>
                <body style="font-family: Arial, sans-serif; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #4CAF50;">✅ Your Access Has Been Extended</h2>
                        
                        <p>Dear {guest_name},</p>
                        
                        <p>We are pleased to inform you that your access to the poolDRV system has been extended.</p>
                        
                        <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #4CAF50;">
                            <p><strong>New Expiry Date:</strong> {new_expiry_date}</p>
                            <p><strong>Justification:</strong> {justification}</p>
                        </div>
                        
                        <p>You continue to have access to all previously authorized resources.</p>
                        
                        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                        
                        <p style="font-size: 12px; color: #666;">
                            This is an automated notification from the poolDRV system.
                        </p>
                    </div>
                </body>
                </html>
                """
            else:  # admin
                body = f"""
                <html>
                <body style="font-family: Arial, sans-serif; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #4CAF50;">✅ Guest Access Extended</h2>
                        
                        <p>Dear Administrator,</p>
                        
                        <p>This is a notification that the following guest user's access has been extended:</p>
                        
                        <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #4CAF50;">
                            <p><strong>Guest Name:</strong> {guest_name}</p>
                            <p><strong>Email Address:</strong> {guest_email}</p>
                            <p><strong>Partner Company:</strong> {partner_company}</p>
                            <p><strong>New Expiry Date:</strong> {new_expiry_date}</p>
                            <p><strong>Justification:</strong> {justification}</p>
                            <p><strong>Extended By:</strong> {admin_name}</p>
                            <p><strong>Extension Count:</strong> {extension_count}/3</p>
                        </div>
                        
                        {"<p style='color: #ff9800;'><strong>Warning:</strong> This was the final extension allowed!</p>" if extension_count >= 3 else ""}
                        
                        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                        
                        <p style="font-size: 12px; color: #666;">
                            This is an automated notification from the poolDRV system.
                        </p>
                    </div>
                </body>
                </html>
                """
        
        return {
            "subject": subject,
            "body": body,
            "template_key": f"GUEST_EXTENDED_{recipient_type.upper()}"
        }
    
    @staticmethod
    def get_guest_expired_notification(
        guest_name: str,
        guest_email: str,
        partner_company: str,
        expiry_date: str,
        locale: str = "en"
    ) -> Dict[str, str]:
        """Get guest expired notification template.
        
        Args:
            guest_name: Guest user display name
            guest_email: Guest user email
            partner_company: Partner company name
            expiry_date: Expiry date formatted string
            locale: Language locale (en/hu)
            
        Returns:
            Dictionary with subject and body
        """
        if locale == "hu":
            subject = f"Vendég hozzáférés lejárt - {guest_name}"
            body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #f44336;">⏰ Vendég hozzáférés lejárt</h2>
                    
                    <p>Tisztelt Adminisztrátor!</p>
                    
                    <p>Értesítjük, hogy az alábbi vendég felhasználó hozzáférése lejárt és automatikusan visszavonásra került:</p>
                    
                    <div style="background: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f44336;">
                        <p><strong>Vendég neve:</strong> {guest_name}</p>
                        <p><strong>Email címe:</strong> {guest_email}</p>
                        <p><strong>Partner cég:</strong> {partner_company}</p>
                        <p><strong>Lejárat dátuma:</strong> {expiry_date}</p>
                    </div>
                    
                    <p>Az automatikus visszavonás megtörtént. A vendég 30 nap múlva véglegesen törlésre kerül az Azure AD-ból.</p>
                    
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                    
                    <p style="font-size: 12px; color: #666;">
                        Ez egy automatikus értesítés a poolDRV rendszerből.
                    </p>
                </div>
            </body>
            </html>
            """
        else:
            subject = f"Guest Access Expired - {guest_name}"
            body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #f44336;">⏰ Guest Access Expired</h2>
                    
                    <p>Dear Administrator,</p>
                    
                    <p>This is a notification that the following guest user's access has expired and been automatically revoked:</p>
                    
                    <div style="background: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f44336;">
                        <p><strong>Guest Name:</strong> {guest_name}</p>
                        <p><strong>Email Address:</strong> {guest_email}</p>
                        <p><strong>Partner Company:</strong> {partner_company}</p>
                        <p><strong>Expiry Date:</strong> {expiry_date}</p>
                    </div>
                    
                    <p>Automatic revocation has been completed. The guest will be permanently removed from Azure AD in 30 days.</p>
                    
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                    
                    <p style="font-size: 12px; color: #666;">
                        This is an automated notification from the poolDRV system.
                    </p>
                </div>
            </body>
            </html>
            """
        
        return {
            "subject": subject,
            "body": body,
            "template_key": "GUEST_EXPIRED"
        }