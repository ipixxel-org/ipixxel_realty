import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PROJECT_UNIT_ACTIONS } from '../../common/utils/permissions.util';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  ListAssigneeCandidatesQueryDto,
  ListProjectsQueryDto,
} from './dto/list-projects-query.dto';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { SetSalesAgentsDto } from './dto/set-sales-agents.dto';
import { CreateUnitTypeDto } from './dto/create-unit-type.dto';
import { UpdateUnitTypeDto } from './dto/update-unit-type.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto, UpdateUnitStatusDto } from './dto/update-unit.dto';
import { ListUnitsQueryDto } from './dto/list-units-query.dto';

// Every route checks its Projects pill — for the org admin too, whose access
// Super Admin sets in Organisation roles (`enforceForOrgAdmin`).
const ENFORCE = { enforceForOrgAdmin: true } as const;

// Every route derives orgId from the JWT — never from a param or body — so
// one org can never read or touch another org's projects, unit types, or
// units. Non-admin users are guarded by PermissionGuard and scoped to their
// assigned projects.
@UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
@Controller('org/projects')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  // --- Media uploads ---
  @Post('upload-url')
  @RequirePermission('projects', 'view', ENFORCE)
  createUploadUrl(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateUploadUrlDto,
  ) {
    return this.service.createUploadUrl(user.orgId as string, dto);
  }

  // --- Projects ---

  @Post()
  @RequirePermission('projects', 'add', ENFORCE)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProjectDto) {
    return this.service.create(user.orgId as string, dto, user.sub);
  }

  @Get()
  @RequirePermission('projects', 'view', ENFORCE)
  list(@CurrentUser() user: JwtPayload, @Query() query: ListProjectsQueryDto) {
    return this.service.list(user.orgId as string, query, user);
  }

  /**
   * Org members who can be assigned to a project as sales agents — the shared
   * "who can hold a lead" rule. Static path, declared before `:id` so it isn't
   * swallowed by the getById route.
   */
  @Get('sales-agent-candidates')
  @RequirePermission('projects', 'view', ENFORCE)
  listSalesAgentCandidates(@CurrentUser() user: JwtPayload) {
    return this.service.listSalesAgentCandidates(user.orgId as string);
  }

  /**
   * Candidates for a project's assignment pickers, with role and existing
   * project context. `?type=sales_agent` (default) excludes Admins/Managers;
   * `?type=manager` lists the users holding the manager role.
   */
  @Get('project-assignee-candidates')
  @RequirePermission('projects', 'view', ENFORCE)
  listProjectAssigneeCandidates(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListAssigneeCandidatesQueryDto,
  ) {
    return this.service.listProjectAssigneeCandidates(
      user.orgId as string,
      query.type,
    );
  }

  @Get(':id')
  @RequirePermission('projects', 'view', ENFORCE)
  getById(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.getById(user.orgId as string, id, user);
  }

  @Patch(':id')
  @RequirePermission('projects', 'edit', ENFORCE)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.service.update(user.orgId as string, id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('projects', 'delete', ENFORCE)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.remove(user.orgId as string, id, user);
  }

  // --- Sales agents assigned to a project (Step 7 of the wizard) ---

  @Get(':id/sales-agents')
  @RequirePermission('projects', 'view', ENFORCE)
  listSalesAgents(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.listSalesAgents(user.orgId as string, id);
  }

  @Put(':id/sales-agents')
  @RequirePermission('projects', 'edit', ENFORCE)
  setSalesAgents(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetSalesAgentsDto,
  ) {
    return this.service.setSalesAgents(user.orgId as string, id, dto.userIds);
  }

  // --- Unit types (nested under a project) ---

  @Post(':projectId/unit-types')
  @RequirePermission('projects', PROJECT_UNIT_ACTIONS.add, ENFORCE)
  createUnitType(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateUnitTypeDto,
  ) {
    return this.service.createUnitType(user.orgId as string, projectId, dto);
  }

  @Get(':projectId/unit-types')
  @RequirePermission('projects', 'view', ENFORCE)
  listUnitTypes(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
  ) {
    return this.service.listUnitTypes(user.orgId as string, projectId);
  }

  @Get(':projectId/unit-types/:id')
  @RequirePermission('projects', 'view', ENFORCE)
  getUnitType(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.getUnitType(user.orgId as string, projectId, id);
  }

  @Patch(':projectId/unit-types/:id')
  @RequirePermission('projects', PROJECT_UNIT_ACTIONS.edit, ENFORCE)
  updateUnitType(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUnitTypeDto,
  ) {
    return this.service.updateUnitType(
      user.orgId as string,
      projectId,
      id,
      dto,
    );
  }

  @Delete(':projectId/unit-types/:id')
  @RequirePermission('projects', PROJECT_UNIT_ACTIONS.delete, ENFORCE)
  removeUnitType(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.removeUnitType(user.orgId as string, projectId, id);
  }

  // --- Units (flat per project; the owning unit type is in the body) ---

  @Post(':projectId/units')
  @RequirePermission('projects', PROJECT_UNIT_ACTIONS.add, ENFORCE)
  createUnit(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateUnitDto,
  ) {
    return this.service.createUnit(
      user.orgId as string,
      projectId,
      dto,
      user.sub,
    );
  }

  @Get(':projectId/units')
  @RequirePermission('projects', 'view', ENFORCE)
  listUnits(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Query() query: ListUnitsQueryDto,
  ) {
    return this.service.listUnits(user.orgId as string, projectId, query);
  }

  @Get(':projectId/units/:id')
  @RequirePermission('projects', 'view', ENFORCE)
  getUnit(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.getUnit(user.orgId as string, projectId, id);
  }

  @Patch(':projectId/units/:id')
  @RequirePermission('projects', PROJECT_UNIT_ACTIONS.edit, ENFORCE)
  updateUnit(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUnitDto,
  ) {
    return this.service.updateUnit(
      user.orgId as string,
      projectId,
      id,
      dto,
      user.sub,
    );
  }

  @Patch(':projectId/units/:id/status')
  @RequirePermission('projects', PROJECT_UNIT_ACTIONS.edit, ENFORCE)
  updateUnitStatus(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUnitStatusDto,
  ) {
    return this.service.updateUnitStatus(
      user.orgId as string,
      projectId,
      id,
      dto,
      user.sub,
    );
  }

  @Delete(':projectId/units/:id')
  @RequirePermission('projects', PROJECT_UNIT_ACTIONS.delete, ENFORCE)
  removeUnit(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.removeUnit(user.orgId as string, projectId, id);
  }
}
