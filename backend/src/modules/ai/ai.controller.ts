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
import { GenerateSectionDto } from './dto/generate-section.dto';
import { EditComponentDto } from './dto/edit-component.dto';

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

  @Post('generate-section')
  generateSection(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateSectionDto,
  ) {
    return this.aiService.generateSection(dto);
  }

  @Post('edit-component')
  editComponent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: EditComponentDto,
  ) {
    return this.aiService.editComponent(dto);
  }
}
