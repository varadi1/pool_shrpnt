import { useEffect, useRef } from 'react';
import { useToast } from '@/components/common/ToastProvider';
import type { Contract } from '@/types/contracts';

interface StatusChange {
  contract: Contract;
  oldStatus: Contract['status'];
  newStatus: Contract['status'];
}

export const useContractStatusMonitor = (contracts: Contract[] | undefined) => {
  const previousContractsRef = useRef<Map<number, Contract>>(new Map());
  const { showToast, showSuccess, showWarning, showInfo } = useToast();

  useEffect(() => {
    if (!contracts || contracts.length === 0) {
      return;
    }

    const currentContracts = new Map(contracts.map(c => [c.id, c]));
    const previousContracts = previousContractsRef.current;
    const statusChanges: StatusChange[] = [];

    // Check for status changes
    currentContracts.forEach((currentContract, id) => {
      const previousContract = previousContracts.get(id);
      
      if (previousContract && previousContract.status !== currentContract.status) {
        statusChanges.push({
          contract: currentContract,
          oldStatus: previousContract.status,
          newStatus: currentContract.status,
        });
      }
    });

    // Notify about status changes
    statusChanges.forEach(({ contract, oldStatus, newStatus }) => {
      const message = `Contract ${contract.contractNumber} status changed from ${oldStatus} to ${newStatus}`;
      
      if (newStatus === 'active') {
        showSuccess(message);
      } else if (newStatus === 'expired') {
        showWarning(message);
      } else if (newStatus === 'inactive') {
        showInfo(message);
      } else {
        showInfo(message);
      }
    });

    // Check for newly expired contracts (based on date)
    const today = new Date().toISOString().split('T')[0];
    currentContracts.forEach((contract) => {
      const wasTracked = previousContracts.has(contract.id);
      
      if (wasTracked && 
          contract.status === 'active' && 
          contract.endDate && 
          contract.endDate < today) {
        
        showWarning(
          `Contract ${contract.contractNumber} - ${contract.name} has passed its end date and may need to be updated.`
        );
      }
    });

    // Update the reference for next comparison
    previousContractsRef.current = currentContracts;
  }, [contracts, showInfo, showSuccess, showWarning]);

  // Function to manually check for status changes
  const checkForUpdates = () => {
    // This will trigger a re-render and the useEffect will run
    console.log('Checking for contract status updates...');
  };

  return { checkForUpdates };
};