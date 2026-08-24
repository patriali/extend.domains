// Typed message protocol between the three contexts. Types only — no runtime
// code — so importing this never grows a bundle.

import type { ParsedDomain } from "../lib/domain";
import type { DnsSummary } from "../lib/doh";
import type { SiteMetadata } from "../lib/metadata";
import type { RdapResult } from "../lib/rdap";
import type { ScoreResult } from "../lib/scorer";
import type { WaybackResult } from "../lib/wayback";

/** One progressive data source's slice of the lookup. */
export type SourceState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "unavailable" }
  | { status: "needs-permission" };

export type LookupState =
  | { kind: "idle" }
  | { kind: "invalid"; text: string }
  | {
      kind: "domain";
      domain: ParsedDomain;
      score: ScoreResult;
      dns: SourceState<DnsSummary>;
      rdap: SourceState<RdapResult>;
      meta: SourceState<SiteMetadata>;
      wayback: SourceState<WaybackResult>;
    };

export type DomainLookupState = Extract<LookupState, { kind: "domain" }>;

/** content script → background (also search bar / context menu) */
export interface SelectionMessage {
  type: "selection";
  text: string;
  /** User-initiated lookup (search bar, context menu): show an explicit
   * "not a domain" state on failure instead of staying quiet like a passive
   * page selection does. */
  explicit?: boolean;
  /** When the text is a bare hostname label with no TLD (e.g. "grok" from the
   * search bar), retry the lookup with this TLD appended ("grok" → "grok.com").
   * Only set for typed search queries, never passive page selections. */
  defaultTld?: string;
}

/** sidebar → background; response is the current LookupState */
export interface GetStateMessage {
  type: "getState";
}

/** background → sidebar broadcast */
export interface StateChangedMessage {
  type: "stateChanged";
  state: LookupState;
}

/** sidebar → background: re-run the current lookup (e.g. after a permission
 * grant). `force` additionally drops the cached record first. */
export interface RefreshMessage {
  type: "refresh";
  force?: boolean;
}

export type AnyMessage =
  | SelectionMessage
  | GetStateMessage
  | StateChangedMessage
  | RefreshMessage;
