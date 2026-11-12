import type { LegalDocs } from "./types";

/**
 * The terms of service, in the three languages. The English text is the one that counts (its
 * last section says so); the others say the same, section by section and point by point, with
 * the same links (`legal.test.ts` checks).
 */
export const TERMS: LegalDocs = {
  "en-US": {
    title: "Terms of Service",
    description:
      "The rules for using tinyworlds: the maps, donations, benefactors' names and links, and what we can and cannot promise.",
    summary: [
      "The maps are free to explore, and need no account.",
      "A donation is a gift that helps build a city and keeps the site running, not a purchase.",
      "If you put your name or links on a city, keep them decent: we may hide anything that is not.",
      "The maps are art made from open data: not something to find your way with.",
    ],
    sections: [
      {
        id: "these-terms",
        title: "These terms",
        blocks: [
          "tinyworlds (“tinyworlds”, “we”, “us”) is a small independent project, made and run by one person, that redraws real cities, and a few imagined places, as pixel-art maps. These terms apply to the whole site: the front page, every map, Your cities and the Hall of Fame.",
          "By using the site you agree to these terms; if you do not, please do not use it. How we handle personal information is explained in our [Privacy Policy](privacy).",
        ],
      },
      {
        id: "using",
        title: "Using the site",
        blocks: [
          "Exploring the maps is free and needs no account. Look around, search, share links to any view and play Guess the building as much as you like. Please do not:",
          {
            items: [
              "attack or overload the site, its API or its servers, or try to get into them;",
              "send the site invented visits, quiz answers or other data, or use programs to inflate its counts;",
              "copy the maps in bulk with automated tools in a way that burdens our servers (the code and the data are open: you can draw the maps yourself);",
              "use the site to break the law or anyone's rights.",
            ],
          },
        ],
      },
      {
        id: "maps",
        title: "The maps are art",
        blocks: [
          "Each map is drawn by a program from open data, with heights, colours and details guessed wherever the data says nothing. Streets, buildings and places may be missing, misplaced, out of date or wrong, and so may the building descriptions, which come from Wikipedia. Do not rely on the maps to find your way, to make decisions about property or safety, or for anything else where accuracy matters.",
          "Winterfell, King's Landing and Westeros are fan-made: unofficial maps of places from a story, laid out by us, and not affiliated with or endorsed by their author or the series.",
        ],
      },
      {
        id: "donations",
        title: "Donations",
        blocks: [
          "Donating is optional. Donations are made in US dollars, from US$1, and paid through Stripe, which handles the payment under its own terms; we never see your card details.",
          {
            items: [
              {
                term: "A gift, not a purchase.",
                text: "A donation supports the project. It does not buy a product or a service, a share of the project or any right over the maps. tinyworlds is not a registered charity, so donations are not tax-deductible.",
              },
              {
                term: "How cities are built.",
                text: "You may name a city with your gift. A city is built once the donations naming it reach its goal (shown on the site: US$30 today), and the most funded cities are built first. We build funded cities as fast as we can, but cannot promise a date. The goals of cities not yet funded may change.",
              },
              {
                term: "Beyond the goal.",
                text: "What is given beyond a city's goal, and gifts that name no city, pay for the servers and keep the project improving.",
              },
              {
                term: "If a city cannot be built.",
                text: "Sometimes there is not enough open data to draw a place well. If that happens to a funded city, we will write to its donors and offer to move their gifts to another city or to refund them.",
              },
              {
                term: "Refunds.",
                text: "Otherwise, gifts are final. If you gave by mistake (the wrong amount, or twice), write to {email} within 30 days and we will refund it.",
              },
            ],
          },
        ],
      },
      {
        id: "names-and-links",
        title: "Your name and links",
        blocks: [
          "When you donate to a city you may ask to be named among its benefactors, and once you have given you may show up to three links beside your name. Names and links are public: they appear on the city's list, on the front page and in the Hall of Fame, and the links are ordinary links that search engines follow. Your name and links must not:",
          {
            items: [
              "be offensive, hateful, sexual or violent;",
              "pretend to be someone else, or use a name or brand you have no right to;",
              "lead to anything illegal, harmful, deceptive or malicious (malware, phishing, scams);",
              "infringe anyone's rights.",
            ],
          },
          "To show a link, the site reads the linked page once and keeps its title, its description and small copies of its icon and picture. You are responsible for what you link to. We may hide or remove any name or link, at any time and without notice, if we believe it breaks these rules; your gift and your stones stay counted. You can change your name, your listing and your links whenever you like on [Your cities](me).",
        ],
      },
      {
        id: "signing-in",
        title: "Signing in",
        blocks: [
          "Donors sign in with their email address: we send a link and a 6-digit code, with no password. Anyone who can read your inbox can sign in as you, so keep it safe. A session lasts 7 days on the device you signed in on; signing out ends it there.",
        ],
      },
      {
        id: "code-and-data",
        title: "Code, data and names",
        blocks: [
          "The code behind tinyworlds is open source, under the [MIT License](license). The map data belongs to its contributors, under their own licences (OpenStreetMap's, for one, under the [Open Database License](odbl)); each map's About lists its sources. The building descriptions are Wikipedia's, under [CC BY-SA 4.0](ccbysa).",
          "The tinyworlds name and wordmark are ours: please do not use them in a way that suggests your work is ours, or that we endorse it.",
        ],
      },
      {
        id: "changes",
        title: "Changes and availability",
        blocks: [
          "The site is offered as it is. We may change, pause or stop any part of it, a map included, at any time. We try to keep it running, but cannot promise it will always be available or free of errors.",
          "We may update these terms. When we do, we change the date at the top, and if a change matters to donors we also tell them by email. Using the site after a change means you accept the new terms.",
        ],
      },
      {
        id: "liability",
        title: "Liability",
        blocks: [
          "As far as the law allows, tinyworlds is provided without warranties of any kind, and we are not liable for any indirect, incidental or consequential loss arising from your use of the site. Where we are liable, our total liability is limited to what you donated in the 12 months before the claim. Nothing in these terms limits rights that the law of your country gives you and does not allow to be limited.",
        ],
      },
      {
        id: "language",
        title: "Language",
        blocks: [
          "These terms are written in English and translated into Portuguese and Spanish. If a translation ever differs from the English text, the English text prevails.",
        ],
      },
      {
        id: "contact",
        title: "Contact",
        blocks: ["Questions about these terms? Write to {email}."],
      },
    ],
  },

  "pt-BR": {
    title: "Termos de Uso",
    description:
      "As regras para usar o tinyworlds: os mapas, as doações, os nomes e links dos benfeitores, e o que podemos e não podemos prometer.",
    summary: [
      "Os mapas são gratuitos para explorar e não pedem conta.",
      "Uma doação é um presente que ajuda a construir uma cidade e mantém o site no ar, não uma compra.",
      "Se você puser seu nome ou links numa cidade, mantenha-os decentes: podemos ocultar o que não for.",
      "Os mapas são arte feita com dados abertos: não servem para se orientar.",
    ],
    sections: [
      {
        id: "these-terms",
        title: "Estes termos",
        blocks: [
          "O tinyworlds (“tinyworlds”, “nós”) é um pequeno projeto independente, feito e mantido por uma pessoa, que redesenha cidades reais, e alguns lugares imaginários, como mapas em pixel art. Estes termos valem para o site inteiro: a página inicial, todos os mapas, Suas cidades e o Hall da Fama.",
          "Ao usar o site, você concorda com estes termos; se não concordar, por favor não o use. Como tratamos dados pessoais está explicado na nossa [Política de Privacidade](privacy).",
        ],
      },
      {
        id: "using",
        title: "Usando o site",
        blocks: [
          "Explorar os mapas é gratuito e não pede conta. Passeie, pesquise, compartilhe links de qualquer vista e jogue Adivinhe o prédio quanto quiser. Por favor, não:",
          {
            items: [
              "ataque ou sobrecarregue o site, sua API ou seus servidores, nem tente invadi-los;",
              "envie ao site visitas, respostas do quiz ou outros dados inventados, nem use programas para inflar suas contagens;",
              "copie os mapas em massa com ferramentas automáticas de um jeito que pese nos nossos servidores (o código e os dados são abertos: você pode desenhar os mapas por conta própria);",
              "use o site para desrespeitar a lei ou os direitos de alguém.",
            ],
          },
        ],
      },
      {
        id: "maps",
        title: "Os mapas são arte",
        blocks: [
          "Cada mapa é desenhado por um programa a partir de dados abertos, com alturas, cores e detalhes estimados onde os dados não dizem nada. Ruas, prédios e lugares podem faltar, estar no lugar errado, desatualizados ou errados, e o mesmo vale para as descrições dos prédios, que vêm da Wikipédia. Não conte com os mapas para se orientar, para tomar decisões sobre imóveis ou segurança, nem para nada em que a precisão importe.",
          "Winterfell, Porto Real e Westeros são feitos por fãs: mapas não oficiais de lugares de uma história, desenhados por nós, sem vínculo com o autor ou a série nem aprovação deles.",
        ],
      },
      {
        id: "donations",
        title: "Doações",
        blocks: [
          "Doar é opcional. As doações são feitas em dólares americanos, a partir de US$1, e pagas pelo Stripe, que cuida do pagamento segundo os próprios termos; nunca vemos os dados do seu cartão.",
          {
            items: [
              {
                term: "Um presente, não uma compra.",
                text: "Uma doação apoia o projeto. Ela não compra um produto ou serviço, uma parte do projeto nem qualquer direito sobre os mapas. O tinyworlds não é uma entidade beneficente registrada, então as doações não são dedutíveis de impostos.",
              },
              {
                term: "Como as cidades são construídas.",
                text: "Você pode indicar uma cidade com a sua doação. Uma cidade é construída quando as doações que a indicam chegam à meta dela (mostrada no site: US$30 hoje), e as cidades com mais doações vêm primeiro. Construímos as cidades financiadas o mais rápido que podemos, mas não podemos prometer uma data. As metas das cidades ainda não financiadas podem mudar.",
              },
              {
                term: "Além da meta.",
                text: "O que é doado além da meta de uma cidade, e as doações que não indicam cidade, pagam os servidores e fazem o projeto melhorar.",
              },
              {
                term: "Se uma cidade não puder ser construída.",
                text: "Às vezes não há dados abertos suficientes para desenhar bem um lugar. Se isso acontecer com uma cidade financiada, escreveremos aos doadores dela e ofereceremos transferir as doações para outra cidade ou devolvê-las.",
              },
              {
                term: "Reembolsos.",
                text: "Fora isso, as doações são definitivas. Se você doou por engano (o valor errado, ou duas vezes), escreva para {email} em até 30 dias e devolveremos o valor.",
              },
            ],
          },
        ],
      },
      {
        id: "names-and-links",
        title: "Seu nome e seus links",
        blocks: [
          "Ao doar para uma cidade, você pode pedir para ter seu nome entre os benfeitores dela e, depois de doar, mostrar até três links ao lado do seu nome. Nomes e links são públicos: aparecem na lista da cidade, na página inicial e no Hall da Fama, e os links são links comuns, que os buscadores seguem. Seu nome e seus links não podem:",
          {
            items: [
              "ser ofensivos, de ódio, sexuais ou violentos;",
              "fingir ser outra pessoa, nem usar um nome ou marca a que você não tem direito;",
              "levar a nada ilegal, nocivo, enganoso ou malicioso (malware, phishing, golpes);",
              "violar os direitos de alguém.",
            ],
          },
          "Para mostrar um link, o site lê a página indicada uma vez e guarda o título, a descrição e pequenas cópias do ícone e da imagem dela. Você é responsável pelo que indica. Podemos ocultar ou remover qualquer nome ou link, a qualquer momento e sem aviso, se acharmos que ele desrespeita estas regras; sua doação e suas pedras continuam contadas. Você pode mudar seu nome, sua listagem e seus links quando quiser em [Suas cidades](me).",
        ],
      },
      {
        id: "signing-in",
        title: "Entrando",
        blocks: [
          "Os doadores entram com o e-mail: enviamos um link e um código de 6 dígitos, sem senha. Quem consegue ler sua caixa de entrada consegue entrar como você, então proteja-a. Uma sessão dura 7 dias no aparelho em que você entrou; sair encerra a sessão ali.",
        ],
      },
      {
        id: "code-and-data",
        title: "Código, dados e nomes",
        blocks: [
          "O código do tinyworlds é aberto, sob a [Licença MIT](license). Os dados dos mapas pertencem a quem os fez, sob as próprias licenças (os do OpenStreetMap, por exemplo, sob a [Open Database License](odbl)); o Sobre de cada mapa lista as fontes dele. As descrições dos prédios são da Wikipédia, sob a [CC BY-SA 4.0](ccbysa).",
          "O nome e a marca tinyworlds são nossos: por favor, não os use de um jeito que sugira que o seu trabalho é nosso ou que o endossamos.",
        ],
      },
      {
        id: "changes",
        title: "Mudanças e disponibilidade",
        blocks: [
          "O site é oferecido como está. Podemos mudar, pausar ou encerrar qualquer parte dele, inclusive um mapa, a qualquer momento. Procuramos mantê-lo no ar, mas não podemos prometer que estará sempre disponível ou livre de erros.",
          "Podemos atualizar estes termos. Quando fizermos isso, mudaremos a data no topo e, se a mudança importar para os doadores, também os avisaremos por e-mail. Usar o site depois de uma mudança significa aceitar os novos termos.",
        ],
      },
      {
        id: "liability",
        title: "Responsabilidade",
        blocks: [
          "Na medida em que a lei permite, o tinyworlds é oferecido sem garantias de qualquer tipo, e não respondemos por perdas indiretas, incidentais ou consequentes decorrentes do uso do site. Quando respondermos, nossa responsabilidade total se limita ao que você doou nos 12 meses anteriores à reclamação. Nada nestes termos limita direitos que a lei do seu país lhe garante e não permite limitar.",
        ],
      },
      {
        id: "language",
        title: "Idioma",
        blocks: [
          "Estes termos foram escritos em inglês e traduzidos para o português e o espanhol. Se uma tradução divergir do texto em inglês, vale o texto em inglês.",
        ],
      },
      {
        id: "contact",
        title: "Contato",
        blocks: ["Dúvidas sobre estes termos? Escreva para {email}."],
      },
    ],
  },

  "es-ES": {
    title: "Condiciones de uso",
    description:
      "Las normas para usar tinyworlds: los mapas, las donaciones, los nombres y enlaces de los benefactores, y lo que podemos y no podemos prometer.",
    summary: [
      "Los mapas son gratis para explorar y no piden cuenta.",
      "Una donación es un regalo que ayuda a construir una ciudad y mantiene el sitio en marcha, no una compra.",
      "Si pones tu nombre o tus enlaces en una ciudad, que sean decentes: podemos ocultar lo que no lo sea.",
      "Los mapas son arte hecho con datos abiertos: no sirven para orientarse.",
    ],
    sections: [
      {
        id: "these-terms",
        title: "Estas condiciones",
        blocks: [
          "tinyworlds («tinyworlds», «nosotros») es un pequeño proyecto independiente, hecho y mantenido por una persona, que redibuja ciudades reales, y algunos lugares imaginarios, como mapas en pixel art. Estas condiciones valen para todo el sitio: la página principal, todos los mapas, Tus ciudades y el Salón de la Fama.",
          "Al usar el sitio aceptas estas condiciones; si no las aceptas, por favor no lo uses. Cómo tratamos los datos personales se explica en nuestra [Política de privacidad](privacy).",
        ],
      },
      {
        id: "using",
        title: "Usar el sitio",
        blocks: [
          "Explorar los mapas es gratis y no pide cuenta. Pasea, busca, comparte enlaces a cualquier vista y juega a Adivina el edificio cuanto quieras. Por favor, no:",
          {
            items: [
              "ataques ni sobrecargues el sitio, su API o sus servidores, ni intentes entrar en ellos;",
              "envíes al sitio visitas, respuestas del juego u otros datos inventados, ni uses programas para inflar sus cifras;",
              "copies los mapas en masa con herramientas automáticas de un modo que cargue nuestros servidores (el código y los datos son abiertos: puedes dibujar los mapas por tu cuenta);",
              "uses el sitio para saltarte la ley o los derechos de nadie.",
            ],
          },
        ],
      },
      {
        id: "maps",
        title: "Los mapas son arte",
        blocks: [
          "Cada mapa lo dibuja un programa a partir de datos abiertos, con alturas, colores y detalles estimados allí donde los datos no dicen nada. Puede que falten calles, edificios o lugares, o que estén mal situados, desfasados o equivocados, y lo mismo vale para las descripciones de los edificios, que vienen de Wikipedia. No te fíes de los mapas para orientarte, para tomar decisiones sobre inmuebles o seguridad, ni para nada en lo que importe la exactitud.",
          "Invernalia, Desembarco del Rey y Poniente son obra de fans: mapas no oficiales de lugares de una historia, trazados por nosotros, sin relación con su autor ni con la serie y sin su respaldo.",
        ],
      },
      {
        id: "donations",
        title: "Donaciones",
        blocks: [
          "Donar es opcional. Las donaciones se hacen en dólares estadounidenses, desde 1 US$, y se pagan a través de Stripe, que gestiona el pago según sus propias condiciones; nunca vemos los datos de tu tarjeta.",
          {
            items: [
              {
                term: "Un regalo, no una compra.",
                text: "Una donación apoya el proyecto. No compra un producto ni un servicio, una parte del proyecto ni ningún derecho sobre los mapas. tinyworlds no es una entidad benéfica registrada, así que las donaciones no desgravan.",
              },
              {
                term: "Cómo se construyen las ciudades.",
                text: "Puedes proponer una ciudad con tu donación. Una ciudad se construye cuando las donaciones que la proponen alcanzan su meta (la que muestra el sitio: 30 US$ hoy), y las ciudades con más fondos van primero. Construimos las ciudades financiadas lo más rápido que podemos, pero no podemos prometer una fecha. Las metas de las ciudades aún no financiadas pueden cambiar.",
              },
              {
                term: "Más allá de la meta.",
                text: "Lo que se dona por encima de la meta de una ciudad, y las donaciones que no proponen ninguna, pagan los servidores y hacen que el proyecto siga mejorando.",
              },
              {
                term: "Si una ciudad no se puede construir.",
                text: "A veces no hay datos abiertos suficientes para dibujar bien un lugar. Si le pasa a una ciudad financiada, escribiremos a sus donantes y les ofreceremos pasar sus donaciones a otra ciudad o devolvérselas.",
              },
              {
                term: "Reembolsos.",
                text: "Por lo demás, las donaciones son definitivas. Si donaste por error (un importe equivocado, o dos veces), escribe a {email} en un plazo de 30 días y te lo devolveremos.",
              },
            ],
          },
        ],
      },
      {
        id: "names-and-links",
        title: "Tu nombre y tus enlaces",
        blocks: [
          "Al donar a una ciudad puedes pedir que tu nombre figure entre sus benefactores y, una vez que has donado, mostrar hasta tres enlaces junto a tu nombre. Los nombres y los enlaces son públicos: aparecen en la lista de la ciudad, en la página principal y en el Salón de la Fama, y los enlaces son enlaces normales, que los buscadores siguen. Tu nombre y tus enlaces no pueden:",
          {
            items: [
              "ser ofensivos, de odio, sexuales o violentos;",
              "hacerse pasar por otra persona, ni usar un nombre o una marca sobre los que no tienes derecho;",
              "llevar a nada ilegal, dañino, engañoso o malicioso (malware, phishing, estafas);",
              "vulnerar los derechos de nadie.",
            ],
          },
          "Para mostrar un enlace, el sitio lee la página enlazada una vez y guarda su título, su descripción y copias pequeñas de su icono y su imagen. Eres responsable de lo que enlazas. Podemos ocultar o retirar cualquier nombre o enlace, en cualquier momento y sin aviso, si creemos que incumple estas normas; tu donación y tus piedras siguen contando. Puedes cambiar tu nombre, si figuras en las listas y tus enlaces cuando quieras en [Tus ciudades](me).",
        ],
      },
      {
        id: "signing-in",
        title: "Iniciar sesión",
        blocks: [
          "Los donantes entran con su correo: les enviamos un enlace y un código de 6 cifras, sin contraseña. Quien pueda leer tu bandeja de entrada puede entrar como tú, así que protégela. Una sesión dura 7 días en el dispositivo en el que entraste; cerrar la sesión la termina ahí.",
        ],
      },
      {
        id: "code-and-data",
        title: "Código, datos y nombres",
        blocks: [
          "El código de tinyworlds es abierto, bajo la [Licencia MIT](license). Los datos de los mapas pertenecen a quienes los hicieron, bajo sus propias licencias (los de OpenStreetMap, por ejemplo, bajo la [Open Database License](odbl)); el «Acerca de» de cada mapa enumera sus fuentes. Las descripciones de los edificios son de Wikipedia, bajo [CC BY-SA 4.0](ccbysa).",
          "El nombre y la marca tinyworlds son nuestros: por favor, no los uses de forma que sugiera que tu trabajo es nuestro o que lo respaldamos.",
        ],
      },
      {
        id: "changes",
        title: "Cambios y disponibilidad",
        blocks: [
          "El sitio se ofrece tal cual. Podemos cambiar, pausar o cerrar cualquier parte de él, un mapa incluido, en cualquier momento. Intentamos mantenerlo en marcha, pero no podemos prometer que esté siempre disponible ni libre de errores.",
          "Podemos actualizar estas condiciones. Cuando lo hagamos, cambiaremos la fecha de arriba y, si el cambio importa a los donantes, también se lo diremos por correo. Usar el sitio después de un cambio significa aceptar las nuevas condiciones.",
        ],
      },
      {
        id: "liability",
        title: "Responsabilidad",
        blocks: [
          "En la medida en que la ley lo permite, tinyworlds se ofrece sin garantías de ningún tipo, y no respondemos de pérdidas indirectas, incidentales o consecuentes derivadas del uso del sitio. Cuando respondamos, nuestra responsabilidad total se limita a lo que donaste en los 12 meses anteriores a la reclamación. Nada en estas condiciones limita los derechos que la ley de tu país te reconoce y no permite limitar.",
        ],
      },
      {
        id: "language",
        title: "Idioma",
        blocks: [
          "Estas condiciones están escritas en inglés y traducidas al portugués y al español. Si una traducción difiere del texto en inglés, prevalece el texto en inglés.",
        ],
      },
      {
        id: "contact",
        title: "Contacto",
        blocks: ["¿Dudas sobre estas condiciones? Escribe a {email}."],
      },
    ],
  },
};
