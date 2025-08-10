import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { 
  InheritanceToggle, 
  InheritanceVisualization,
  detectSpecialFolder,
  validateInheritanceOperation 
} from '../InheritanceToggle';
import type { FolderPermission } from '../../../types/permissions';
import userEvent from '@testing-library/user-event';

const mockFolder: FolderPermission = {
  folderId: 'test-folder-1',
  path: '/test/folder',
  name: 'TestFolder',
  depth: 1,
  inheritanceState: 'inherited',
  permissions: [],
  children: [
    {
      folderId: 'child-1',
      path: '/test/folder/child',
      name: 'ChildFolder',
      depth: 2,
      inheritanceState: 'inherited',
      permissions: [],
    },
  ],
};

const mockSpecialFolder: FolderPermission = {
  ...mockFolder,
  name: '00_BELSO_NEU_ONLY',
  path: '/test/00_BELSO_NEU_ONLY',
  specialFlags: { isNeuOnly: true },
};

const mockLockedFolder: FolderPermission = {
  ...mockFolder,
  name: '03_VEGLEGES',
  specialFlags: { isLocked: true },
};

const createWrapper = ({ children }: { children: React.ReactNode }) => (
  <FluentProvider theme={webLightTheme}>{children}</FluentProvider>
);

describe('InheritanceToggle', () => {
  const mockOnToggle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render inherited state correctly', () => {
    render(
      <InheritanceToggle folder={mockFolder} onToggle={mockOnToggle} />,
      { wrapper: createWrapper }
    );

    expect(screen.getByText('Inherited')).toBeInTheDocument();
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('should render broken inheritance state correctly', () => {
    const brokenFolder: FolderPermission = {
      ...mockFolder,
      inheritanceState: 'broken',
    };

    render(
      <InheritanceToggle folder={brokenFolder} onToggle={mockOnToggle} />,
      { wrapper: createWrapper }
    );

    expect(screen.getByText('Broken')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('should render explicit state correctly', () => {
    const explicitFolder: FolderPermission = {
      ...mockFolder,
      inheritanceState: 'explicit',
    };

    render(
      <InheritanceToggle folder={explicitFolder} onToggle={mockOnToggle} />,
      { wrapper: createWrapper }
    );

    expect(screen.getByText('Explicit')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('should show confirmation dialog when breaking inheritance', async () => {
    const user = userEvent.setup();
    render(
      <InheritanceToggle folder={mockFolder} onToggle={mockOnToggle} />,
      { wrapper: createWrapper }
    );

    const switchElement = screen.getByRole('switch');
    await user.click(switchElement);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Break Inheritance' })).toBeInTheDocument();
      expect(
        screen.getByText(/Breaking inheritance will create unique permissions/)
      ).toBeInTheDocument();
    });
  });

  it('should show confirmation dialog when restoring inheritance', async () => {
    const user = userEvent.setup();
    const brokenFolder: FolderPermission = {
      ...mockFolder,
      inheritanceState: 'broken',
    };

    render(
      <InheritanceToggle folder={brokenFolder} onToggle={mockOnToggle} />,
      { wrapper: createWrapper }
    );

    const switchElement = screen.getByRole('switch');
    await user.click(switchElement);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Restore Inheritance' })).toBeInTheDocument();
      expect(
        screen.getByText(/Restoring inheritance will replace current permissions/)
      ).toBeInTheDocument();
    });
  });

  it('should call onToggle when confirmed', async () => {
    const user = userEvent.setup();
    render(
      <InheritanceToggle folder={mockFolder} onToggle={mockOnToggle} />,
      { wrapper: createWrapper }
    );

    const switchElement = screen.getByRole('switch');
    await user.click(switchElement);

    const confirmButton = await screen.findByRole('button', { name: 'Break Inheritance' });
    await user.click(confirmButton);

    expect(mockOnToggle).toHaveBeenCalledWith('test-folder-1', true);
  });

  it('should not call onToggle when cancelled', async () => {
    const user = userEvent.setup();
    render(
      <InheritanceToggle folder={mockFolder} onToggle={mockOnToggle} />,
      { wrapper: createWrapper }
    );

    const switchElement = screen.getByRole('switch');
    await user.click(switchElement);

    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    expect(mockOnToggle).not.toHaveBeenCalled();
  });

  it('should show special folder warning for NEU-only folders', async () => {
    const user = userEvent.setup();
    render(
      <InheritanceToggle folder={mockSpecialFolder} onToggle={mockOnToggle} />,
      { wrapper: createWrapper }
    );

    expect(screen.getByText('NEU Only')).toBeInTheDocument();

    const switchElement = screen.getByRole('switch');
    await user.click(switchElement);

    await waitFor(() => {
      expect(
        screen.getByText(/This is a special folder with restricted access/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/This folder is restricted to NEU personnel only/)
      ).toBeInTheDocument();
    });
  });

  it('should disable switch for locked folders', () => {
    render(
      <InheritanceToggle folder={mockLockedFolder} onToggle={mockOnToggle} />,
      { wrapper: createWrapper }
    );

    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeDisabled();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('should show affected folders count', () => {
    const folderWithChildren: FolderPermission = {
      ...mockFolder,
      inheritanceState: 'broken',
      children: [
        {
          folderId: 'child-1',
          path: '/test/folder/child1',
          name: 'Child1',
          depth: 2,
          inheritanceState: 'inherited',
          permissions: [],
        },
        {
          folderId: 'child-2',
          path: '/test/folder/child2',
          name: 'Child2',
          depth: 2,
          inheritanceState: 'inherited',
          permissions: [],
        },
      ],
    };

    render(
      <InheritanceToggle folder={folderWithChildren} onToggle={mockOnToggle} />,
      { wrapper: createWrapper }
    );

    expect(screen.getByText('2 affected')).toBeInTheDocument();
  });

  it('should disable switch when loading', () => {
    render(
      <InheritanceToggle folder={mockFolder} onToggle={mockOnToggle} isLoading={true} />,
      { wrapper: createWrapper }
    );

    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeDisabled();
  });
});

describe('InheritanceVisualization', () => {
  it('should render inheritance chain', () => {
    const parentFolder: FolderPermission = {
      folderId: 'parent',
      path: '/parent',
      name: 'ParentFolder',
      depth: 0,
      inheritanceState: 'explicit',
      permissions: [],
    };

    render(
      <InheritanceVisualization folder={mockFolder} parentFolder={parentFolder} />,
      { wrapper: createWrapper }
    );

    expect(screen.getByText('Inheritance Chain:')).toBeInTheDocument();
    expect(screen.getByText('ParentFolder')).toBeInTheDocument();
  });

  it('should show broken inheritance indicator', () => {
    const brokenFolder: FolderPermission = {
      ...mockFolder,
      inheritanceState: 'broken',
    };

    render(
      <InheritanceVisualization folder={brokenFolder} />,
      { wrapper: createWrapper }
    );

    expect(screen.getByText('Inheritance broken at this level')).toBeInTheDocument();
  });
});

describe('detectSpecialFolder', () => {
  it('should detect NEU-only folders', () => {
    const folder: FolderPermission = {
      ...mockFolder,
      name: '00_BELSO_NEU_ONLY',
    };

    const result = detectSpecialFolder(folder);
    expect(result.isSpecial).toBe(true);
    expect(result.type).toBe('neuOnly');
    expect(result.message).toContain('NEU-only folder');
  });

  it('should detect financial folders', () => {
    const folder: FolderPermission = {
      ...mockFolder,
      name: 'TIG',
      path: '/test/TIG',
    };

    const result = detectSpecialFolder(folder);
    expect(result.isSpecial).toBe(true);
    expect(result.type).toBe('financial');
    expect(result.message).toContain('Financial folder');
  });

  it('should detect final/locked folders', () => {
    const folder: FolderPermission = {
      ...mockFolder,
      name: '03_VEGLEGES',
    };

    const result = detectSpecialFolder(folder);
    expect(result.isSpecial).toBe(true);
    expect(result.type).toBe('final');
    expect(result.message).toContain('Final folder');
  });

  it('should return not special for regular folders', () => {
    const result = detectSpecialFolder(mockFolder);
    expect(result.isSpecial).toBe(false);
    expect(result.type).toBeUndefined();
  });
});

describe('validateInheritanceOperation', () => {
  it('should validate breaking inheritance on inherited folder', () => {
    const result = validateInheritanceOperation(mockFolder, 'break');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return error when breaking already broken inheritance', () => {
    const brokenFolder: FolderPermission = {
      ...mockFolder,
      inheritanceState: 'broken',
    };

    const result = validateInheritanceOperation(brokenFolder, 'break');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Inheritance is already broken for this folder');
  });

  it('should return error for locked folders', () => {
    const result = validateInheritanceOperation(mockLockedFolder, 'break');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Cannot modify inheritance on locked folders');
  });

  it('should warn about special folders', () => {
    const result = validateInheritanceOperation(mockSpecialFolder, 'break');
    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain('NEU-only folder - No partner access allowed');
  });

  it('should validate restoring inheritance on broken folder', () => {
    const brokenFolder: FolderPermission = {
      ...mockFolder,
      inheritanceState: 'broken',
    };

    const result = validateInheritanceOperation(brokenFolder, 'restore');
    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain('All custom permissions will be replaced with inherited permissions');
  });

  it('should return error when restoring non-broken inheritance', () => {
    const result = validateInheritanceOperation(mockFolder, 'restore');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Inheritance is not broken for this folder');
  });

  it('should warn about affected child folders', () => {
    const folderWithChildren: FolderPermission = {
      ...mockFolder,
      children: [
        {
          folderId: 'child-1',
          path: '/test/folder/child',
          name: 'Child',
          depth: 2,
          inheritanceState: 'inherited',
          permissions: [],
        },
      ],
    };

    const result = validateInheritanceOperation(folderWithChildren, 'break');
    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain('1 child folders will be affected by this change');
  });
});