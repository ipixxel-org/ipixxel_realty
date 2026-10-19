import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentStatus } from '@prisma/client';

/** Body posted by the frontend from Razorpay Checkout's success handler. */
export class VerifyPaymentDto {
  @IsString()
  @Matches(/^order_[A-Za-z0-9]+$/)
  razorpay_order_id!: string;

  @IsString()
  @Matches(/^pay_[A-Za-z0-9]+$/)
  razorpay_payment_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  razorpay_signature!: string;
}

export class ListPaymentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;
}

export class AdminListPaymentsQueryDto extends ListPaymentsQueryDto {
  @IsOptional()
  @IsUUID()
  organisationId?: string;
}
