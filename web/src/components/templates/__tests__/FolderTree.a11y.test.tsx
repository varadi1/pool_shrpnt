import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { FolderTree } from '../FolderTree';
import type { FolderNode } from '../../../types/templates';

expect.extend(toHaveNoViolations);

describe('FolderTree Accessibility', () => {
  const mockOnChange = vi.fn();
  const mockOnSelect = vi.fn();

  const mockTree: FolderNode = {
    id: 'root',
    name: 'Root',
    path: '/',
    type: 'folder',
    children: [
      {
        id: 'doc',
        name: 'Documents',
        path: '/Documents',
        type: 'folder',
        children: [
          {
            id: 'financial',
            name: 'Financial',
            path: '/Documents/Financial',
            type: 'folder',
            children: [],
            properties: { required: true, locked: false },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
        ],
        properties: { required: true, locked: false },
        permissions: { inherit: true, breakInheritance: false, groups: [] },
        metadata: {},
      },
      {
        id: 'contracts',
        name: 'Contracts',
        path: '/Contracts',
        type: 'folder',
        children: [],
        properties: { required: false, locked: false },
        permissions: { inherit: true, breakInheritance: false, groups: [] },
        metadata: {},
      },
    ],
    properties: { required: true, locked: false },
    permissions: { inherit: true, breakInheritance: false, groups: [] },
    metadata: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have no accessibility violations', async () => {
    const { container } = render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
        selectedNodeId="doc"
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have proper ARIA attributes for tree structure', () => {
    render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
      />
    );

    // Check main tree has proper role
    const tree = screen.getByRole('tree');
    expect(tree).toBeInTheDocument();

    // Check tree items have proper roles
    const treeItems = screen.getAllByRole('treeitem');
    expect(treeItems.length).toBeGreaterThan(0);
  });

  it('should support keyboard navigation with arrow keys', async () => {
    render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
        selectedNodeId="root"
      />
    );

    const user = userEvent.setup();
    const rootNode = screen.getByText('Root');
    rootNode.focus();

    // Test arrow down navigation
    await user.keyboard('{ArrowDown}');
    expect(screen.getByText('Documents')).toHaveFocus();

    // Test arrow right to expand
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Financial')).toBeInTheDocument();

    // Test arrow down to child
    await user.keyboard('{ArrowDown}');
    expect(screen.getByText('Financial')).toHaveFocus();

    // Test arrow left to collapse
    await user.keyboard('{ArrowLeft}');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('Documents')).toHaveFocus();

    // Test arrow up navigation
    await user.keyboard('{ArrowUp}');
    expect(screen.getByText('Root')).toHaveFocus();
  });

  it('should support Enter key to select node', async () => {
    render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
      />
    );

    const user = userEvent.setup();
    const documentsNode = screen.getByText('Documents');
    documentsNode.focus();

    await user.keyboard('{Enter}');
    expect(mockOnSelect).toHaveBeenCalledWith('doc');
  });

  it('should support Space key to toggle expansion', async () => {
    render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
      />
    );

    const user = userEvent.setup();
    const documentsNode = screen.getByText('Documents');
    documentsNode.focus();

    // Expand with space
    await user.keyboard(' ');
    expect(screen.getByText('Financial')).toBeInTheDocument();

    // Collapse with space
    await user.keyboard(' ');
    expect(screen.queryByText('Financial')).not.toBeInTheDocument();
  });

  it('should have proper aria-expanded attributes', () => {
    render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
        expandedNodeIds={['doc']}
      />
    );

    const documentsNode = screen.getByText('Documents').closest('[role="treeitem"]');
    expect(documentsNode).toHaveAttribute('aria-expanded', 'true');

    const contractsNode = screen.getByText('Contracts').closest('[role="treeitem"]');
    expect(contractsNode).toHaveAttribute('aria-expanded', 'false');
  });

  it('should have proper aria-selected attributes', () => {
    render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
        selectedNodeId="doc"
      />
    );

    const documentsNode = screen.getByText('Documents').closest('[role="treeitem"]');
    expect(documentsNode).toHaveAttribute('aria-selected', 'true');

    const contractsNode = screen.getByText('Contracts').closest('[role="treeitem"]');
    expect(contractsNode).toHaveAttribute('aria-selected', 'false');
  });

  it('should support Home and End keys for navigation', async () => {
    render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
        expandedNodeIds={['doc']}
      />
    );

    const user = userEvent.setup();
    const financialNode = screen.getByText('Financial');
    financialNode.focus();

    // Test Home key - should go to first node
    await user.keyboard('{Home}');
    expect(screen.getByText('Root')).toHaveFocus();

    // Test End key - should go to last visible node
    await user.keyboard('{End}');
    expect(screen.getByText('Contracts')).toHaveFocus();
  });

  it('should announce changes to screen readers', async () => {
    const { rerender } = render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
        selectedNodeId="root"
      />
    );

    // Check live region exists
    const liveRegion = screen.getByRole('status', { hidden: true });
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');

    // Simulate selection change
    rerender(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
        selectedNodeId="doc"
      />
    );

    // Should announce the selection
    expect(liveRegion).toHaveTextContent('Documents selected');
  });

  it('should support type-ahead navigation', async () => {
    render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
      />
    );

    const user = userEvent.setup();
    const tree = screen.getByRole('tree');
    tree.focus();

    // Type 'c' to jump to Contracts
    await user.keyboard('c');
    expect(screen.getByText('Contracts')).toHaveFocus();

    // Type 'd' to jump to Documents
    await user.keyboard('d');
    expect(screen.getByText('Documents')).toHaveFocus();
  });

  it('should have proper tab order', async () => {
    render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
        selectedNodeId="doc"
        readOnly={false}
      />
    );

    const user = userEvent.setup();

    // Tab should move through interactive elements
    await user.tab();
    expect(document.activeElement).toHaveRole('treeitem');

    // Shift+Tab should move backwards
    await user.tab({ shift: true });
    expect(document.activeElement).toHaveRole('tree');
  });

  it('should provide context for drag and drop operations', async () => {
    render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
        draggable
      />
    );

    const documentsNode = screen.getByText('Documents').closest('[role="treeitem"]');
    
    // Should have draggable attribute
    expect(documentsNode).toHaveAttribute('draggable', 'true');
    
    // Should have aria-grabbed when dragging
    const user = userEvent.setup();
    await user.pointer([
      { target: documentsNode!, keys: '[MouseLeft>]' },
      { coords: { x: 100, y: 100 } },
    ]);
    
    expect(documentsNode).toHaveAttribute('aria-grabbed', 'true');
  });

  it('should indicate drop targets during drag', async () => {
    render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
        draggable
      />
    );

    const documentsNode = screen.getByText('Documents').closest('[role="treeitem"]');
    const contractsNode = screen.getByText('Contracts').closest('[role="treeitem"]');
    
    // Start dragging
    const user = userEvent.setup();
    await user.pointer([
      { target: documentsNode!, keys: '[MouseLeft>]' },
      { coords: { x: 100, y: 100 } },
    ]);
    
    // Contracts should indicate it's a drop target
    expect(contractsNode).toHaveAttribute('aria-dropeffect', 'move');
  });

  it('should provide keyboard shortcuts help', () => {
    render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
        showHelp
      />
    );

    // Should have help text or tooltip
    const helpText = screen.getByRole('tooltip', { hidden: true });
    expect(helpText).toBeInTheDocument();
    expect(helpText).toHaveTextContent(/arrow keys.*navigate/i);
    expect(helpText).toHaveTextContent(/enter.*select/i);
    expect(helpText).toHaveTextContent(/space.*expand/i);
  });

  it('should respect prefers-reduced-motion for animations', () => {
    // Mock matchMedia for reduced motion
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { container } = render(
      <FolderTree
        tree={mockTree}
        onChange={mockOnChange}
        onSelect={mockOnSelect}
      />
    );

    // Check that animations are disabled
    const treeItems = container.querySelectorAll('[role="treeitem"]');
    treeItems.forEach(item => {
      const styles = window.getComputedStyle(item);
      expect(styles.transition).toBe('none');
    });
  });
});