import { Router } from 'express';
import { createProjectsRouter } from './projects.js';
import { createAgentsRouter } from './agents.js';
import { createTasksRouter } from './tasks.js';
import { createWorkflowsRouter } from './workflows.js';
import { createMetricsRouter } from './metrics.js';
import { createDirectiveRouter } from './directive.js';
import { createChatRouter } from './chat.js';

export function createApiRouter(): Router {
  const router = Router();

  // Project routes
  router.use('/projects', createProjectsRouter());

  // Agent routes (nested under projects + direct)
  const agentsRouter = createAgentsRouter();
  router.use('/', agentsRouter);

  // Task routes (nested under projects + direct)
  const tasksRouter = createTasksRouter();
  router.use('/', tasksRouter);

  // Workflow routes (nested under projects + direct)
  const workflowsRouter = createWorkflowsRouter();
  router.use('/', workflowsRouter);

  // Directive routes (CEO → PM flow)
  const directiveRouter = createDirectiveRouter();
  router.use('/', directiveRouter);

  // Chat routes (CEO ↔ PM conversation)
  const chatRouter = createChatRouter();
  router.use('/', chatRouter);

  // Metrics routes
  const metricsRouter = createMetricsRouter();
  router.use('/', metricsRouter);

  return router;
}

export { createProjectsRouter } from './projects.js';
export { createAgentsRouter } from './agents.js';
export { createTasksRouter } from './tasks.js';
export { createWorkflowsRouter } from './workflows.js';
export { createMetricsRouter } from './metrics.js';
export { createDirectiveRouter } from './directive.js';
export { createChatRouter } from './chat.js';
