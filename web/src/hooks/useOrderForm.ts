import { useState, useCallback, useEffect, useRef } from 'react';
import { z } from 'zod';
import type { OrderFormData, PartConfiguration, PartnerAssignment } from '@/types/orders';

// Validation schema for the entire form
export const orderFormSchema = z.object({
  contractId: z.string().min(1, 'Contract is required'),
  contractName: z.string().min(1, 'Contract name is required'),
  orderName: z.string()
    .min(3, 'Order name must be at least 3 characters')
    .max(100, 'Order name too long')
    .regex(/^[A-Za-z0-9][A-Za-z0-9\s\-_]*$/, 'Invalid name format'),
  orderCode: z.string().min(1, 'Order code is required'),
  description: z.string().max(500).optional(),
  startDate: z.date(),
  endDate: z.date(),
  orderType: z.enum(['standard', 'urgent', 'special']),
  templateId: z.string().min(1, 'Template is required'),
  templateVersion: z.string().min(1, 'Template version is required'),
  parts: z.array(z.object({
    type: z.enum(['A', 'B', 'C']),
    deadline: z.date(),
    lockSchedule: z.object({
      t3: z.date(),
      t1: z.date(),
      t0: z.date(),
      t8: z.date(),
    }),
    responsibleUserId: z.string().optional(),
    responsibleTeamId: z.string().optional(),
  })).min(1, 'At least one part required'),
  partners: z.array(z.object({
    companyId: z.string(),
    companyName: z.string(),
    accessLevel: z.enum(['read', 'write', 'admin']),
    folders: z.array(z.string()),
    parts: z.array(z.enum(['A', 'B', 'C'])),
    expiryDate: z.date().optional(),
  })).min(1, 'At least one partner required'),
}).refine(data => {
  if (!data.startDate || !data.endDate) return true;
  return data.endDate > data.startDate;
}, {
  message: 'End date must be after start date',
  path: ['endDate'],
});

export interface UseOrderFormOptions {
  initialData?: Partial<OrderFormData>;
  onDirtyChange?: (isDirty: boolean) => void;
  persistKey?: string;
}

export interface UseOrderFormReturn {
  formData: Partial<OrderFormData>;
  errors: Record<string, string>;
  isDirty: boolean;
  isValid: boolean;
  currentStep: number;
  
  // Field update methods
  updateField: <K extends keyof OrderFormData>(field: K, value: OrderFormData[K]) => void;
  updateFields: (updates: Partial<OrderFormData>) => void;
  
  // Part management
  addPart: (part: PartConfiguration) => void;
  updatePart: (index: number, part: PartConfiguration) => void;
  removePart: (index: number) => void;
  
  // Partner management
  addPartner: (partner: PartnerAssignment) => void;
  updatePartner: (index: number, partner: PartnerAssignment) => void;
  removePartner: (index: number) => void;
  
  // Form actions
  validate: () => boolean;
  validateStep: (step: number) => boolean;
  reset: () => void;
  clearErrors: () => void;
  
  // Persistence
  save: () => void;
  load: () => void;
  clearSaved: () => void;
  
  // Step navigation
  nextStep: () => boolean;
  previousStep: () => void;
  goToStep: (step: number) => void;
}

const STORAGE_KEY_PREFIX = 'order-form-';

