import type { LegalDocs } from "./types";

/**
 * The privacy policy, in the three languages, section by section and point by point with the
 * same links (`legal.test.ts` checks). It says what the code does: the funnel and the visits
 * (`lib/funnel.ts`, the API's `funnel/` and `visits/`), the quiz's answers, the two kinds of
 * analytics (`components/analytics.tsx`, `lib/consent.ts`), what the browser keeps, the
 * donations and donors (`tinyworlds-api/prisma/schema.prisma`), the links, the sign-in and the
 * lists people ask to join (`lib/lists.ts`, the API's `lists/`).
 * Change it with them.
 */
export const PRIVACY: LegalDocs = {
  "en-US": {
    title: "Privacy Policy",
    description:
      "What tinyworlds collects when you explore, donate or sign in, why, who else sees it, and how to have it changed or deleted.",
    summary: [
      "You can explore every map without telling us who you are. We sell no data and show no ads.",
      "Visits are counted with a random id that lives in one browser tab, not with cookies.",
      "Google Analytics' cookies are used only where allowed: in Europe we ask first, and anyone can say no.",
      "If you donate, Stripe handles the payment; we keep your email, what you gave and, if you choose, your name on a city.",
      "If you ask to be told when a city is built, we keep your email on that list and send only its mails; each one has a link to leave.",
      "Write to {email} to see, correct or delete what we hold about you.",
    ],
    sections: [
      {
        id: "who",
        title: "Who we are",
        blocks: [
          "tinyworlds is a small independent project, made and run by one person. We decide what is collected on this site and why, and you can reach us at {email}. This policy covers the whole site: the front page, every map, Your cities and the Hall of Fame.",
        ],
      },
      {
        id: "exploring",
        title: "When you explore",
        blocks: [
          "Exploring needs no account, and the maps never ask who you are. So that we know which maps are visited, and how a donation came about, each page tells our server:",
          {
            items: [
              {
                term: "That it was opened:",
                text: "which map, and the interface's language, under a random id that the page makes up and keeps in that tab's session storage. The id is gone when the tab closes; it is not a cookie, and it says nothing about who you are.",
              },
              {
                term: "That a map is still open:",
                text: "every 30 seconds while it is in view, so that the site can say how many people are exploring now, and we can see how long visits last.",
              },
              {
                term: "The steps towards a donation:",
                text: "opening the donate sign, starting a checkout, or coming back from one without paying, with the city and the amount chosen.",
              },
              {
                term: "Your answers in Guess the building:",
                text: "the building asked about, the name you picked, the difficulty and the language, so that everyone can see how others answered.",
              },
            ],
          },
          "None of this holds your name, your email or your IP address. If you then donate, the donation keeps the visit's id, which ties that visit's steps to your gift. Visits from a browser where one of our admins is signed in, or from a browser driven by a program, are not counted.",
        ],
      },
      {
        id: "analytics",
        title: "Analytics and cookies",
        blocks: [
          "We use two analytics tools to learn how people find and use the maps:",
          {
            items: [
              {
                term: "Rybbit,",
                text: "which we run ourselves. It counts page views and a few clicks (opening the donate sign, starting the game), with the page, the site you came from, your browser, device and language, and the country and region worked out from your IP address. It sets no cookies.",
              },
              {
                term: "Google Analytics,",
                text: "through Google Tag Manager. It does set cookies (_ga), and Google processes what it collects under its own [privacy policy](google). If your browser is set to a European time zone (or hides its time zone), we ask first, and nothing from Google loads until you say yes; elsewhere it loads with the page, with everything to do with advertising turned off. Wherever you are, you can say no at any time in [Cookie settings](cookies), on the front page or in a map's About: a no is remembered, and Google's cookies are deleted.",
              },
            ],
          },
          "No page of the site uses cookies for advertising.",
        ],
      },
      {
        id: "your-browser",
        title: "What stays in your browser",
        blocks: [
          "The site keeps a few things in your browser's storage, which never leave it except as described above:",
          {
            items: [
              "your settings (language, theme, the map's switches) and your answer to the cookie question;",
              "the buildings you have already played in Guess the building, and the game you chose;",
              "the visit's id, and what you chose in the donate sign while you are at the checkout (in session storage, gone when the tab closes);",
              "if you sign in, your session, for 7 days;",
              'if you press "Tell me" before signing in, which list you asked for and when (under tinyworlds.join): it is read and removed once the sign-in completes, and ignored if it is more than an hour old.',
            ],
          },
          "You can clear them at any time in your browser's settings.",
        ],
      },
      {
        id: "donating",
        title: "When you donate",
        blocks: [
          "Payments are handled by Stripe, under its [privacy policy](stripe). Stripe collects your card or other payment details and your email address; we never see your card details. From Stripe we receive and keep:",
          {
            items: [
              "your email address;",
              "the amount, the currency, the date and Stripe's references for the payment;",
              "the city you named, the map you came from, the language and the visit's id;",
              "the name you asked to be listed under, if you did.",
            ],
          },
          "We use your email address to thank you for your gift, to tell you when a city you gave to is built, and to tell you, once, that you are in the Hall of Fame; the person who makes tinyworlds may also write to you once, from their own address, to thank you personally. We send no newsletters or marketing beyond the lists you ask to join (below), and your email address is never shown on the site, to anyone.",
        ],
      },
      {
        id: "public",
        title: "What is public",
        blocks: [
          "A gift's amount and stones are shown on its city's list without saying who gave them, unless you ask to be named: then your name is shown there, on the front page and in the Hall of Fame, with the links you add. You can stop being named, change your name or remove your links at any time on [Your cities](me). We may hide a name or links that break our [Terms of Service](terms).",
          "To show a link, our server reads the linked page once (and again whenever you ask) and keeps its title, its description and small copies of its icon and picture, so that visitors' browsers never contact the linked site.",
        ],
      },
      {
        id: "signing-in",
        title: "When you sign in",
        blocks: [
          'Anyone may sign in with an email address, to see what they have given or to join a list (below). We keep the address and when it last signed in, whether or not it has given, until you ask us to delete it. Each sign-in link and code works once, for 15 minutes; we store only a one-way hash of them, never the link or the code itself, and, with a link asked for from "Tell me", the list it is for.',
        ],
      },
      {
        id: "lists",
        title: "When you ask to be told",
        blocks: [
          'Anyone may ask to hear when a city is built, or when new cities are built, by pressing "Tell me" and confirming their email address with a sign-in link or code. For each list you join we keep, beside your address, which list it is, when you joined and the language of the page you joined from. We send:',
          {
            items: [
              "one welcome mail, with three buildings from the cities already on the map;",
              'one mail when a city you are waiting for is built; for "new cities", one whenever a new world is added to the map.',
            ],
          },
          'Nothing else is sent through the lists. A city\'s list ends once its mail has gone out; "new cities" lasts until you leave it.',
          'You can leave at any time: every list mail has a "Leave this list" link that needs no sign-in, and your mail program\'s own unsubscribe button works too. You can also leave any list on [Your cities](me).',
          "Leaving takes you off the list, and nothing more: your address stays, as for any sign-in (above), with a note of the list mails sent to it (when the welcome went, and which city each of the others was about, and when), so that nobody is told twice. Both stay until you ask us to delete them.",
        ],
      },
      {
        id: "sharing",
        title: "Who else sees it",
        blocks: [
          "We do not sell or rent personal data, and we do not share it for advertising. Besides us, it reaches only:",
          {
            items: [
              { term: "Stripe,", text: "for payments." },
              { term: "Google,", text: "for Google Analytics, where it is allowed (above)." },
              {
                term: "The servers the site runs on,",
                text: "for the site, its database, its mail and Rybbit. Like any web server, they see your IP address and browser and write them in technical logs, used only to run and protect the site; the API also uses addresses for a moment, to limit how often anything can be asked of it.",
              },
              { term: "The authorities,", text: "if the law requires it." },
            ],
          },
          "Stripe and Google may process data outside your country, including in the United States.",
        ],
      },
      {
        id: "keeping",
        title: "How long we keep it",
        blocks: [
          {
            items: [
              {
                term: "Donations:",
                text: "for as long as the site runs: they make up each city's funding and its list of benefactors, and they are the record of payments.",
              },
              {
                term: "Your address and donor details",
                text: "(email address, name, links), whether you gave or only signed in: until you ask us to delete them.",
              },
              {
                term: "Visits and quiz answers:",
                text: "kept, with nothing in them that points to you, to count visits and answers over time.",
              },
              {
                term: "List memberships:",
                text: "until you leave the list or, for a city, until its mail has gone out.",
              },
              {
                term: "Notes of list mails",
                text: "(which city each was about and when, and when the welcome went): until you ask us to delete your address, so that nobody is told twice.",
              },
              {
                term: "Sign-in links and codes:",
                text: "only as one-way hashes, with the list a link was asked for, if any: for a day or until that address next asks for one, whichever is later.",
              },
            ],
          },
        ],
      },
      {
        id: "rights",
        title: "Your rights",
        blocks: [
          "Depending on where you live (the GDPR in Europe and the UK, the LGPD in Brazil, the CCPA in California, among others), you may have the right to know what we hold about you, to receive a copy, to have it corrected or deleted, and to object to its use. Wherever you live, write to {email} from the address in question and we will do it within 30 days. If we delete your donor details, your gifts stay counted in their cities, with nothing left that ties them to you. You may also complain to your data protection authority.",
          "Where the law asks for a legal basis: running the site and counting its visits are in our legitimate interest; recording a donation and writing to you about it are needed for the gift you made; Google Analytics' cookies, and showing your name and links, rest on your consent, which you can withdraw at any time.",
        ],
      },
      {
        id: "children",
        title: "Children",
        blocks: [
          "The maps are for everyone. Donating and signing in are for adults: if you are under 18, ask a parent or guardian first. We do not knowingly collect personal information from children under 13; if you think we have, write to us and we will delete it.",
        ],
      },
      {
        id: "changes",
        title: "Changes",
        blocks: [
          "When this policy changes, we update the date at the top, and if a change matters to donors we tell them by email. It is written in English and translated into Portuguese and Spanish; if a translation ever differs from the English text, the English text prevails.",
        ],
      },
    ],
  },

  "pt-BR": {
    title: "Política de Privacidade",
    description:
      "O que o tinyworlds coleta quando você explora, doa ou entra, por quê, quem mais vê esses dados e como pedir que sejam corrigidos ou apagados.",
    summary: [
      "Você explora todos os mapas sem nos dizer quem é. Não vendemos dados nem mostramos anúncios.",
      "As visitas são contadas com um código aleatório que vive numa aba do navegador, não com cookies.",
      "Os cookies do Google Analytics só são usados onde é permitido: na Europa perguntamos antes, e qualquer pessoa pode recusar.",
      "Se você doar, o Stripe cuida do pagamento; guardamos seu e-mail, o que você doou e, se quiser, seu nome numa cidade.",
      "Se você pedir para ser avisado quando uma cidade for construída, guardamos seu e-mail nessa lista e enviamos só os e-mails dela; todos têm um link para sair.",
      "Escreva para {email} para ver, corrigir ou apagar o que temos sobre você.",
    ],
    sections: [
      {
        id: "who",
        title: "Quem somos",
        blocks: [
          "O tinyworlds é um pequeno projeto independente, feito e mantido por uma pessoa. Nós decidimos o que é coletado neste site e para quê, e você nos encontra em {email}. Esta política vale para o site inteiro: a página inicial, todos os mapas, Suas cidades e o Hall da Fama.",
        ],
      },
      {
        id: "exploring",
        title: "Quando você explora",
        blocks: [
          "Explorar não pede conta, e os mapas nunca perguntam quem você é. Para sabermos quais mapas são visitados, e como uma doação aconteceu, cada página informa ao nosso servidor:",
          {
            items: [
              {
                term: "Que foi aberta:",
                text: "qual mapa e o idioma da interface, com um código aleatório que a página cria e guarda no armazenamento de sessão daquela aba. O código some quando a aba é fechada; não é um cookie e não diz nada sobre quem você é.",
              },
              {
                term: "Que um mapa continua aberto:",
                text: "a cada 30 segundos enquanto está à vista, para o site dizer quantas pessoas estão explorando agora e podermos ver quanto duram as visitas.",
              },
              {
                term: "Os passos rumo a uma doação:",
                text: "abrir o painel de doação, começar um pagamento ou voltar dele sem pagar, com a cidade e o valor escolhidos.",
              },
              {
                term: "Suas respostas no Adivinhe o prédio:",
                text: "o prédio perguntado, o nome que você escolheu, a dificuldade e o idioma, para todos verem como os outros responderam.",
              },
            ],
          },
          "Nada disso contém seu nome, seu e-mail ou seu endereço IP. Se depois você doar, a doação guarda o código da visita, o que liga os passos daquela visita à sua doação. Não contamos visitas de um navegador em que um dos nossos administradores entrou, nem de um navegador controlado por um programa.",
        ],
      },
      {
        id: "analytics",
        title: "Estatísticas e cookies",
        blocks: [
          "Usamos duas ferramentas de estatísticas para entender como as pessoas encontram e usam os mapas:",
          {
            items: [
              {
                term: "Rybbit,",
                text: "que nós mesmos mantemos. Ele conta visualizações de página e alguns cliques (abrir o painel de doação, começar o jogo), com a página, o site de onde você veio, seu navegador, aparelho e idioma, e o país e a região deduzidos do seu endereço IP. Ele não usa cookies.",
              },
              {
                term: "Google Analytics,",
                text: "pelo Google Tag Manager. Ele usa cookies (_ga), e o Google trata o que coleta segundo a própria [política de privacidade](google). Se o seu navegador estiver num fuso horário da Europa (ou esconder o fuso), perguntamos antes, e nada do Google carrega até você aceitar; nos outros lugares ele carrega com a página, com tudo o que tem a ver com publicidade desligado. Esteja onde estiver, você pode recusar a qualquer momento em [Configurações de cookies](cookies), na página inicial ou no Sobre de um mapa: a recusa fica guardada, e os cookies do Google são apagados.",
              },
            ],
          },
          "Nenhuma página do site usa cookies para publicidade.",
        ],
      },
      {
        id: "your-browser",
        title: "O que fica no seu navegador",
        blocks: [
          "O site guarda algumas coisas no armazenamento do seu navegador, que só saem dele como descrito acima:",
          {
            items: [
              "suas configurações (idioma, tema, as opções do mapa) e sua resposta sobre os cookies;",
              "os prédios que você já jogou no Adivinhe o prédio, e o jogo que escolheu;",
              "o código da visita, e o que você escolheu no painel de doação enquanto está no pagamento (no armazenamento de sessão, que some quando a aba é fechada);",
              "se você entrar, sua sessão, por 7 dias;",
              'se você clicar em "Me avise" antes de entrar, qual lista você pediu e quando (em tinyworlds.join): ele é lido e apagado quando o acesso é concluído, e ignorado se tiver mais de uma hora.',
            ],
          },
          "Você pode apagá-las a qualquer momento nas configurações do navegador.",
        ],
      },
      {
        id: "donating",
        title: "Quando você doa",
        blocks: [
          "Os pagamentos são feitos pelo Stripe, segundo a [política de privacidade](stripe) dele. O Stripe coleta os dados do seu cartão ou de outro meio de pagamento e seu e-mail; nós nunca vemos os dados do seu cartão. Do Stripe recebemos e guardamos:",
          {
            items: [
              "seu endereço de e-mail;",
              "o valor, a moeda, a data e as referências do Stripe para o pagamento;",
              "a cidade que você indicou, o mapa de onde veio, o idioma e o código da visita;",
              "o nome com que você pediu para aparecer, se pediu.",
            ],
          },
          "Usamos seu e-mail para agradecer pela doação, para avisar quando uma cidade para a qual você doou for construída e para avisar, uma vez, que você está no Hall da Fama; a pessoa que faz o tinyworlds também pode escrever a você uma vez, do próprio endereço, para agradecer pessoalmente. Não enviamos newsletters nem marketing além das listas em que você pede para entrar (abaixo), e seu e-mail nunca aparece no site, para ninguém.",
        ],
      },
      {
        id: "public",
        title: "O que é público",
        blocks: [
          "O valor e as pedras de uma doação aparecem na lista da cidade sem dizer quem doou, a menos que você peça para ter seu nome: aí seu nome aparece ali, na página inicial e no Hall da Fama, com os links que você adicionar. Você pode deixar de aparecer, mudar seu nome ou remover seus links a qualquer momento em [Suas cidades](me). Podemos ocultar um nome ou links que desrespeitem nossos [Termos de Uso](terms).",
          "Para mostrar um link, nosso servidor lê a página indicada uma vez (e de novo sempre que você pedir) e guarda o título, a descrição e pequenas cópias do ícone e da imagem dela, para que os navegadores dos visitantes nunca contatem o site indicado.",
        ],
      },
      {
        id: "signing-in",
        title: "Quando você entra",
        blocks: [
          'Qualquer pessoa pode entrar com um e-mail, para ver o que doou ou para entrar em uma lista (abaixo). Guardamos o endereço e quando ele entrou pela última vez, tenha doado ou não, até você pedir que o apaguemos. Cada link e código de acesso funciona uma vez, por 15 minutos; guardamos só um hash irreversível deles, nunca o link ou o código em si, e, num link pedido pelo "Me avise", a lista a que ele se refere.',
        ],
      },
      {
        id: "lists",
        title: "Quando você pede para ser avisado",
        blocks: [
          'Qualquer pessoa pode pedir para saber quando uma cidade for construída, ou quando novas cidades forem construídas, clicando em "Me avise" e confirmando o e-mail com um link ou código de acesso. Para cada lista em que você entra, guardamos, junto do seu endereço, qual é a lista, quando você entrou e o idioma da página de onde entrou. Enviamos:',
          {
            items: [
              "um e-mail de boas-vindas, com três prédios das cidades que já estão no mapa;",
              'um e-mail quando uma cidade que você espera for construída; para "novas cidades", um sempre que um novo mundo for adicionado ao mapa.',
            ],
          },
          'Nada mais é enviado pelas listas. A lista de uma cidade termina quando o e-mail dela é enviado; "novas cidades" dura até você sair.',
          'Você pode sair a qualquer momento: todo e-mail de lista tem um link "Sair desta lista" que não pede acesso, e o botão de cancelar inscrição do seu programa de e-mail também funciona. Você também pode sair de qualquer lista em [Suas cidades](me).',
          "Sair de uma lista tira você dela, e só: seu endereço continua guardado, como em qualquer acesso (acima), com um registro dos e-mails de lista enviados a ele (quando foi o de boas-vindas, e de qual cidade cada um dos outros falava, e quando), para que ninguém seja avisado duas vezes. Os dois ficam até você pedir que os apaguemos.",
        ],
      },
      {
        id: "sharing",
        title: "Quem mais vê esses dados",
        blocks: [
          "Não vendemos nem alugamos dados pessoais, e não os compartilhamos para publicidade. Além de nós, eles chegam apenas a:",
          {
            items: [
              { term: "Stripe,", text: "para os pagamentos." },
              { term: "Google,", text: "para o Google Analytics, onde é permitido (acima)." },
              {
                term: "Os servidores em que o site roda,",
                text: "para o site, o banco de dados, os e-mails e o Rybbit. Como qualquer servidor web, eles veem seu endereço IP e seu navegador e os registram em logs técnicos, usados só para manter e proteger o site; a API também usa os endereços por um instante, para limitar com que frequência algo pode ser pedido a ela.",
              },
              { term: "As autoridades,", text: "se a lei exigir." },
            ],
          },
          "O Stripe e o Google podem tratar dados fora do seu país, inclusive nos Estados Unidos.",
        ],
      },
      {
        id: "keeping",
        title: "Por quanto tempo guardamos",
        blocks: [
          {
            items: [
              {
                term: "Doações:",
                text: "enquanto o site existir: elas formam o financiamento de cada cidade e sua lista de benfeitores, e são o registro dos pagamentos.",
              },
              {
                term: "Seu endereço e seus dados de doador",
                text: "(e-mail, nome, links), tenha você doado ou apenas entrado: até você pedir que os apaguemos.",
              },
              {
                term: "Visitas e respostas do quiz:",
                text: "guardadas, sem nada que aponte para você, para contar visitas e respostas ao longo do tempo.",
              },
              {
                term: "Participação em listas:",
                text: "até você sair da lista ou, no caso de uma cidade, até o e-mail dela ser enviado.",
              },
              {
                term: "Registro dos e-mails de lista",
                text: "(de qual cidade cada um falava e quando, e quando foi o de boas-vindas): até você pedir que apaguemos seu endereço, para que ninguém seja avisado duas vezes.",
              },
              {
                term: "Links e códigos de acesso:",
                text: "só como hashes irreversíveis, com a lista para a qual o link foi pedido, se houver: por um dia ou até aquele endereço pedir outro, o que vier depois.",
              },
            ],
          },
        ],
      },
      {
        id: "rights",
        title: "Seus direitos",
        blocks: [
          "Dependendo de onde você mora (a LGPD no Brasil, o RGPD na Europa e no Reino Unido, a CCPA na Califórnia, entre outras), você pode ter o direito de saber o que guardamos sobre você, de receber uma cópia, de pedir correção ou exclusão e de se opor ao uso desses dados. Onde quer que você more, escreva para {email} a partir do endereço em questão e faremos isso em até 30 dias. Se apagarmos seus dados de doador, suas doações continuam contadas nas cidades, sem nada que as ligue a você. Você também pode reclamar à autoridade de proteção de dados (no Brasil, a ANPD).",
          "Onde a lei pede uma base legal: manter o site e contar suas visitas são do nosso legítimo interesse; registrar uma doação e escrever a você sobre ela são necessários para a doação que você fez; os cookies do Google Analytics, e mostrar seu nome e seus links, dependem do seu consentimento, que você pode retirar a qualquer momento.",
        ],
      },
      {
        id: "children",
        title: "Crianças",
        blocks: [
          "Os mapas são para todos. Doar e entrar são para adultos: se você tem menos de 18 anos, peça antes a um dos pais ou responsável. Não coletamos de propósito dados pessoais de crianças com menos de 13 anos; se achar que coletamos, escreva para nós e os apagaremos.",
        ],
      },
      {
        id: "changes",
        title: "Mudanças",
        blocks: [
          "Quando esta política mudar, atualizaremos a data no topo e, se a mudança importar para os doadores, os avisaremos por e-mail. Ela foi escrita em inglês e traduzida para o português e o espanhol; se uma tradução divergir do texto em inglês, vale o texto em inglês.",
        ],
      },
    ],
  },

  "es-ES": {
    title: "Política de privacidad",
    description:
      "Qué recoge tinyworlds cuando exploras, donas o inicias sesión, para qué, quién más lo ve y cómo pedir que se corrija o se borre.",
    summary: [
      "Puedes explorar todos los mapas sin decirnos quién eres. No vendemos datos ni mostramos anuncios.",
      "Las visitas se cuentan con un código aleatorio que vive en una pestaña del navegador, no con cookies.",
      "Las cookies de Google Analytics solo se usan donde está permitido: en Europa preguntamos antes, y cualquiera puede decir que no.",
      "Si donas, Stripe gestiona el pago; guardamos tu correo, lo que donaste y, si quieres, tu nombre en una ciudad.",
      "Si pides que te avisemos cuando se construya una ciudad, guardamos tu correo en esa lista y enviamos solo sus correos; todos traen un enlace para darte de baja.",
      "Escribe a {email} para ver, corregir o borrar lo que tenemos sobre ti.",
    ],
    sections: [
      {
        id: "who",
        title: "Quiénes somos",
        blocks: [
          "tinyworlds es un pequeño proyecto independiente, hecho y mantenido por una persona. Nosotros decidimos qué se recoge en este sitio y para qué, y puedes escribirnos a {email}. Esta política vale para todo el sitio: la página principal, todos los mapas, Tus ciudades y el Salón de la Fama.",
        ],
      },
      {
        id: "exploring",
        title: "Cuando exploras",
        blocks: [
          "Explorar no pide cuenta, y los mapas nunca preguntan quién eres. Para saber qué mapas se visitan, y cómo llegó una donación, cada página le dice a nuestro servidor:",
          {
            items: [
              {
                term: "Que se abrió:",
                text: "qué mapa y el idioma de la interfaz, con un código aleatorio que la página se inventa y guarda en el almacenamiento de sesión de esa pestaña. El código desaparece al cerrar la pestaña; no es una cookie y no dice nada de quién eres.",
              },
              {
                term: "Que un mapa sigue abierto:",
                text: "cada 30 segundos mientras está a la vista, para que el sitio pueda decir cuántas personas están explorando ahora y nosotros, cuánto duran las visitas.",
              },
              {
                term: "Los pasos hacia una donación:",
                text: "abrir el panel de donación, empezar un pago o volver de él sin pagar, con la ciudad y el importe elegidos.",
              },
              {
                term: "Tus respuestas en Adivina el edificio:",
                text: "el edificio preguntado, el nombre que elegiste, la dificultad y el idioma, para que todos vean cómo respondieron los demás.",
              },
            ],
          },
          "Nada de esto incluye tu nombre, tu correo ni tu dirección IP. Si después donas, la donación guarda el código de la visita, lo que une los pasos de esa visita a tu donación. No contamos las visitas de un navegador en el que ha entrado uno de nuestros administradores, ni las de un navegador manejado por un programa.",
        ],
      },
      {
        id: "analytics",
        title: "Estadísticas y cookies",
        blocks: [
          "Usamos dos herramientas de estadísticas para saber cómo encuentra y usa la gente los mapas:",
          {
            items: [
              {
                term: "Rybbit,",
                text: "que mantenemos nosotros mismos. Cuenta las páginas vistas y algunos clics (abrir el panel de donación, empezar el juego), con la página, el sitio del que vienes, tu navegador, dispositivo e idioma, y el país y la región deducidos de tu dirección IP. No usa cookies.",
              },
              {
                term: "Google Analytics,",
                text: "a través de Google Tag Manager. Este sí usa cookies (_ga), y Google trata lo que recoge según su propia [política de privacidad](google). Si tu navegador está en una zona horaria de Europa (o la oculta), preguntamos antes, y no se carga nada de Google hasta que dices que sí; en el resto del mundo se carga con la página, con todo lo relacionado con la publicidad desactivado. Estés donde estés, puedes decir que no en cualquier momento en [Configuración de cookies](cookies), en la página principal o en el «Acerca de» de un mapa: el no se recuerda, y las cookies de Google se borran.",
              },
            ],
          },
          "Ninguna página del sitio usa cookies para publicidad.",
        ],
      },
      {
        id: "your-browser",
        title: "Lo que se queda en tu navegador",
        blocks: [
          "El sitio guarda algunas cosas en el almacenamiento de tu navegador, que solo salen de él como se explica arriba:",
          {
            items: [
              "tus ajustes (idioma, tema, las opciones del mapa) y tu respuesta sobre las cookies;",
              "los edificios que ya has jugado en Adivina el edificio, y la partida que elegiste;",
              "el código de la visita, y lo que elegiste en el panel de donación mientras estás en el pago (en el almacenamiento de sesión, que desaparece al cerrar la pestaña);",
              "si inicias sesión, tu sesión, durante 7 días;",
              "si pulsas «Avísame» antes de iniciar sesión, qué lista pediste y cuándo (en tinyworlds.join): se lee y se borra cuando termina el inicio de sesión, y se ignora si tiene más de una hora.",
            ],
          },
          "Puedes borrarlas cuando quieras en los ajustes del navegador.",
        ],
      },
      {
        id: "donating",
        title: "Cuando donas",
        blocks: [
          "Los pagos los gestiona Stripe, según su [política de privacidad](stripe). Stripe recoge los datos de tu tarjeta u otro medio de pago y tu correo; nosotros nunca vemos los datos de tu tarjeta. De Stripe recibimos y guardamos:",
          {
            items: [
              "tu dirección de correo;",
              "el importe, la moneda, la fecha y las referencias de Stripe para el pago;",
              "la ciudad que propusiste, el mapa del que venías, el idioma y el código de la visita;",
              "el nombre con el que pediste aparecer, si lo pediste.",
            ],
          },
          "Usamos tu correo para darte las gracias por la donación, para avisarte cuando se construya una ciudad a la que donaste y para decirte, una vez, que estás en el Salón de la Fama; la persona que hace tinyworlds también puede escribirte una vez, desde su propia dirección, para darte las gracias en persona. No enviamos boletines ni publicidad más allá de las listas a las que pides unirte (abajo), y tu correo nunca se muestra en el sitio, a nadie.",
        ],
      },
      {
        id: "public",
        title: "Lo que es público",
        blocks: [
          "El importe y las piedras de una donación se muestran en la lista de su ciudad sin decir quién donó, salvo que pidas aparecer con tu nombre: entonces tu nombre aparece ahí, en la página principal y en el Salón de la Fama, con los enlaces que añadas. Puedes dejar de aparecer, cambiar tu nombre o quitar tus enlaces cuando quieras en [Tus ciudades](me). Podemos ocultar un nombre o unos enlaces que incumplan nuestras [Condiciones de uso](terms).",
          "Para mostrar un enlace, nuestro servidor lee la página enlazada una vez (y otra vez cuando lo pidas) y guarda su título, su descripción y copias pequeñas de su icono y su imagen, para que los navegadores de los visitantes nunca contacten con el sitio enlazado.",
        ],
      },
      {
        id: "signing-in",
        title: "Cuando inicias sesión",
        blocks: [
          "Cualquiera puede iniciar sesión con un correo, para ver lo que ha donado o para unirse a una lista (abajo). Guardamos la dirección y cuándo entró por última vez, haya donado o no, hasta que nos pidas borrarla. Cada enlace y código de acceso sirve una vez, durante 15 minutos; solo guardamos un hash irreversible de ellos, nunca el enlace ni el código, y, en un enlace pedido desde «Avísame», la lista a la que corresponde.",
        ],
      },
      {
        id: "lists",
        title: "Cuando pides que te avisemos",
        blocks: [
          "Cualquiera puede pedir que le avisen cuando se construya una ciudad, o cuando se construyan ciudades nuevas, pulsando «Avísame» y confirmando su correo con un enlace o código de acceso. De cada lista a la que te unes guardamos, junto a tu dirección, qué lista es, cuándo te uniste y el idioma de la página desde la que lo hiciste. Enviamos:",
          {
            items: [
              "un correo de bienvenida, con tres edificios de las ciudades que ya están en el mapa;",
              "un correo cuando se construya una ciudad que esperas; para «ciudades nuevas», uno cada vez que se añada un mundo nuevo al mapa.",
            ],
          },
          "Por las listas no se envía nada más. La lista de una ciudad termina cuando se ha enviado su correo; «ciudades nuevas» dura hasta que te des de baja.",
          "Puedes darte de baja cuando quieras: todo correo de una lista trae un enlace «Salir de esta lista» que no pide iniciar sesión, y el botón de cancelar suscripción de tu programa de correo también funciona. También puedes salir de cualquier lista en [Tus ciudades](me).",
          "Salir de una lista te quita de ella, y nada más: tu dirección sigue guardada, como en cualquier inicio de sesión (arriba), con una nota de los correos de las listas que se le enviaron (cuándo salió el de bienvenida, y de qué ciudad hablaba cada uno de los demás, y cuándo), para que a nadie se le avise dos veces. Ambas se guardan hasta que nos pidas borrarlas.",
        ],
      },
      {
        id: "sharing",
        title: "Quién más lo ve",
        blocks: [
          "No vendemos ni alquilamos datos personales, y no los compartimos para publicidad. Aparte de nosotros, solo llegan a:",
          {
            items: [
              { term: "Stripe,", text: "para los pagos." },
              { term: "Google,", text: "para Google Analytics, donde está permitido (arriba)." },
              {
                term: "Los servidores en los que funciona el sitio,",
                text: "para el sitio, su base de datos, su correo y Rybbit. Como cualquier servidor web, ven tu dirección IP y tu navegador y los anotan en registros técnicos, que solo sirven para mantener y proteger el sitio; la API también usa las direcciones un instante, para limitar cuántas veces se le puede pedir algo.",
              },
              { term: "Las autoridades,", text: "si la ley lo exige." },
            ],
          },
          "Stripe y Google pueden tratar datos fuera de tu país, incluso en Estados Unidos.",
        ],
      },
      {
        id: "keeping",
        title: "Cuánto tiempo lo guardamos",
        blocks: [
          {
            items: [
              {
                term: "Donaciones:",
                text: "mientras exista el sitio: forman los fondos de cada ciudad y su lista de benefactores, y son el registro de los pagos.",
              },
              {
                term: "Tu dirección y tus datos de donante",
                text: "(correo, nombre, enlaces), hayas donado o solo iniciado sesión: hasta que nos pidas borrarlos.",
              },
              {
                term: "Visitas y respuestas del juego:",
                text: "se guardan, sin nada que apunte a ti, para contar visitas y respuestas a lo largo del tiempo.",
              },
              {
                term: "Pertenencia a listas:",
                text: "hasta que salgas de la lista o, en el caso de una ciudad, hasta que se haya enviado su correo.",
              },
              {
                term: "Nota de los correos de las listas",
                text: "(de qué ciudad hablaba cada uno y cuándo, y cuándo salió el de bienvenida): hasta que nos pidas borrar tu dirección, para que a nadie se le avise dos veces.",
              },
              {
                term: "Enlaces y códigos de acceso:",
                text: "solo como hashes irreversibles, con la lista para la que se pidió el enlace, si la hay: un día o hasta que esa dirección pida otro, lo que ocurra más tarde.",
              },
            ],
          },
        ],
      },
      {
        id: "rights",
        title: "Tus derechos",
        blocks: [
          "Según dónde vivas (el RGPD en Europa y el Reino Unido, la LGPD en Brasil, la CCPA en California, entre otras), puedes tener derecho a saber qué guardamos sobre ti, a recibir una copia, a que se corrija o se borre y a oponerte a su uso. Vivas donde vivas, escribe a {email} desde la dirección en cuestión y lo haremos en un plazo de 30 días. Si borramos tus datos de donante, tus donaciones siguen contando en sus ciudades, sin nada que las una a ti. También puedes reclamar ante tu autoridad de protección de datos (en España, la AEPD).",
          "Donde la ley pide una base jurídica: mantener el sitio y contar sus visitas es nuestro interés legítimo; registrar una donación y escribirte sobre ella es necesario para la donación que hiciste; las cookies de Google Analytics, y mostrar tu nombre y tus enlaces, se basan en tu consentimiento, que puedes retirar en cualquier momento.",
        ],
      },
      {
        id: "children",
        title: "Menores",
        blocks: [
          "Los mapas son para todo el mundo. Donar e iniciar sesión es cosa de adultos: si tienes menos de 18 años, pregunta antes a tu madre, padre o tutor. No recogemos a sabiendas datos personales de menores de 13 años; si crees que lo hemos hecho, escríbenos y los borraremos.",
        ],
      },
      {
        id: "changes",
        title: "Cambios",
        blocks: [
          "Cuando esta política cambie, actualizaremos la fecha de arriba y, si el cambio importa a los donantes, se lo diremos por correo. Está escrita en inglés y traducida al portugués y al español; si una traducción difiere del texto en inglés, prevalece el texto en inglés.",
        ],
      },
    ],
  },
};
