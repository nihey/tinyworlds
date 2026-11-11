import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  Matches,
  MaxLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';
import { normalizeCode } from '../auth.service.js';

/** A token comes alone: with an address or a code beside it, the body is ambiguous. */
@ValidatorConstraint({ name: 'tokenAlone' })
class TokenAlone implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as VerifyLinkDto;
    return dto.email === undefined && dto.code === undefined;
  }
  defaultMessage(): string {
    return 'send a token, or an email with a code, not both';
  }
}

/**
 * The body of `POST /api/auth/verify`: a link's token, or the address with the code from the
 * same mail.
 */
export class VerifyLinkDto {
  /** The token a sign-in link carries after its `#token=`. Required unless email and code come. */
  @ValidateIf(
    (dto: VerifyLinkDto) =>
      dto.token !== undefined ||
      (dto.email === undefined && dto.code === undefined),
  )
  @IsString()
  @Length(20, 200)
  @Validate(TokenAlone)
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
