import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { AiService } from './ai.service';
import { GenerateTemplateDto } from './dto/generate-template.dto';
import { RegenerateSectionDto } from './dto/regenerate-section.dto';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('status')
  getStatus() {
    return this.aiService.getStatus();
  }

  @Post('generate-template')
  generateTemplate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateTemplateDto,
  ) {
    const orgId = user.orgId ? (user.orgId as string) : null;
    return this.aiService.generateLandingPage(orgId, dto);
  }

  @Post('regenerate-section')
  regenerateSection(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegenerateSectionDto,
  ) {
    return this.aiService.regenerateSection(dto);
  }
}
