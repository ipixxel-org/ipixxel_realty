import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { OrgDomainService } from './org-domain.service';
import { RequestCustomDomainDto } from './dto/request-custom-domain.dto';
import { AssignCustomDomainDto } from './dto/assign-custom-domain.dto';

@UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
@Controller('org/domain')
export class OrgDomainController {
  constructor(private readonly service: OrgDomainService) {}

  @RequirePermission('domains', 'view')
  @Get()
  getInfo(@CurrentUser() user: JwtPayload) {
    return this.service.getInfo(user.orgId as string);
  }

  @RequirePermission('domains', 'add')
  @Post('custom-domain')
  requestCustomDomain(@CurrentUser() user: JwtPayload, @Body() dto: RequestCustomDomainDto) {
    return this.service.requestCustomDomain(
      user.orgId as string,
      user.sub as string,
      dto,
    );
  }

  @RequirePermission('domains', 'edit')
  @Post('verify-dns/:id')
  verifyDns(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.verifyDns(user.orgId as string, user.sub as string, id);
  }

  @RequirePermission('domains', 'edit')
  @Post('verify-ssl/:id')
  verifySsl(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.verifySsl(user.orgId as string, user.sub as string, id);
  }

  @RequirePermission('domains', 'edit')
  @Post('publish/:id')
  publishDomain(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.publishDomain(user.orgId as string, user.sub as string, id);
  }

  @RequirePermission('domains', 'edit')
  @Post('unpublish/:id')
  unpublishDomain(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.unpublishDomain(user.orgId as string, user.sub as string, id);
  }

  @RequirePermission('domains', 'edit')
  @Post('assign')
  assignDomain(@CurrentUser() user: JwtPayload, @Body() dto: AssignCustomDomainDto) {
    return this.service.assignDomain(
      user.orgId as string,
      user.sub as string,
      dto.domainRequestId,
      dto.landingPageId,
    );
  }

  @RequirePermission('domains', 'delete')
  @Delete('custom-domain/:id')
  deleteCustomDomain(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.deleteCustomDomain(
      user.orgId as string,
      user.sub as string,
      id,
    );
  }
}
