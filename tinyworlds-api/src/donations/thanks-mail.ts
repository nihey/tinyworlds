import type { CityStatus } from '../generated/prisma/enums.js';
import { formatCount, formatUsd } from '../mail/format.js';
import { bold, fill, fillHtml, markup } from '../mail/html.js';
import { heldBadges } from '../mail/badges.js';
import {
  buttons,
  heading,
  impactBox,
  mailto,
  paragraph,
  progressBar,
  shell,
  stonesGrid,
} from '../mail/layout.js';
import type { Mail } from '../mail/mailer.js';
import type { Locale } from './locales.js';
import type { GiftPlace } from './thanks-facts.js';

/** What a thank-you is told about one gift. */
export interface ThanksFacts {
  locale: Locale;
  /** The site's origin (SITE_URL), for every link and picture. */
  site: string;
  amountCents: number;
  /** False for a gift in another currency: its amount is not written as dollars. */
  inDollars: boolean;
  /** The city the gift was for; null when the donor chose none. */
  city: {
    name: string;
    status: CityStatus;
    /** Visits to its world, when it is on the map. */
    worldVisits: number | null;
    /** Where the gift stands among the city's dollars; null when it is in another currency. */
    place: GiftPlace | null;
  } | null;
  /** Visits to every world so far, the front page's cards added up. */
  totalVisits: number;
}

interface Words {
  label: string;
  subject: {
    stoneOne: string;
    stoneMany: string;
    keystone: string;
    beyond: string;
    project: string;
    plain: string;
  };
  heading: {
    closerOne: string;
    closerMany: string;
    keystone: string;
    beyondFunded: string;
    beyondBuilt: string;
    project: string;
    plain: string;
  };
  text: {
    laidOne: string;
    laidMany: string;
    lastOne: string;
    lastMany: string;
    beyondFunded: string;
    beyondBuilt: string;
    project: string;
    /** For a gift to no city in another currency: no amount. */
    projectOther: string;
    plain: string;
  };
  toGoOne: string;
  toGoMany: string;
  allLaid: string;
  impactToCome: string;
  impactBuilt: string;
  listed: string;
  founders: string;
  benefactors: string;
  anonymous: string;
  seeCities: string;
  tellFriend: string;
  friendSubject: string;
  friendBody: string;
  footer: string[];
}

