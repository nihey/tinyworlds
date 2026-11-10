import type { PlaceType } from "@/map/manifest";

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
    drag: string;
    keysSearch: string;
    keysToggles: string;
    /** the same line for a city with no neighbourhood lines */
    keysTogglesNoHoods: string;
    link: string;
    mapData: string;
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
    /** with the list: what a full bar means */
    goal: string;
    /** cities with the most funding come first; what is given beyond a city's goal is not lost */
    priority: string;
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
    donations: { none: string; one: string; other: string };
    status: { funded: string; building: string; built: string };
    showAll: string;
    showFewer: string;
    /** the choice of a city that is not on the list, and the hint in its text field */
    other: string;
    otherPlaceholder: string;
    none: string;
    /** back from a finished checkout */
    thanks: string;
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
  /**
   * The admin pages (the front page's build, at /admin/): signing in by a link sent by email,
   * and the donation funnel. "{email}" is an address, "{minutes}" a number of minutes,
   * "{share}" a percentage, "{zone}" a time zone.
   */
  admin: {
    title: string;
    signIn: {
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
    };
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
    /** the link in the front page's footer that only a signed-in admin sees */
    footerLink: string;
  };
  /** "borough" is missing on purpose: what one is called depends on the city (world copy). */
  placeTypes: Record<Exclude<PlaceType, "borough">, string>;
  errors: {
    answered: (url: string, status: number) => string;
    noCanvas: string;
  };
}
