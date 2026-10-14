import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class UpdatePlatformConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(253)
  subdomainBase?: string;

  @IsOptional()
  @IsIn(['localhost', 'production'])
  subdomainMode?: 'localhost' | 'production';

  @IsOptional()
  @IsIn(['a'])
  dnsMode?: 'a';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  infraIp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  infraIpv6?: string;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  infraCname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  infraNs1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  infraNs2?: string;

  /** Days before renewsAt the "expiring soon" popup notification fires. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  billingExpiryNotifyDays?: number;

  /** Days a past_due subscription stays usable before the expiry behaviour. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  billingGracePeriodDays?: number;

  /** What happens when the grace period lapses: 'restrict' | 'cancel'. */
  @IsOptional()
  @IsIn(['restrict', 'cancel'])
  billingExpiryBehavior?: 'restrict' | 'cancel';

  /** Notification body for the expiring / past-due popups. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  billingExpiryMessage?: string;

  /** Billing v2: online (Razorpay) plan payments. Off = manual approval by Super Admin. */
  @IsOptional()
  @IsBoolean()
  onlinePaymentsEnabled?: boolean;

  /** Global primary brand color (HEX, e.g. #0f1424 or #6366f1). */
  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
    message: 'primaryColor must be a valid hex color code (e.g. #0f1424)',
  })
  primaryColor?: string;

  /** Global secondary accent color (HEX, e.g. #2a3348 or #0ea5e9). */
  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
    message: 'secondaryColor must be a valid hex color code (e.g. #2a3348)',
  })
  secondaryColor?: string;
}