const WORDS: Record<Locale, Words> = {
  'en-US': {
    label: 'Thank you',
    subject: {
      stoneOne: 'You laid stone {n} of {city}',
      stoneMany: 'You laid stones {from}–{to} of {city}',
      keystone: 'You laid the last stone of {city}',
      beyond: 'Thank you for keeping {city} running',
      project: 'Thank you for your gift to tinyworlds',
      plain: 'Thank you for your gift towards {city}',
    },
    heading: {
      closerOne: '{city} is one stone closer, because of you.',
      closerMany: '{city} is {k} stones closer, because of you.',
      keystone: 'You laid the last stone: {city} is funded.',
      beyondFunded: '{city} is funded, and your gift keeps it running',
      beyondBuilt: 'You keep {city} running for its {visits} explorers',
      project: 'Your gift goes to the cities to come.',
      plain: 'Thank you for your gift towards {city}.',
    },
    text: {
      laidOne:
        'Your {amount} laid stone {from} of its {count}. When the last one is in, I build it.',
      laidMany:
        'Your {amount} laid stones {from} to {to} of its {count}. When the last one is in, I build it.',
      lastOne:
        'Your {amount} laid stone {from} of its {count}, the last one. Now I build it.',
      lastMany:
        'Your {amount} laid stones {from} to {to} of its {count}, the last one among them. Now I build it.',
      beyondFunded:
        'All {count} of its stones are laid. Your {amount} goes to its servers and upkeep, so it stays open to everyone once it is built.',
      beyondBuilt:
        '{city} is on the map, and your {amount} goes to the servers and upkeep that keep it open to everyone.',
      project:
        "Your {amount} isn't tied to one city: it pays for the servers, the upkeep and the next cities on the list.",
      projectOther:
        "Your gift isn't tied to one city: it pays for the servers, the upkeep and the next cities on the list.",
      plain:
        'Your gift towards {city} has arrived. Thank you for helping tinyworlds grow.',
    },
    toGoOne: '{raised} of {goal} · 1 stone to go',
    toGoMany: '{raised} of {goal} · {left} stones to go',
    allLaid: '{raised} of {goal} · every stone is laid',
    impactToCome:
      'visits to the cities on tinyworlds so far. Once {city} is built, every one of its explorers walks streets you helped lay.',
    impactBuilt:
      "visits to the cities on tinyworlds so far. Every one of {city}'s explorers walks streets you keep open.",
    listed:
      "You're on {city}'s {list} as {name}. You can change your name or hide it any time.",
    founders: 'Founding Benefactors',
    benefactors: 'Benefactors',
    anonymous: "You're anonymous here. Add your name on Your cities.",
    seeCities: 'See your cities',
    tellFriend: 'Tell a friend',
    friendSubject: 'Whole cities in pixel art, free to explore',
    friendBody:
      'Have a look at tinyworlds: whole cities as pixel-art miniatures, free to explore street by street.',
    footer: [
      'Stripe sends your payment receipt separately.',
      "You're getting this because you donated to tinyworlds with this address.",
    ],
  },
  'pt-BR': {
    label: 'Obrigado',
    subject: {
      stoneOne: 'Você assentou a pedra {n} de {city}',
      stoneMany: 'Você assentou as pedras {from}–{to} de {city}',
      keystone: 'Você assentou a última pedra de {city}',
      beyond: 'Obrigado por manter {city} funcionando',
      project: 'Obrigado pela sua doação ao tinyworlds',
      plain: 'Obrigado pela sua doação para {city}',
    },
    heading: {
      closerOne: '{city} está uma pedra mais perto, graças a você.',
      closerMany: '{city} está {k} pedras mais perto, graças a você.',
      keystone:
        'Você assentou a última pedra: a construção de {city} está garantida.',
      beyondFunded:
        '{city} já tem todas as pedras, e sua doação mantém a cidade funcionando',
      beyondBuilt:
        'Você mantém {city} funcionando para seus {visits} exploradores',
      project: 'Sua doação vai para as próximas cidades.',
      plain: 'Obrigado pela sua doação para {city}.',
    },
    text: {
      laidOne:
        'Seus {amount} assentaram a pedra {from} das {count} da cidade. Quando a última estiver no lugar, eu construo a cidade.',
      laidMany:
        'Seus {amount} assentaram as pedras {from} a {to} das {count} da cidade. Quando a última estiver no lugar, eu construo a cidade.',
      lastOne:
        'Seus {amount} assentaram a pedra {from} das {count} da cidade: a última. Agora eu construo a cidade.',
      lastMany:
        'Seus {amount} assentaram as pedras {from} a {to} das {count} da cidade, a última entre elas. Agora eu construo a cidade.',
      beyondFunded:
        'As {count} pedras da cidade já estão no lugar. Seus {amount} vão para os servidores e a manutenção, para que ela fique aberta a todos quando estiver pronta.',
      beyondBuilt:
        '{city} está no mapa, e seus {amount} vão para os servidores e a manutenção que a mantêm aberta a todos.',
      project:
        'Seus {amount} não estão presos a uma cidade: pagam os servidores, a manutenção e as próximas cidades da lista.',
      projectOther:
        'Sua doação não está presa a uma cidade: paga os servidores, a manutenção e as próximas cidades da lista.',
      plain:
        'Sua doação para {city} chegou. Obrigado por ajudar o tinyworlds a crescer.',
    },
    toGoOne: '{raised} de {goal} · falta 1 pedra',
    toGoMany: '{raised} de {goal} · faltam {left} pedras',
    allLaid: '{raised} de {goal} · todas as pedras assentadas',
    impactToCome:
      'visitas às cidades do tinyworlds até agora. Quando {city} estiver no mapa, cada um dos seus exploradores vai andar por ruas que você ajudou a construir.',
    impactBuilt:
      'visitas às cidades do tinyworlds até agora. Cada explorador de {city} anda por ruas que você mantém abertas.',
    listed:
      'Você está entre os {list} de {city} como {name}. Você pode mudar seu nome ou escondê-lo quando quiser.',
    founders: 'Benfeitores Fundadores',
    benefactors: 'Benfeitores',
    anonymous:
      'Aqui você aparece como anônimo. Adicione seu nome em Suas cidades.',
    seeCities: 'Ver suas cidades',
    tellFriend: 'Contar a um amigo',
    friendSubject: 'Cidades inteiras em pixel art, para explorar de graça',
    friendBody:
      'Dá uma olhada no tinyworlds: cidades inteiras como miniaturas em pixel art, para explorar rua por rua, de graça.',
    footer: [
      'O Stripe envia o recibo do pagamento separadamente.',
      'Você está recebendo isto porque doou ao tinyworlds com este endereço.',
    ],
  },
  'es-ES': {
    label: 'Gracias',
    subject: {
      stoneOne: 'Pusiste la piedra {n} de {city}',
      stoneMany: 'Pusiste las piedras {from}–{to} de {city}',
      keystone: 'Pusiste la última piedra de {city}',
      beyond: 'Gracias por mantener {city} en marcha',
      project: 'Gracias por tu donación a tinyworlds',
      plain: 'Gracias por tu donación para {city}',
    },
    heading: {
      closerOne: '{city} está una piedra más cerca, gracias a ti.',
      closerMany: '{city} está {k} piedras más cerca, gracias a ti.',
      keystone:
        'Pusiste la última piedra: la construcción de {city} está asegurada.',
      beyondFunded:
        '{city} ya tiene todas sus piedras, y tu donación la mantiene en marcha',
      beyondBuilt: 'Mantienes {city} en marcha para sus {visits} exploradores',
      project: 'Tu donación va a las ciudades que vendrán.',
      plain: 'Gracias por tu donación para {city}.',
    },
    text: {
      laidOne:
        'Tus {amount} pusieron la piedra {from} de sus {count}. Cuando esté la última, la construyo.',
      laidMany:
        'Tus {amount} pusieron las piedras {from} a {to} de sus {count}. Cuando esté la última, la construyo.',
      lastOne:
        'Tus {amount} pusieron la piedra {from} de sus {count}: la última. Ahora la construyo.',
      lastMany:
        'Tus {amount} pusieron las piedras {from} a {to} de sus {count}, y la última es una de ellas. Ahora la construyo.',
      beyondFunded:
        'Sus {count} piedras ya están puestas. Tus {amount} van a los servidores y al mantenimiento, para que esté abierta a todos cuando la construya.',
      beyondBuilt:
        '{city} está en el mapa, y tus {amount} van a los servidores y al mantenimiento que la mantienen abierta a todos.',
      project:
        'Tus {amount} no van a una sola ciudad: pagan los servidores, el mantenimiento y las próximas ciudades de la lista.',
      projectOther:
        'Tu donación no va a una sola ciudad: paga los servidores, el mantenimiento y las próximas ciudades de la lista.',
      plain:
        'Tu donación para {city} ha llegado. Gracias por ayudar a que tinyworlds crezca.',
    },
    toGoOne: '{raised} de {goal} · falta 1 piedra',
    toGoMany: '{raised} de {goal} · faltan {left} piedras',
    allLaid: '{raised} de {goal} · todas las piedras puestas',
    impactToCome:
      'visitas a las ciudades de tinyworlds hasta ahora. Cuando {city} esté en el mapa, cada uno de sus exploradores recorrerá calles que ayudaste a construir.',
    impactBuilt:
      'visitas a las ciudades de tinyworlds hasta ahora. Cada explorador de {city} recorre calles que tú mantienes abiertas.',
    listed:
      'Estás entre los {list} de {city} como {name}. Puedes cambiar tu nombre u ocultarlo cuando quieras.',
    founders: 'Benefactores Fundadores',
    benefactors: 'Benefactores',
    anonymous: 'Aquí apareces como anónimo. Añade tu nombre en Tus ciudades.',
    seeCities: 'Ver tus ciudades',
    tellFriend: 'Contárselo a un amigo',
    friendSubject: 'Ciudades enteras en pixel art, para explorar gratis',
    friendBody:
      'Echa un vistazo a tinyworlds: ciudades enteras como miniaturas de pixel art, para recorrer calle a calle, gratis.',
    footer: [
      'Stripe te envía el recibo del pago por separado.',
      'Recibes esto porque donaste a tinyworlds con esta dirección.',
    ],
  },
};

