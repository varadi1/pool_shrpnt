import { useState, useEffect, useCallback, useRef } from 'react';
import { getOrderStatus, getOrderAuditLog } from '@/services/api/orders';
import type { ProvisioningStep, AuditLogEntry } from '@/types/orders';

export type ProvisioningStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

interface UseProvisioningStatusReturn {
  status: ProvisioningStatus | null;
  steps: ProvisioningStep[];
  auditLog: AuditLogEntry[];
  progress: number;
  error: string | null;
  isLoading: boolean;
  refetch: () => void;
}

const POLLING_INTERVAL = 2000; // Poll every 2 seconds
const MAX_RETRIES = 3;

export const useProvisioningStatus = (orderId: string): UseProvisioningStatusReturn => {
  const [status, setStatus] = useState<ProvisioningStatus | null>(null);
  const [steps, setSteps] = useState<ProvisioningStep[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const isMountedRef = useRef(true);

  const calculateProgress = (steps: ProvisioningStep[]): number => {
    if (steps.length === 0) return 0;
    
    const completedSteps = steps.filter(step => step.status === 'completed').length;
    return Math.round((completedSteps / steps.length) * 100);
  };

  const fetchStatus = useCallback(async () => {
    if (!orderId) return;

    try {
      setIsLoading(true);
      
      // Fetch order status
      const statusResponse = await getOrderStatus(orderId);
      
      if (!isMountedRef.current) return;
      
      setStatus(statusResponse.status);
      setSteps(statusResponse.steps || []);
      setProgress(calculateProgress(statusResponse.steps || []));
      
      // Fetch audit log
      const auditResponse = await getOrderAuditLog(orderId);
      if (!isMountedRef.current) return;
      
      setAuditLog(auditResponse.entries || []);
      
      // Reset retry count on successful fetch
      retryCountRef.current = 0;
      setError(null);
      
      // Stop polling if completed or failed
      if (statusResponse.status === 'completed' || statusResponse.status === 'failed') {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        
        if (statusResponse.status === 'failed' && statusResponse.error) {
          setError(statusResponse.error);
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      
      console.error('Failed to fetch provisioning status:', err);
      
      // Increment retry count
      retryCountRef.current += 1;
      
      // Stop polling after max retries
      if (retryCountRef.current >= MAX_RETRIES) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setError('Failed to fetch provisioning status. Please refresh the page.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [orderId]);

  const refetch = useCallback(() => {
    retryCountRef.current = 0;
    setError(null);
    fetchStatus();
    
    // Restart polling if not already running
    if (!intervalRef.current) {
      intervalRef.current = setInterval(fetchStatus, POLLING_INTERVAL);
    }
  }, [fetchStatus]);

  useEffect(() => {
    isMountedRef.current = true;
    
    if (!orderId) {
      setIsLoading(false);
      return;
    }
    
    // Initial fetch
    fetchStatus();
    
    // Start polling
    intervalRef.current = setInterval(fetchStatus, POLLING_INTERVAL);
    
    // Cleanup
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [orderId, fetchStatus]);

  return {
    status,
    steps,
    auditLog,
    progress,
    error,
    isLoading,
    refetch,
  };
};

// Mock implementation for demonstration
// This will be replaced with actual API calls when backend is ready
export const useMockProvisioningStatus = (orderId: string): UseProvisioningStatusReturn => {
  const [status, setStatus] = useState<ProvisioningStatus>('in_progress');
  const [steps, setSteps] = useState<ProvisioningStep[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    // Simulate progressive updates
    const mockSteps: ProvisioningStep[] = [
      { id: '1', name: 'Creating SharePoint site', status: 'pending', description: 'Setting up site collection' },
      { id: '2', name: 'Creating document libraries', status: 'pending', description: 'Creating folder structure' },
      { id: '3', name: 'Setting permissions', status: 'pending', description: 'Applying security groups' },
      { id: '4', name: 'Creating Teams channels', status: 'pending', description: 'Setting up collaboration channels' },
      { id: '5', name: 'Configuring locks', status: 'pending', description: 'Setting up automated locks' },
      { id: '6', name: 'Sending notifications', status: 'pending', description: 'Notifying stakeholders' },
    ];
    
    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < mockSteps.length) {
        // Update current step to in_progress
        mockSteps[currentStep].status = 'in_progress';
        setSteps([...mockSteps]);
        
        // After 1 second, mark as completed and move to next
        setTimeout(() => {
          mockSteps[currentStep].status = 'completed';
          mockSteps[currentStep].duration = Math.floor(Math.random() * 3000) + 1000;
          currentStep++;
          
          if (currentStep < mockSteps.length) {
            setSteps([...mockSteps]);
            setProgress(Math.round((currentStep / mockSteps.length) * 100));
            
            // Add audit log entry
            setAuditLog(prev => [...prev, {
              id: `audit-${currentStep}`,
              timestamp: new Date().toISOString(),
              action: `Completed: ${mockSteps[currentStep - 1].name}`,
              user: 'System',
            }]);
          } else {
            // All steps completed
            setStatus('completed');
            setProgress(100);
            clearInterval(interval);
          }
        }, 1500);
      }
    }, 3000);
    
    return () => clearInterval(interval);
  }, [orderId]);
  
  return {
    status,
    steps,
    auditLog,
    progress,
    error: null,
    isLoading: false,
    refetch: () => {},
  };
};

export default useProvisioningStatus;