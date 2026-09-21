import { describe, expect, it, vi } from 'vitest';
import { Router } from '../src/Router.js';
import { createRoutes, type PluginClient } from '../src/createRoutes.js';
import type { SseHub } from '../src/SseHub.js';

function buildRouter(allowPermissionApprovals: boolean) {
  const client = {
    postSessionIdPermissionsPermissionId: vi
      .fn()
      .mockResolvedValue({ data: { ok: true } }),
  } as unknown as PluginClient;
  const sseHub = {} as SseHub;
  const routes = createRoutes(
    { client, directory: '/tmp', allowPermissionApprovals },
    sseHub,
  );
  return { router: new Router(routes, () => {}), client };
}

const permissionRequest = () =>
  new Request('http://localhost/session/ses_1/permissions/perm_1', {
    method: 'POST',
    body: '{"allow":true}',
  });

describe('permission approvals gating', () => {
  it('returns 403 and does not call the SDK when disabled', async () => {
    const { router, client } = buildRouter(false);

    const response = await router.handle(permissionRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'permission approvals disabled',
    });
    expect(client.postSessionIdPermissionsPermissionId).not.toHaveBeenCalled();
  });

  it('invokes the handler when enabled', async () => {
    const { router, client } = buildRouter(true);

    const response = await router.handle(permissionRequest());

    expect(client.postSessionIdPermissionsPermissionId).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
