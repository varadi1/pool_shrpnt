import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOrderForm } from '../useOrderForm';
import type { OrderFormData, PartConfiguration, PartnerAssignment } from '@/types/orders';

describe('useOrderForm', () => {
  const mockInitialData: Partial<OrderFormData> = {
    contractId: 'contract-1',
    contractName: 'Test Contract',
    orderName: 'Test Order',
    orderCode: 'EM-2025-TC001-001',
  };

  beforeEach(() => {
    // Clear sessionStorage before each test
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('initializes with default values', () => {
    const { result } = renderHook(() => useOrderForm());

    expect(result.current.formData).toEqual({});
    expect(result.current.errors).toEqual({});
    expect(result.current.isDirty).toBe(false);
    expect(result.current.isValid).toBe(false);
    expect(result.current.currentStep).toBe(0);
  });

  it('initializes with provided initial data', () => {
    const { result } = renderHook(() => useOrderForm({ initialData: mockInitialData }));

    expect(result.current.formData).toEqual(mockInitialData);
    expect(result.current.isDirty).toBe(false);
  });

  it('updates single field correctly', () => {
    const { result } = renderHook(() => useOrderForm());

    act(() => {
      result.current.updateField('orderName', 'New Order Name');
    });

    expect(result.current.formData.orderName).toBe('New Order Name');
    expect(result.current.isDirty).toBe(true);
  });

  it('updates multiple fields correctly', () => {
    const { result } = renderHook(() => useOrderForm());

    act(() => {
      result.current.updateFields({
        orderName: 'New Order',
        orderType: 'urgent',
        description: 'Test description',
      });
    });

    expect(result.current.formData.orderName).toBe('New Order');
    expect(result.current.formData.orderType).toBe('urgent');
    expect(result.current.formData.description).toBe('Test description');
    expect(result.current.isDirty).toBe(true);
  });

  it('manages parts correctly', () => {
    const { result } = renderHook(() => useOrderForm());

    const newPart: PartConfiguration = {
      type: 'A',
      deadline: new Date('2025-03-01'),
      lockSchedule: {
        t3: new Date('2025-02-26'),
        t1: new Date('2025-02-28'),
        t0: new Date('2025-03-01'),
        t8: new Date('2025-03-09'),
      },
    };

    act(() => {
      result.current.addPart(newPart);
    });

    expect(result.current.formData.parts).toHaveLength(1);
    expect(result.current.formData.parts?.[0]).toEqual(newPart);

    const updatedPart = { ...newPart, type: 'B' as const };
    act(() => {
      result.current.updatePart(0, updatedPart);
    });

    expect(result.current.formData.parts?.[0].type).toBe('B');

    act(() => {
      result.current.removePart(0);
    });

    expect(result.current.formData.parts).toHaveLength(0);
  });

  it('manages partners correctly', () => {
    const { result } = renderHook(() => useOrderForm());

    const newPartner: PartnerAssignment = {
      companyId: 'partner-1',
      companyName: 'Partner Company',
      accessLevel: 'read',
      folders: ['folder1'],
      parts: ['A'],
    };

    act(() => {
      result.current.addPartner(newPartner);
    });

    expect(result.current.formData.partners).toHaveLength(1);
    expect(result.current.formData.partners?.[0]).toEqual(newPartner);

    const updatedPartner = { ...newPartner, accessLevel: 'write' as const };
    act(() => {
      result.current.updatePartner(0, updatedPartner);
    });

    expect(result.current.formData.partners?.[0].accessLevel).toBe('write');

    act(() => {
      result.current.removePartner(0);
    });

    expect(result.current.formData.partners).toHaveLength(0);
  });

  it('validates form data correctly', () => {
    const { result } = renderHook(() => useOrderForm());

    act(() => {
      const isValid = result.current.validate();
      expect(isValid).toBe(false);
    });

    expect(result.current.errors).toHaveProperty('contractId');
    expect(result.current.errors).toHaveProperty('orderName');

    // Add valid data
    const validData: OrderFormData = {
      contractId: 'contract-1',
      contractName: 'Test Contract',
      orderName: 'Valid Order',
      orderCode: 'EM-2025-TC001-001',
      description: 'Test',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      orderType: 'standard',
      templateId: 'template-1',
      templateVersion: '1.0',
      parts: [{
        type: 'A',
        deadline: new Date('2025-03-01'),
        lockSchedule: {
          t3: new Date('2025-02-26'),
          t1: new Date('2025-02-28'),
          t0: new Date('2025-03-01'),
          t8: new Date('2025-03-09'),
        },
      }],
      partners: [{
        companyId: 'partner-1',
        companyName: 'Partner',
        accessLevel: 'read',
        folders: ['folder1'],
        parts: ['A'],
      }],
    };

    act(() => {
      result.current.updateFields(validData);
    });

    act(() => {
      const isValid = result.current.validate();
      expect(isValid).toBe(true);
    });

    expect(result.current.errors).toEqual({});
  });

  it('validates individual steps', () => {
    const { result } = renderHook(() => useOrderForm());

    // Step 0 - Contract selection
    act(() => {
      const isValid = result.current.validateStep(0);
      expect(isValid).toBe(false);
    });

    act(() => {
      result.current.updateFields({
        contractId: 'contract-1',
        contractName: 'Test Contract',
      });
    });

    act(() => {
      const isValid = result.current.validateStep(0);
      expect(isValid).toBe(true);
    });
  });

  it('handles form reset', () => {
    const { result } = renderHook(() => useOrderForm({ initialData: mockInitialData }));

    act(() => {
      result.current.updateField('orderName', 'Changed Name');
    });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.formData.orderName).toBe('Changed Name');

    act(() => {
      result.current.reset();
    });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.formData).toEqual(mockInitialData);
    expect(result.current.currentStep).toBe(0);
  });

  it('persists and loads from sessionStorage', () => {
    const { result } = renderHook(() => useOrderForm({ persistKey: 'test-order' }));

    const testData = {
      orderName: 'Persisted Order',
      orderType: 'urgent' as const,
    };

    act(() => {
      result.current.updateFields(testData);
    });
    
    act(() => {
      result.current.save();
    });

    const saved = sessionStorage.getItem('order-form-test-order');
    expect(saved).toBeTruthy();

    // Create new hook instance
    const { result: newResult } = renderHook(() => useOrderForm({ persistKey: 'test-order' }));

    // Data should be loaded automatically
    expect(newResult.current.formData.orderName).toBe('Persisted Order');
    expect(newResult.current.formData.orderType).toBe('urgent');
  });

  it('handles step navigation', () => {
    const { result } = renderHook(() => useOrderForm());

    expect(result.current.currentStep).toBe(0);

    // Can't proceed without valid data
    act(() => {
      const canProceed = result.current.nextStep();
      expect(canProceed).toBe(false);
    });

    expect(result.current.currentStep).toBe(0);

    // Add valid data for step 0
    act(() => {
      result.current.updateFields({
        contractId: 'contract-1',
        contractName: 'Test Contract',
      });
    });

    act(() => {
      const canProceed = result.current.nextStep();
      expect(canProceed).toBe(true);
    });

    expect(result.current.currentStep).toBe(1);

    act(() => {
      result.current.previousStep();
    });

    expect(result.current.currentStep).toBe(0);

    act(() => {
      result.current.goToStep(2);
    });

    // Can't skip ahead without validation
    expect(result.current.currentStep).toBe(0);
  });

  it('tracks dirty state correctly', () => {
    const onDirtyChange = vi.fn();
    const { result } = renderHook(() => useOrderForm({ 
      initialData: mockInitialData,
      onDirtyChange 
    }));

    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.updateField('orderName', 'Changed');
    });

    expect(result.current.isDirty).toBe(true);
    expect(onDirtyChange).toHaveBeenCalledWith(true);

    act(() => {
      result.current.updateField('orderName', mockInitialData.orderName!);
    });

    expect(result.current.isDirty).toBe(false);
    expect(onDirtyChange).toHaveBeenCalledWith(false);
  });

  it('clears errors correctly', () => {
    const { result } = renderHook(() => useOrderForm());

    act(() => {
      result.current.validate();
    });

    expect(Object.keys(result.current.errors).length).toBeGreaterThan(0);

    act(() => {
      result.current.clearErrors();
    });

    expect(result.current.errors).toEqual({});
  });

  it('validates date relationships', () => {
    const { result } = renderHook(() => useOrderForm());

    act(() => {
      result.current.updateFields({
        startDate: new Date('2025-12-31'),
        endDate: new Date('2025-01-01'),
      });
    });

    act(() => {
      result.current.validateStep(1);
    });

    expect(result.current.errors.endDate).toBe('End date must be after start date');
  });

  it('handles date conversion when loading from storage', () => {
    const { result } = renderHook(() => useOrderForm({ persistKey: 'date-test' }));

    const testData = {
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      parts: [{
        type: 'A' as const,
        deadline: new Date('2025-03-01'),
        lockSchedule: {
          t3: new Date('2025-02-26'),
          t1: new Date('2025-02-28'),
          t0: new Date('2025-03-01'),
          t8: new Date('2025-03-09'),
        },
      }],
    };

    act(() => {
      result.current.updateFields(testData);
    });
    
    act(() => {
      result.current.save();
    });

    // Create new instance and load
    const { result: newResult } = renderHook(() => useOrderForm({ persistKey: 'date-test' }));

    expect(newResult.current.formData.startDate).toBeInstanceOf(Date);
    expect(newResult.current.formData.endDate).toBeInstanceOf(Date);
    expect(newResult.current.formData.parts?.[0].deadline).toBeInstanceOf(Date);
  });
});