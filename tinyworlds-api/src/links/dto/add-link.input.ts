import { Field, InputType } from '@nestjs/graphql';
import { IsString, MaxLength } from 'class-validator';
import { URL_MAX } from '../link-url.js';

@InputType()
export class AddLinkInput {
  // cleaned (and refused when it is not a public https page) in the service; the cap only
  // bounds the work
  @Field(() => String)
  @IsString()
  @MaxLength(URL_MAX * 4)
  url: string;
}
