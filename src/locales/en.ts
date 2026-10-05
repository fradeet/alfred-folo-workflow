/** English copy shown in Alfred Script Filter results. */
export const en = {
  timeline: {
    untitledEntry: "Untitled entry",
    unknownFeed: "Unknown feed",
    noNextPage: "No next page",
    alreadyAtTop: "Already at the top",
    emptyTitle: "No Folo entries",
    emptyUnreadSubscription: "This subscription has no unread entries",
    emptySubscription: "This subscription has no entries",
    emptyView: "This view has no entries",
    refreshPage: "Refresh this timeline page",
  },
  subscriptions: {
    list: "List",
    feed: "Feed",
    untitled: (kind: string): string => `Untitled ${kind.toLowerCase()}`,
    feedCount: (count: number): string => `${count} ${count === 1 ? "feed" : "feeds"}`,
    emptyTitle: "No Folo subscriptions",
  },
  unread: {
    untitled: (sourceType: string): string => `Untitled ${sourceType}`,
    count: (count: number): string => `${count} unread`,
    emptyTitle: "No unread subscriptions",
    emptySubtitle: "You're all caught up",
  },
  errors: {
    authenticationRequired: "Folo authentication required",
    unableToLoad: "Unable to load Folo",
    authenticate: "Run folologin to authenticate",
    timeout: "The Folo request timed out; check your network and try again",
    debugger: "Open Alfred's debugger for details",
  },
  login: {
    missingConfigToken: "Folo config does not contain a token.",
    emptyToken: "Folo token must not be empty.",
    missingWorkflowId: "Alfred did not provide alfred_workflow_bundleid.",
    saveTokenFailed: "Unable to save the Folo token in Alfred.",
  },
  common: {
    tryAnotherQuery: "Try another query",
  },
} as const;
