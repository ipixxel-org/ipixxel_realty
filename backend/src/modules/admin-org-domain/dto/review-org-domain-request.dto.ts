import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewOrgDomainRequestDto {
  @IsString()
  @IsIn(['approve', 'reject', 'suspend', 'reactivate'])
  action!: 'approve' | 'reject' | 'suspend' | 'reactivate';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
