import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { GoogleSheetsService } from './google-sheets.service';

@Controller('webhooks/google-sheets')
export class GoogleSheetsWebhookController {
  constructor(private readonly googleSheets: GoogleSheetsService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'Google Sheets Webhook & Real-time Apps Script Ingest',
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  info() {
    return {
      status: 'active',
      service: 'Google Sheets Webhook Ingest',
      usage:
        'Install the Lead Center CRM Apps Script in your Google Spreadsheet to push edits automatically.',
    };
  }

  @Post()
  async receiveWebhook(
    @Body() body: Record<string, unknown>,
    @Query('token') queryToken?: string,
    @Headers('x-webhook-token') headerToken?: string,
  ) {
    const payload = {
      ...body,
      token: (body?.token || queryToken || headerToken || '') as string,
    };
    return this.googleSheets.handleWebhook(payload);
  }

  @Post(':connectionId')
  async receiveWebhookForConnection(
    @Param('connectionId') connectionId: string,
    @Body() body: Record<string, unknown>,
    @Query('token') queryToken?: string,
    @Headers('x-webhook-token') headerToken?: string,
  ) {
    const payload = {
      ...body,
      connectionId,
      token: (body?.token || queryToken || headerToken || '') as string,
    };
    return this.googleSheets.handleWebhook(payload);
  }
}
