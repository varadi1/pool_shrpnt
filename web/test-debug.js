import { renderHook, act } from '@testing-library/react';
import { useOrderForm } from './src/hooks/useOrderForm';

const { result } = renderHook(() => useOrderForm());

console.log('Initial errors:', result.current.errors);

act(() => {
  const isValid = result.current.validate();
  console.log('Validation result:', isValid);
});

console.log('Errors after validate:', result.current.errors);
