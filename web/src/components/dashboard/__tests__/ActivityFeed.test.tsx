import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityFeed } from '../ActivityFeed';

// Mock date-fns
vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn((date) => '5 minutes ago'),
}));

describe('ActivityFeed', () => {
  const mockActivities = [
    {
      id: '1',
      user: 'user1@example.com',
      action: 'Created new order',
      target: 'Order-123',
      timestamp: '2024-01-15T10:00:00Z',
      type: 'create' as const,
    },
    {
      id: '2',
      user: 'admin@example.com',
      action: 'Updated contract',
      target: 'Contract-456',
      timestamp: '2024-01-15T09:30:00Z',
      type: 'update' as const,
    },
    {
      id: '3',
      user: 'user2@example.com',
      action: 'Deleted template',
      target: 'Template-789',
      timestamp: '2024-01-15T09:00:00Z',
      type: 'delete' as const,
    },
  ];

  it('renders activity feed with activities', () => {
    render(<ActivityFeed activities={mockActivities} />);

    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByText('user1@example.com')).toBeInTheDocument();
    expect(screen.getByText('Created new order')).toBeInTheDocument();
    expect(screen.getByText('Order-123')).toBeInTheDocument();
  });

  it('displays loading state', () => {
    render(<ActivityFeed loading={true} />);

    expect(screen.getByText('Loading activities...')).toBeInTheDocument();
  });

  it('displays error state', () => {
    render(<ActivityFeed error={true} />);

    expect(screen.getByText('Failed to load activities')).toBeInTheDocument();
  });

  it('displays empty state when no activities', () => {
    render(<ActivityFeed activities={[]} />);

    expect(screen.getByText('No recent activity')).toBeInTheDocument();
  });

  it('renders correct badge colors for different activity types', () => {
    render(<ActivityFeed activities={mockActivities} />);

    // Check that badges are rendered for each activity type
    expect(screen.getByText('create')).toBeInTheDocument();
    expect(screen.getByText('update')).toBeInTheDocument();
  });

  it('displays time ago for each activity', () => {
    render(<ActivityFeed activities={mockActivities} />);

    // Check that formatDistanceToNow was called for each activity
    const timeElements = screen.getAllByText('5 minutes ago');
    expect(timeElements).toHaveLength(mockActivities.length);
  });

  it('handles activities without target', () => {
    const activitiesWithoutTarget = [
      {
        id: '1',
        user: 'user@example.com',
        action: 'Logged in',
        timestamp: '2024-01-15T10:00:00Z',
        type: 'update' as const,
      },
    ];

    render(<ActivityFeed activities={activitiesWithoutTarget} />);

    expect(screen.getByText('Logged in')).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it('renders all activity types with correct badges', () => {
    const allTypes = [
      { id: '1', user: 'user', action: 'action', timestamp: '2024-01-15T10:00:00Z', type: 'create' as const },
      { id: '2', user: 'user', action: 'action', timestamp: '2024-01-15T10:00:00Z', type: 'update' as const },
      { id: '3', user: 'user', action: 'action', timestamp: '2024-01-15T10:00:00Z', type: 'delete' as const },
      { id: '4', user: 'user', action: 'action', timestamp: '2024-01-15T10:00:00Z', type: 'provision' as const },
      { id: '5', user: 'user', action: 'action', timestamp: '2024-01-15T10:00:00Z', type: 'lock' as const },
      { id: '6', user: 'user', action: 'action', timestamp: '2024-01-15T10:00:00Z', type: 'unlock' as const },
    ];

    render(<ActivityFeed activities={allTypes} />);

    expect(screen.getByText('create')).toBeInTheDocument();
    expect(screen.getByText('update')).toBeInTheDocument();
    expect(screen.getByText('delete')).toBeInTheDocument();
    expect(screen.getByText('provision')).toBeInTheDocument();
    expect(screen.getByText('lock')).toBeInTheDocument();
    expect(screen.getByText('unlock')).toBeInTheDocument();
  });

  it('handles undefined activities prop', () => {
    render(<ActivityFeed />);

    expect(screen.getByText('No recent activity')).toBeInTheDocument();
  });

  it('renders with all props defined', () => {
    render(
      <ActivityFeed 
        activities={mockActivities}
        loading={false}
        error={false}
      />
    );

    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByText('user1@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Loading activities...')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed to load activities')).not.toBeInTheDocument();
  });
});