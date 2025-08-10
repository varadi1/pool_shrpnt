import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { permissionsService } from '../permissions';
import { api } from '../api';
import type {
  PermissionMatrix,
  EffectivePermission,
  User,
  Group,
  UserGroupAssignment,
} from '../../types/permissions';

// Mock the api module
vi.mock('../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('PermissionsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getEffectivePermissions', () => {
    it('should fetch effective permissions with all parameters', async () => {
      const mockResponse: EffectivePermission[] = [
        {
          userId: 'user1',
          folderId: 'folder1',
          calculatedLevel: 'read',
          sources: [],
        },
      ];

      vi.mocked(api.get).mockResolvedValue(mockResponse);

      const result = await permissionsService.getEffectivePermissions(
        'order1',
        'user1',
        'folder1',
        'group1'
      );

      expect(api.get).toHaveBeenCalledWith(
        '/api/permissions/effective?orderId=order1&userId=user1&folderId=folder1&groupId=group1'
      );
      expect(result).toEqual(mockResponse);
    });

    it('should fetch effective permissions with only orderId', async () => {
      const mockResponse: EffectivePermission[] = [];
      vi.mocked(api.get).mockResolvedValue(mockResponse);

      await permissionsService.getEffectivePermissions('order1');

      expect(api.get).toHaveBeenCalledWith(
        '/api/permissions/effective?orderId=order1'
      );
    });
  });

  describe('getPermissionMatrix', () => {
    it('should fetch permission matrix for an order', async () => {
      const mockMatrix: PermissionMatrix = {
        orderId: 'order1',
        folders: [],
        roles: [],
        lastModified: new Date(),
        syncStatus: {
          status: 'idle',
          pendingChanges: 0,
        },
      };

      vi.mocked(api.get).mockResolvedValue(mockMatrix);

      const result = await permissionsService.getPermissionMatrix('order1');

      expect(api.get).toHaveBeenCalledWith('/api/permissions/matrix/order1');
      expect(result).toEqual(mockMatrix);
    });
  });

  describe('updatePermissionMatrix', () => {
    it('should update permission matrix with optimistic callback', async () => {
      const updates = [
        {
          folderId: 'folder1',
          roleType: 'Expert' as const,
          level: 'write' as const,
        },
      ];

      const mockResponse: PermissionMatrix = {
        orderId: 'order1',
        folders: [],
        roles: [],
        lastModified: new Date(),
        syncStatus: {
          status: 'idle',
          pendingChanges: 0,
        },
      };

      vi.mocked(api.put).mockResolvedValue(mockResponse);

      const optimisticCallback = vi.fn();

      const result = await permissionsService.updatePermissionMatrix(
        {
          orderId: 'order1',
          updates,
        },
        optimisticCallback
      );

      expect(optimisticCallback).toHaveBeenCalledWith(updates);
      expect(api.put).toHaveBeenCalledWith(
        '/api/permissions/matrix/order1',
        { updates }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should rollback optimistic updates on failure', async () => {
      const updates = [
        {
          folderId: 'folder1',
          roleType: 'Expert' as const,
          level: 'write' as const,
        },
      ];

      vi.mocked(api.put).mockRejectedValue(new Error('Update failed'));

      const optimisticCallback = vi.fn();

      await expect(
        permissionsService.updatePermissionMatrix(
          {
            orderId: 'order1',
            updates,
          },
          optimisticCallback
        )
      ).rejects.toThrow('Update failed');

      // Check that optimistic update was called
      expect(optimisticCallback).toHaveBeenCalledTimes(2);
      
      // First call is the optimistic update
      expect(optimisticCallback).toHaveBeenNthCalledWith(1, updates);
      
      // Second call is the rollback
      expect(optimisticCallback).toHaveBeenNthCalledWith(2, [
        {
          folderId: 'folder1',
          roleType: 'Expert',
          level: 'none',
        },
      ]);
    });
  });

  describe('applyPermissions', () => {
    it('should apply permissions and track progress', async () => {
      const mockResponse = {
        status: 'in_progress' as const,
        jobId: 'job1',
        startedAt: new Date(),
        progress: {
          current: 0,
          total: 10,
          percentage: 0,
        },
      };

      vi.mocked(api.post).mockResolvedValue(mockResponse);
      vi.mocked(api.get).mockResolvedValue({
        ...mockResponse,
        status: 'completed',
        completedAt: new Date(),
        progress: {
          current: 10,
          total: 10,
          percentage: 100,
        },
      });

      const onProgress = vi.fn();

      const result = await permissionsService.applyPermissions(
        {
          orderId: 'order1',
          dryRun: false,
        },
        onProgress
      );

      expect(api.post).toHaveBeenCalledWith('/api/permissions/apply', {
        orderId: 'order1',
        dryRun: false,
      });
      expect(result).toEqual(mockResponse);

      // Advance timers to trigger polling
      await vi.advanceTimersByTimeAsync(2000);

      expect(api.get).toHaveBeenCalledWith('/api/permissions/apply/job1');
      expect(onProgress).toHaveBeenCalled();
    });
  });

  describe('searchUsers', () => {
    it('should search users with query and limit', async () => {
      const mockUsers: User[] = [
        {
          id: 'user1',
          displayName: 'John Doe',
          email: 'john@example.com',
          userPrincipalName: 'john@example.com',
          type: 'Member',
        },
      ];

      vi.mocked(api.get).mockResolvedValue(mockUsers);

      const result = await permissionsService.searchUsers('john', 5);

      expect(api.get).toHaveBeenCalledWith('/api/users?q=john&limit=5');
      expect(result).toEqual(mockUsers);
    });
  });

  describe('searchGroups', () => {
    it('should search groups with query and limit', async () => {
      const mockGroups: Group[] = [
        {
          id: 'group1',
          displayName: 'Admins',
          mailEnabled: true,
          groupType: 'Security',
          memberCount: 5,
        },
      ];

      vi.mocked(api.get).mockResolvedValue(mockGroups);

      const result = await permissionsService.searchGroups('admin', 10);

      expect(api.get).toHaveBeenCalledWith('/api/groups?q=admin&limit=10');
      expect(result).toEqual(mockGroups);
    });
  });

  describe('getAssignments', () => {
    it('should fetch assignments for an order', async () => {
      const mockAssignments: UserGroupAssignment[] = [
        {
          principalId: 'user1',
          principalType: 'user',
          displayName: 'John Doe',
          email: 'john@example.com',
          roleType: 'Expert',
          folders: ['folder1'],
          assignedBy: 'admin',
          assignedAt: new Date(),
        },
      ];

      vi.mocked(api.get).mockResolvedValue(mockAssignments);

      const result = await permissionsService.getAssignments('order1');

      expect(api.get).toHaveBeenCalledWith(
        '/api/permissions/assignments/order1'
      );
      expect(result).toEqual(mockAssignments);
    });
  });

  describe('addAssignment', () => {
    it('should add a new assignment', async () => {
      const newAssignment = {
        principalId: 'user1',
        principalType: 'user' as const,
        displayName: 'John Doe',
        email: 'john@example.com',
        roleType: 'Expert' as const,
        folders: ['folder1'],
      };

      const mockResponse: UserGroupAssignment = {
        ...newAssignment,
        assignedBy: 'admin',
        assignedAt: new Date(),
      };

      vi.mocked(api.post).mockResolvedValue(mockResponse);

      const result = await permissionsService.addAssignment(
        'order1',
        newAssignment
      );

      expect(api.post).toHaveBeenCalledWith(
        '/api/permissions/assignments/order1',
        newAssignment
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('removeAssignment', () => {
    it('should remove an assignment', async () => {
      vi.mocked(api.delete).mockResolvedValue(undefined);

      await permissionsService.removeAssignment('order1', 'user1');

      expect(api.delete).toHaveBeenCalledWith(
        '/api/permissions/assignments/order1/user1'
      );
    });
  });

  describe('copyPermissions', () => {
    it('should copy permissions from source to target users', async () => {
      vi.mocked(api.post).mockResolvedValue(undefined);

      await permissionsService.copyPermissions('order1', 'user1', [
        'user2',
        'user3',
      ]);

      expect(api.post).toHaveBeenCalledWith(
        '/api/permissions/copy/order1',
        {
          sourceUserId: 'user1',
          targetUserIds: ['user2', 'user3'],
        }
      );
    });
  });

  describe('retry logic', () => {
    it('should retry on 429 throttling error', async () => {
      const mockResponse = { data: 'success' };
      
      // First call fails with 429, second succeeds
      vi.mocked(api.get)
        .mockRejectedValueOnce({
          response: {
            status: 429,
            headers: {
              'retry-after': '1',
            },
          },
        })
        .mockResolvedValueOnce(mockResponse);

      const result = await permissionsService.getPermissionMatrix('order1');

      expect(api.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockResponse);
    });

    it('should retry on 503 service unavailable', async () => {
      const mockResponse = { data: 'success' };
      
      // First call fails with 503, second succeeds
      vi.mocked(api.get)
        .mockRejectedValueOnce({
          response: {
            status: 503,
          },
        })
        .mockResolvedValueOnce(mockResponse);

      const result = await permissionsService.getPermissionMatrix('order1');

      expect(api.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockResponse);
    });

    it('should not retry on 400 client errors', async () => {
      vi.mocked(api.get).mockRejectedValue({
        response: {
          status: 400,
          data: { error: 'Bad request' },
        },
      });

      await expect(
        permissionsService.getPermissionMatrix('order1')
      ).rejects.toMatchObject({
        response: {
          status: 400,
        },
      });

      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('should give up after max retries', async () => {
      vi.mocked(api.get).mockRejectedValue({
        response: {
          status: 503,
        },
      });

      await expect(
        permissionsService.getPermissionMatrix('order1')
      ).rejects.toMatchObject({
        response: {
          status: 503,
        },
      });

      // Default max retries is 3, so 4 total attempts
      expect(api.get).toHaveBeenCalledTimes(4);
    });
  });

  describe('throttle state', () => {
    it('should track throttle state', async () => {
      const resetTime = Date.now() + 60000;
      
      vi.mocked(api.get).mockRejectedValueOnce({
        response: {
          status: 429,
          headers: {
            'retry-after': '60',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor(resetTime / 1000)),
          },
        },
      }).mockResolvedValueOnce({ data: 'success' });

      await permissionsService.getPermissionMatrix('order1');

      const throttleState = permissionsService.getThrottleState();
      expect(throttleState).toBeTruthy();
      expect(throttleState?.retryAfter).toBe(60);
      expect(throttleState?.requestsRemaining).toBe(0);
      expect(permissionsService.isThrottled()).toBe(true);
    });
  });

  describe('checkConflicts', () => {
    it('should check for permission conflicts', async () => {
      const mockConflicts = [
        {
          folderId: 'folder1',
          userId: 'user1',
          conflicts: [
            {
              source1: 'role',
              source2: 'explicit',
              level1: 'read' as const,
              level2: 'write' as const,
              resolution: 'manual' as const,
            },
          ],
        },
      ];

      vi.mocked(api.post).mockResolvedValue(mockConflicts);

      const result = await permissionsService.checkConflicts({
        orderId: 'order1',
        folderId: 'folder1',
        userId: 'user1',
      });

      expect(api.post).toHaveBeenCalledWith('/api/permissions/conflicts', {
        orderId: 'order1',
        folderId: 'folder1',
        userId: 'user1',
      });
      expect(result).toEqual(mockConflicts);
    });
  });

  describe('bulkUpdate', () => {
    it('should perform bulk update operations', async () => {
      vi.mocked(api.post).mockResolvedValue(undefined);

      const operation = {
        type: 'add' as const,
        targets: {
          users: ['user1', 'user2'],
          folders: ['folder1'],
        },
        permission: 'write' as const,
        limits: {
          maxUsers: 100,
          maxFolders: 50,
          maxGroups: 20,
        },
      };

      await permissionsService.bulkUpdate('order1', operation);

      expect(api.post).toHaveBeenCalledWith(
        '/api/permissions/bulk/order1',
        operation
      );
    });
  });

  describe('getApplyStatus', () => {
    it('should get apply job status', async () => {
      const mockStatus = {
        status: 'completed' as const,
        jobId: 'job1',
        startedAt: new Date(),
        completedAt: new Date(),
        progress: {
          current: 10,
          total: 10,
          percentage: 100,
        },
      };

      vi.mocked(api.get).mockResolvedValue(mockStatus);

      const result = await permissionsService.getApplyStatus('job1');

      expect(api.get).toHaveBeenCalledWith('/api/permissions/apply/job1');
      expect(result).toEqual(mockStatus);
    });
  });
});