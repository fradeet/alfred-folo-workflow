/**
 * Base value object for Alfred JSON structures.
 *
 * Optional properties are omitted from JSON when they are `undefined` or
 * `null`. Values such as `false`, `0`, and an empty string are retained because
 * they can carry meaning in Alfred's JSON formats.
 */
export abstract class AlfredJsonValue {
  /** Returns the enumerable properties that should be sent to Alfred. */
  toJSON(): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(this).filter(([, value]) => value !== undefined && value !== null),
    );
  }
}

/** Variables made available to downstream workflow objects. */
export type AlfredVariables = Record<string, unknown>;

/** Modifier-key overrides keyed by `cmd`, `alt`, `ctrl`, `shift`, or combinations. */
export type AlfredModifiers = Record<string, Record<string, unknown>>;

/** Optional top-level fields in an Alfred Script Filter response. */
export interface AlfredSFOptions {
  /** Session variables available to downstream objects and subsequent reruns. */
  variables?: AlfredVariables;

  /** Automatic rerun interval in seconds; Alfred accepts values from 0.1 to 5.0. */
  rerun?: number;

  /** Result-cache configuration supported by Alfred 5.5 and later. */
  cache?: AlfredSFCache;

  /** Preserve the supplied order instead of applying Alfred's learned ordering. */
  skipknowledge?: boolean;
}

/**
 * Top-level response returned by an Alfred Script Filter.
 *
 * A response must contain an items array, which may be empty.
 *
 * @see https://www.alfredapp.com/help/workflows/inputs/script-filter/json/
 */
export class AlfredSF extends AlfredJsonValue {
  /** Session variables available to downstream objects and subsequent reruns. */
  readonly variables?: AlfredVariables;

  /** Automatic rerun interval in seconds. */
  readonly rerun?: number;

  /** Result-cache configuration. */
  readonly cache?: AlfredSFCache;

  /** Whether Alfred should preserve the supplied result order. */
  readonly skipknowledge?: boolean;

  /**
   * @param items Result rows displayed by Alfred.
   * @param options Optional session, rerun, caching, and ordering settings.
   */
  constructor(
    readonly items: AlfredSFItem[],
    options: AlfredSFOptions = {},
  ) {
    super();
    this.variables = options.variables;
    this.rerun = options.rerun;
    this.cache = options.cache;
    this.skipknowledge = options.skipknowledge;
  }
}

/** Configuration for Alfred's automatic Script Filter result cache. */
export class AlfredSFCache extends AlfredJsonValue {
  /**
   * @param seconds Cache lifetime from 5 to 86,400 seconds.
   * @param loosereload Show cached data first while refreshing stale results in the background.
   */
  constructor(
    readonly seconds: number,
    readonly loosereload?: boolean,
  ) {
    super();
  }
}

export enum AlfredSFItemType {
  /** A normal, non-file result. */
  Default = "default",

  /** A file result whose path Alfred verifies before displaying it. */
  File = "file",

  /** A file result for which Alfred skips the path-existence check. */
  FileSkipcheck = "file:skipcheck",
}

/**
 * Typed Universal Action content for a Script Filter result.
 *
 * `auto` lets Alfred infer the content type; `text`, `url`, and `file` identify
 * it explicitly.
 */
export class AlfredSFItemAction extends AlfredJsonValue {
  /**
   * @param text Text content supplied to Universal Actions.
   * @param url URL content supplied to Universal Actions.
   * @param file File-path content supplied to Universal Actions.
   * @param auto Content whose type Alfred should infer.
   */
  constructor(
    readonly text?: string | string[],
    readonly url?: string,
    readonly file?: string,
    readonly auto?: string,
  ) {
    super();
  }
}

/** Icon displayed alongside a Script Filter result. */
export class AlfredSFItemIcon extends AlfredJsonValue {
  /**
   * @param path Image path, file path, or UTI depending on `type`.
   * @param type Use `fileicon` for a path's icon or `filetype` for a UTI; omit for an image path.
   */
  constructor(
    readonly path: string,
    readonly type?: "fileicon" | "filetype",
  ) {
    super();
  }
}

/** Text used when the user copies a result or displays it in Large Type. */
export class AlfredSFItemText extends AlfredJsonValue {
  /**
   * @param copy Text copied with Command-C.
   * @param largetype Text displayed with Command-L.
   */
  constructor(
    readonly copy: string,
    readonly largetype: string,
  ) {
    super();
  }
}

/** Optional fields for a single Script Filter result row. */
export interface AlfredSFItemOptions {
  /** Universal Action content; overrides `arg` for that action. */
  action?: AlfredSFItemAction | unknown[] | string;

  /** Value passed to the connected workflow action when the item is selected. */
  arg?: string | string[];

  /** Text inserted into Alfred's search field when the item is autocompleted. */
  autocomplete?: string;

  /** Result icon; relative paths resolve from the workflow root. */
  icon?: AlfredSFItemIcon;

  /** Searchable text used instead of the title when Alfred filters results. */
  match?: string;

  /** Modifier-key overrides for the item. */
  mods?: AlfredModifiers;

  /** Quick Look URL or path; Alfred falls back to `arg` when omitted. */
  quicklookurl?: string;

  /** Secondary text displayed below the title. */
  subtitle?: string;

  /** Controls whether Alfred treats the result as a normal item or file. */
  type?: AlfredSFItemType;

