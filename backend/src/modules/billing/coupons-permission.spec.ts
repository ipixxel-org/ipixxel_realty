import { readFileSync } from 'fs';
import { join } from 'path';
import {
  actionFromHttpMethod,
  moduleActions,
  PLATFORM_PERMISSION_MODULE_KEYS,
  platformModuleForPath,
} from '../../common/utils/permissions.util';

/**
 * Coupons are their own platform module (admin_coupons). Using a coupon on an
 * organisation stays under Subscriptions. Existing roles keep their access via
 * the copy migration.
 */
describe('Coupons platform permission', () => {
  it('is a platform module with View, Create (add) and Edit', () => {
    expect(PLATFORM_PERMISSION_MODULE_KEYS).toContain('admin_coupons');
    expect(moduleActions('admin_coupons')).toEqual(['view', 'add', 'edit']);
  });

  it.each([
    ['/admin/billing/coupons', 'admin_coupons'],
    ['/admin/billing/coupons/SAVE10', 'admin_coupons'],
    ['/admin/billing/org-options', 'admin_coupons'],
    ['/admin/billing/coupon-plans', 'admin_coupons'],
    // Using a coupon on an organisation is a Subscriptions action.
    ['/admin/billing/subscriptions/org-1/coupon', 'admin_subscriptions'],
    ['/admin/package-change-requests/pcr-1/coupon', 'admin_subscriptions'],
    ['/admin/billing/plans', 'admin_subscriptions'],
  ])('%s → %s', (path, module) => {
    expect(platformModuleForPath(path)).toBe(module);
  });

  it('new coupon is Create (POST → add), editing is Edit (PUT → edit)', () => {
    expect(actionFromHttpMethod('POST')).toBe('add');
    expect(actionFromHttpMethod('PUT')).toBe('edit');
    expect(actionFromHttpMethod('GET')).toBe('view');
  });

  it('the migration copies every role’s Subscriptions View / Add / Edit to Coupons, without overwriting', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '../../../prisma/migrations/20261104090000_admin_coupons_permissions/migration.sql',
      ),
      'utf8',
    );
    expect(sql).toMatch(
      /SELECT "org_id", "role_id", 'admin_coupons', "can_view", "can_add", "can_edit",\s+false, false, false, false, false/,
    );
    expect(sql).toMatch(/WHERE "module_key" = 'admin_subscriptions'/);
    expect(sql).toMatch(/ON CONFLICT \("org_id", "role_id", "module_key"\) DO NOTHING/);
  });
});
