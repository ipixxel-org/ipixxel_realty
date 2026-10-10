import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewOrgDomainRequestDto {
  @IsString()
  @IsIn(['approve', 'reject', 'request_changes', 'suspend', 'reactivate'])
  action!: 'approve' | 'reject' | 'request_changes' | 'suspend' | 'reactivate';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  feedback?: string;
}

