import type { PlaceType } from "@/map/manifest";

/** The words of one sign-in sheet: the admin's and, later, the donor's. */
export interface SignInWords {
  heading: string;
  body: string;
  email: string;
  placeholder: string;
  action: string;
  sending: string;
  /** after asking: said whoever the address belongs to */
  sent: string;
  again: string;
  verifying: string;
  /** the link was used already, or is too old */
  expired: string;
  /** the session ran out, or the address is no longer an admin's */
  ended: string;
  failed: string;
  tooMany: string;
  /** this build names no API */
  unavailable: string;
}

/**
 * Every word the interface shows or speaks, in one language. Every dictionary implements this,
 * so a string missing from one is a type error. Text that belongs to a city (its name, its
 * About copy, what it calls its districts) lives in src/worlds instead, also once per language.
 *
 * In `about`, "{X}" stands for the key cap X and "{hoods}" for what the world calls its
 * neighbourhood lines (the world copy's `hoodLines.inSentence`).
 */
export interface Strings {
  search: {
    inputLabel: string;
    unavailable: string;
    loading: string;
    clear: string;
    listLabel: string;
    startSomewhere: string;
    nothing: string;
    stillLoading: string;
  };
  tools: {
    navLabel: string;
    zoomIn: string;
    zoomOut: string;
    wholeMap: string;
    search: string;
    share: string;
    settings: string;
    about: string;
    donate: string;
  };
  settings: {
    title: string;
    minimap: string;
    tilt: string;
    strength: string;
    tiltStrengthLabel: string;
    life: string;
    timeOfDay: string;
    themes: { system: string; light: string; dark: string };
    language: string;
    /** the choice that follows the browser's language */
    languageAuto: string;
    keys: { search: string; zoom: string; wholeMap: string; move: string };
  };
  about: {
    gettingAround: string;
    /** the label of the benefactors section, for a city that is built */
    benefactors: string;
    /** the quiet link to the donor's own page */
    yourCities: string;
    drag: string;
    keysSearch: string;
    keysToggles: string;
    /** the same line for a city with no neighbourhood lines */
    keysTogglesNoHoods: string;
    link: string;
    mapData: string;
    /** the credit for the buildings' descriptions, with the licence's URL (made a link) */
    descriptions: string;
    /** quiet links at the foot of the sign: to the front page, to the source, and to the author's inbox */
    allCities: string;
    openSource: string;
    contact: string;
  };
  /** The front page that lists the worlds. `title` and `description` are the page's metadata. */
  home: {
    title: string;
    description: string;
    /** what the front page's share card shows, for those who cannot see it */
    cardAlt: string;
    tagline: string;
    pitch: string;
    /** the hero's button, into the map its picture shows: "{city}" is that world's city */
    explore: string;
    cities: string;
    /** the heading of the worlds that are not real places */
    imagined: string;
    /** the cities being funded, in order of funding; and the ones that reached their goal */
    ranking: string;
    funded: string;
    /** nobody has given anything yet */
    rankingEmpty: string;
    /** names the button of a row: "{city}" is the city */
    donateTo: string;
    /** names the flag beside a row: opens the city's benefactors; "{city}" is the city */
    benefactorsOf: string;
    /** under a card: every visit its map has had; "{n}" is the number, written the visitor's way */
    visits: { one: string; other: string };
    /** beside it, once more than ten have that map open now; "{n}" is how many */
    exploringNow: string;
    /** the link in the header to the donor's own page */
    yourCities: string;
    /** names the row of links to the page's sections */
    navLabel: string;
    /** the line under each section's title */
    citiesLine: string;
    imaginedLine: string;
    rankingLine: string;
    /** the hero's button, where the sign names the city beside it; and the one towards funding */
    exploreShort: string;
    fundNext: string;
    /** the hero goes round the worlds: its name, its arrows, and a dot's ("{city}") */
    carousel: { label: string; previous: string; next: string; show: string };
    /** under the hero, each a figure and what it counts (the figure is set apart: no "{n}") */
    numbers: {
      worlds: { one: string; other: string };
      visits: { one: string; other: string };
      live: string;
      funding: { one: string; other: string };
    };
    /** the tile after the cities: which one is built next; "{goal}" is a sum */
    next: { kicker: string; title: string; body: string; action: string; ranking: string };
    /** why donate, when there is no list of cities to show */
    nextPitch: string;
    openSource: string;
    openSourceBody: string;
    github: string;
    credits: string;
    /** in the footer; "{email}" becomes the address, as a link */
    contact: string;
  };
  /**
   * The donate sign. In `body`, "{wordmark}" stands for the world's name ("tinynyc"); in
   * `progress` and `preview`, "{raised}", "{added}" and "{goal}" are amounts of money; "{amount}"
   * is one too, "{name}" a city and "{n}" a count.
   */
  donate: {
    title: string;
    body: string;
    /** without the list of cities: a donor can ask for one in the checkout */
    wish: string;
    /** with the list: what a full bar means; "{goal}" is a city's goal, as money */
    goal: string;
    /** cities with the most funding come first; what is given beyond a city's goal is not lost */
    priority: string;
    /** "{goal}": a city's goal, as money */
    over: string;
    /** the button that opens the checkout, and what it says while that is on its way */
    action: string;
    /** the same button once an amount is chosen */
    actionAmount: string;
    pending: string;
    /** under the button: with the payment link the amount is set on the checkout page… */
    footnote: string;
    /** …and with the list it was set here */
    footnoteApi: string;
    /** the list could not be loaded, so the plain checkout is offered instead */
    linkNote: string;
    /** the checkout could not be opened and there is no other way to offer */
    failed: string;
    /** names the city field */
    cities: string;
    loading: string;
    /** the city picker: its search box, its groups, and its special choices */
    pickerPlaceholder: string;
    groupFunding: string;
    groupMore: string;
    otherOption: string;
    useTyped: string;
    backToList: string;
    noMatch: string;
    alreadyBuilt: string;
    /** the amount: its label, and the field for one that is not on a chip */
    amount: string;
    customAmount: string;
    customPlaceholder: string;
    progress: string;
    /** the bar with the donation about to be made added to it */
    preview: string;
    fills: string;
    /** under the bar of a city nobody has given to yet; and when no city is chosen */
    newCity: string;
    whole: string;
    /** a built city: where a gift goes; "{city}" is its name */
    builtUpkeep: string;
    /** the stones a gift would lay: "{from}", "{to}", "{count}" and "{city}"; `one` when it is a single stone */
    stones: { one: string; other: string };
    /**
     * joining the city's benefactors: "{city}" is its name, "{n}" and "{max}" the counter; `note`
     * says that the gift counts with the switch off, that an email which already has a name keeps
     * it, and where the name can be changed later ("Your cities")
     */
    join: {
      label: string;
      name: string;
      namePlaceholder: string;
      counter: string;
      /** shown under the name field while the switch is on and the name is empty */
      needsName: string;
      note: string;
    };
    donations: { none: string; one: string; other: string };
    status: { funded: string; building: string; built: string };
    showAll: string;
    showFewer: string;
    /**
     * "Build the next city": the three steps, a city's card and the last card. "{amount}" and
     * "{goal}" are sums; "{laid}" and "{total}" count stones.
     */
    build: {
      steps: {
        pick: { title: string; body: string };
        give: { title: string; body: string };
        build: { title: string; body: string };
      };
      stonesLaid: string;
      firstUnclaimed: string;
      raised: string;
      /** a built city whose donations reached its goal */
      fundedInFull: string;
      groupBuilt: string;
      /** the card for a city nobody has named yet */
      other: { title: string; body: string; action: string };
    };
    /** the choice of a city that is not on the list, and the hint in its text field */
    other: string;
    otherPlaceholder: string;
    none: string;
    /** back from a finished checkout */
    thanks: string;
    /** the thank-you's action: opens "Your cities" */
    seeYourPlace: string;
  };
  /**
   * The benefactors sign. "{city}" is a city's name, "{n}" a number; `more` is the collapsed
   * founders ("{n} more"), `moreAnonymous` what is added after a comma when some are anonymous; `founderNo` is the short label of the founding badge.
   */
  benefactors: {
    heading: string;
    founders: string;
    benefactors: string;
    keepingRunning: string;
    anonymous: string;
    more: { one: string; other: string };
    moreAnonymous: { one: string; other: string };
    stones: { one: string; other: string };
    firstStone: string;
    keystone: string;
    foundingTitle: string;
    founderNo: string;
    benefactorTitle: string;
    legendFirst: string;
    legendKey: string;
    legendAnon: string;
    become: string;
    failed: string;
    stoneTitle: string;
    /**
     * A link beside a named benefactor, as a screen reader hears it: "{title}" is the page's
     * title, "{host}" where it leads.
     */
    linkLabel: string;
    /**
     * Everyone who gave to a city, down the front page's sides: what the list is called, an
     * unnamed gift's name, "{n}" more cities than are named, and the card that invites.
     */
    wall: {
      label: string;
      /** under the title, where it has room: what the list is */
      line: string;
      anonymous: string;
      moreCities: string;
      invite: { title: string; body: string };
    };
  };
  /**
   * The hall of fame (the front page's build, at /hall-of-fame/): everyone who gave, and a page
   * for each city. "{city}" is a city's name, "{n}" a count, "{raised}" and "{goal}" sums.
   */
  hall: {
    /** the document's title and description, and the page's heading and the line under it */
    title: string;
    description: string;
    heading: string;
    line: string;
    /** the link to it, from the front page and from a city's benefactors */
    open: string;
    openCity: string;
    /** the overall page's two parts */
    everyone: string;
    byCity: string;
    byCityLine: string;
    /** the cities on the map because people paid for them: the section, and its line */
    builtBy: string;
    builtByLine: string;
    /**
     * the plaque of a city its benefactors brought, by how many they are: `{people}` is
     * `people` ("2 benefactors"), `{amount}` what they gave ("$35")
     */
    broughtBy: { one: string; other: string };
    /** after a few names: how many more gave */
    more: string;
    /** the overall page's figures: what was given, by how many, and what it built */
    figures: {
      donated: string;
      people: { one: string; other: string };
      built: { one: string; other: string };
    };
    /** on a city's tile: how many are in its hall */
    people: { one: string; other: string };
    built: string;
    funding: string;
    /** nobody has given yet; and the button that opens the donate sign */
    empty: string;
    join: string;
    /** a city's page: the document's title, the heading, the line by its status */
    cityTitle: string;
    cityHeading: string;
    cityBuilt: string;
    cityFunding: string;
    explore: string;
    /** no such city, and the way back */
    unknown: string;
    back: string;
    loading: string;
    failed: string;
    /** what the page says of the links, under the lists */
    linksNote: string;
  };
  loadError: {
    title: string;
    body: string;
    retry: string;
  };
  minimap: { label: string };
  compass: {
    up: string;
    down: string;
    upRight: string;
    upLeft: string;
    right: string;
    left: string;
    downRight: string;
    downLeft: string;
    /** the letter at the needle's tip */
    letter: string;
  };
  share: {
    copied: string;
    copiedDetail: string;
    failed: string;
    /** what screen readers call the corner where these messages appear */
    region: string;
  };
  credit: {
    /** on narrow screens, in place of the world's full credit line */
    short: string;
    /** in place of the data credit, for a place that does not exist */
    fictional: string;
    north: string;
    south: string;
    east: string;
    west: string;
    /** decimal mark in the coordinates readout */
    decimal: string;
  };
  dialog: { close: string };
  /** On a map: the invitation to the site's other places. "{n}" is how many there are. */
  explore: { more: string };
  /** the question before Google's tags may set cookies (lib/consent.ts), and the way back to it */
  consent: {
    /** what the sign is, for screen readers */
    label: string;
    message: string;
    allow: string;
    deny: string;
    /** the link (About, the front page's footer) that puts the question up again */
    settings: string;
  };
  /** what every sign-in shares: the code, the spam warning, waiting to send again */
  signIn: {
    /** the sheet's heading once a link and code were sent */
    checkEmail: string;
    code: string;
    codePlaceholder: string;
    submit: string;
    spam: string;
    changeAddress: string;
    sendAgain: string;
    /** "{seconds}": the countdown to sending again */
    sendAgainIn: string;
    wrongCode: string;
  };
  /**
   * "Your cities" (the front page's build, at /me/): a donor signs in and sees what they gave,
   * the badges they earned and whether they are named. the summary line is built from
   * `summaryCities`, `summaryStones` and `summaryGiven`; "{amount}" is money, "{ranges}" stone ranges ("1–12"), "{left}" money still
   * missing, "{city}" a city's name, "{name}" the donor's, "{email}" their address, "{n}" a number.
   */
  me: {
    title: string;
    signIn: SignInWords;
    founderNo: string;
    firstStone: string;
    keystone: string;
    benefactor: string;
    given: string;
    stonesRange: string;
    toGo: string;
    status: { funded: string; building: string; built: string };
    explore: string;
    listedAs: string;
    notListed: string;
    /** names the switch of a city: "{city}" */
    listLabel: string;
    edit: string;
    save: string;
    cancel: string;
    /** the name field's label, and what is said when a listing is asked for before a name is set */
    nameLabel: string;
    nameFirst: string;
    namePlaceholder: string;
    project: string;
    signedInAs: string;
    signOut: string;
    loading: string;
    failed: string;
    retry: string;
    /** someone who has not given yet */
    noStones: string;
    noStonesBody: string;
    badgesToEarn: string;
    yourBadges: string;
    /** each badge's name and how it is earned; "{n}" counts the cities it was earned in */
    badges: {
      founding: { name: string; how: string };
      firstStone: { name: string; how: string };
      keystone: { name: string; how: string };
      notYet: string;
      inCities: { one: string; other: string };
    };
    /** the three figures at the top: each a number and what it counts (no "{n}") */
    tiles: {
      cities: { one: string; other: string };
      stones: { one: string; other: string };
      given: string;
    };
    legendYours: string;
    legendOthers: string;
    giveAgain: string;
    /** the cities to fund beside the giving: "{goal}" is a sum, "{n}" how many cities */
    buildBody: string;
    buildAll: string;
    /** the worlds under it; "{n}" is how many there are */
    exploring: { title: string; body: string; all: string };
    /**
     * The links a donor shows beside their name: "{max}" is how many there may be, "{n}" how
     * many there are, "{amount}" a sum, "{title}" a link's title.
     */
    links: {
      heading: string;
      body: string;
      count: string;
      label: string;
      placeholder: string;
      add: string;
      /** while the API reads the page */
      reading: string;
      invalid: string;
      duplicate: string;
      failed: string;
      remove: string;
      refresh: string;
      removeLabel: string;
      refreshLabel: string;
      refreshFailed: string;
      /** no link yet */
      empty: string;
      /** the donor is named nowhere, so the links show nowhere */
      needsName: string;
      /** an admin took them off the lists */
      hidden: string;
      picturesOn: string;
      picturesOff: string;
      /** on a link's picture that the lists do not show yet */
      pictureWaiting: string;
    };
  };
  /**
   * The lists a visitor joins to hear when a city is built ("Tell me"): the buttons, the join sign
   * (`join`, with its own sign-in words), "Your lists" on /me/ (`me`), the page a mail's leave link
   * opens (`leave`) and the admin table (`admin`). "{city}" is a city's name, "{email}" an address,
   * "{n}" a number.
   */
  lists: {
    tellMe: string;
    toldYou: string;
    /** "{city}": names the Tell me button for screen readers */
    tellMeAria: string;
    /** "{city}": names the joined button, which leaves; it starts with `toldYou`, the words it shows */
    leaveAria: string;
    /** the hint of "You'll be told" for a donor of the city: their donor mail covers it */
    donorCovered: string;
    newCities: string;
    newCitiesOn: string;
    waitingOne: string;
    /** "{n}" */
    waitingMany: string;
    /** a sonner toast when leaving a list fails */
    leaveFailed: string;
    join: {
      /** "{city}" */
      cityTitle: string;
      newTitle: string;
      /** what a city's list sends */
      body: string;
      /** what new cities' list sends */
      bodyNew: string;
      action: string;
      /** "{city}" */
      doneCity: string;
      doneNew: string;
      /** "{email}", "{city}" */
      doneBody: string;
      /** "{email}" */
      doneBodyNew: string;
      /** "{city}" */
      help: string;
      close: string;
      failed: string;
      /** a sonner toast: signed in from a join's link opened where no join was waiting (another device) */
      signedIn: string;
      signIn: SignInWords;
    };
    me: {
      title: string;
      /** "New cities" */
      newCities: string;
      /** "{city}": names a row's Leave button */
      leave: string;
      leaveLabel: string;
      empty: string;
      pressTellMe: string;
    };
    leave: {
      title: string;
      working: string;
      /** while "Leave all lists" is working */
      workingAll: string;
      /** no link in the address: a reload, or the page opened by hand */
      noToken: string;
      left: string;
      leftAll: string;
      /** the link is not one of ours */
      bad: string;
      failed: string;
      leaveAll: string;
      joinAgain: string;
      backHome: string;
    };
    admin: {
      heading: string;
      note: string;
      city: string;
      waiting: string;
      newCities: string;
      empty: string;
    };
  };
  /**
   * The admin pages (the front page's build, at /admin/): signing in by a link sent by email,
   * and the donation funnel. "{email}" is an address, "{minutes}" a number of minutes,
   * "{share}" a percentage, "{zone}" a time zone.
   */
  admin: {
    title: string;
    signIn: SignInWords;
    signedInAs: string;
    signOut: string;
    frontPage: string;
    /** names the choice of period, and the periods */
    period: string;
    ranges: { d7: string; d30: string; d90: string; d365: string };
    loading: string;
    loadFailed: string;
    retry: string;
    /** an admin's own visits are left out */
    ownVisits: string;
    funnel: {
      heading: string;
      note: string;
      steps: { visits: string; donateOpened: string; checkoutStarted: string; donations: string };
      ofPrevious: string;
      ofVisits: string;
      cancelled: string;
      raised: string;
      empty: string;
    };
    cities: {
      heading: string;
      note: string;
      /** donations that name no map: given through the plain payment link */
      noWorld: string;
      columns: {
        city: string;
        visits: string;
        donateOpened: string;
        checkoutStarted: string;
        donations: string;
        raised: string;
      };
      empty: string;
    };
    days: {
      heading: string;
      note: string;
      table: string;
      day: string;
    };
    donations: {
      heading: string;
      empty: string;
      noCity: string;
      columns: { when: string; amount: string; city: string; from: string };
    };
    /** the donors' names on benefactors pages, and hiding them; "{cities}" is a list of city names */
    names: {
      heading: string;
      note: string;
      empty: string;
      hide: string;
      unhide: string;
      hidden: string;
      cities: string;
      hideLinks: string;
      showLinks: string;
      linksHidden: string;
    };
    /** the link in the front page's footer that only a signed-in admin sees */
    footerLink: string;
  };
  /** "borough" is missing on purpose: what one is called depends on the city (world copy). */
  placeTypes: Record<Exclude<PlaceType, "borough">, string>;
  /** The sign beside a lit building. */
  sight: {
    /** what a building named by its own name is called */
    building: string;
    /** the link to its Wikipedia article */
    readOn: string;
  };
  /** Guess the building: the sign that starts it and the card a round is played on */
  quiz: {
    /** the sign under "more cities" */
    invite: string;
    /** the card's header, in the pixel face */
    title: string;
    /** "round {round} of {total} · {right} right": `one` for one right answer, `other` for none or several */
    score: { one: string; other: string };
    /** the choosing step's rows: difficulty and what (the borough row takes the world's `borough` word) */
    difficulty: string;
    what: string;
    /** each difficulty's name and the line under it */
    levels: {
      easy: { name: string; line: string };
      medium: { name: string; line: string };
      hard: { name: string; line: string };
    };
    /** the "What" row's chips ("Stations" for the stations) */
    groups: {
      all: string;
      buildings: string;
      museums: string;
      landmarks: string;
      stations: string;
    };
    /** the "all boroughs" chip */
    allAreas: string;
    /** "{n} buildings in this game" */
    count: { one: string; other: string };
    /** "Only {n} buildings in this game", for a handful */
    few: { one: string; other: string };
    start: string;
    /** aria-label of the header's gear: back to choosing */
    change: string;
    /** the end of a game: "You named {right} of {total}." */
    end: string;
    again: string;
    /** the end's way back to choosing */
    changeChoice: string;
    /** aria-label of the card's close button */
    close: string;
    /** the question, by what the building is */
    ask: { building: string; station: string; bridge: string; museum: string };
    /** under the text: where it comes from, and that it was changed */
    source: string;
    /** under the text once it is whole: where it comes from */
    credit: string;
    /** what a screen reader says for a blank */
    blank: string;
    right: string;
    /** "Not quite. It's {name}." */
    wrong: string;
    /** beside the visitor's own pick */
    you: string;
    /** how many have answered this building, with {n} */
    people: { one: string; other: string };
    /** when the visitor is the only one so far */
    first: string;
    next: string;
    /** the last round's button: it leads to the score */
    seeScore: string;
    stop: string;
    loading: string;
    empty: string;
  };
  /**
   * The terms of service and the privacy policy (their texts are in src/legal/, not here: no
   * map downloads them): the links to them, and the words around the texts.
   */
  legal: {
    /** the links' words, in footers, About and the cookie question; also each page's name */
    terms: string;
    privacy: string;
    /** "{date}": the day the texts last changed, written out */
    updated: string;
    /** above the list of the page's sections */
    contents: string;
    /** above the few lines that sum the page up */
    summary: string;
  };
  errors: {
    answered: (url: string, status: number) => string;
    noCanvas: string;
  };
}
