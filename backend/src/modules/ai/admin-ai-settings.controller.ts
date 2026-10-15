import { Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { AiSettingsService } from './ai-settings.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';

/**
 * Super Admin-only AI provider credentials (Gemini / Anthropic / custom).
 * Gated by the Settings module in PLATFORM_ROUTE_MODULES for Platform Team
 * members; always available to full Super Admins.
 */
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/ai-settings')
export class AdminAiSettingsController {
  constructor(private readonly service: AiSettingsService) {}

  @Get()
  get() {
    return this.service.getForAdmin();
  }

  @Put()
  update(@Body() dto: UpdateAiSettingsDto) {
    return this.service.update(dto);
  }

  @Delete()
  clear() {
    return this.service.clear();
  }
}
