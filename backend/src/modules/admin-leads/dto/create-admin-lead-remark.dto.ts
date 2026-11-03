import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAdminLeadRemarkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  remark!: string;
}
