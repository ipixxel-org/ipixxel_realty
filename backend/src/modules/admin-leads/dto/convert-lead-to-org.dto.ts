import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConvertLeadToOrgDto {
  @IsString()
  @IsNotEmpty()
  orgName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  city?: string;
}
