import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import buildRouteInventory from '../scripts/route-inventory.js';

import PROJECT_PERMISSIONS from '../src/constants/projectPermission.js';
import PROJECT_ROLE_PERMISSIONS from '../src/constants/projectRolePermissions.js';
import { ROLE_PERMISSIONS } from '../src/constants/rolePermissions.js';
import { WORKSPACE_PERMISSIONS } from '../src/constants/workspacePermissions.js';
import { WORKSPACE_ROLES } from '../src/constants/workspaceRoles.js';
import { SRC_DIR } from '../src/config/paths.js';

/*
 * The permission tables must describe what is enforced.
 *
 * The audit that prompted this file found the project role table granting
 * capabilities no route consults — `project:update`, `project:archive`,
 * `project:restore`, `project:add_member`, `project:remove_member` — and the
 * workspace admin role holding `archive_workspace` while the route required
 * OWNER. The tables were read as the authorization answer and were wrong.
 *
 * These tests derive the truth from the route inventory (which is built from
 * the route files themselves) and compare it against the tables, so the two
 * cannot drift apart again without a failure.
 */

let enforcedProjectPermissions;
let enforcedWorkspacePermissions;

before(async () => {
  const routes = await buildRouteInventory();
  const allGuards = routes.flatMap((route) => route.guards);

  /** Permissions passed to `requireProjectPermission` on some route. */
  enforcedProjectPermissions = new Set(
    allGuards
      .filter((guard) => guard.startsWith('project:'))
      .map((guard) => guard.slice('project:'.length))
  );

  /** Workspace permissions passed to `requireWorkspacePermission` on some route. */
  enforcedWorkspacePermissions = new Set(
    allGuards
      .filter((guard) => guard.startsWith('workspace:'))
      .map((guard) => WORKSPACE_PERMISSIONS[guard.slice('workspace:'.length)])
      .filter(Boolean)
  );
});

/** Every permission value granted to at least one project role. */
const grantedProjectPermissions = new Set(Object.values(PROJECT_ROLE_PERMISSIONS).flat());

/** Every permission value granted to at least one workspace role. */
const grantedWorkspacePermissions = new Set(Object.values(ROLE_PERMISSIONS).flat());

/**
 * Some capabilities are checked in a service rather than on a route, because
 * the decision needs the document that is being modified: whether the caller
 * may delete *someone else's* comment or attachment. Those are found by
 * searching the service sources for the permission constant.
 */
const serviceSources = fs
  .readdirSync(path.join(SRC_DIR, 'services'))
  .map((file) => fs.readFileSync(path.join(SRC_DIR, 'services', file), 'utf8'))
  .join('\n');

const constantNameOf = Object.fromEntries(
  Object.entries(PROJECT_PERMISSIONS).map(([name, value]) => [value, name])
);

const referencedByAService = (permission) => {
  const name = constantNameOf[permission];

  return Boolean(name) && serviceSources.includes(`PROJECT_PERMISSIONS.${name}`);
};

