import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import {
  PermissionGuard,
  assertOrgPermission,
} from '../../common/guards/permission.guard';
import { PrismaService } from '../../database/prisma.service';
import { PROJECT_LEAD_ACTION } from '../../common/utils/permissions.util';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { CreateManualLeadDto } from './dto/create-manual-lead.dto';
import { ImportLeadsDto } from './dto/import-leads.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import { UpdateLeadNextActionDto } from './dto/update-lead-next-action.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@Controller('org/leads')
export class LeadsController {
  constructor(
    private readonly service: LeadsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Public lead capture. Intentionally unguarded: the published form is filled
   * by anonymous visitors. orgId is derived from landingPageId server-side.
   */
  @Post()
  createPublic(@Body() dto: CreateLeadDto, @Req() req: Request) {
    const rawIp = req.headers['x-forwarded-for'];
    const clientIp = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : req.ip;
    return this.service.createFromPublic(dto, clientIp);
  }

  // Leads / CRM > Add allows any lead. Projects > Add lead (the project
  // pages' "Add lead") allows a lead tied to a project — checked here because
  // the needed permission depends on the body.
  @UseGuards(JwtAuthGuard, OrgApprovedGuard)
  @Post('manual')
  async createManual(@CurrentUser() user: JwtPayload, @Body() dto: CreateManualLeadDto) {
    try {
      await assertOrgPermission(this.prisma, user, 'crm', 'add', false);
    } catch (crmError) {
      if (!dto.projectId) throw crmError;
      await assertOrgPermission(this.prisma, user, 'projects', PROJECT_LEAD_ACTION, true);
    }
    return this.service.createFromCrm(user.orgId as string, user, dto);
  }

  /**
   * Bulk lead import from a CSV parsed client-side. Same permission as a
   * manual lead; rows are validated individually and invalid ones skipped.
   */
  @UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
  @RequirePermission('crm', 'add')
  @Post('import')
  importCsv(@CurrentUser() user: JwtPayload, @Body() dto: ImportLeadsDto) {
    return this.service.importFromCsv(user.orgId as string, user, dto);
  }

  /**
   * Lead inbox. Open to any approved org member; the service scopes the rows
   * by role (admin = all, manager/sales = assigned/project-scoped only).
   */
  @UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
  @RequirePermission('crm', 'view')
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListLeadsQueryDto,
  ) {
    return this.service.list(user.orgId as string, user, query);
  }

  /**
   * Org members eligible as assignees for the assignment UI.
   * Open to any member with crm:edit permission (e.g. managers, admins).
   * Must be before :id to avoid route collision.
   */
  @UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
  @RequirePermission('crm', 'edit')
  @Get('assignable')
  listAssignableUsers(@CurrentUser() user: JwtPayload) {
    return this.service.listAssignableUsers(user.orgId as string);
  }

  @UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
  @RequirePermission('crm', 'view')
  @Get(':id')
  getById(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.getById(user.orgId as string, id, user);
  }

  /**
   * Full lead edit form. Persists the structured contact / requirement /
   * source / consent fields. Pipeline status is not accepted here — it keeps
   * its own note-required path (`PATCH :id/assign`).
   */
  @UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
  @RequirePermission('crm', 'edit')
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.service.update(user.orgId as string, id, user, dto);
  }

  @UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
  @RequirePermission('crm', 'add')
  @Post(':id/notes')
  addNote(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateLeadNoteDto,
  ) {
    return this.service.addNote(user.orgId as string, id, user, dto);
  }

  @UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
  @RequirePermission('crm', 'edit')
  @Patch(':id/next-action')
  updateNextAction(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateLeadNextActionDto,
  ) {
    return this.service.updateNextAction(user.orgId as string, id, user, dto);
  }

  /**
   * (Re)assign a lead to an org member and/or move its stage.
   * Open to any member with crm:edit permission.
   */
  @UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
  @RequirePermission('crm', 'edit')
  @Patch(':id/assign')
  assign(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AssignLeadDto,
  ) {
    return this.service.assign(user.orgId as string, id, dto, user);
  }
}
