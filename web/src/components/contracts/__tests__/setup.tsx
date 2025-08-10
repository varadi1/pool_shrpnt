import { vi } from 'vitest';
import React from 'react';

// Mock Fluent UI DataGrid components that have issues in test environment
vi.mock('@fluentui/react-components', async () => {
  const actual = await vi.importActual('@fluentui/react-components');
  
  return {
    ...actual,
    DataGrid: ({ children, ...props }: any) => (
      <div data-testid="data-grid" {...props}>{children}</div>
    ),
    DataGridHeader: ({ children, ...props }: any) => (
      <div data-testid="data-grid-header" {...props}>{children}</div>
    ),
    DataGridHeaderCell: ({ children, onClick, ...props }: any) => (
      <th onClick={onClick} {...props}>{children}</th>
    ),
    DataGridBody: ({ children, ...props }: any) => (
      <tbody data-testid="data-grid-body" {...props}>{children}</tbody>
    ),
    DataGridRow: ({ children, onClick, ...props }: any) => (
      <tr onClick={onClick} {...props}>{children}</tr>
    ),
    DataGridCell: ({ children, ...props }: any) => (
      <td {...props}>{children}</td>
    ),
    TableCellLayout: ({ children, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
  };
});