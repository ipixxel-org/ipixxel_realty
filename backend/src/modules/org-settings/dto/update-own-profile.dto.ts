import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PHONE_NUMBER_MESSAGE,
  PHONE_NUMBER_REGEX,
} from '../../../common/utils/phone.util';

// Settings > My profile. Email, country and role are deliberately absent —
// they can't be changed from here; unknown fields are rejected by the
// global ValidationPipe.
export class UpdateOwnProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(PHONE_NUMBER_REGEX, { message: PHONE_NUMBER_MESSAGE })
  phoneNumber?: string;

  // Blank / omitted = keep the current password.
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password?: string;
}