/** Which thank-you a gift gets. */
type Kind = 'founding' | 'beyond' | 'project' | 'plain';

function kindOf(city: ThanksFacts['city']): Kind {
  if (!city) return 'project';
  const { place } = city;
  if (!place) return 'plain';
  // a built city is running already, whatever stones are still open on its list
  if (city.status === 'BUILT') return 'beyond';
  if (place.founding) return place.laid.length ? 'founding' : 'plain';
  return 'beyond';
}

/**
 * The mail that thanks a donor once Stripe has confirmed the gift: how much closer the city is
 * (its stones, theirs lit, and its bar), how many people explore the cities, where they are
 * listed, and the way to their own page. A gift beyond the goal keeps its city running; a gift
 * to no city goes to the cities to come; a gift in another currency gets a plain thank-you.
 */
export function thanksMail(facts: ThanksFacts): Omit<Mail, 'to'> {
  const { locale, site, city } = facts;
  const w = WORDS[locale];
  const kind = kindOf(city);
  const place = city?.place ?? null;
  const laid = place?.laid ?? [];
  // what every template of this gift may name
  const values: Record<string, string> = {
    city: city?.name ?? '',
    amount: formatUsd(facts.amountCents, locale),
    n: String(laid[0] ?? ''),
    from: String(laid[0] ?? ''),
    to: String(laid[laid.length - 1] ?? ''),
    k: String(laid.length),
    count: String(place?.stoneCount ?? 0),
    visits: formatCount(city?.worldVisits ?? 0, locale),
  };

  let subject = w.subject[kind === 'founding' ? 'stoneMany' : kind];
  let title = w.heading.project;
  let lead = facts.inDollars ? w.text.project : w.text.projectOther;
  if (kind === 'plain') {
    title = w.heading.plain;
    lead = w.text.plain;
  } else if (kind === 'founding' && place) {
    const one = laid.length === 1;
    const last = laid.includes(place.stoneCount);
    subject = last
      ? w.subject.keystone
      : one
        ? w.subject.stoneOne
        : w.subject.stoneMany;
    title = last
      ? w.heading.keystone
      : one
        ? w.heading.closerOne
        : w.heading.closerMany;
    lead = last
      ? one
        ? w.text.lastOne
        : w.text.lastMany
      : one
        ? w.text.laidOne
        : w.text.laidMany;
  } else if (kind === 'beyond') {
    const built = city?.status === 'BUILT' && city.worldVisits !== null;
    title = built ? w.heading.beyondBuilt : w.heading.beyondFunded;
    lead = built ? w.text.beyondBuilt : w.text.beyondFunded;
  }
  subject = fill(subject, values);
  title = fill(title, values);

  const body = [heading(title), paragraph(markup(fillHtml(lead, values)))];
  const text = [title, fill(lead, values)];

  if (place && (kind === 'founding' || kind === 'beyond')) {
    const held = heldBadges(site, locale, place);
    body.push(held.html);
    text.push(held.text);
  }

  if (place && kind === 'founding') {
    const left = place.stones.filter((stone) => stone === null).length;
    const progress = fill(
      left === 0 ? w.allLaid : left === 1 ? w.toGoOne : w.toGoMany,
      {
        raised: formatUsd(place.raisedCents, locale),
        goal: formatUsd(place.goalCents, locale),
        left,
      },
    );
    body.push(
      stonesGrid(place.stones),
      progressBar(place.raisedCents / place.goalCents),
      paragraph(markup(fillHtml(progress)), true),
    );
    text.push(progress);
  }

  if (city) {
    const impact = city.status === 'BUILT' ? w.impactBuilt : w.impactToCome;
    const total = formatCount(facts.totalVisits, locale);
    body.push(impactBox(total, markup(fillHtml(impact, values))));
    text.push(`${total} ${fill(impact, values)}`);
  }

  if (city && place && (kind === 'founding' || kind === 'beyond')) {
    if (place.listedAs !== null) {
      const list = place.onFounders ? w.founders : w.benefactors;
      body.push(
        paragraph(
          markup(
            fillHtml(w.listed, {
              city: city.name,
              list: bold(list),
              name: bold(place.listedAs),
            }),
          ),
        ),
      );
      text.push(
        fill(w.listed, { city: city.name, list, name: place.listedAs }),
      );
    } else {
      body.push(paragraph(markup(fillHtml(w.anonymous))));
      text.push(w.anonymous);
    }
  }

  const mine = `${site}/me/`;
  const friend = mailto(w.friendSubject, `${w.friendBody}\n\n${site}/`);
  body.push(
    buttons([
      { label: w.seeCities, href: mine },
      { label: w.tellFriend, href: friend, ghost: true },
    ]),
  );
  text.push(`${w.seeCities}: ${mine}`, w.footer.join('\n'));

  return {
    subject,
    text: `${text.join('\n\n')}\n`,
    html: shell({
      locale,
      title: subject,
      preheader: fill(lead, values),
      site,
      label: w.label,
      body: body.join(''),
      footer: w.footer,
    }),
  };
}
