import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { LOCALES, type Locale } from '../../donations/locales.js';

/** The body of `POST /api/auth/magic-link`. */
export class RequestLinkDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** The admin page the link should open: one of the site's own pages, without query or hash. */
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(300)
  returnUrl: string;

  /** The language to write the mail in; English when left out. */
  @IsOptional()
  @IsIn(LOCALES)
  locale?: Locale;
}
