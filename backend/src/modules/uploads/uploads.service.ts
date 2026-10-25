import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { CreateMediaUploadUrlDto } from './dto/create-upload-url.dto';
import { RegisterMediaDto } from './dto/register-media.dto';
import { ListMediaQueryDto } from './dto/list-media-query.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { BulkDeleteMediaDto } from './dto/bulk-delete-media.dto';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  private determineCategory(mimeType: string, field?: string): string {
    if (field === 'amenityIcon' || field === 'favicon') return 'icon';
    if (field === 'logo') return 'logo';

    const mime = (mimeType || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (
      mime.includes('pdf') ||
      mime.includes('word') ||
      mime.includes('excel') ||
      mime.includes('spreadsheet') ||
      mime.includes('document') ||
      mime.includes('text') ||
      mime.includes('zip')
    ) {
      return 'document';
    }
    return 'other';
  }

  // --- Presigned Upload URL ---
  async createUploadUrl(user: JwtPayload, dto: CreateMediaUploadUrlDto) {
    const isSuperAdmin = !user.orgId || (user.roles && user.roles.includes('super_admin'));
    const orgId = isSuperAdmin ? undefined : (user.orgId ?? undefined);

    const result = await this.storageService.createUploadUrl({
      field: (dto.field as any) || 'media',
      filename: dto.filename,
      contentType: dto.contentType,
      size: dto.size,
      orgId,
    });

    const category =
      dto.category || this.determineCategory(dto.contentType, dto.field);

    return {
      ...result,
      category,
      suggestedFolder: dto.folder || 'general',
    };
  }

  // --- Register file metadata in DB after upload ---
  async registerMedia(user: JwtPayload, dto: RegisterMediaDto) {
    const isSuperAdmin = !user.orgId || (user.roles && user.roles.includes('super_admin'));
    const orgId = isSuperAdmin ? undefined : (user.orgId ?? undefined);

    const category =
      dto.category || this.determineCategory(dto.mimeType);

    if (dto.storedKey.includes('..') || dto.storedKey.includes('\\')) {
      throw new BadRequestException('Path traversal characters are forbidden in storage key');
    }
    if (orgId && !dto.storedKey.startsWith(`orgs/${orgId}/`)) {
      throw new BadRequestException('Storage key does not belong to your organisation');
    }

    const file = await this.prisma.mediaFile.create({
      data: {
        orgId: orgId || null,
        uploadedById: user.sub,
        name: dto.name || dto.filename,
        filename: dto.filename,
        storedKey: dto.storedKey,
        publicUrl: dto.publicUrl,
        mimeType: dto.mimeType,
        size: dto.size,
        category,
        folder: dto.folder || 'general',
        tags: dto.tags || [],
        metadata: dto.metadata || {},
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return file;
  }

  // --- List Media for Org ---
  async listOrgMedia(orgId: string, query: ListMediaQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 24;
    const skip = (page - 1) * limit;

    const where: any = { orgId };
    if (query.category) where.category = query.category;
    if (query.folder) where.folder = query.folder;

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { filename: { contains: query.search, mode: 'insensitive' } },
        { alt: { contains: query.search, mode: 'insensitive' } },
        { tags: { has: query.search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.mediaFile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          uploadedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.mediaFile.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  // --- Get Org Media Stats & Folders ---
  async getOrgStats(orgId: string) {
    const files = await this.prisma.mediaFile.findMany({
      where: { orgId },
      select: { size: true, category: true, folder: true },
    });

    const totalFiles = files.length;
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);

    const categoryBreakdown: Record<string, { count: number; bytes: number }> = {};
    const foldersSet = new Set<string>();

    files.forEach((f) => {
      const cat = f.category || 'other';
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { count: 0, bytes: 0 };
      }
      categoryBreakdown[cat].count += 1;
      categoryBreakdown[cat].bytes += f.size || 0;
      if (f.folder) foldersSet.add(f.folder);
    });

    return {
      totalFiles,
      totalBytes,
      totalFormatted: formatBytes(totalBytes),
      categoryBreakdown,
      folders: Array.from(foldersSet).sort(),
    };
  }

  // --- Update Media ---
  async updateMedia(orgId: string | null, id: string, dto: UpdateMediaDto) {
    const where: any = { id };
    if (orgId) where.orgId = orgId;

    const existing = await this.prisma.mediaFile.findFirst({ where });
    if (!existing) {
      throw new NotFoundException('Media file not found');
    }

    return this.prisma.mediaFile.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name : existing.name,
        folder: dto.folder !== undefined ? dto.folder : existing.folder,
        tags: dto.tags !== undefined ? dto.tags : existing.tags,
        metadata: dto.metadata !== undefined ? (dto.metadata as any) : (existing.metadata as any),
      },
    });
  }

  // --- Delete Media ---
  async deleteMedia(orgId: string | null, id: string) {
    const where: any = { id };
    if (orgId) where.orgId = orgId;

    const existing = await this.prisma.mediaFile.findFirst({ where });
    if (!existing) {
      throw new NotFoundException('Media file not found');
    }

    // Attempt storage deletion
    if (existing.storedKey) {
      await this.storageService.deleteObject(existing.storedKey);
    }

    await this.prisma.mediaFile.delete({ where: { id } });
    return { success: true, id };
  }

  // --- Bulk Delete Media ---
  async bulkDeleteMedia(orgId: string | null, ids: string[]) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('No media ids provided');
    }

    const where: any = { id: { in: ids } };
    if (orgId) where.orgId = orgId;

    const files = await this.prisma.mediaFile.findMany({ where });

    // Delete from R2
    await Promise.all(
      files.map((f) =>
        f.storedKey ? this.storageService.deleteObject(f.storedKey) : Promise.resolve(),
      ),
    );

    const deleted = await this.prisma.mediaFile.deleteMany({ where });
    return { success: true, count: deleted.count };
  }

  // =========================================================================
  // Super Admin Methods
  // =========================================================================

  async adminListMedia(query: ListMediaQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 24));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.orgId && query.orgId !== 'all') {
      if (query.orgId === 'platform') {
        where.orgId = null;
      } else {
        where.orgId = query.orgId;
      }
    }

    if (query.category && query.category !== 'all') {
      where.category = query.category;
    }

    if (query.folder && query.folder !== 'all') {
      where.folder = query.folder;
    }

    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { filename: { contains: q, mode: 'insensitive' } },
        { tags: { has: q } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.mediaFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          organisation: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
            },
          },
          uploadedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.mediaFile.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async adminGetStats() {
    const [allFiles, totalOrgsWithFiles] = await Promise.all([
      this.prisma.mediaFile.findMany({
        select: { orgId: true, size: true, category: true },
      }),
      this.prisma.mediaFile.groupBy({
        by: ['orgId'],
        where: { orgId: { not: null } },
      }),
    ]);

    const totalFiles = allFiles.length;
    const totalBytes = allFiles.reduce((sum, f) => sum + (f.size || 0), 0);

    const categoryBreakdown: Record<string, { count: number; bytes: number }> = {};
    const orgStorageMap: Record<string, number> = {};

    allFiles.forEach((f) => {
      const cat = f.category || 'other';
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { count: 0, bytes: 0 };
      }
      categoryBreakdown[cat].count += 1;
      categoryBreakdown[cat].bytes += f.size || 0;

      if (f.orgId) {
        orgStorageMap[f.orgId] = (orgStorageMap[f.orgId] || 0) + (f.size || 0);
      }
    });

    // Top orgs by storage usage
    const topOrgIds = Object.entries(orgStorageMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([orgId]) => orgId);

    const topOrgsDetails = await this.prisma.organisation.findMany({
      where: { id: { in: topOrgIds } },
      select: { id: true, name: true, logoUrl: true, slug: true },
    });

    const topOrgs = topOrgIds.map((orgId) => {
      const org = topOrgsDetails.find((o) => o.id === orgId);
      const bytes = orgStorageMap[orgId] || 0;
      return {
        id: orgId,
        name: org?.name || 'Unknown Organisation',
        slug: org?.slug || '',
        logoUrl: org?.logoUrl || null,
        bytes,
        formatted: formatBytes(bytes),
      };
    });

    return {
      totalFiles,
      totalBytes,
      totalFormatted: formatBytes(totalBytes),
      totalOrgs: totalOrgsWithFiles.length,
      categoryBreakdown,
      topOrgs,
    };
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
