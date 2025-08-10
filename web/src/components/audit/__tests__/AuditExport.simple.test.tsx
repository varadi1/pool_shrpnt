import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditExport } from '../AuditExport';
import type { AuditFilter } from '../../../types/audit';

describe('AuditExport Simple Test', () => {
  it('should import and render without errors', () => {
    const mockFilters: AuditFilter = {};
    const mockOnExport = vi.fn();
    const mockOnDownload = vi.fn();

    const { container } = render(
      <AuditExport
        filters={mockFilters}
        totalCount={100}
        onExport={mockOnExport}
        onDownload={mockOnDownload}
      />
    );

    expect(container).toBeTruthy();
  });
});