export const useOrderForm = (options: UseOrderFormOptions = {}): UseOrderFormReturn => {
  const { initialData = {}, onDirtyChange, persistKey } = options;
  const storageKey = persistKey ? `${STORAGE_KEY_PREFIX}${persistKey}` : null;
  
  // Initialize form data with saved data or initial data
  const getInitialFormData = (): Partial<OrderFormData> => {
    if (storageKey) {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        try {
          const { data } = JSON.parse(saved);
          // Convert date strings back to Date objects
          if (data.startDate) data.startDate = new Date(data.startDate);
          if (data.endDate) data.endDate = new Date(data.endDate);
          if (data.parts) {
            data.parts = data.parts.map((part: any) => ({
              ...part,
              deadline: new Date(part.deadline),
              lockSchedule: {
                t3: new Date(part.lockSchedule.t3),
                t1: new Date(part.lockSchedule.t1),
                t0: new Date(part.lockSchedule.t0),
                t8: new Date(part.lockSchedule.t8),
              },
            }));
          }
          if (data.partners) {
            data.partners = data.partners.map((partner: any) => ({
              ...partner,
              expiryDate: partner.expiryDate ? new Date(partner.expiryDate) : undefined,
            }));
          }
          return data;
        } catch (error) {
          console.error('Failed to load saved form data:', error);
        }
      }
    }
    return initialData;
  };
  
  const [formData, setFormData] = useState<Partial<OrderFormData>>(getInitialFormData());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  
  const initialDataRef = useRef(initialData);
  const previousDirtyRef = useRef(false);
  const formDataRef = useRef(formData);
  
  // Keep formDataRef in sync
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Check if form is valid
  const isValid = Object.keys(errors).length === 0 && validateForm(formData);

  // Update dirty state
  useEffect(() => {
    const dirty = JSON.stringify(formData) !== JSON.stringify(initialDataRef.current);
    if (dirty !== previousDirtyRef.current) {
      setIsDirty(dirty);
      previousDirtyRef.current = dirty;
      onDirtyChange?.(dirty);
    }
  }, [formData, onDirtyChange]);

  // Auto-save to sessionStorage
  useEffect(() => {
    if (storageKey && isDirty) {
      const timer = setTimeout(() => {
        save();
      }, 1000); // Debounce saves
      return () => clearTimeout(timer);
    }
  }, [formData, isDirty, storageKey]);

  const updateField = useCallback(<K extends keyof OrderFormData>(
    field: K,
    value: OrderFormData[K]
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    
    // Clear error for this field
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);

  const updateFields = useCallback((updates: Partial<OrderFormData>) => {
    setFormData(prev => ({
      ...prev,
      ...updates,
    }));
    
    // Clear errors for updated fields
    setErrors(prev => {
      const newErrors = { ...prev };
      Object.keys(updates).forEach(key => {
        delete newErrors[key];
      });
      return newErrors;
    });
  }, []);

  const addPart = useCallback((part: PartConfiguration) => {
    setFormData(prev => ({
      ...prev,
      parts: [...(prev.parts || []), part],
    }));
  }, []);

  const updatePart = useCallback((index: number, part: PartConfiguration) => {
    setFormData(prev => {
      const parts = [...(prev.parts || [])];
      parts[index] = part;
      return { ...prev, parts };
    });
  }, []);

  const removePart = useCallback((index: number) => {
    setFormData(prev => {
      const parts = [...(prev.parts || [])];
      parts.splice(index, 1);
      return { ...prev, parts };
    });
  }, []);

  const addPartner = useCallback((partner: PartnerAssignment) => {
    setFormData(prev => ({
      ...prev,
      partners: [...(prev.partners || []), partner],
    }));
  }, []);

  const updatePartner = useCallback((index: number, partner: PartnerAssignment) => {
    setFormData(prev => {
      const partners = [...(prev.partners || [])];
      partners[index] = partner;
      return { ...prev, partners };
    });
  }, []);

  const removePartner = useCallback((index: number) => {
    setFormData(prev => {
      const partners = [...(prev.partners || [])];
      partners.splice(index, 1);
      return { ...prev, partners };
    });
  }, []);

  const validate = useCallback((): boolean => {
    try {
      orderFormSchema.parse(formData);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.issues?.forEach(issue => {
          if (issue.path.length > 0) {
            const path = issue.path[0].toString();
            newErrors[path] = issue.message;
          } else {
            // For refinement errors without path
            newErrors['general'] = issue.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  }, [formData]);

  const validateStep = useCallback((step: number): boolean => {
    const stepFields = getStepFields(step);
    const stepData: any = {};
    
    stepFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(formData, field)) {
        stepData[field] = (formData as any)[field];
      }
    });

    // Special handling for date validation in step 1
    if (step === 1 && stepData.startDate && stepData.endDate) {
      // Validate date relationship
      if (stepData.endDate <= stepData.startDate) {
        setErrors(prev => ({ ...prev, endDate: 'End date must be after start date' }));
        return false;
      }
    }

    try {
      // Create a partial schema for the step
      const stepSchema = createStepSchema(step);
      stepSchema.parse(stepData);
      
      // Clear errors for validated fields
      setErrors(prev => {
        const newErrors = { ...prev };
        stepFields.forEach(field => {
          delete newErrors[field];
        });
        return newErrors;
      });
      
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors?.forEach(err => {
          const path = err.path[0]?.toString() || err.path.join('.');
          newErrors[path] = err.message;
        });
        setErrors(prev => ({ ...prev, ...newErrors }));
      }
      return false;
    }
  }, [formData]);

  const reset = useCallback(() => {
    setFormData(initialDataRef.current);
    setErrors({});
    setIsDirty(false);
    setCurrentStep(0);
    if (storageKey) {
      sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const save = useCallback(() => {
    if (storageKey) {
      const dataToSave = {
        data: formDataRef.current,  // Use ref to get latest data
        timestamp: new Date().toISOString(),
        step: currentStep,
      };
      sessionStorage.setItem(storageKey, JSON.stringify(dataToSave));
    }
  }, [currentStep, storageKey]);

  const load = useCallback(() => {
    if (storageKey) {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        try {
          const { data, step } = JSON.parse(saved);
          // Convert date strings back to Date objects
          if (data.startDate) data.startDate = new Date(data.startDate);
          if (data.endDate) data.endDate = new Date(data.endDate);
          if (data.parts) {
            data.parts = data.parts.map((part: any) => ({
              ...part,
              deadline: new Date(part.deadline),
              lockSchedule: {
                t3: new Date(part.lockSchedule.t3),
                t1: new Date(part.lockSchedule.t1),
                t0: new Date(part.lockSchedule.t0),
                t8: new Date(part.lockSchedule.t8),
              },
            }));
          }
          if (data.partners) {
            data.partners = data.partners.map((partner: any) => ({
              ...partner,
              expiryDate: partner.expiryDate ? new Date(partner.expiryDate) : undefined,
            }));
          }
          setFormData(data);
          setCurrentStep(step || 0);
        } catch (error) {
          console.error('Failed to load saved form data:', error);
        }
      }
    }
  }, [storageKey]);

  const clearSaved = useCallback(() => {
    if (storageKey) {
      sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  const nextStep = useCallback((): boolean => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 5)); // Max 6 steps (0-5)
      return true;
    }
    return false;
  }, [currentStep, validateStep]);

  const previousStep = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const goToStep = useCallback((step: number) => {
    if (step >= 0 && step <= 5) {
      // Validate all steps up to the target step
      let canNavigate = true;
      for (let i = 0; i < step; i++) {
        if (!validateStep(i)) {
          canNavigate = false;
          break;
        }
      }
      
      if (canNavigate || step < currentStep) {
        setCurrentStep(step);
      }
    }
  }, [currentStep, validateStep]);

  return {
    formData,
    errors,
    isDirty,
    isValid,
    currentStep,
    updateField,
    updateFields,
    addPart,
    updatePart,
    removePart,
    addPartner,
    updatePartner,
    removePartner,
    validate,
    validateStep,
    reset,
    clearErrors,
    save,
    load,
    clearSaved,
    nextStep,
    previousStep,
    goToStep,
  };
};

// Helper functions
function validateForm(data: Partial<OrderFormData>): boolean {
  try {
    orderFormSchema.parse(data);
    return true;
  } catch {
    return false;
  }
}

function getStepFields(step: number): string[] {
  const stepFieldMap: Record<number, string[]> = {
    0: ['contractId', 'contractName'],
    1: ['orderName', 'orderCode', 'description', 'startDate', 'endDate', 'orderType'],
    2: ['templateId', 'templateVersion'],
    3: ['parts'],
    4: ['partners'],
    5: [], // Review step - no new fields
  };
  
  return stepFieldMap[step] || [];
}

function createStepSchema(step: number): z.ZodSchema {
  switch (step) {
    case 0:
      return z.object({
        contractId: z.string().min(1, 'Contract is required'),
        contractName: z.string().min(1, 'Contract name is required'),
      });
    
    case 1: {
      const schema = z.object({
        orderName: z.string()
          .min(3, 'Order name must be at least 3 characters')
          .max(100, 'Order name too long'),
        orderCode: z.string().min(1, 'Order code is required'),
        description: z.string().max(500).optional(),
        startDate: z.date(),
        endDate: z.date(),
        orderType: z.enum(['standard', 'urgent', 'special']),
      });
      
      // Only add refine if both dates exist
      return schema.refine(data => {
        if (data.startDate && data.endDate) {
          return data.endDate > data.startDate;
        }
        return true;
      }, {
        message: 'End date must be after start date',
        path: ['endDate'],
      });
    }
    
    case 2:
      return z.object({
        templateId: z.string().min(1, 'Template is required'),
        templateVersion: z.string().min(1, 'Template version is required'),
      });
    
    case 3:
      return z.object({
        parts: z.array(z.object({
          type: z.enum(['A', 'B', 'C']),
          deadline: z.date(),
          lockSchedule: z.object({
            t3: z.date(),
            t1: z.date(),
            t0: z.date(),
            t8: z.date(),
          }),
        })).min(1, 'At least one part required'),
      });
    
    case 4:
      return z.object({
        partners: z.array(z.object({
          companyId: z.string(),
          companyName: z.string(),
          accessLevel: z.enum(['read', 'write', 'admin']),
          folders: z.array(z.string()),
          parts: z.array(z.enum(['A', 'B', 'C'])),
          expiryDate: z.date().optional(),
        })).min(1, 'At least one partner required'),
      });
    
    default:
      return z.object({});
  }
}

export default useOrderForm;