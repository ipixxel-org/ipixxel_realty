import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';

// A form row is either:
//   * owner == null  -> platform-wide (Super Admin console) form, or
//   * owner == orgId -> a specific organisation's form.
// Every query is scoped by owner so one org can never touch another's forms
// and the console can never touch org forms (and vice versa).

const FORM_SELECT = {
  id: true,
  orgId: true,
  name: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeadFormSelect;

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function contentName(content: Record<string, unknown>): string | null {
  return typeof content.name === 'string' && content.name.trim()
    ? content.name.trim().slice(0, 160)
    : null;
}

function stringifyName(content: Record<string, unknown>): string {
  return contentName(content) ?? 'Untitled Form';
}

/** Deep-copy a definition for duplication with fresh, collision-free ids. */
function cloneForCopy(content: Record<string, unknown>, name: string): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(content)) as Record<string, unknown>;
  copy.id = uid('form');
  copy.name = name;
  copy.createdAt = new Date().toISOString();
  copy.updatedAt = new Date().toISOString();
  if (copy.embed && typeof copy.embed === 'object') {
    copy.embed = { ...(copy.embed as Record<string, unknown>), id: uid('emb') };
  }
  if (Array.isArray(copy.fields)) {
    copy.fields = (copy.fields as Record<string, unknown>[]).map((field) => ({
      ...field,
      id: uid('fld'),
    }));
  }
  return copy;
}

@Injectable()
export class FormsService {
  constructor(private readonly prisma: PrismaService) {}

  list(owner: string | null) {
    return this.prisma.leadForm.findMany({
      where: { orgId: owner },
      select: FORM_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(owner: string | null, id: string) {
    const row = await this.prisma.leadForm.findFirst({
      where: { id, orgId: owner },
      select: FORM_SELECT,
    });
    if (!row) throw new NotFoundException('Form not found');
    return row;
  }

  /** Resolve a saved form by its public embed id (no auth). */
  async getPublicByEmbed(embedId: string) {
    const id = embedId.trim();
    if (!id) throw new NotFoundException('Form not found');

    const row = await this.prisma.leadForm.findFirst({
      where: {
        OR: [
          { content: { path: ['embed', 'id'], equals: id } },
          { content: { path: ['id'], equals: id } },
        ],
      },
      select: FORM_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
    if (!row) throw new NotFoundException('Form not found');
    return row;
  }

  create(owner: string | null, dto: CreateFormDto) {
    if (!dto.content || typeof dto.content !== 'object' || Array.isArray(dto.content)) {
      throw new BadRequestException('content must be a form definition object');
    }
    return this.prisma.leadForm.create({
      data: {
        orgId: owner,
        name: dto.name.trim(), // name is required on create; derived on update only
        content: dto.content as Prisma.InputJsonObject,
      },
      select: FORM_SELECT,
    });
  }

  async update(owner: string | null, id: string, dto: UpdateFormDto) {
    const row = await this.get(owner, id);
    const content = dto.content ? (dto.content as Record<string, unknown>) : (row.content as Record<string, unknown>);
    const data: Prisma.LeadFormUpdateInput = { content: content as Prisma.InputJsonObject };
    if (dto.name) {
      data.name = dto.name.trim();
    } else if (dto.content) {
      // Name is denormalised for listing — keep it in sync with the editor's
      // renamed definition when only content changed.
      data.name = stringifyName(content);
    }
    return this.prisma.leadForm.update({
      where: { id },
      data,
      select: FORM_SELECT,
    });
  }

  async remove(owner: string | null, id: string) {
    await this.get(owner, id);
    await this.prisma.leadForm.delete({ where: { id } });
    return { deleted: true };
  }

  async duplicate(owner: string | null, id: string) {
    const row = await this.get(owner, id);
    const src = row.content as Record<string, unknown>;
    const copyName = `${(contentName(src) ?? row.name).slice(0, 140)} (copy)`;
    return this.prisma.leadForm.create({
      data: {
        orgId: owner,
        name: copyName,
        content: cloneForCopy(src, copyName) as Prisma.InputJsonObject,
      },
      select: FORM_SELECT,
    });
  }
}