import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { AdminOrgDomainService } from './admin-org-domain.service';
import { ReviewOrgDomainRequestDto } from './dto/review-org-domain-request.dto';

@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/org-domain-requests')
export class AdminOrgDomainController {
  constructor(private readonly service: AdminOrgDomainService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('kind') kind?: string,
    @Query('tab') tab?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list({
      status,
      kind,
      tab,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id/verify')
  verify(@Param('id') id: string) {
    return this.service.verify(id);
  }

  @Post(':id/verify')
  verifyPost(@Param('id') id: string) {
    return this.service.verify(id);
  }

  @Post(':id/review')
  review(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReviewOrgDomainRequestDto,
  ) {
    return this.service.review(
      id,
      user.sub,
      dto.action,
      dto.reason,
      dto.feedback,
    );
  }

  @Delete(':id')
  delete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.delete(id, user.sub);
  }
}
