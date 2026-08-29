import baseApi, { ShiyanCaptureWorkflow } from './index';
import {
  deliverConfirmedFinalDraftToGithub,
  handleMob022Request,
  type Mob022GithubEnv,
} from './mob022';
import type { ConfirmedFinalDraftSnapshot } from '../shared/destination';

type BaseEnv = Parameters<typeof baseApi.fetch>[1];
type Env = BaseEnv & Mob022GithubEnv;

type Device = {
  id: string;
  user_id: string | null;
};

type FinalDraftRow = {
  id: string;
  task_id: string;
  title: string | null;
  task_title: string;
  markdown: string;
  confirmed_at: string | null;
  updated_at: string;
};

const TASK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const requestIdFor = (request: Request): string => {
  const supplied = request.headers.get('x-request-id')?.trim();
  return supplied && supplied.length <= 128 ? supplied : crypto.randomUUID();
};

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

const errorResponse = (
  requestId: string,
  status: number,
  code: string,
  message: string,
  retryable = false,
  taskId?: string,
): Response =>
  json(
    {
      ok: false,
      error: { code, message, retryable },
      requestId,
      ...(taskId ? { taskId } : {}),
    },
    status,
  );

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

async function authenticateDevice(request: Request, env: Env): Promise<Device | null> {
  const match = /^Bearer\s+(.+)$/iu.exec(request.headers.get('authorization') ?? '');
  const credential = match?.[1]?.trim();
  if (!credential) return null;

  const hash = await sha256Hex(`${env.DEVICE_AUTH_PEPPER}:${credential}`);
  return env.DB.prepare(
    `SELECT id, user_id FROM devices
     WHERE credential_hash = ? AND revoked_at IS NULL
     LIMIT 1`,
  )
    .bind(hash)
    .first<Device>();
}

const parseTaskId = (value: string): string | null => {
  try {
    const decoded = decodeURIComponent(value);
    return TASK_ID_PATTERN.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
};

const safeJson = async (request: Request): Promise<Record<string, unknown> | null> => {
  try {
    const value = await request.json();
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

async function taskOwnedByDevice(env: Env, taskId: string, deviceId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT id FROM capture_tasks WHERE id = ? AND device_id = ? LIMIT 1',
  )
    .bind(taskId, deviceId)
    .first<{ id: string }>();
  return Boolean(row);
}

async function readConfirmedFinalDraft(
  env: Env,
  taskId: string,
): Promise<ConfirmedFinalDraftSnapshot | null> {
  const row = await env.DB.prepare(
    `SELECT d.id, d.task_id, d.title, t.title AS task_title, d.markdown,
            d.confirmed_at, d.updated_at
     FROM drafts d
     INNER JOIN capture_tasks t ON t.id = d.task_id
     WHERE d.task_id = ? AND d.kind = 'final' AND d.version = 1
     LIMIT 1`,
  )
    .bind(taskId)
    .first<FinalDraftRow>();
  if (!row) return null;

  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title?.trim() || row.task_title,
    markdown: row.markdown,
    confirmedAt: row.confirmed_at ?? row.updated_at,
  };
}

async function deliverFinalDraft(
  request: Request,
  env: Env,
  device: Device,
  taskId: string,
  requestId: string,
): Promise<Response> {
  if (!(await taskOwnedByDevice(env, taskId, device.id))) {
    return errorResponse(requestId, 404, 'task_not_found', 'CaptureTask not found');
  }

  const raw = await safeJson(request);
  const destination = typeof raw?.destination === 'string' ? raw.destination.trim() : '';
  const idempotencyKey =
    typeof raw?.idempotencyKey === 'string' ? raw.idempotencyKey.trim() : '';
  if (destination !== 'github' || !idempotencyKey || idempotencyKey.length > 128) {
    return errorResponse(
      requestId,
      400,
      'invalid_request',
      'destination="github" and idempotencyKey are required',
      false,
      taskId,
    );
  }

  if (!env.GITHUB_DESTINATION_TOKEN?.trim()) {
    return errorResponse(
      requestId,
      503,
      'github_destination_not_configured',
      'GitHub Destination credential is not configured',
      true,
      taskId,
    );
  }

  const draft = await readConfirmedFinalDraft(env, taskId);
  if (!draft) {
    return errorResponse(
      requestId,
      409,
      'final_draft_not_ready',
      'A confirmed Final Draft is required before delivery',
      false,
      taskId,
    );
  }

  const result = await deliverConfirmedFinalDraftToGithub(env, draft, idempotencyKey);
  if (!result.ok) {
    return errorResponse(
      requestId,
      result.error.kind === 'retryable' ? 503 : 409,
      result.error.code,
      result.error.message,
      result.error.kind === 'retryable',
      taskId,
    );
  }

  return json({
    ok: true,
    data: { taskId, record: result.record, delivery: result.delivery },
    requestId,
  });
}

export { ShiyanCaptureWorkflow };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const deliveriesMatch = /^\/v1\/capture-tasks\/([^/]+)\/deliveries$/.exec(
      url.pathname,
    );
    if (!deliveriesMatch) return baseApi.fetch(request, env);

    const requestId = requestIdFor(request);
    const taskId = parseTaskId(deliveriesMatch[1]);
    if (!taskId) {
      return errorResponse(requestId, 400, 'invalid_task_id', 'Invalid CaptureTask id');
    }

    const device = await authenticateDevice(request, env);
    if (!device) {
      return errorResponse(
        requestId,
        401,
        'device_unauthorized',
        'Valid Shiyan device credential required',
      );
    }

    if (request.method === 'POST') {
      return deliverFinalDraft(request, env, device, taskId, requestId);
    }

    const mob022Response = await handleMob022Request(request, env, device, requestId);
    if (mob022Response) return mob022Response;
    return errorResponse(requestId, 404, 'route_not_found', 'Route not found');
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    await baseApi.scheduled(controller, env, ctx);
  },
};
