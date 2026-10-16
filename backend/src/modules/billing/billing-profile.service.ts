import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { BillingProfileV2 } from './billing.types';
import type { SaveBillingProfileDto } from './dto/save-billing-profile.dto';
import {
  GST_STATES,
  gstinProblem,
  isGstStateCode,
  normaliseGstin,
} from './gst';

const PINCODE_RE = /^[1-9][0-9]{5}$/;

/**
 * Semantic checks for an org billing profile (shape is checked by the DTO).
 * Returns the first problem as a customer-readable message, or null. Pure.
 */
export function billingProfileProblem(p: SaveBillingProfileDto): string | null {
  const country = (p.country ?? 'IN').toUpperCase();
  if (!p.legalName?.trim()) return 'Enter the legal name for invoices.';
  if (!p.addressLine1?.trim()) return 'Enter the billing address.';
  if (!p.city?.trim()) return 'Enter the city.';
  if (country === 'IN') {
    if (!isGstStateCode(p.state))
      return 'Choose the state — it decides how GST is split.';
    if (!PINCODE_RE.test(p.pincode?.trim() ?? ''))
      return 'Enter a 6-digit PIN code.';
    return gstinProblem(p.gstin, p.state);
  }
  // TODO(billing): buyers outside India — export of services rules. For now
  // they're accepted, charged IGST, and can't have a GSTIN.
  if (!p.state?.trim()) return 'Enter the state or region.';
  if (!p.pincode?.trim()) return 'Enter the postal code.';
  if (normaliseGstin(p.gstin))
    return 'A GSTIN only applies to Indian addresses.';
  return null;
}

type ProfileRow = {
  legalName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  gstin: string | null;
};

export function toProfileV2(row: ProfileRow): BillingProfileV2 {
  return {
    legalName: row.legalName,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    country: row.country,
    gstin: row.gstin,
  };
}

@Injectable()
export class BillingProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(orgId: string): Promise<BillingProfileV2 | null> {
    const row = await this.prisma.billingProfile.findUnique({
      where: { organisationId: orgId },
    });
    return row ? toProfileV2(row) : null;
  }

  async save(
    orgId: string,
    dto: SaveBillingProfileDto,
  ): Promise<BillingProfileV2> {
    const problem = billingProfileProblem(dto);
    if (problem) throw new BadRequestException(problem);
    const data = {
      legalName: dto.legalName.trim(),
      addressLine1: dto.addressLine1.trim(),
      addressLine2: dto.addressLine2?.trim() || null,
      city: dto.city.trim(),
      state: dto.state.trim(),
      pincode: dto.pincode.trim(),
      country: (dto.country ?? 'IN').toUpperCase(),
      gstin: normaliseGstin(dto.gstin) || null,
    };
    const row = await this.prisma.billingProfile.upsert({
      where: { organisationId: orgId },
      create: { organisationId: orgId, ...data },
      update: data,
    });
    return toProfileV2(row);
  }
}

export { GST_STATES };
