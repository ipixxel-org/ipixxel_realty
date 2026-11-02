import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ListPlansQueryDto } from './dto/list-plans-query.dto';
import { PLAN_CAPABILITY_CATALOG } from './plan-capabilities';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';

@Controller('admin/plans')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  list(@Query() query: ListPlansQueryDto) {
    return this.plansService.list(query);
  }

  // Must be declared before `:id` so "capabilities" isn't captured as an id.
  @Get('capabilities')
  capabilities() {
    return PLAN_CAPABILITY_CATALOG;
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.plansService.getById(id);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePlanDto) {
    return this.plansService.create(dto, user.sub);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.plansService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string) {
    return this.plansService.remove(id);
  }
}

@Controller('plans')
export class PublicPlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  listPublic(@Query() query: ListPlansQueryDto) {
    // Public for registration — only active plans
    return this.plansService.list({ ...query, isActive: true } as any);
  }
}
