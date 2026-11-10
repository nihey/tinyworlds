import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class DonationCheckout {
  @Field({ description: "Stripe's checkout page for this donation" })
  url: string;
}
