import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { normalizeCode } from '../auth.service.js';

/**
 * The body of `POST /api/auth/verify`: a link's token, or the address with the code from the
 * same mail.
 */
export class VerifyLinkDto {
  /** The token a sign-in link carries after its `#token=`. */
  @ValidateIf(
    (dto: VerifyLinkDto) => dto.email === undefined && dto.code === undefined,
  )
  @IsString()
  @Length(20, 200)
  token?: string;

  @ValidateIf((dto: VerifyLinkDto) => dto.token === undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;

  /** Six digits, however they were pasted ("482 913", "482-913"). */
  @ValidateIf((dto: VerifyLinkDto) => dto.token === undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (normalizeCode(value) ?? value) : value,
  )
  @Matches(/^\d{6}$/)
  code?: string;
}
