import { IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';

export const PUBLIC_TRACK_EVENT_TYPES = [
  'page_view',
  'lead_submit',
  'whatsapp',
  'call',
  'brochure',
] as const;

export class TrackEventDto {
  @IsUUID()
  landingPageId: string;

  @IsOptional()
  @IsIn(PUBLIC_TRACK_EVENT_TYPES)
  eventType?: (typeof PUBLIC_TRACK_EVENT_TYPES)[number];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
