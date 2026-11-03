import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { AdminLeadsService } from './admin-leads.service';
import { ListAdminLeadsQueryDto } from './dto/list-admin-leads-query.dto';
import { UpdateAdminLeadStatusDto } from './dto/update-admin-lead-status.dto';
import { CreateAdminLeadRemarkDto } from './dto/create-admin-lead-remark.dto';
import { UpdateAdminLeadFollowUpDto } from './dto/update-admin-lead-follow-up.dto';

@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/leads')
export class AdminLeadsController {
  constructor(private readonly leads: AdminLeadsService) {}

  @Get()
  list(@Query() query: ListAdminLeadsQueryDto) {
    return this.leads.list(query);
  }

  @Get('meta')
  meta() {
    return this.leads.meta();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.leads.getById(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAdminLeadStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.leads.updateStatus(id, dto, user.sub);
  }

  @Post(':id/remarks')
  addRemark(
    @Param('id') id: string,
    @Body() dto: CreateAdminLeadRemarkDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.leads.addRemark(id, dto, user.sub);
  }

  @Patch(':id/follow-up')
  updateFollowUp(
    @Param('id') id: string,
    @Body() dto: UpdateAdminLeadFollowUpDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.leads.updateFollowUp(id, dto, user.sub);
  }
}