  /** Text used for Copy and Large Type. */
  text?: AlfredSFItemText;

  /** Stable identifier used by Alfred to learn the result's ordering. */
  uid?: string;

  /** Variables emitted when selected; item values override session values. */
  variables?: AlfredVariables;

  /** Whether Return can action the item; Alfred defaults to `true`. */
  valid?: boolean;
}

/**
 * A single result row in an Alfred Script Filter response.
 *
 * Only the title is required. Supplying a stable UID lets Alfred learn the
 * result's ranking; omit it when the returned order must be kept.
 */
export class AlfredSFItem extends AlfredJsonValue {
  /** Universal Action content; overrides `arg` for that action. */
  readonly action?: AlfredSFItemAction | unknown[] | string;

  /** Value passed to the connected workflow action when selected. */
  readonly arg?: string | string[];

  /** Text inserted into Alfred's search field when autocompleted. */
  readonly autocomplete?: string;

  /** Icon displayed alongside the result. */
  readonly icon?: AlfredSFItemIcon;

  /** Searchable text used instead of the title when filtering results. */
  readonly match?: string;

  /** Modifier-key overrides for the result. */
  readonly mods?: AlfredModifiers;

  /** Quick Look URL or path. */
  readonly quicklookurl?: string;

  /** Secondary text displayed below the title. */
  readonly subtitle?: string;

  /** Whether Alfred treats the result as a normal item or file. */
  readonly type?: AlfredSFItemType;

  /** Text used for Copy and Large Type. */
  readonly text?: AlfredSFItemText;

  /** Stable identifier used by Alfred to learn ordering. */
  readonly uid?: string;

  /** Variables emitted when the result is selected. */
  readonly variables?: AlfredVariables;

  /** Whether Return can action the result. */
  readonly valid?: boolean;

  /**
   * @param title Primary, non-empty text displayed in the result row.
   * @param options Optional action, presentation, matching, and variable fields.
   */
  constructor(
    readonly title: string,
    options: AlfredSFItemOptions = {},
  ) {
    super();
    this.action = options.action;
    this.arg = options.arg;
    this.autocomplete = options.autocomplete;
    this.icon = options.icon;
    this.match = options.match;
    this.mods = options.mods;
    this.quicklookurl = options.quicklookurl;
    this.subtitle = options.subtitle;
    this.type = options.type;
    this.text = options.text;
    this.uid = options.uid;
    this.variables = options.variables;
    this.valid = options.valid;
  }
}

export enum AlfredTVBehaviourResponse {
  /** Replace all content with the new response. */
  Replace = "replace",

  /** Add the new response to the bottom of the view. */
  Append = "append",

  /** Add the new response to the top of the view. */
  Prepend = "prepend",

  /** Replace the content produced by the previous response. */
  ReplaceLast = "replacelast",
}

export enum AlfredTVBehaviourScroll {
  /** Scroll to the start of the new response. */
  Auto = "auto",

  /** Scroll to the start of the Text View. */
  Start = "start",

  /** Scroll to the end of the Text View. */
  End = "end",
}

export enum AlfredTVBehaviourInputField {
  /** Erase the input field text after it is actioned. */
  Clear = "clear",

  /** Select the input field text after it is actioned. */
  Select = "select",
}

/** Controls how an Alfred Text View updates and handles its input field. */
export class AlfredTVBehaviour extends AlfredJsonValue {
  /**
   * @param response How new response text updates existing content.
   * @param scroll Where the Text View scrolls after receiving a response.
   * @param inputfield What happens to the input field after actioning it.
   */
  constructor(
    readonly response?: AlfredTVBehaviourResponse,
    readonly scroll?: AlfredTVBehaviourScroll,
    readonly inputfield?: AlfredTVBehaviourInputField,
  ) {
    super();
  }
}

/** Optional top-level fields in an Alfred Text View response. */
export interface AlfredTVOptions {
  /** Session variables available to downstream objects and subsequent reruns. */
  variables?: AlfredVariables;

  /** Automatic rerun interval in seconds; Alfred accepts values from 0.1 to 5.0. */
  rerun?: number;

  /** Text displayed in the window footer. */
  footer?: string;

  /** Close the Text View and send `response` to the connected workflow object. */
  actionoutput?: boolean;

  /** Controls response updates, scrolling, and input-field handling. */
  behaviour?: AlfredTVBehaviour;
}

/**
 * Top-level response used to populate an Alfred Text View.
 *
 * @see https://www.alfredapp.com/help/workflows/user-interface/text/json/
 */
export class AlfredTV extends AlfredJsonValue {
  /** Session variables available to downstream objects and subsequent reruns. */
  readonly variables?: AlfredVariables;

  /** Automatic rerun interval in seconds. */
  readonly rerun?: number;

  /** Text displayed in the window footer. */
  readonly footer?: string;

  /** Whether actioning closes the view and emits `response`. */
  readonly actionoutput?: boolean;

  /** Response-update, scroll, and input-field behaviour. */
  readonly behaviour?: AlfredTVBehaviour;

  /**
   * @param response Text displayed in the Text View.
   * @param options Optional session, rerun, footer, action, and update settings.
   */
  constructor(
    readonly response: string,
    options: AlfredTVOptions = {},
  ) {
    super();
    this.variables = options.variables;
    this.rerun = options.rerun;
    this.footer = options.footer;
    this.actionoutput = options.actionoutput;
    this.behaviour = options.behaviour;
  }
}
