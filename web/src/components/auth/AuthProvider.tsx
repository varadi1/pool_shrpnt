import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { EventType } from '@azure/msal-browser';
import type { EventMessage, AuthenticationResult } from '@azure/msal-browser';
import { msalInstance } from '@/config/auth.config';

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Initialize MSAL first
        await msalInstance.initialize();
        
        // Setup event callbacks before handling redirects
        const callbackId = msalInstance.addEventCallback((event: EventMessage) => {
          if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
            const payload = event.payload as AuthenticationResult;
            handleAuthResponse(payload);
          }
          
          if (event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS && event.payload) {
            const payload = event.payload as AuthenticationResult;
            console.log('Token acquired successfully');
            // Store token expiry for renewal scheduling
            if (payload.expiresOn) {
              scheduleTokenRenewal(payload.expiresOn);
            }
          }
          
          if (event.eventType === EventType.LOGIN_FAILURE || 
              event.eventType === EventType.ACQUIRE_TOKEN_FAILURE) {
            console.error('Authentication failed:', event.error);
          }
        });
        
        // Handle redirect response after event callbacks are set up
        const response = await msalInstance.handleRedirectPromise();
        if (response) {
          console.log('Handling redirect response:', response);
          handleAuthResponse(response);
          // Set active account
          msalInstance.setActiveAccount(response.account);
        } else {
          // Check if there's already an active account
          const accounts = msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0]);
          }
        }

        setIsInitialized(true);

        // Cleanup
        return () => {
          if (callbackId) {
            msalInstance.removeEventCallback(callbackId);
          }
        };
      } catch (error) {
        console.error('Failed to initialize MSAL:', error);
        setIsInitialized(true); // Still set as initialized to show error state
      }
    };

    initializeAuth();
  }, []);

  const handleAuthResponse = (response: AuthenticationResult) => {
    // Extract and store user role claims from ID token
    const idTokenClaims = response.idTokenClaims as any;
    if (idTokenClaims?.roles) {
      // Store roles in session storage for quick access
      sessionStorage.setItem('userRoles', JSON.stringify(idTokenClaims.roles));
      console.log('User roles:', idTokenClaims.roles);
    }
  };

  const scheduleTokenRenewal = (expiresOn: Date) => {
    // Schedule silent token renewal 5 minutes before expiry
    const now = Date.now();
    const expiry = expiresOn.getTime();
    const renewalTime = expiry - (5 * 60 * 1000); // 5 minutes before expiry
    
    if (renewalTime > now) {
      const timeout = renewalTime - now;
      setTimeout(async () => {
        try {
          const accounts = msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            await msalInstance.acquireTokenSilent({
              scopes: ['User.Read'],
              account: accounts[0],
              forceRefresh: true,
            });
            console.log('Token renewed successfully');
          }
        } catch (error) {
          console.error('Silent token renewal failed:', error);
          // Fall back to interactive login if needed
          await msalInstance.acquireTokenRedirect({
            scopes: ['User.Read'],
          });
        }
      }, timeout);
    }
  };

  if (!isInitialized) {
    return null; // Or a loading spinner
  }

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
};