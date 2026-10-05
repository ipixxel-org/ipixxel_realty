import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const PRESENCE_EVENTS = ['enter', 'heartbeat', 'leave'] as const;
export type PresenceEvent = (typeof PRESENCE_EVENTS)[number];

export class HeartbeatDto {
  @IsIn(PRESENCE_EVENTS)
  event: PresenceEvent;

  /** Pathname only — never the query string or any form values. */
  @IsString()
  @MaxLength(300)
  @Matches(/^\/[^?#]*$/)
  route: string;

  @IsString()
  @MaxLength(64)
  sessionId: string;

  @IsBoolean()
  visible: boolean;

  /** Epoch milliseconds of the user's last keydown/click/scroll/input. */
  @IsOptional()
  @IsNumber()
  lastInteractionAt?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  errorCount?: number;
}
