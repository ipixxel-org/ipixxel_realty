import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { toSafeOrganisation } from '../../common/utils/mappers.util';
import {
  listIndustryHistory,
  updateOrganisationProfile,
} from '../../common/utils/org-industry.util';
import { UpdateOrganisationDto } from '../admin-organisations/dto/update-organisation.dto';
import { AssetUploadUrlDto } from './dto/asset-upload-url.dto';

@Injectable()
export class OrgSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getSettings(orgId: string) {
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: orgId },
    });
    return toSafeOrganisation(organisation);
  }

  async updateSettings(
    orgId: string,
    dto: UpdateOrganisationDto,
    actorId: string,
  ) {
    // slug and status are excluded from UpdateOrganisationDto entirely — an
    // Org Admin can never touch either, matching the mockup (slug shown
    // read-only, status is Super-Admin-only via its own endpoint).
    const updated = await updateOrganisationProfile(
      this.prisma,
      orgId,
      dto,
      actorId,
      'org_admin',
    );
    return toSafeOrganisation(updated);
  }

  // Industry ("role") change history — shown under Settings → General.
  async industryHistory(orgId: string) {
    return listIndustryHistory(this.prisma, orgId);
  }

  // Presigned PUT URL for the caller's own org logo/favicon, used by the
  // branding section of /org/settings. Same StorageService rules as the
  // signup wizard — the key is scoped to the JWT's orgId, never a body value.
  async createAssetUploadUrl(
    orgId: string,
    field: 'logo' | 'favicon',
    dto: AssetUploadUrlDto,
  ) {
    return this.storage.createUploadUrl({
      orgId,
      field,
      filename: dto.filename,
      contentType: dto.contentType,
      size: dto.size,
    });
  }
}
