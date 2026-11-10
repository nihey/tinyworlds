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
    /** quiet links at the foot of the sign: to the front page, and to the source */
    allCities: string;
    openSource: string;
  };
  /** The front page that lists the worlds. `title` and `description` are the page's metadata. */
  home: {
    title: string;
    description: string;
    tagline: string;
    pitch: string;
    cities: string;
    next: string;
    /** why donate, when there is no list of cities to show */
    nextPitch: string;
    openSource: string;
    openSourceBody: string;
    github: string;
    credits: string;
  };
  /**
   * The donate sign. In `body`, "{wordmark}" stands for the world's name ("tinynyc"); in
   * `progress`, "{raised}" and "{goal}" are amounts of money.
   */
  donate: {
    title: string;
    body: string;
    /** without the list of cities: a donor can ask for one in the checkout */
    wish: string;
    /** with the list: what a full bar means */
    goal: string;
    /** the button that opens the checkout, and what it says while that is on its way */
    action: string;
    pending: string;
    footnote: string;
    /** the checkout could not be opened and there is no other way to offer */
    failed: string;
    /** names the group of choices */
    cities: string;
    loading: string;
    progress: string;
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
    north: string;
    south: string;
    east: string;
    west: string;
    /** decimal mark in the coordinates readout */
    decimal: string;
  };
  dialog: { close: string };
  /** "borough" is missing on purpose: what one is called depends on the city (world copy). */
  placeTypes: Record<Exclude<PlaceType, "borough">, string>;
  errors: {
    answered: (url: string, status: number) => string;
    noCanvas: string;
  };
}
