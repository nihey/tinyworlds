import { IsString, Length } from 'class-validator';

/** The body of `POST /api/auth/verify`. */
export class VerifyLinkDto {
  /** The token a sign-in link carries after its `#token=`. */
  @IsString()
  @Length(20, 200)
  token: string;
}
