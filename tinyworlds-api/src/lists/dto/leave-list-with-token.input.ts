import { Field, InputType } from '@nestjs/graphql';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

@InputType()
export class LeaveListWithTokenInput {
  @Field(() => String)
  @IsString()
  @MaxLength(300)
  token: string;

  @Field(() => Boolean, {
    nullable: true,
    description: 'Leave every list, not only the one the link is for',
  })
  @IsOptional()
  @IsBoolean()
  all?: boolean | null;
}
