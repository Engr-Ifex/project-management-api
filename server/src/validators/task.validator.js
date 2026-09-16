import { z } from 'zod';

const taskStatus = ['todo', 'in_progress', 'in_review', 'completed', 'cancelled'];

const taskPriority = ['low', 'medium', 'high', 'urgent'];

export const createTaskSchema = z.object({
  body: z.object({
    title: z
      .string()
      .trim()
      .min(2, 'Task title must be at least 2 characters')
      .max(200, 'Task title cannot exceed 200 characters'),

    description: z
      .string()
      .trim()
      .max(5000, 'Task description cannot exceed 5000 characters')
      .optional()
      .default(''),

    assignee: z.string().min(1, 'Assignee ID cannot be empty').optional().nullable(),

    startDate: z.string().datetime().optional().nullable(),

    dueDate: z.string().datetime().optional().nullable(),

    // Whole minutes. `0` is valid and means no estimate recorded yet.
    estimatedTime: z
      .number()
      .int()
      .min(0, 'Estimated time cannot be negative')
      .optional()
      .default(0),

    priority: z.enum(taskPriority).optional().default('medium'),
  }),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    projectId: z.string().min(1, 'Project ID is required'),
  }),

  query: z.object({}).optional(),
});

export const updateTaskSchema = z.object({
  body: z
    .object({
      title: z
        .string()
        .trim()
        .min(2, 'Task title must be at least 2 characters')
        .max(200, 'Task title cannot exceed 200 characters')
        .optional(),

      description: z
        .string()
        .trim()
        .max(5000, 'Task description cannot exceed 5000 characters')
        .optional(),

      startDate: z.string().datetime().nullable().optional(),

      dueDate: z.string().datetime().nullable().optional(),

      // Whole minutes; identical rule to task creation.
      estimatedTime: z.number().int().min(0, 'Estimated time cannot be negative').optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    projectId: z.string().min(1, 'Project ID is required'),

    taskId: z.string().min(1, 'Task ID is required'),
  }),

  query: z.object({}).optional(),
});

export const taskIdSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    projectId: z.string().min(1, 'Project ID is required'),

    taskId: z.string().min(1, 'Task ID is required'),
  }),

  query: z.object({}).optional(),
});

export const updateTaskStatusSchema = z.object({
  body: z.object({
    status: z.enum(taskStatus),
  }),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    projectId: z.string().min(1, 'Project ID is required'),

    taskId: z.string().min(1, 'Task ID is required'),
  }),

  query: z.object({}).optional(),
});

export const updateTaskPrioritySchema = z.object({
  body: z.object({
    priority: z.enum(taskPriority),
  }),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    projectId: z.string().min(1, 'Project ID is required'),

    taskId: z.string().min(1, 'Task ID is required'),
  }),

  query: z.object({}).optional(),
});

export const assignTaskSchema = z.object({
  body: z.object({
    assignee: z.string().min(1, 'Assignee ID is required').nullable(),
  }),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    projectId: z.string().min(1, 'Project ID is required'),

    taskId: z.string().min(1, 'Task ID is required'),
  }),

  query: z.object({}).optional(),
});

export const taskDueDateSchema = z.object({
  body: z.object({
    dueDate: z.string().datetime().nullable(),
  }),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    projectId: z.string().min(1, 'Project ID is required'),

    taskId: z.string().min(1, 'Task ID is required'),
  }),

  query: z.object({}).optional(),
});

export const projectTasksSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    projectId: z.string().min(1, 'Project ID is required'),
  }),

  query: z.object({}).optional(),
});

export const reorderTaskSchema = z.object({
  body: z.object({
    position: z.number().int().min(0, 'Position cannot be negative'),
  }),

  params: z.object({
    workspaceId: z.string().min(1, 'Workspace ID is required'),

    projectId: z.string().min(1, 'Project ID is required'),

    taskId: z.string().min(1, 'Task ID is required'),
  }),

  query: z.object({}).optional(),
});

export const taskStartDateSchema = z.object({
  body: z.object({
    startDate: z.string().datetime().nullable(),
  }),

  params: z.object({
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    taskId: z.string().min(1),
  }),

  query: z.object({}).optional(),
});

export const createSubtaskSchema = z.object({
  body: z.object({
    title: z
      .string()
      .trim()
      .min(1, 'Subtask title cannot be empty')
      .max(200, 'Subtask title cannot exceed 200 characters'),
  }),

  params: z.object({
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    taskId: z.string().min(1),
  }),

  query: z.object({}).optional(),
});

export const updateSubtaskSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(1).max(200).optional(),

      isCompleted: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided',
    }),

  params: z.object({
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    taskId: z.string().min(1),
    subtaskId: z.string().min(1),
  }),

  query: z.object({}).optional(),
});

export const subtaskIdSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    taskId: z.string().min(1),
    subtaskId: z.string().min(1),
  }),

  query: z.object({}).optional(),
});
