import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { UpdateMcpSettingsDto } from './dto/update-mcp-settings.dto';
import { McpSettingsService } from './mcp-settings.service';
import { McpService, type McpConnection } from './mcp.service';

@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/integrations/mcp')
export class AdminMcpController {
  constructor(
    private readonly mcp: McpService,
    private readonly settings: McpSettingsService,
  ) {}

  @Get('connection')
  connection(@CurrentUser() actor: JwtPayload): Promise<McpConnection> {
    return this.mcp.connection(actor);
  }

  @Get('settings')
  getSettings() {
    return this.settings.getForAdmin();
  }

  @Put('settings')
  updateSettings(@Body() dto: UpdateMcpSettingsDto) {
    return this.settings.update(dto);
  }

  @Post('settings/reset')
  resetSettings() {
    return this.settings.reset();
  }
}
