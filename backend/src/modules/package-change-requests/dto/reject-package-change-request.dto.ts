import { IsString, MaxLength } from 'class-validator';

export const REJECTION_REASON_MIN = 10;
export const REJECTION_REASON_MAX = 500;

export class RejectPackageChangeRequestDto {
  /** Required: shown to the organisation and in the rejection notification. */
  @IsString()
  @MaxLength(REJECTION_REASON_MAX)
  rejectionReason!: string;
}
