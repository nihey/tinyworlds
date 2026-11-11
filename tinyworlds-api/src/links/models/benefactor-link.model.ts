import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({
  description:
    'A page a named donor points to, as the page describes itself (read when the link was saved)',
})
export class BenefactorLink {
  @Field()
  url: string;

  @Field({
    description: "The page's title; the link's host and path when it gave none",
  })
  title: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field(() => String, {
    nullable: true,
    description:
      "The site's icon, a copy kept here: a path on this API's host (/api/link-images/<id>)",
  })
  icon: string | null;

  @Field(() => String, {
    nullable: true,
    description:
      "The page's picture, likewise; null when it has none, or on a public list while the donor has given less than what shows pictures",
  })
  image: string | null;
}

@ObjectType({ description: "One of the signed-in donor's own links" })
export class MyLink extends BenefactorLink {
  @Field(() => ID)
  id: string;
}

@ObjectType({
  description: "The signed-in donor's links, and what shows of them",
})
export class MyLinks {
  @Field(() => [MyLink], { description: 'In the order they were added' })
  links: MyLink[];

  @Field(() => Int, { description: 'How many links a donor may have' })
  max: number;

  @Field(() => Int, {
    description: 'Everything the donor has given, in US cents',
  })
  givenCents: number;

  @Field(() => Int, {
    description:
      "From this much given, in US cents, the links' pictures show on the public lists",
  })
  picturesFromCents: number;

  @Field(() => Boolean, {
    description: 'An admin has taken the links off the public lists',
  })
  hidden: boolean;
}
