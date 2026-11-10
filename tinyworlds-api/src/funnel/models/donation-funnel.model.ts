import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({
  description:
    'How many visits reached each step towards a donation, and what was given',
})
export class FunnelCounts {
  @Field(() => Int, { description: 'Visits that opened a page' })
  visits: number;

  @Field(() => Int, { description: 'Visits that opened the donate sign' })
  donateOpened: number;

  @Field(() => Int, { description: 'Visits that went on to a checkout' })
  checkoutStarted: number;

  @Field(() => Int, {
    description: 'Visits that came back from a checkout without paying',
  })
  checkoutCancelled: number;

  @Field(() => Int, { description: 'Donations paid' })
  donations: number;

  @Field(() => Int, { description: 'US cents given (donations in US dollars)' })
  raisedCents: number;
}

@ObjectType({ description: 'The funnel of one world, or of the front page' })
export class FunnelWorld extends FunnelCounts {
  @Field(() => String, {
    nullable: true,
    description:
      'A world\'s id, "home" for the front page, or null for donations that name no world',
  })
  world: string | null;
}

@ObjectType({ description: 'The funnel of one day' })
export class FunnelDay extends FunnelCounts {
  @Field({ description: 'The day, in the time zone asked for: "2026-11-10"' })
  day: string;
}

@ObjectType({ description: 'A paid donation, as the admin pages list it' })
export class FunnelDonation {
  @Field(() => ID)
  id: string;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Int)
  amountCents: number;

  @Field({ description: 'Lower case: "usd"' })
  currency: string;

  @Field(() => String, { nullable: true })
  city: string | null;

  @Field(() => String, { nullable: true })
  world: string | null;

  @Field(() => String, { nullable: true })
  locale: string | null;
}

@ObjectType({ description: 'The donation funnel over a period' })
export class DonationFunnel {
  @Field(() => Date)
  from: Date;

  @Field(() => Date)
  to: Date;

  @Field()
  timeZone: string;

  @Field(() => FunnelCounts, {
    description:
      'The whole site: a visit counts once, however many worlds it saw',
  })
  totals: FunnelCounts;

  @Field(() => [FunnelWorld], {
    description: 'By world, the most visited first',
  })
  worlds: FunnelWorld[];

  @Field(() => [FunnelDay], {
    description: 'By day, oldest first, every day of the period',
  })
  days: FunnelDay[];

  @Field(() => [FunnelDonation], {
    description: 'The latest donations of the period, newest first',
  })
  recentDonations: FunnelDonation[];
}
