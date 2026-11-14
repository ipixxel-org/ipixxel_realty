import { Module } from '@nestjs/common';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { AuthModule } from '../auth/auth.module';
import { AdminMcpController } from './admin-mcp.controller';
import { McpSettingsService } from './mcp-settings.service';
import { McpService } from './mcp.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminMcpController],
  providers: [McpService, McpSettingsService, SuperAdminGuard],
})
export class McpModule {}