describe('permission tables match the implementation', () => {
  describe('project permissions', () => {
    test('no project role is granted a permission nothing enforces', () => {
      const unenforced = [...grantedProjectPermissions].filter(
        (permission) =>
          !enforcedProjectPermissions.has(permission) && !referencedByAService(permission)
      );

      assert.deepEqual(
        unenforced,
        [],
        `granted to a role but never checked:\n  ${unenforced.join('\n  ')}\n` +
          'Either gate a route on it, or remove the grant — a grant no route ' +
          'consults is read as authorization and is wrong.'
      );
    });

    test('every permission a route checks is granted to at least one role', () => {
      /*
       * The opposite drift: a guard naming a permission no role holds denies
       * everyone, including the project owner.
       */
      const ungranted = [...enforcedProjectPermissions].filter(
        (permission) => !grantedProjectPermissions.has(permission)
      );

      assert.deepEqual(
        ungranted,
        [],
        `checked by a route but granted to no role:\n  ${ungranted.join('\n  ')}`
      );
    });

    test('the moderate capabilities are granted and enforced in a service', () => {
      for (const permission of [
        PROJECT_PERMISSIONS.MODERATE_COMMENT,
        PROJECT_PERMISSIONS.MODERATE_ATTACHMENT,
      ]) {
        assert.ok(
          grantedProjectPermissions.has(permission),
          `${permission} must be granted to owner/admin`
        );
        assert.ok(
          referencedByAService(permission),
          `${permission} is not enforced by a route, so a service must check it`
        );
      }
    });
  });

  describe('workspace permissions', () => {
    test('every permission a route checks is granted to at least one role', () => {
      const ungranted = [...enforcedWorkspacePermissions].filter(
        (permission) => !grantedWorkspacePermissions.has(permission)
      );

      assert.deepEqual(
        ungranted,
        [],
        `checked by a route but granted to no role:\n  ${ungranted.join('\n  ')}`
      );
    });

    test('an admin is not granted a capability its route reserves for the owner', () => {
      /*
       * Archive, restore and delete are enforced with
       * `requireWorkspaceRole(OWNER)`, which never consults the permission
       * table. Granting them to admin in the table made the table disagree
       * with the API, so they are pinned here.
       */
      const ownerOnly = [
        WORKSPACE_PERMISSIONS.ARCHIVE_WORKSPACE,
        WORKSPACE_PERMISSIONS.RESTORE_WORKSPACE,
        WORKSPACE_PERMISSIONS.DELETE_WORKSPACE,
        WORKSPACE_PERMISSIONS.CHANGE_ROLES,
        WORKSPACE_PERMISSIONS.TRANSFER_OWNERSHIP,
      ];

      for (const permission of ownerOnly) {
        assert.ok(
          !ROLE_PERMISSIONS[WORKSPACE_ROLES.ADMIN].includes(permission),
          `admin must not hold ${permission}: the route requires OWNER`
        );
        assert.ok(
          ROLE_PERMISSIONS[WORKSPACE_ROLES.OWNER].includes(permission),
          `owner must hold ${permission}`
        );
      }
    });

    test('a member holds only read capabilities', () => {
      assert.deepEqual(
        [...ROLE_PERMISSIONS[WORKSPACE_ROLES.MEMBER]].sort(),
        [WORKSPACE_PERMISSIONS.VIEW_WORKSPACE, WORKSPACE_PERMISSIONS.VIEW_MEMBERS].sort()
      );
    });
  });

  describe('project role shapes', () => {
    test('owner and admin hold the same set', () => {
      assert.deepEqual(
        [...PROJECT_ROLE_PERMISSIONS.owner].sort(),
        [...PROJECT_ROLE_PERMISSIONS.admin].sort(),
        'owner and admin are documented as identical'
      );
    });

    test('a viewer may only view', () => {
      assert.deepEqual(PROJECT_ROLE_PERMISSIONS.viewer, [PROJECT_PERMISSIONS.VIEW_PROJECT]);
    });

    test('a member cannot delete, archive or moderate', () => {
      const forbidden = [
        PROJECT_PERMISSIONS.DELETE_TASK,
        PROJECT_PERMISSIONS.ARCHIVE_TASK,
        PROJECT_PERMISSIONS.RESTORE_TASK,
        PROJECT_PERMISSIONS.MODERATE_COMMENT,
        PROJECT_PERMISSIONS.MODERATE_ATTACHMENT,
        PROJECT_PERMISSIONS.CREATE_LABEL,
        PROJECT_PERMISSIONS.CHANGE_PROJECT_ROLE,
      ];

      for (const permission of forbidden) {
        assert.ok(
          !PROJECT_ROLE_PERMISSIONS.member.includes(permission),
          `member must not hold ${permission}`
        );
      }
    });
  });
});
