import { Controller, Get, Param } from '@nestjs/common';
import { FormsService } from './forms.service';

// Public, unauthenticated read access for standalone Form Builder embeds. The
// embed snippet only knows the form's public `embed.id`, so it must be able to
// fetch the saved definition without an admin session.
@Controller('public/forms')
export class PublicFormsController {
  constructor(private readonly service: FormsService) {}

  @Get('embed/:embedId')
  getByEmbed(@Param('embedId') embedId: string) {
    return this.service.getPublicByEmbed(embedId);
  }
}
