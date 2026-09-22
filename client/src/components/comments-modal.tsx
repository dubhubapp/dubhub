
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { X, Heart, Check, CheckCircle, Award, Users, XCircle, Flag, MoreHorizontal, ArrowUpDown, MessageCircle, Trash2, Pin, EyeOff, Lock } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { INPUT_LIMITS } from "@shared/input-limits";
import {
  commentMentionsUsername,
  getExcludedMentionUsernamesForAutocomplete,
} from "@shared/mentionParsing";
import { renderCommentMentionNodes } from "@/lib/comment-mention-render";
import {
  DELETED_COMMENT_BODY,
  DELETED_COMMENT_DISPLAY,
  isDeletedCommentBody,
  shouldHideDeletedCommentLeaf,
} from "@shared/deleted-comment";
import { ApiRequestError } from "@/lib/apiDiagnostics";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/lib/user-context";
import type { PostWithUser, CommentWithUser } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { ReportModal } from "./report-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GoldVerifiedTick, goldAvatarGlowShadowClass } from "./verified-artist";
import { getGenreGlowPillStyle, STATUS_GLOW_PILL_BG, STATUS_GLOW_PILL_CLASS } from "@/lib/genre-styles";
import { UserRoleInlineIcons } from "./moderator-shield";
import { useDelayedReleaseFeedSkeleton } from "@/lib/use-delayed-release-feed-skeleton";
import { getDefaultAvatarPublicUrl, isDefaultAvatarUrl } from "@/lib/default-avatar";
import { useUserProfileLightPopup } from "@/components/user-profile-light-popup";
import { formatUsernameDisplay, cn } from "@/lib/utils";
import {
  APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS,
  APP_MATERIAL_OVERLAY_BACKDROP_CLASS,
  APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS,
  APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_TITLE_CLASS,
} from "@/lib/app-material";
import { findCommentInTree } from "@/lib/comment-selection";
import {
  findEarliestCommentIdTaggingArtist,
  isCommentEligibleForArtistConfirmId,
  markViewerArtistRevealedOnPost,
  readAnonymousIdentifyErrorCode,
  resolveAnonymousIdentifyErrorCopy,
  resolveArtistPendingActionsVisible,
  ANONYMOUS_ID_INFO_TITLE,
  ANONYMOUS_ID_INFO_BODY,
} from "@/lib/artist-id-comments-actions";
import { StatInfoPopover } from "@/components/stat-info-popover";
import {
  ANONYMOUS_IDENTIFIED_A11Y_LABEL,
  IDENTIFIED_PILL_LABEL,
  resolvePostIdentificationPresentationKind,
} from "@/lib/post-identification-status";
import { formatAnonymousIdentificationTitleLabel } from "@shared/artist-private-identification";
import { useAuthoritativeSubscriptionStatus } from "@/hooks/use-authoritative-subscription-status";
import { resolvePaidToolGateMode } from "@/lib/paid-tool-gate";
import { requestVerifiedArtistToolsUpgrade } from "@/lib/verified-artist-tools-upgrade";
import { commentsKeyboardDebugEnabled, logCommentsKeyboardSnapshot } from "@/lib/comments-keyboard-debug";
import { playInteractionLight, playSuccessNotification } from "@/lib/haptic";
import {
  MARK_ID_LONG_PRESS_MS,
  armMarkIdLongPressSelectionGuard,
  clearDomTextSelection,
  disarmMarkIdLongPressSelectionGuard,
  isCommentEligibleForOwnerMarkAsId,
  isMarkIdLongPressInteractiveTarget,
  runAcceptedMarkIdLongPress,
  shouldCancelMarkIdLongPressForMove,
} from "@/lib/mark-id-long-press";
import { COMMENTS_HINT_SETTLE_MS } from "@/lib/contextual-coachmark";
import {
  HINT_COMMENTS_COMPLETED_EVENT,
  HINT_COMMENTS_READY_EVENT,
} from "@/lib/onboarding";
import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { setOpenCommentsPostId } from "@/lib/in-app-notification-suppression";
import { readRecentMentionUsers, writeRecentMentionUser } from "@/lib/comment-mention-recent";
import {
  buildMentionSuggestions,
  isValidMentionQuery,
  type MentionSuggestion,
} from "@/lib/comment-mention-suggestions";
import {
  ARTIST_DENIED_MENTION_HINT,
  collectDeniedArtistIdsFromTags,
} from "@shared/artist-video-tag-status";
interface CommentsModalProps {
  post: PostWithUser;
  isOpen: boolean;
  onClose: () => void;
  /** After Vaul close animation finishes. Unmount the host here, not in onClose. */
  onClosed?: () => void;
  /** Local feed count offset (e.g. Random mode post not in query cache). */
  onCommentCountDelta?: (delta: number) => void;
  /** Raise drawer above fullscreen clip overlays (z-[100]). */
  elevatedStack?: boolean;
  /** Owner + unidentified eligibility from VideoCard Mark gate. */
  ownerCommunityMarkEnabled?: boolean;
  /** Open existing CommunityVerificationDialog with this comment preselected. */
  onRequestOwnerCommunityVerify?: (commentId: string) => void;
  /** Tagged verified artist + pending eligibility from VideoCard ID gate. */
  artistPendingActionsEnabled?: boolean;
  /** Open existing ArtistVerificationDialog with this comment preselected (Confirm ID). */
  onRequestArtistConfirmId?: (commentId: string) => void;
  /** Existing artist-deny mutation with a tagging commentId (Not my track). */
  onRequestArtistNotMyTrack?: (commentId: string) => void;
  artistNotMyTrackPending?: boolean;
  /**
   * Paid path: POST /artist-identify-anonymous for the tagged comment.
   * Free / unresolved subscription opens VAT paywall inside the modal instead.
   */
  onRequestArtistIdentifyAnonymously?: (commentId: string) => void;
  artistIdentifyAnonymouslyPending?: boolean;
}

function applyPostPatch(old: unknown, postId: string, patch: (p: PostWithUser) => PostWithUser): unknown {
  if (!old) return old;
  if (Array.isArray(old)) {
    return (old as PostWithUser[]).map((p) => (p?.id === postId ? patch(p) : p));
  }
  if (typeof old === "object" && Array.isArray((old as InfiniteData<{ items?: PostWithUser[] }>).pages)) {
    const paged = old as InfiniteData<{ items?: PostWithUser[] }>;
    return {
      ...paged,
      pages: paged.pages.map((page) => ({
        ...page,
        items: Array.isArray(page.items)
          ? page.items.map((p) => (p?.id === postId ? patch(p) : p))
          : page.items,
      })),
    };
  }
  if (
    typeof old === "object" &&
    typeof (old as PostWithUser).id === "string" &&
    (old as PostWithUser).id === postId
  ) {
    return patch(old as PostWithUser);
  }
  return old;
}

function patchPostInFeedCaches(
  queryClient: QueryClient,
  postId: string,
  patch: (p: PostWithUser) => PostWithUser,
): void {
  queryClient.setQueriesData({ queryKey: ["/api/posts"], exact: false }, (old: unknown) =>
    applyPostPatch(old, postId, patch),
  );
  queryClient.setQueriesData(
    {
      predicate: (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key[0] === "/api/user" &&
          (key[2] === "posts" || key[2] === "liked-posts")
        );
      },
    },
    (old: unknown) => applyPostPatch(old, postId, patch),
  );
}

function bumpPostCommentCount(p: PostWithUser, delta: number): PostWithUser {
  const current = Number((p as { comments?: number }).comments ?? 0);
  return { ...p, comments: Math.max(0, current + delta) };
}

/** Matches previous sheet cap: min(66vh, 33rem). */
const COMMENTS_SHEET_VH_FRACTION = 0.66;
const COMMENTS_SHEET_REM_CAP = 33;

/**
 * Space below the physical top of the visual viewport reserved for status / notch,
 * Vaul drag handle, and Comments header so the sheet never grows under the notch.
 * Single constant — not per-device.
 */
const COMMENTS_SHEET_TOP_RESERVE_PX = 72;

const COMMENTS_SHEET_MIN_PX = 160;

/** Debounce before GET /api/users/search — balances feel vs request volume while typing. */
const MENTION_GLOBAL_SEARCH_DEBOUNCE_MS = 180;

/** Comment ⋯ menu (delete / report) — keep inset from screen edges on mobile. */
const COMMENT_ACTIONS_DROPDOWN_CONTENT_CLASS =
  "z-[70] min-w-[10rem] max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-1 text-gray-900 shadow-lg dark:border-border dark:bg-popover dark:text-popover-foreground";

/** Local Comments sheet fill — opaque navy; do not use the shared 20px-blur sheet token. */
const COMMENTS_SHEET_SURFACE_CLASS =
  "bottom-0 mx-auto mt-0 h-[min(66vh,33rem)] w-full max-w-xl gap-0 rounded-t-3xl border-0 bg-white/95 p-0 shadow-2xl backdrop-blur-sm outline-none dark:bg-[#141a2e] dark:shadow-[0_-16px_56px_-12px_rgba(0,0,0,0.58)] dark:backdrop-blur-sm dark:[background-image:linear-gradient(180deg,rgba(46,62,118,0.32)_0%,rgba(20,26,46,0)_38%)] [&>div:first-child]:bg-black/25 dark:[&>div:first-child]:bg-white/22";

/** Plain header icon control — generous hit target, no visible circle chrome. */
const COMMENTS_HEADER_ICON_BUTTON_CLASS =
  "inline-flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center border-0 bg-transparent p-0 text-gray-500 transition-colors hover:bg-transparent hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a83ff]/45 focus-visible:ring-offset-1 dark:text-white/80 dark:hover:bg-transparent dark:hover:text-white dark:focus-visible:ring-[#0a83ff]/45 dark:focus-visible:ring-offset-[#141a2e]";

/**
 * COMMENTS-CHROME-2E geometry (presentation only).
 *
 * Avatar box: h-7/sm:h-8 with border-2 under border-box → visible outer Ø = 28/32px.
 * Filled send discs read smaller than bordered avatars at equal CSS size, so the
 * send visible Ø is +2px (30/34) to match the avatar’s visible outer circle.
 * Row uses equal outer padding + equal column gaps (no translate/negative margin).
 */
const COMMENTS_COMPOSER_AVATAR_BOX_CLASS = "h-7 w-7 sm:h-8 sm:w-8";
const COMMENTS_COMPOSER_ROW_CLASS =
  "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5";

/**
 * Composer send — visible circle Ø matches avatar outer (28/32 + 2px optical).
 * Visible in both states; enabled lights up, disabled stays muted.
 * Size is constant so input width does not shift when enabling.
 */
const COMMENTS_COMPOSER_SEND_BUTTON_CLASS =
  "inline-flex h-[30px] w-[30px] flex-shrink-0 touch-manipulation items-center justify-center rounded-full border-0 bg-[#0a83ff] p-0 text-white shadow-none transition-colors hover:bg-[#3b9bff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a83ff]/45 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:bg-black/[0.06] disabled:text-gray-400 disabled:hover:bg-black/[0.06] sm:h-[34px] sm:w-[34px] dark:bg-[#0a83ff] dark:text-white dark:hover:bg-[#3b9bff] dark:focus-visible:ring-offset-[#141a2e] dark:disabled:bg-white/[0.08] dark:disabled:text-white/35 dark:disabled:hover:bg-white/[0.08]";

/** Icon footprint inside the send circle (circle itself is avatar-matched). */
const COMMENTS_COMPOSER_SEND_ICON_CLASS = "h-3.5 w-3.5 sm:h-4 sm:w-4";

/**
 * COMMENTS-CHROME-2G: thin outlined upward send arrow (open head, not filled).
 * Chevron is one continuous stroke (left → tip → right); stem is a second subpath
 * from tip down. Tip is a linejoin, not two independent Lucide paths overlapping.
 * Centerline x=12; wings (6.5,10.5)/(17.5,10.5); tip (12,5); stem base (12,19).
 */
function CommentsComposerSendArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        d="M6.5 10.5L12 5L17.5 10.5M12 5V19"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Comment like — 32px hit target, no resting/hover/liked circular disc. */
const COMMENTS_LIKE_BUTTON_CLASS =
  "flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center border-0 bg-transparent p-0 hover:bg-transparent focus:bg-transparent active:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a83ff]/40 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-[#141a2e]";

const COMMENTS_LIKE_BUTTON_LIKED_CLASS = "text-pink-600 dark:text-pink-400";

const COMMENTS_LIKE_BUTTON_UNLIKED_CLASS = "text-gray-500 dark:text-white/40";

/** Canonical Home Identified pill chrome — presentation only. */
const COMMENTS_IDENTIFIED_PILL_CLASS = STATUS_GLOW_PILL_CLASS;

const COMMENTS_IDENTIFIED_PILL_STYLE = getGenreGlowPillStyle(
  STATUS_GLOW_PILL_BG.identified,
  "text-white",
);

function CommentsPostIdentificationPill({
  post,
  testIdPrefix,
}: {
  post: PostWithUser;
  testIdPrefix: string;
}) {
  const kind = resolvePostIdentificationPresentationKind(post);
  if (
    kind !== "artist_verified_anonymous" &&
    kind !== "artist_verified" &&
    kind !== "moderator_identified" &&
    kind !== "community_approved" &&
    kind !== "community"
  ) {
    return null;
  }

  const suffix =
    kind === "artist_verified_anonymous"
      ? "artist-verified-anonymous"
      : kind === "artist_verified"
        ? "artist-identified"
        : kind === "moderator_identified"
          ? "identified"
          : kind === "community_approved"
            ? "community-approved-identified"
            : "community-identified";

  const icon =
    kind === "artist_verified_anonymous" ? (
      <EyeOff className="h-3 w-3 shrink-0 text-white" aria-hidden />
    ) : kind === "artist_verified" ? (
      <GoldVerifiedTick className="h-3 w-3 shrink-0 text-[#FFD700]" />
    ) : kind === "moderator_identified" ? (
      <Check className="h-3 w-3 shrink-0 text-white" />
    ) : (
      <Users className="h-3 w-3 shrink-0" />
    );

  return (
    <span
      className={COMMENTS_IDENTIFIED_PILL_CLASS}
      style={COMMENTS_IDENTIFIED_PILL_STYLE}
      data-testid={`${testIdPrefix}-${suffix}`}
      aria-label={
        kind === "artist_verified_anonymous" ? ANONYMOUS_IDENTIFIED_A11Y_LABEL : undefined
      }
      title={kind === "artist_verified_anonymous" ? ANONYMOUS_IDENTIFIED_A11Y_LABEL : undefined}
    >
      {icon}
      {IDENTIFIED_PILL_LABEL}
    </span>
  );
}

const COMMENTS_THREAD_LINK_CLASS =
  "text-xs font-medium text-[#0a83ff] hover:text-[#3b9bff] dark:text-[#5babff] dark:hover:text-[#7cbcff]";

const COMMENTS_TAGGED_ROW_CLASS =
  "rounded-lg border border-amber-400/25 bg-amber-500/[0.05] p-2";

/** Top-level comments: no hairline; list `space-y-2` is the only separator. */
const COMMENTS_NORMAL_ROW_CLASS = "";

const COMMENTS_PIN_ICON_CLASS =
  "pointer-events-none h-3.5 w-3.5 shrink-0 text-gray-500 dark:text-white/55";

function getAppViewportHostEl(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const root = document.getElementById("root");
  const inner = root?.firstElementChild;
  return inner instanceof HTMLElement ? inner : root;
}

function isActiveSelectionInsideElement(root: HTMLElement | null): boolean {
  if (!root || typeof window === "undefined") return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.toString().length === 0) return false;
  const anchorInside = selection.anchorNode != null && root.contains(selection.anchorNode);
  const focusInside = selection.focusNode != null && root.contains(selection.focusNode);
  return anchorInside || focusInside;
}

/** Lifts a `position:fixed; bottom:0` sheet to sit above the on-screen keyboard. */
function computeCommentsKeyboardBottomInset(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
}

/**
 * Max sheet height: prefer the established large-phone cap, but never exceed what
 * fits in the *visual* viewport (critical when the iOS keyboard is open — `100dvh`
 * / layout height often stay large, which over-shrinks nothing and the OS scrolls
 * the sheet past the top).
 */
function computeCommentsSheetMaxPx(): number {
  if (typeof window === "undefined") {
    return COMMENTS_SHEET_REM_CAP * 16;
  }
  const innerH = window.innerHeight;
  const vv = window.visualViewport;
  const visibleH = vv?.height ?? innerH;
  const preferredCap = Math.min(innerH * COMMENTS_SHEET_VH_FRACTION, COMMENTS_SHEET_REM_CAP * 16);
  const visibleBudget = Math.max(COMMENTS_SHEET_MIN_PX, Math.floor(visibleH - COMMENTS_SHEET_TOP_RESERVE_PX));
  return Math.min(preferredCap, visibleBudget);
}

/** Native iOS keyboard mode keeps layout viewport fixed; cap from innerHeight only. */
function computeCommentsSheetMaxPxWithoutVisualViewport(): number {
  if (typeof window === "undefined") {
    return COMMENTS_SHEET_REM_CAP * 16;
  }
  const innerH = window.innerHeight;
  const preferredCap = Math.min(innerH * COMMENTS_SHEET_VH_FRACTION, COMMENTS_SHEET_REM_CAP * 16);
  const visibleBudget = Math.max(COMMENTS_SHEET_MIN_PX, Math.floor(innerH - COMMENTS_SHEET_TOP_RESERVE_PX));
  return Math.min(preferredCap, visibleBudget);
}

export function CommentsModal({
  post,
  isOpen,
  onClose,
  onClosed,
  onCommentCountDelta,
  elevatedStack = false,
  ownerCommunityMarkEnabled = false,
  onRequestOwnerCommunityVerify,
  artistPendingActionsEnabled = false,
  onRequestArtistConfirmId,
  onRequestArtistNotMyTrack,
  artistNotMyTrackPending = false,
  onRequestArtistIdentifyAnonymously,
  artistIdentifyAnonymouslyPending = false,
}: CommentsModalProps) {
  const drawerStackZ = elevatedStack ? "z-[110]" : "z-[60]";
  const reportDialogStackZ = elevatedStack ? "z-[120]" : "z-[70]";
  const alertDialogStackZ = elevatedStack ? "z-[120]" : "z-[80]";
  const commentActionsDropdownClass = elevatedStack
    ? "z-[120] min-w-[10rem] max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-1 text-gray-900 shadow-lg dark:border-border dark:bg-popover dark:text-popover-foreground"
    : COMMENT_ACTIONS_DROPDOWN_CONTENT_CLASS;

  const closeCommittedRef = useRef(false);
  const drawerContentRef = useRef<HTMLDivElement | null>(null);
  const savedDrawerTouchActionRef = useRef<string | null>(null);
  const markIdLongPressSessionRef = useRef<{
    commentId: string;
    pointerId: number;
    startX: number;
    startY: number;
    holdTimer: ReturnType<typeof setTimeout> | null;
    openTimerCancel: (() => void) | null;
    accepted: boolean;
    rowEl: HTMLElement | null;
  } | null>(null);

  const handleClose = useCallback(() => {
    if (closeCommittedRef.current) return;
    closeCommittedRef.current = true;
    playInteractionLight();
    onClose();
  }, [onClose]);

  const clearMarkIdLongPress = useCallback(() => {
    const session = markIdLongPressSessionRef.current;
    if (!session) return;
    if (session.holdTimer) clearTimeout(session.holdTimer);
    session.openTimerCancel?.();
    disarmMarkIdLongPressSelectionGuard(session.rowEl);
    markIdLongPressSessionRef.current = null;
  }, []);

  useEffect(() => {
    if (!isOpen) clearMarkIdLongPress();
  }, [isOpen, clearMarkIdLongPress]);

  useEffect(() => {
    return () => clearMarkIdLongPress();
  }, [clearMarkIdLongPress]);

  const onMarkIdLongPressPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, commentId: string, commentBody: unknown) => {
      if (!ownerCommunityMarkEnabled || !onRequestOwnerCommunityVerify) return;
      if (!isCommentEligibleForOwnerMarkAsId(commentBody)) return;
      if (isMarkIdLongPressInteractiveTarget(e.target)) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;

      clearMarkIdLongPress();
      const pointerId = e.pointerId;
      const rowEl = e.currentTarget;
      armMarkIdLongPressSelectionGuard(rowEl);

      const holdTimer = setTimeout(() => {
        const session = markIdLongPressSessionRef.current;
        if (!session || session.pointerId !== pointerId || session.accepted) return;
        session.accepted = true;
        if (session.holdTimer) {
          clearTimeout(session.holdTimer);
          session.holdTimer = null;
        }

        const { cancelOpen } = runAcceptedMarkIdLongPress({
          suppressNativeSelection: () => {
            armMarkIdLongPressSelectionGuard(session.rowEl);
            clearDomTextSelection();
          },
          playHaptic: () => playInteractionLight(),
          openDialog: () => {
            const latest = markIdLongPressSessionRef.current;
            if (!latest || latest.pointerId !== pointerId || !latest.accepted) return;
            latest.openTimerCancel = null;
            onRequestOwnerCommunityVerify(commentId);
            // Keep selection guard briefly so a still-held finger does not
            // re-trigger WebKit selection into the newly mounted dialog.
            window.setTimeout(() => {
              disarmMarkIdLongPressSelectionGuard(latest.rowEl);
              if (markIdLongPressSessionRef.current === latest) {
                markIdLongPressSessionRef.current = null;
              }
            }, 180);
          },
        });
        session.openTimerCancel = cancelOpen;
      }, MARK_ID_LONG_PRESS_MS);

      markIdLongPressSessionRef.current = {
        commentId,
        pointerId,
        startX: e.clientX,
        startY: e.clientY,
        holdTimer,
        openTimerCancel: null,
        accepted: false,
        rowEl,
      };
    },
    [clearMarkIdLongPress, onRequestOwnerCommunityVerify, ownerCommunityMarkEnabled],
  );

  const onMarkIdLongPressPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const session = markIdLongPressSessionRef.current;
      if (!session || session.accepted || session.pointerId !== e.pointerId) return;
      if (
        shouldCancelMarkIdLongPressForMove(session.startX, session.startY, e.clientX, e.clientY)
      ) {
        clearMarkIdLongPress();
      }
    },
    [clearMarkIdLongPress],
  );

  const onMarkIdLongPressPointerEnd = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const session = markIdLongPressSessionRef.current;
      if (!session || session.pointerId !== e.pointerId) return;
      // Short press / cancelled hold: clear. Accepted: leave open delay running.
      if (!session.accepted) {
        clearMarkIdLongPress();
        return;
      }
      clearDomTextSelection();
    },
    [clearMarkIdLongPress],
  );

  const bindMarkIdLongPressHandlers = useCallback(
    (commentId: string, commentBody: unknown) => {
      if (!ownerCommunityMarkEnabled || !onRequestOwnerCommunityVerify) return {};
      if (!isCommentEligibleForOwnerMarkAsId(commentBody)) return {};
      return {
        onPointerDown: (e: ReactPointerEvent<HTMLElement>) =>
          onMarkIdLongPressPointerDown(e, commentId, commentBody),
        onPointerMove: onMarkIdLongPressPointerMove,
        onPointerUp: onMarkIdLongPressPointerEnd,
        onPointerCancel: onMarkIdLongPressPointerEnd,
        onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
          e.preventDefault();
        },
      };
    },
    [
      onMarkIdLongPressPointerDown,
      onMarkIdLongPressPointerEnd,
      onMarkIdLongPressPointerMove,
      onRequestOwnerCommunityVerify,
      ownerCommunityMarkEnabled,
    ],
  );

  const [newComment, setNewComment] = useState("");
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const [artistSearchTerm, setArtistSearchTerm] = useState("");
  const [currentMentionStart, setCurrentMentionStart] = useState(-1);
  const mentionQueryEndRef = useRef(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportingComment, setReportingComment] = useState<{id: string, userId: string} | null>(null);
  const [deleteConfirmCommentId, setDeleteConfirmCommentId] = useState<string | null>(null);
  const [showNotMyTrackConfirm, setShowNotMyTrackConfirm] = useState(false);
  const [showRevealIdConfirm, setShowRevealIdConfirm] = useState(false);
  const [nativeKeyboardInsetPx, setNativeKeyboardInsetPx] = useState(0);
  const [nativeKeyboardLayoutActive, setNativeKeyboardLayoutActive] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    profileImage: userProfileImage,
    username: contextUsername,
    currentUser: contextUser,
    verifiedArtist,
    userType,
    isModerator,
  } = useUser();
  const debugComments = commentsKeyboardDebugEnabled();
  const debugKeyboardTiming = commentsKeyboardDebugEnabled() || debugComments;
  const composerFieldId = useId();
  /** Set while comments viewport lock is active; used to resync offset immediately on composer focus. */
  const viewportHostVvSyncRef = useRef<(() => void) | null>(null);

  const { openByUsername, popup: userProfilePopup } = useUserProfileLightPopup({
    verifiedArtistsEnabled: isOpen,
    presentation: "sheet",
    sheetStack: "above-comments",
  });

  const openCommentAuthorPreview = useCallback(
    (
      e: { clientX: number; clientY: number; preventDefault?: () => void; stopPropagation?: () => void },
      author: {
        id?: string;
        username?: string | null;
        avatar_url?: string | null;
        account_type?: string;
        verified_artist?: boolean;
        moderator?: boolean;
      },
    ) => {
      e.preventDefault?.();
      e.stopPropagation?.();
      const username = author.username?.trim();
      if (!username) return;
      openByUsername(username, {
        anchor: { x: e.clientX, y: e.clientY },
        reopenCommentsPostId: post.id,
        seed: {
          id: author.id,
          avatar_url: author.avatar_url,
          account_type: author.account_type,
          verified_artist: author.verified_artist,
          moderator: author.moderator,
        },
      });
    },
    [openByUsername, post.id],
  );

  const restoreDrawerTouchAction = useCallback(() => {
    const drawer = drawerContentRef.current;
    if (!drawer) return;
    if (savedDrawerTouchActionRef.current !== null) {
      drawer.style.touchAction = savedDrawerTouchActionRef.current;
      savedDrawerTouchActionRef.current = null;
    } else {
      drawer.style.removeProperty("touch-action");
    }
  }, []);

  const syncDrawerTouchActionForSelection = useCallback(() => {
    const drawer = drawerContentRef.current;
    if (!drawer) return;
    if (isActiveSelectionInsideElement(drawer)) {
      if (savedDrawerTouchActionRef.current === null) {
        savedDrawerTouchActionRef.current = drawer.style.touchAction;
        drawer.style.touchAction = "auto";
      }
      return;
    }
    restoreDrawerTouchAction();
  }, [restoreDrawerTouchAction]);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    const onSelectionChange = () => syncDrawerTouchActionForSelection();
    document.addEventListener("selectionchange", onSelectionChange);
    onSelectionChange();
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      restoreDrawerTouchAction();
    };
  }, [isOpen, restoreDrawerTouchAction, syncDrawerTouchActionForSelection]);

  const handleCommentBodyPointerDown = useCallback((e: ReactPointerEvent<HTMLParagraphElement>) => {
    if (isActiveSelectionInsideElement(drawerContentRef.current)) {
      e.stopPropagation();
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    closeCommittedRef.current = false;
    playInteractionLight();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) setOpenCommentsPostId(post.id);
  }, [isOpen, post.id]);

  useEffect(() => {
    return () => setOpenCommentsPostId(null);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (debugComments) {
      console.log("[CommentsModal] opened", {
        modalPostId: post.id,
        queryKey: ["/api/posts", post.id, "comments"],
      });
    }
  }, [isOpen, post.id, debugComments]);

  useEffect(() => {
    if (!isOpen || !debugKeyboardTiming) return;
    console.log("[CommentsModal][kbd-timing] instrumentation-active", {
      postId: post.id,
      search: typeof window !== "undefined" ? window.location.search : "",
      localStorageLegacy: typeof window !== "undefined" ? localStorage.getItem("dubhub-debug-comments-keyboard") : null,
      localStorageNative: typeof window !== "undefined" ? localStorage.getItem("dubhub.debug.commentsKeyboard") : null,
    });
  }, [debugKeyboardTiming, isOpen, post.id]);

  /**
   * Keep shell `pb-[var(--app-bottom-nav-block)]` identical for the whole time comments are open.
   * Freezing avoids iOS keyboard / dynamic safe-area changes fighting `--app-bottom-nav-block`
   * (which includes `env(safe-area-inset-bottom)`) and shifting the feed.
   */
  useLayoutEffect(() => {
    if (typeof document === "undefined" || !isOpen) return;
    const frozen = getComputedStyle(document.documentElement).getPropertyValue("--app-bottom-nav-block").trim();
    if (!frozen) return;
    document.body.style.setProperty("--app-bottom-nav-block", frozen);
    return () => {
      document.body.style.removeProperty("--app-bottom-nav-block");
    };
  }, [isOpen]);

  /**
   * Pin the React viewport host (everything under #root except portaled drawers) while comments
   * are open, and counteract Mobile Safari’s visual-viewport pan when the composer focuses so the
   * feed/video does not slide upward. The drawer stays outside this host and gets its own
   * `bottom` inset from `computeCommentsKeyboardBottomInset()` so only the sheet rides above the keyboard.
   */
  useLayoutEffect(() => {
    if (typeof document === "undefined" || !isOpen) return;
    const host = getAppViewportHostEl();
    if (!host) return;

    const lockH = Math.round(Math.max(window.innerHeight, window.visualViewport?.height ?? 0));

    if (commentsKeyboardDebugEnabled()) {
      document.documentElement.style.setProperty("--comments-app-lock-px", `${lockH}px`);
    }

    let rafFollowUpId = 0;

    const syncVvOffset = () => {
      const vv = window.visualViewport;
      const y = vv ? Math.round(vv.offsetTop) : 0;
      if (y) {
        host.style.transform = `translate3d(0, ${y}px, 0)`;
      } else {
        host.style.removeProperty("transform");
      }
    };

    /** Apply immediately (same tick as WebKit’s viewport change) plus one rAF so we match layout after paint. */
    const syncVvOffsetThorough = () => {
      logKeyboardTiming("viewport-host-sync:start");
      syncVvOffset();
      if (rafFollowUpId) cancelAnimationFrame(rafFollowUpId);
      logKeyboardTiming("viewport-host-sync:raf-scheduled");
      rafFollowUpId = requestAnimationFrame(() => {
        rafFollowUpId = 0;
        logKeyboardTiming("viewport-host-sync:raf-fired");
        syncVvOffset();
      });
    };

    viewportHostVvSyncRef.current = syncVvOffsetThorough;

    const applyLock = () => {
      host.style.position = "fixed";
      host.style.top = "0";
      host.style.left = "0";
      host.style.width = "100%";
      host.style.height = `${lockH}px`;
      host.style.maxHeight = `${lockH}px`;
      host.style.overflow = "hidden";
      host.style.boxSizing = "border-box";
      /* Interpolating `transform` lags behind `offsetTop` during the iOS keyboard animation → visible jump. */
      host.style.transition = "none";
      host.style.willChange = "transform";
      syncVvOffsetThorough();
    };

    applyLock();

    const vv = window.visualViewport;
    const onVv = () => {
      logKeyboardTiming("viewport-host-sync:event");
      syncVvOffsetThorough();
    };
    vv?.addEventListener("resize", onVv);
    vv?.addEventListener("scroll", onVv);
    window.addEventListener("resize", onVv);

    return () => {
      viewportHostVvSyncRef.current = null;
      if (rafFollowUpId) cancelAnimationFrame(rafFollowUpId);
      vv?.removeEventListener("resize", onVv);
      vv?.removeEventListener("scroll", onVv);
      window.removeEventListener("resize", onVv);
      host.style.removeProperty("position");
      host.style.removeProperty("top");
      host.style.removeProperty("left");
      host.style.removeProperty("width");
      host.style.removeProperty("height");
      host.style.removeProperty("max-height");
      host.style.removeProperty("overflow");
      host.style.removeProperty("box-sizing");
      host.style.removeProperty("transform");
      host.style.removeProperty("transition");
      host.style.removeProperty("will-change");
      if (commentsKeyboardDebugEnabled()) {
        document.documentElement.style.removeProperty("--comments-app-lock-px");
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const body = document.body;
    let dismissPullGuardTimer: number | null = null;

    const clearDismissPullGuardTimer = () => {
      if (dismissPullGuardTimer != null) {
        clearTimeout(dismissPullGuardTimer);
        dismissPullGuardTimer = null;
      }
    };

    if (isOpen) {
      clearDismissPullGuardTimer();
      body.classList.remove("comments-dismiss-pull-guard");
      root.classList.add("comments-modal-open");
      body.classList.add("comments-modal-open");
      if (commentsKeyboardDebugEnabled()) {
        queueMicrotask(() => logCommentsKeyboardSnapshot("after-modal-open", { postId: post.id }));
      }
    } else {
      root.classList.remove("comments-modal-open");
      body.classList.remove("comments-modal-open");
      clearDismissPullGuardTimer();
      body.classList.add("comments-dismiss-pull-guard");
      logKeyboardTiming("dismiss-pull-guard-timeout:scheduled", { delayMs: 520 });
      dismissPullGuardTimer = window.setTimeout(() => {
        logKeyboardTiming("dismiss-pull-guard-timeout:fired");
        dismissPullGuardTimer = null;
        body.classList.remove("comments-dismiss-pull-guard");
      }, 520);
    }

    return () => {
      clearDismissPullGuardTimer();
      body.classList.remove("comments-dismiss-pull-guard");
      if (isOpen) {
        root.classList.remove("comments-modal-open");
        body.classList.remove("comments-modal-open");
      }
    };
  }, [isOpen, post.id]);

  useEffect(() => {
    if (!isOpen || !commentsKeyboardDebugEnabled()) return;
    const vv = window.visualViewport;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onVv = () => {
      logKeyboardTiming("debug-vv-listener:event");
      clearTimeout(t);
      logKeyboardTiming("debug-vv-listener:timeout-scheduled", { delayMs: 80 });
      t = setTimeout(() => {
        logKeyboardTiming("debug-vv-listener:timeout-fired", { delayMs: 80 });
        logCommentsKeyboardSnapshot("visual-viewport-resize");
      }, 80);
    };
    vv?.addEventListener("resize", onVv);
    vv?.addEventListener("scroll", onVv);
    let moT: ReturnType<typeof setTimeout> | undefined;
    const mo = new MutationObserver(() => {
      clearTimeout(moT);
      logKeyboardTiming("debug-mutation-listener:timeout-scheduled", { delayMs: 80 });
      moT = setTimeout(() => {
        logKeyboardTiming("debug-mutation-listener:timeout-fired", { delayMs: 80 });
        logCommentsKeyboardSnapshot("html-body-style-mutation");
      }, 80);
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    return () => {
      vv?.removeEventListener("resize", onVv);
      vv?.removeEventListener("scroll", onVv);
      mo.disconnect();
      clearTimeout(t);
      clearTimeout(moT);
    };
  }, [isOpen]);

  // Format time ago helper function
  const formatTimeAgo = (date: string | Date | null) => {
    if (!date) return "Recently";
    const now = new Date();
    const commentDate = typeof date === 'string' ? new Date(date) : date;
    const diffInMinutes = Math.floor((now.getTime() - commentDate.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const REPLY_BATCH_SIZE = 3;
  // Per-parent-thread visible reply count (0 = collapsed)
  const [visibleReplyCountByParent, setVisibleReplyCountByParent] = useState<Record<string, number>>({});
  const [replyingTo, setReplyingTo] = useState<{id: string, username: string} | null>(null);
  const [commentFilter, setCommentFilter] = useState<'all' | 'newest' | 'top'>('all');
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const commentsListRef = useRef<HTMLDivElement | null>(null);

  const scrollToPostedComment = useCallback(
    (commentId: string, opts: { isReply: boolean; parentId?: string }) => {
      const run = () => {
        const listEl = commentsListRef.current;
        if (!listEl) return;

        if (!opts.isReply) {
          if (commentFilter === "top") {
            const target = listEl.querySelector(`[data-comment-id="${commentId}"]`);
            if (target instanceof HTMLElement) {
              target.scrollIntoView({ block: "nearest" });
            } else {
              listEl.scrollTop = listEl.scrollHeight;
            }
          } else {
            listEl.scrollTop = 0;
          }
          return;
        }

        const replyTarget = listEl.querySelector(`[data-comment-id="${commentId}"]`);
        if (replyTarget instanceof HTMLElement) {
          replyTarget.scrollIntoView({ block: "nearest" });
          return;
        }
        if (opts.parentId) {
          const parentTarget = listEl.querySelector(`[data-comment-id="${opts.parentId}"]`);
          if (parentTarget instanceof HTMLElement) {
            parentTarget.scrollIntoView({ block: "nearest" });
          }
        }
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(run);
      });
    },
    [commentFilter],
  );
  const [, bumpForVisualViewport] = useReducer((x: number) => x + 1, 0);
  const postArtistVerifiedBy = (post as any).artistVerifiedBy ?? (post as any).artist_verified_by;
  const isArtistIdentifiedPost = !!((post as any).isVerifiedArtist ?? (post as any).is_verified_artist) && !!postArtistVerifiedBy;
  const shouldShowArtistSelfTagPlaceholder =
    !!contextUser?.id &&
    userType === "artist" &&
    verifiedArtist &&
    !isArtistIdentifiedPost;
  const commentsSheetMaxPx = isOpen
    ? nativeKeyboardLayoutActive
      ? computeCommentsSheetMaxPxWithoutVisualViewport()
      : computeCommentsSheetMaxPx()
    : null;
  const commentsKeyboardBottomInset = isOpen
    ? nativeKeyboardLayoutActive
      ? nativeKeyboardInsetPx
      : computeCommentsKeyboardBottomInset()
    : 0;

  function logKeyboardTiming(phase: string, extra?: Record<string, unknown>) {
    if (!debugKeyboardTiming || typeof window === "undefined") return;
    const vv = window.visualViewport;
    const composerRect = commentInputRef.current?.getBoundingClientRect();
    const drawerRect = drawerContentRef.current?.getBoundingClientRect();
    const drawerStyle = drawerContentRef.current ? getComputedStyle(drawerContentRef.current) : null;
    const keyboardInset = vv
      ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      : 0;

    console.log("[CommentsModal][kbd-timing]", {
      phase,
      tPerfMs: Math.round(performance.now() * 100) / 100,
      tIso: new Date().toISOString(),
      isOpen,
      innerHeight: window.innerHeight,
      visualViewportHeight: vv?.height ?? null,
      visualViewportOffsetTop: vv?.offsetTop ?? null,
      computedKeyboardInset: keyboardInset,
      drawerBottom: drawerStyle?.bottom ?? null,
      commentsSheetMaxPx,
      nativeKeyboardLayoutActive,
      nativeKeyboardInsetPx,
      effectiveDrawerBottomInset: commentsKeyboardBottomInset,
      composerRect: composerRect
        ? {
            top: Math.round(composerRect.top * 100) / 100,
            bottom: Math.round(composerRect.bottom * 100) / 100,
            height: Math.round(composerRect.height * 100) / 100,
          }
        : null,
      drawerRect: drawerRect
        ? {
            top: Math.round(drawerRect.top * 100) / 100,
            bottom: Math.round(drawerRect.bottom * 100) / 100,
            height: Math.round(drawerRect.height * 100) / 100,
          }
        : null,
      ...extra,
    });
  }

  useEffect(() => {
    if (!isOpen) {
      setNativeKeyboardInsetPx(0);
      setNativeKeyboardLayoutActive(false);
      return;
    }
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
      setNativeKeyboardInsetPx(0);
      setNativeKeyboardLayoutActive(false);
      return;
    }

    let cancelled = false;
    let previousResizeMode: KeyboardResize | null = null;
    let removeWillShow: (() => Promise<void>) | null = null;
    let removeWillHide: (() => Promise<void>) | null = null;
    let removeDidHide: (() => Promise<void>) | null = null;
    const onWindowResize = () => {
      logKeyboardTiming("native-ios:window-resize-observed");
    };

    const setupNativeKeyboardMode = async () => {
      try {
        const current = await Keyboard.getResizeMode();
        previousResizeMode = current?.mode ?? KeyboardResize.Native;
      } catch {
        previousResizeMode = KeyboardResize.Native;
      }

      try {
        await Keyboard.setResizeMode({ mode: KeyboardResize.None });
        if (cancelled) return;
        setNativeKeyboardLayoutActive(true);
        logKeyboardTiming("native-ios:resize-mode-set-none");
      } catch (err) {
        if (!cancelled) {
          setNativeKeyboardLayoutActive(false);
          setNativeKeyboardInsetPx(0);
          logKeyboardTiming("native-ios:resize-mode-set-none-failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      window.addEventListener("resize", onWindowResize);

      try {
        const h = await Keyboard.addListener("keyboardWillShow", (info) => {
          const height = Math.max(0, Math.round((info as { keyboardHeight?: number }).keyboardHeight ?? 0));
          logKeyboardTiming("native-ios:keyboardWillShow", { keyboardHeight: height });
          setNativeKeyboardInsetPx(height);
        });
        removeWillShow = () => h.remove();
      } catch (err) {
        logKeyboardTiming("native-ios:keyboardWillShow-listener-failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        const h = await Keyboard.addListener("keyboardWillHide", () => {
          logKeyboardTiming("native-ios:keyboardWillHide");
          setNativeKeyboardInsetPx(0);
        });
        removeWillHide = () => h.remove();
      } catch (err) {
        logKeyboardTiming("native-ios:keyboardWillHide-listener-failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        const h = await Keyboard.addListener("keyboardDidHide", () => {
          logKeyboardTiming("native-ios:keyboardDidHide");
          setNativeKeyboardInsetPx(0);
        });
        removeDidHide = () => h.remove();
      } catch (err) {
        logKeyboardTiming("native-ios:keyboardDidHide-listener-failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    void setupNativeKeyboardMode();

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onWindowResize);
      setNativeKeyboardInsetPx(0);
      setNativeKeyboardLayoutActive(false);
      void removeWillShow?.();
      void removeWillHide?.();
      void removeDidHide?.();
      const restoreMode = previousResizeMode ?? KeyboardResize.Native;
      void Keyboard.setResizeMode({ mode: restoreMode })
        .then(() => {
          logKeyboardTiming("native-ios:resize-mode-restored", { mode: restoreMode });
        })
        .catch((err) => {
          logKeyboardTiming("native-ios:resize-mode-restore-failed", {
            mode: restoreMode,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const vv = window.visualViewport;
    const bump = (reason: string) => {
      logKeyboardTiming("layout-bump:before", { reason });
      bumpForVisualViewport();
      logKeyboardTiming("layout-bump:after", { reason });
      requestAnimationFrame(() => {
        logKeyboardTiming("layout-bump:after-raf", { reason });
      });
    };
    const onVvResize = () => {
      logKeyboardTiming("visualViewport:resize:before");
      bump("visualViewport.resize");
      logKeyboardTiming("visualViewport:resize:after");
      requestAnimationFrame(() => logKeyboardTiming("visualViewport:resize:after-raf"));
    };
    const onVvScroll = () => {
      logKeyboardTiming("visualViewport:scroll:before");
      bump("visualViewport.scroll");
      logKeyboardTiming("visualViewport:scroll:after");
      requestAnimationFrame(() => logKeyboardTiming("visualViewport:scroll:after-raf"));
    };
    const onWindowResize = () => {
      logKeyboardTiming("window:resize:before");
      bump("window.resize");
      logKeyboardTiming("window:resize:after");
      requestAnimationFrame(() => logKeyboardTiming("window:resize:after-raf"));
    };
    logKeyboardTiming("layout-bump:effect-mounted");
    bump("effect-mount");
    vv?.addEventListener("resize", onVvResize);
    vv?.addEventListener("scroll", onVvScroll);
    window.addEventListener("resize", onWindowResize);
    return () => {
      logKeyboardTiming("layout-bump:effect-cleanup");
      vv?.removeEventListener("resize", onVvResize);
      vv?.removeEventListener("scroll", onVvScroll);
      window.removeEventListener("resize", onWindowResize);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    logKeyboardTiming("layout-values:render");
  }, [commentsKeyboardBottomInset, commentsSheetMaxPx, isOpen]);

  useEffect(() => {
    logKeyboardTiming("modal-open-state-change");
  }, [isOpen]);

  const {
    data: commentsData,
    isLoading: isLoadingComments,
    isFetching: isFetchingComments,
  } = useQuery<CommentWithUser[]>({
    queryKey: ["/api/posts", post.id, "comments"],
    queryFn: async () => {
      if (debugComments) {
        console.log("[CommentsModal] fetching", { modalPostId: post.id, url: `/api/posts/${post.id}/comments` });
      }
      const response = await apiRequest("GET", `/api/posts/${post.id}/comments`);
      const data = await response.json();
      if (!Array.isArray(data)) {
        console.warn("[DubHub][CommentsModal] Non-array comments payload", data);
      }
      if (debugComments) {
        console.log("[CommentsModal] fetched", {
          modalPostId: post.id,
          payloadType: Array.isArray(data) ? "array" : typeof data,
          rootCount: Array.isArray(data) ? data.length : null,
        });
      }
      return Array.isArray(data) ? data : [];
    },
    enabled: isOpen,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const comments = Array.isArray(commentsData) ? commentsData : [];
  const isAnonymousIdentifiedPost =
    resolvePostIdentificationPresentationKind(post) === "artist_verified_anonymous";
  const anonymousTrackTitleLabel = formatAnonymousIdentificationTitleLabel(
    (post as { anonymousTrackTitle?: string | null }).anonymousTrackTitle ??
      (post as { anonymous_track_title?: string | null }).anonymous_track_title,
  );

  /** Owner-only: existing GET returns 404 for non-owners (no identity leak). */
  const { data: ownerPrivateClaim } = useQuery<{
    claim?: { state?: string; trackTitle?: string | null; artistId?: string };
  } | null>({
    queryKey: ["/api/posts", post.id, "artist-private-identification"],
    queryFn: async () => {
      try {
        const res = await apiRequest(
          "GET",
          `/api/posts/${post.id}/artist-private-identification`,
        );
        return (await res.json()) as {
          claim?: { state?: string; trackTitle?: string | null; artistId?: string };
        };
      } catch {
        return null;
      }
    },
    enabled: isOpen && isAnonymousIdentifiedPost && !!verifiedArtist && !!contextUser?.id,
    staleTime: 0,
    retry: false,
  });
  const ownsAnonymousClaim =
    ownerPrivateClaim?.claim?.state === "anonymous" &&
    !!contextUser?.id &&
    ownerPrivateClaim.claim.artistId === contextUser.id;

  const reviewingArtistIdentity = useMemo(() => {
    if (!contextUser?.id || !verifiedArtist) return null;
    return {
      id: String(contextUser.id),
      username: contextUsername ?? contextUser.username ?? null,
    };
  }, [contextUser?.id, contextUser?.username, contextUsername, verifiedArtist]);
  const artistTagActionsVisible = useMemo(
    () =>
      resolveArtistPendingActionsVisible({
        post,
        currentUserId: contextUser?.id ?? null,
        verifiedArtist,
        feedFlagEnabled: artistPendingActionsEnabled,
        comments,
        artist: reviewingArtistIdentity,
      }),
    [
      artistPendingActionsEnabled,
      comments,
      contextUser?.id,
      post,
      reviewingArtistIdentity,
      verifiedArtist,
    ],
  );
  const reviewingArtistForIdActions = artistTagActionsVisible ? reviewingArtistIdentity : null;
  const notMyTrackCommentId = useMemo(() => {
    if (!reviewingArtistForIdActions) return null;
    return findEarliestCommentIdTaggingArtist(comments, reviewingArtistForIdActions);
  }, [comments, reviewingArtistForIdActions]);
  const subscription = useAuthoritativeSubscriptionStatus({
    enabled: isOpen && artistTagActionsVisible,
  });
  const anonymousIdentifyGateMode = resolvePaidToolGateMode({
    enabled: artistTagActionsVisible,
    loading: subscription.loading,
    hasError: subscription.error != null,
    selection: subscription.selection,
  });
  const anonymousIdentifyEntitled = anonymousIdentifyGateMode === "available";
  const verifiedCommentId =
    post.verifiedCommentId ??
    (post as { verified_comment_id?: string | null }).verified_comment_id ??
    null;
  const verifiedReplyPin = useMemo(() => {
    if (!verifiedCommentId || comments.length === 0) return null;
    const found = findCommentInTree(comments, verifiedCommentId);
    if (!found?.isReply) return null;
    return found;
  }, [comments, verifiedCommentId]);

  // When the verified ID is a reply, expand its parent thread so the in-thread copy is visible.
  useEffect(() => {
    if (!isOpen || !verifiedReplyPin?.parentId) return;
    const parentLookup = findCommentInTree(comments, verifiedReplyPin.parentId);
    const totalReplies = parentLookup?.comment.replies?.length ?? 0;
    if (totalReplies === 0) return;

    const parentId = verifiedReplyPin.parentId;
    setVisibleReplyCountByParent((prev) => {
      const current = prev[parentId] ?? 0;
      if (current >= totalReplies) return prev;
      return { ...prev, [parentId]: totalReplies };
    });
  }, [isOpen, verifiedReplyPin?.parentId, verifiedReplyPin?.comment.id, comments]);

  const shouldShowCommentsLoadingState =
    isOpen && commentsData === undefined && (isLoadingComments || isFetchingComments);
  const showCommentsSkeleton = useDelayedReleaseFeedSkeleton(shouldShowCommentsLoadingState);

  // Get verified artists for auto-complete
  const { data: verifiedArtists = [] } = useQuery<any[]>({
    queryKey: ["/api/artists/verified"],
    enabled: isOpen,
  });

  const { data: postArtistTags = [] } = useQuery<
    Array<{ artist_id?: string; artistId?: string; status?: string }>
  >({
    queryKey: ["/api/posts", post.id, "artist-tags"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/${post.id}/artist-tags`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: isOpen && !!post.id,
    staleTime: 30_000,
  });

  const deniedArtistIdsOnPost = useMemo(
    () => collectDeniedArtistIdsFromTags(postArtistTags),
    [postArtistTags],
  );
  const { data: apiCurrentUser } = useQuery({
    queryKey: ["/api/user/current"],
    enabled: isOpen,
  });

  const isViewerVerifiedArtist = useMemo(
    () =>
      verifiedArtist ||
      (contextUser?.account_type === "artist" && contextUser?.verified_artist === true) ||
      (apiCurrentUser as { verified_artist?: boolean } | null | undefined)?.verified_artist === true,
    [verifiedArtist, contextUser?.account_type, contextUser?.verified_artist, apiCurrentUser],
  );

  const selfUsernameCandidates = useMemo(() => {
    const candidates = [
      contextUsername,
      contextUser?.username,
      (apiCurrentUser as { username?: string } | null | undefined)?.username,
    ];
    const normalized = new Set<string>();
    for (const candidate of candidates) {
      const value = candidate?.trim().toLowerCase();
      if (value) normalized.add(value);
    }
    return normalized;
  }, [contextUsername, contextUser?.username, apiCurrentUser]);

  const selfVerifiedArtistUsername = useMemo(() => {
    if (!isViewerVerifiedArtist || selfUsernameCandidates.size === 0) return null;
    return selfUsernameCandidates.values().next().value ?? null;
  }, [isViewerVerifiedArtist, selfUsernameCandidates]);

  const verifiedArtistUsernameSet = useMemo(() => {
    const set = new Set<string>();
    for (const artist of verifiedArtists) {
      const normalized = artist.username?.trim().toLowerCase();
      if (normalized) set.add(normalized);
    }
    if (selfVerifiedArtistUsername) {
      set.add(selfVerifiedArtistUsername);
    }
    const addVerifiedParticipant = (user: CommentWithUser["user"] | PostWithUser["user"] | undefined) => {
      if (user?.verified_artist && user.username?.trim()) {
        set.add(user.username.trim().toLowerCase());
      }
    };
    addVerifiedParticipant(post.user);
    const walkComments = (items: CommentWithUser[]) => {
      for (const comment of items) {
        addVerifiedParticipant(comment.user);
        if (comment.replies?.length) walkComments(comment.replies);
      }
    };
    walkComments(comments);
    return set;
  }, [verifiedArtists, selfVerifiedArtistUsername, post.user, comments]);

  const isVerifiedArtistUsername = useCallback(
    (username: string) => {
      const normalized = username.trim().toLowerCase();
      if (!normalized) return false;
      if (isViewerVerifiedArtist && selfUsernameCandidates.has(normalized)) return true;
      return verifiedArtistUsernameSet.has(normalized);
    },
    [isViewerVerifiedArtist, selfUsernameCandidates, verifiedArtistUsernameSet],
  );

  const highlightArtistMentions = useCallback(
    (text: string, tagStatus?: "pending" | "confirmed" | "denied") =>
      renderCommentMentionNodes(text, isVerifiedArtistUsername, {
        tagStatus,
        onMentionClick: (username, e) => {
          const verified = isVerifiedArtistUsername(username);
          openByUsername(username, {
            anchor: { x: e.clientX, y: e.clientY },
            reopenCommentsPostId: post.id,
            seed: verified
              ? { verified_artist: true, account_type: "artist" }
              : null,
          });
        },
      }),
    [isVerifiedArtistUsername, openByUsername, post.id],
  );

  // Note: karma display has been removed from the comments UI to avoid stray numeric artifacts near names.

  // Handle comment input changes and @mention detection
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart || 0;

    setNewComment(value);

    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);

      if (
        textAfterAt.length >= 0 &&
        !/\s/.test(textAfterAt) &&
        isValidMentionQuery(textAfterAt)
      ) {
        setArtistSearchTerm(textAfterAt);
        setCurrentMentionStart(lastAtIndex);
        mentionQueryEndRef.current = cursorPosition;
        setShowArtistDropdown(true);
      } else {
        setShowArtistDropdown(false);
      }
    } else {
      setShowArtistDropdown(false);
    }
  };

  const handleMentionSelect = (suggestion: MentionSuggestion) => {
    if (suggestion.disabled) return;
    const mentionStart = currentMentionStart;
    const mentionEnd = mentionQueryEndRef.current;
    if (mentionStart !== -1) {
      const insertion = `@${suggestion.username.trim()} `;
      const beforeMention = newComment.substring(0, mentionStart);
      const afterMention = newComment.substring(mentionEnd);
      const newValue = `${beforeMention}${insertion}${afterMention}`;
      setNewComment(newValue);

      const cursorPos = beforeMention.length + insertion.length;
      requestAnimationFrame(() => {
        const el = commentInputRef.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        el.setSelectionRange(cursorPos, cursorPos);
      });
    }

    if (contextUser?.id) {
      const isSelf = suggestion.userId === contextUser.id;
      if (!isSelf || suggestion.isPinnedSelf) {
        writeRecentMentionUser(contextUser.id, {
          userId: suggestion.userId,
          username: suggestion.username,
          avatar_url: suggestion.avatar_url,
          verified_artist: suggestion.verified_artist,
        });
      }
    }

    setShowArtistDropdown(false);
    setArtistSearchTerm("");
    setCurrentMentionStart(-1);
  };

  const shouldPinCurrentArtistInMentions = userType === "artist" && verifiedArtist && !!contextUsername;
  const normalizedContextUsername = (contextUsername ?? "").toLowerCase();

  const threadParticipants = useMemo((): MentionSuggestion[] => {
    const byId = new Map<string, MentionSuggestion>();
    const addParticipant = (user: CommentWithUser["user"] | PostWithUser["user"] | undefined) => {
      if (!user?.id || !user.username) return;
      if (byId.has(user.id)) return;
      byId.set(user.id, {
        userId: user.id,
        username: user.username,
        avatar_url: user.avatar_url ?? null,
        verified_artist: user.verified_artist === true,
        source: "thread",
      });
    };

    addParticipant(post.user);
    const walkComments = (items: CommentWithUser[]) => {
      for (const comment of items) {
        addParticipant(comment.user);
        if (comment.replies?.length) {
          walkComments(comment.replies);
        }
      }
    };
    walkComments(comments);
    return Array.from(byId.values());
  }, [post.user, comments]);

  const [debouncedMentionQuery, setDebouncedMentionQuery] = useState("");

  useEffect(() => {
    if (!showArtistDropdown) {
      setDebouncedMentionQuery("");
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedMentionQuery(artistSearchTerm);
    }, MENTION_GLOBAL_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [artistSearchTerm, showArtistDropdown]);

  const trimmedDebouncedMentionQuery = debouncedMentionQuery.trim();
  const shouldFetchGlobalMentionSearch =
    isOpen &&
    showArtistDropdown &&
    trimmedDebouncedMentionQuery.length >= 2 &&
    isValidMentionQuery(trimmedDebouncedMentionQuery);

  const {
    data: globalMentionSearchUsers = [],
    isFetching: isFetchingGlobalMentionSearch,
    isFetched: isGlobalMentionSearchFetched,
  } = useQuery<
    {
      id: string;
      username: string;
      avatar_url?: string | null;
      verified_artist?: boolean;
    }[]
  >({
    queryKey: ["/api/users/search", trimmedDebouncedMentionQuery],
    queryFn: async () => {
      const q = encodeURIComponent(trimmedDebouncedMentionQuery);
      const res = await apiRequest("GET", `/api/users/search?q=${q}&limit=10`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: shouldFetchGlobalMentionSearch,
    staleTime: 30_000,
  });

  const excludedMentionUsernames = useMemo(
    () => getExcludedMentionUsernamesForAutocomplete(newComment, currentMentionStart),
    [newComment, currentMentionStart],
  );

  const mentionSuggestions = useMemo(() => {
    if (!showArtistDropdown) return [];
    return buildMentionSuggestions({
      query: artistSearchTerm,
      verifiedArtists,
      recentMentionUsers: readRecentMentionUsers(contextUser?.id),
      threadParticipants,
      globalSearchResults: shouldFetchGlobalMentionSearch ? globalMentionSearchUsers : [],
      excludedMentionUsernames,
      deniedArtistIds: deniedArtistIdsOnPost,
      deniedArtistHint: ARTIST_DENIED_MENTION_HINT,
      currentUserId: contextUser?.id,
      pinSelfArtist: shouldPinCurrentArtistInMentions,
      selfUsername: contextUsername,
    });
  }, [
    showArtistDropdown,
    artistSearchTerm,
    verifiedArtists,
    threadParticipants,
    shouldFetchGlobalMentionSearch,
    globalMentionSearchUsers,
    excludedMentionUsernames,
    deniedArtistIdsOnPost,
    contextUser?.id,
    shouldPinCurrentArtistInMentions,
    contextUsername,
  ]);

  const trimmedActiveMentionQuery = artistSearchTerm.trim();
  const isDebouncingGlobalMentionSearch =
    showArtistDropdown &&
    trimmedActiveMentionQuery.length >= 2 &&
    isValidMentionQuery(trimmedActiveMentionQuery) &&
    trimmedDebouncedMentionQuery !== trimmedActiveMentionQuery;

  const showMentionAutocompleteDropdown =
    showArtistDropdown &&
    (mentionSuggestions.length > 0 ||
      (trimmedActiveMentionQuery.length >= 2 &&
        (isDebouncingGlobalMentionSearch ||
          (shouldFetchGlobalMentionSearch &&
            (isFetchingGlobalMentionSearch ||
              (isGlobalMentionSearchFetched && mentionSuggestions.length === 0))))));

  const showMentionSearchLoadingRow =
    trimmedActiveMentionQuery.length >= 2 &&
    mentionSuggestions.length === 0 &&
    (isDebouncingGlobalMentionSearch ||
      (shouldFetchGlobalMentionSearch && isFetchingGlobalMentionSearch));

  const showMentionSearchEmptyRow =
    trimmedActiveMentionQuery.length >= 2 &&
    shouldFetchGlobalMentionSearch &&
    !isDebouncingGlobalMentionSearch &&
    isGlobalMentionSearchFetched &&
    !isFetchingGlobalMentionSearch &&
    mentionSuggestions.length === 0;

  const addCommentMutation = useMutation({
    mutationFn: async (data: { content: string; parentId?: string }) => {
      const res = await apiRequest("POST", `/api/posts/${post.id}/comments`, {
        body: data.content,
        parentId: data.parentId ?? null,
      });
      const created = await res.json();
      return created as { id: string; post_id: string; user_id: string; body: string; artist_tag: string | null; created_at: string };
    },
    onMutate: () => {
      patchPostInFeedCaches(queryClient, post.id, (p) => bumpPostCommentCount(p, 1));
      onCommentCountDelta?.(1);
    },
    onSuccess: (data, variables) => {
      playSuccessNotification();
      window.dispatchEvent(new CustomEvent(HINT_COMMENTS_COMPLETED_EVENT));
      setNewComment("");
      const newCommentWithUser: CommentWithUser = {
        id: data.id,
        postId: post.id,
        userId: data.user_id,
        body: data.body,
        artistTag: data.artist_tag ?? null,
        createdAt: data.created_at as unknown as Date,
        parentId: (variables.parentId as string | undefined) ?? null,
        user: {
          id: contextUser?.id ?? data.user_id,
          username: contextUsername ?? "You",
          avatar_url: userProfileImage ?? null,
          account_type: userType === "artist" ? "artist" : "user",
          verified_artist: verifiedArtist,
          moderator: isModerator,
        } as CommentWithUser["user"],
        replies: [],
      };
      // If this is a reply, attach to parent comment; otherwise prepend as top-level (newest-first)
      if (variables.parentId) {
        queryClient.setQueryData<CommentWithUser[]>(
          ["/api/posts", post.id, "comments"],
          (old) => {
            if (!old) return old;
            const attachReply = (items: CommentWithUser[]): CommentWithUser[] =>
              items.map((c) => {
                if (c.id === variables.parentId) {
                  const existingReplies = Array.isArray(c.replies) ? c.replies : [];
                  return { ...c, replies: [...existingReplies, newCommentWithUser] };
                }
                if (c.replies && c.replies.length > 0) {
                  return { ...c, replies: attachReply(c.replies) };
                }
                return c;
              });
            return attachReply(old);
          }
        );

        // Exception: if the user just replied, reveal the whole parent thread so
        // the reply is immediately visible.
        const key = ["/api/posts", post.id, "comments"] as const;
        const latest = queryClient.getQueryData<CommentWithUser[]>(key);
        const findInTree = (items: CommentWithUser[], id: string): CommentWithUser | null => {
          for (const c of items) {
            if (c.id === id) return c;
            if (c.replies?.length) {
              const found = findInTree(c.replies, id);
              if (found) return found;
            }
          }
          return null;
        };
        const parent = findInTree(latest || [], variables.parentId);
        const total = parent?.replies?.length ?? 0;
        setVisibleReplyCountByParent((prev) => ({
          ...prev,
          [variables.parentId as string]: Math.max(prev[variables.parentId as string] ?? 0, total),
        }));
        scrollToPostedComment(data.id, {
          isReply: true,
          parentId: variables.parentId as string,
        });
      } else {
        queryClient.setQueryData<CommentWithUser[]>(
          ["/api/posts", post.id, "comments"],
          (old) => (old ? [newCommentWithUser, ...old] : [newCommentWithUser])
        );
        scrollToPostedComment(data.id, { isReply: false });
      }
      const isVerifiedArtistSelfTag =
        verifiedArtist &&
        !!contextUsername &&
        commentMentionsUsername(variables.content, contextUsername);

      if (isVerifiedArtistSelfTag) {
        patchPostInFeedCaches(queryClient, post.id, (p) => ({
          ...p,
          currentUserTaggedAsArtist: true,
          current_user_tagged_as_artist: true,
        }));
      }
      toast({ title: "Comment added successfully!" });
    },
    onError: () => {
      patchPostInFeedCaches(queryClient, post.id, (p) => bumpPostCommentCount(p, -1));
      onCommentCountDelta?.(-1);
      toast({ title: "Error", description: "Failed to add comment", variant: "destructive" });
    },
  });

  const updateCommentBodyInTree = useCallback(
    (commentId: string, body: string) => {
      queryClient.setQueryData<CommentWithUser[]>(
        ["/api/posts", post.id, "comments"],
        (old) => {
          if (!old) return old;
          const patchTree = (items: CommentWithUser[]): CommentWithUser[] =>
            items.map((c) => {
              if (c.id === commentId) {
                return { ...c, body, artistTag: null };
              }
              if (c.replies?.length) {
                return { ...c, replies: patchTree(c.replies) };
              }
              return c;
            });
          return patchTree(old);
        },
      );
    },
    [post.id, queryClient],
  );

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await apiRequest("DELETE", `/api/comments/${commentId}`);
      const payload = (await res.json()) as { alreadyDeleted?: boolean; id?: string };
      return payload;
    },
    onSuccess: (data, commentId) => {
      updateCommentBodyInTree(commentId, DELETED_COMMENT_BODY);
      if (data?.alreadyDeleted === true) return;
      patchPostInFeedCaches(queryClient, post.id, (p) => bumpPostCommentCount(p, -1));
      onCommentCountDelta?.(-1);
    },
    onError: (error: unknown) => {
      let description = "Failed to delete comment";
      if (error instanceof ApiRequestError && error.responseBody) {
        try {
          const parsed = JSON.parse(error.responseBody) as { message?: string };
          if (typeof parsed.message === "string" && parsed.message.trim()) {
            description = parsed.message;
          }
        } catch {
          /* use default */
        }
      }
      toast({ title: "Could not delete comment", description, variant: "destructive" });
    },
  });

  const revealAnonymousIdentificationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/posts/${post.id}/artist-reveal-identification`,
        {},
      );
      return res.json() as Promise<{
        alreadyRevealed?: boolean;
        insertedConfirmCommentId?: string | null;
      }>;
    },
    onSuccess: () => {
      playSuccessNotification();
      const artistId = contextUser?.id;
      if (artistId) {
        patchPostInFeedCaches(queryClient, post.id, (p) =>
          markViewerArtistRevealedOnPost(p, artistId),
        );
      }
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts", post.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts", post.id, "comments"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/posts", post.id, "artist-private-identification"],
      });
      setShowRevealIdConfirm(false);
      toast({
        title: "ID revealed",
        description: "Your artist identity is now public on this track.",
      });
    },
    onError: (error: unknown) => {
      const { code, message } = readAnonymousIdentifyErrorCode(error);
      const copy = resolveAnonymousIdentifyErrorCopy(code, message);
      toast({
        title: copy.title === "Couldn't identify anonymously" ? "Couldn't reveal" : copy.title,
        description: copy.description,
        variant: "destructive",
      });
    },
  });

  const requestDeleteComment = (commentId: string) => {
    if (deleteCommentMutation.isPending) return;
    setDeleteConfirmCommentId(commentId);
  };

  const confirmDeleteComment = () => {
    if (!deleteConfirmCommentId || deleteCommentMutation.isPending) return;
    const commentId = deleteConfirmCommentId;
    setDeleteConfirmCommentId(null);
    deleteCommentMutation.mutate(commentId);
  };

  // Comment like toggle
  const handleToggleCommentLike = async (commentId: string) => {
    try {
      // Optimistic UI update
      queryClient.setQueryData<CommentWithUser[]>(
        ["/api/posts", post.id, "comments"],
        (old) => {
          if (!old) return old;

          const updateTree = (items: CommentWithUser[]): CommentWithUser[] =>
            items.map((c) => {
              if (c.id === commentId) {
                const currentlyLiked = c.userVote === "upvote";
                const currentCount = c.voteScore || 0;
                return {
                  ...c,
                  voteScore: currentlyLiked ? Math.max(0, currentCount - 1) : currentCount + 1,
                  userVote: currentlyLiked ? null : "upvote",
                };
              }
              if (c.replies && c.replies.length > 0) {
                return { ...c, replies: updateTree(c.replies) };
              }
              return c;
            });

          return updateTree(old);
        }
      );

      await apiRequest("POST", `/api/comments/${commentId}/like`, {});
      // Optionally re-fetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["/api/posts", post.id, "comments"] });
    } catch (err) {
      console.error("Failed to toggle comment like:", err);
    }
  };

  const sortedRepliesChronological = (replies: CommentWithUser[] | undefined) => {
    const safeReplies = Array.isArray(replies) ? replies : [];
    if (safeReplies.length === 0) return [];
    return [...safeReplies].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB; // oldest -> newest
    });
  };

  const visibleRepliesForComment = (comment: CommentWithUser) =>
    sortedRepliesChronological(comment.replies).filter(
      (reply) => !isDeletedCommentBody(reply.body),
    );

  const isVisibleInCommentsThread = (comment: CommentWithUser) =>
    !shouldHideDeletedCommentLeaf({
      body: comment.body,
      replies: (comment.replies ?? []).filter((reply) => !isDeletedCommentBody(reply.body)),
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed || trimmed.length > INPUT_LIMITS.commentBody) return;
    addCommentMutation.mutate({
      content: trimmed,
      parentId: replyingTo?.id
    } as any);
    setReplyingTo(null); // Clear reply state after submitting
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed || trimmed.length > INPUT_LIMITS.commentBody || addCommentMutation.isPending) return;
    addCommentMutation.mutate({
      content: trimmed,
      parentId: replyingTo?.id,
    } as any);
    setReplyingTo(null);
  };

  const activateReplyTarget = useCallback((parentCommentId: string, username: string) => {
    setReplyingTo({ id: parentCommentId, username });
    setNewComment(`${formatUsernameDisplay(username)} `);
    requestAnimationFrame(() => {
      commentInputRef.current?.focus({ preventScroll: true });
    });
  }, []);

  useLayoutEffect(() => {
    const el = commentInputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const nextHeight = Math.min(el.scrollHeight, 112);
    el.style.height = `${nextHeight}px`;
  }, [newComment, isOpen, replyingTo]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      // Only skip when the keyboard is actually raised (inset > 0).
      // Do NOT use nativeKeyboardLayoutActive — on iOS that flag means
      // KeyboardResize.None is engaged for the sheet, not that the keyboard is visible.
      if (nativeKeyboardInsetPx > 0) return;
      const drawer = drawerContentRef.current;
      if (!drawer || !drawer.isConnected) return;
      const rect = drawer.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      window.dispatchEvent(
        new CustomEvent(HINT_COMMENTS_READY_EVENT, {
          detail: {
            target: drawer,
            positionMode: "fixed",
            placementVariant: "comments-sheet-above",
          },
        }),
      );
    }, COMMENTS_HINT_SETTLE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, post.id, nativeKeyboardInsetPx]);

  useEffect(() => {
    if (!isOpen) {
      setDeleteConfirmCommentId(null);
      setShowNotMyTrackConfirm(false);
      setShowRevealIdConfirm(false);
    }
  }, [isOpen]);

  return (
    <>
      <AlertDialog
        open={deleteConfirmCommentId != null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmCommentId(null);
        }}
      >
        <AlertDialogContent
          className={cn(alertDialogStackZ, APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS)}
          overlayClassName={cn(alertDialogStackZ, APP_MATERIAL_OVERLAY_BACKDROP_CLASS)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className={APP_MATERIAL_OVERLAY_TITLE_CLASS}>
              Delete comment?
            </AlertDialogTitle>
            <AlertDialogDescription className={APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS}>
              Any replies will stay visible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className={APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS}
              data-testid="delete-comment-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS}
              disabled={deleteCommentMutation.isPending}
              data-testid="delete-comment-confirm"
              onClick={confirmDeleteComment}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={showNotMyTrackConfirm}
        onOpenChange={(open) => {
          if (!open) setShowNotMyTrackConfirm(false);
        }}
      >
        <AlertDialogContent
          className={cn(alertDialogStackZ, APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS)}
          overlayClassName={cn(alertDialogStackZ, APP_MATERIAL_OVERLAY_BACKDROP_CLASS)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className={APP_MATERIAL_OVERLAY_TITLE_CLASS}>
              Is this your track?
            </AlertDialogTitle>
            <AlertDialogDescription className={APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS}>
              If it isn&apos;t yours, decline the tag as normal.
              <span className="mt-2 block">
                If it is yours but you&apos;re not ready to reveal yourself, Verified Artist Tools
                lets you identify it anonymously and reveal later.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <AlertDialogAction
              className={cn(APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS, "w-full")}
              disabled={
                !notMyTrackCommentId ||
                artistIdentifyAnonymouslyPending ||
                artistNotMyTrackPending ||
                (anonymousIdentifyEntitled && !onRequestArtistIdentifyAnonymously)
              }
              data-testid="identify-anonymously-confirm"
              aria-label={
                anonymousIdentifyEntitled
                  ? "Identify anonymously"
                  : "Identify anonymously — Verified Artist Tools"
              }
              onClick={(event) => {
                event.preventDefault();
                if (!notMyTrackCommentId) return;
                setShowNotMyTrackConfirm(false);
                if (anonymousIdentifyEntitled) {
                  onRequestArtistIdentifyAnonymously?.(notMyTrackCommentId);
                  return;
                }
                requestVerifiedArtistToolsUpgrade(toast, {
                  source: "anonymous_identify",
                });
              }}
            >
              {artistIdentifyAnonymouslyPending ? (
                "Saving…"
              ) : (
                <span className="inline-flex items-center justify-center gap-1.5">
                  {!anonymousIdentifyEntitled ? (
                    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : null}
                  Identify anonymously
                </span>
              )}
            </AlertDialogAction>
            <AlertDialogAction
              className={cn(APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS, "w-full")}
              disabled={
                artistNotMyTrackPending ||
                artistIdentifyAnonymouslyPending ||
                !notMyTrackCommentId ||
                !onRequestArtistNotMyTrack
              }
              data-testid="not-my-track-confirm"
              onClick={() => {
                if (!notMyTrackCommentId || !onRequestArtistNotMyTrack) return;
                setShowNotMyTrackConfirm(false);
                onRequestArtistNotMyTrack(notMyTrackCommentId);
              }}
            >
              {artistNotMyTrackPending ? "Saving…" : "Not my track"}
            </AlertDialogAction>
            <AlertDialogCancel
              className={cn(APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS, "mt-0 w-full")}
              data-testid="not-my-track-cancel"
            >
              Cancel
            </AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={showRevealIdConfirm}
        onOpenChange={(open) => {
          if (!open && !revealAnonymousIdentificationMutation.isPending) {
            setShowRevealIdConfirm(false);
          }
        }}
      >
        <AlertDialogContent
          className={cn(alertDialogStackZ, APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS)}
          overlayClassName={cn(alertDialogStackZ, APP_MATERIAL_OVERLAY_BACKDROP_CLASS)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className={APP_MATERIAL_OVERLAY_TITLE_CLASS}>
              Reveal this ID?
            </AlertDialogTitle>
            <AlertDialogDescription className={APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS}>
              This will reveal that you identified this track. This can&apos;t be undone.
              {anonymousTrackTitleLabel ? (
                <span className="mt-2 block font-medium text-foreground/90">
                  {anonymousTrackTitleLabel}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className={APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS}
              disabled={revealAnonymousIdentificationMutation.isPending}
              data-testid="reveal-anonymous-id-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS}
              disabled={revealAnonymousIdentificationMutation.isPending}
              data-testid="reveal-anonymous-id-confirm"
              onClick={(event) => {
                event.preventDefault();
                revealAnonymousIdentificationMutation.mutate();
              }}
            >
              {revealAnonymousIdentificationMutation.isPending ? "Revealing…" : "Reveal ID"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ReportModal
        isOpen={showReportModal}
        onClose={() => {
          setShowReportModal(false);
          setReportingComment(null);
        }}
        type="comment"
        postId={post.id}
        commentId={reportingComment?.id}
        reportedUserId={reportingComment?.userId}
        dialogStackClassName={reportDialogStackZ}
      />
      <Drawer
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        onAnimationEnd={(open) => {
          if (open) return;
          setOpenCommentsPostId(null);
          onClosed?.();
        }}
        shouldScaleBackground={false}
        repositionInputs={false}
        noBodyStyles
      >
        <DrawerContent
        ref={drawerContentRef}
        data-comments-sheet
        overlayClassName={cn(drawerStackZ, "bg-transparent")}
        className={cn(COMMENTS_SHEET_SURFACE_CLASS, drawerStackZ)}
        style={
          commentsSheetMaxPx != null
            ? {
                maxHeight: commentsSheetMaxPx,
                bottom: commentsKeyboardBottomInset,
                transition: "bottom 0.5s cubic-bezier(0.32, 0.72, 0, 1)",
                willChange: "bottom",
              }
            : undefined
        }
      >
        <DrawerTitle className="sr-only">Comments for track</DrawerTitle>
        <DrawerDescription className="sr-only">View and add comments for this track</DrawerDescription>
        {/* Header — title absolutely centered; sort alone on the right (no X). */}
        <div className="relative flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/[0.08]">
          <div className="relative z-20 h-8 w-8" aria-hidden />
          <h3 className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 text-base font-semibold text-gray-900 dark:text-white">
            Comments
          </h3>
          <div className="relative z-20 flex items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={COMMENTS_HEADER_ICON_BUTTON_CLASS}
                  aria-label="Sort comments"
                  data-testid="comments-filter-menu-trigger"
                >
                  <ArrowUpDown className="h-4 w-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className={cn(commentActionsDropdownClass, "max-w-none")}
              >
                <DropdownMenuItem
                  className="cursor-pointer text-sm text-gray-800 focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900 dark:text-popover-foreground dark:focus:bg-muted dark:focus:text-foreground dark:data-[highlighted]:bg-muted dark:data-[highlighted]:text-foreground"
                  onSelect={() => setCommentFilter("all")}
                  data-testid="comments-filter-all"
                >
                  {commentFilter === "all" ? "✓ " : ""}All
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-sm text-gray-800 focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900 dark:text-popover-foreground dark:focus:bg-muted dark:focus:text-foreground dark:data-[highlighted]:bg-muted dark:data-[highlighted]:text-foreground"
                  onSelect={() => setCommentFilter("newest")}
                  data-testid="comments-filter-newest"
                >
                  {commentFilter === "newest" ? "✓ " : ""}Newest
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-sm text-gray-800 focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900 dark:text-popover-foreground dark:focus:bg-muted dark:focus:text-foreground dark:data-[highlighted]:bg-muted dark:data-[highlighted]:text-foreground"
                  onSelect={() => setCommentFilter("top")}
                  data-testid="comments-filter-top"
                >
                  {commentFilter === "top" ? "✓ " : ""}Top rated
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Comments List */}
        <div className="relative min-h-0 flex-1">
        <div
          ref={commentsListRef}
          className="h-full overflow-y-auto px-3.5 pb-6 sm:px-4"
        >
          {/*
            Ordinary inset inside the scroll content (not on the overflow
            viewport): 16px keeps the first Identified glow fully visible below
            the header divider.
          */}
          <div className="space-y-2 pt-4">
          {reviewingArtistForIdActions && artistTagActionsVisible ? (
            <div
              className="mb-1 rounded-lg border border-[#FFD700]/18 bg-[rgba(255,215,0,0.04)] px-3 py-2 dark:border-[#FFD700]/16 dark:bg-[rgba(255,215,0,0.06)]"
              data-testid="artist-tag-comments-banner"
            >
              <p className="text-[13px] font-medium leading-snug text-gray-900 dark:text-white">
                Tagged as your track
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-gray-600 dark:text-white/60">
                Someone thinks this track is yours. Confirm the ID below, or let us know if it
                isn&apos;t.
              </p>
              <button
                type="button"
                className="relative mt-1 inline-flex items-center text-[13px] font-semibold text-gray-800 leading-snug underline-offset-2 hover:underline after:absolute after:-inset-y-3 after:inset-x-0 after:content-[''] dark:text-white/90 dark:hover:text-white"
                data-testid="not-my-track-button"
                disabled={!notMyTrackCommentId || artistNotMyTrackPending || !onRequestArtistNotMyTrack}
                onClick={() => setShowNotMyTrackConfirm(true)}
              >
                Not my track
              </button>
            </div>
          ) : null}
          {(() => {
            let filteredComments = [...comments];
            
            switch (commentFilter) {
              case 'newest':
                filteredComments.sort((a, b) => {
                  const dateA = a.createdAt ? (typeof a.createdAt === 'string' ? new Date(a.createdAt) : a.createdAt).getTime() : 0;
                  const dateB = b.createdAt ? (typeof b.createdAt === 'string' ? new Date(b.createdAt) : b.createdAt).getTime() : 0;
                  return dateB - dateA;
                });
                break;
              case 'top':
                filteredComments.sort((a, b) => (b.voteScore || 0) - (a.voteScore || 0));
                break;
              case 'all':
              default:
                // Keep original order
                break;
            }
            
            const artistVerifiedBy = (post as any).artistVerifiedBy ?? (post as any).artist_verified_by;
            const isArtistVerifiedPost = !!((post as any).isVerifiedArtist ?? (post as any).is_verified_artist);

            // Derive the artist confirmation comment heuristically:
            // - Same artist who verified the post
            // - Body uses the confirmation copy we generate ("@... confirmed:"), with or without legacy leading emoji
            const artistConfirmationCommentId = isArtistVerifiedPost && artistVerifiedBy
              ? filteredComments.find((c) => {
                  const userId = (c as any).userId ?? (c as any).user?.id;
                  const body = (c as any).body ?? "";
                  const normalizedBody =
                    typeof body === "string" ? body.trim().replace(/^✅\s*/, "") : "";
                  return (
                    userId === artistVerifiedBy &&
                    typeof body === "string" &&
                    normalizedBody.toLowerCase().includes("confirmed:")
                  );
                })?.id ?? null
              : null;

            // Sort so that:
            // 1) The artist/system confirmation comment appears first (if present)
            // 2) The artist-selected community comment (verifiedCommentId) appears next
            filteredComments.sort((a, b) => {
              const aIsArtistConfirmation = artistConfirmationCommentId && a.id === artistConfirmationCommentId;
              const bIsArtistConfirmation = artistConfirmationCommentId && b.id === artistConfirmationCommentId;
              if (aIsArtistConfirmation && !bIsArtistConfirmation) return -1;
              if (!aIsArtistConfirmation && bIsArtistConfirmation) return 1;

              const aIsPinned = post.verifiedCommentId === a.id;
              const bIsPinned = post.verifiedCommentId === b.id;
              if (aIsPinned && !bIsPinned) return -1;
              if (!aIsPinned && bIsPinned) return 1;

              return 0;
            });

            if (shouldShowCommentsLoadingState) {
              if (!showCommentsSkeleton) {
                return null;
              }
              return (
                <div className="min-h-[9rem] px-1 py-1.5 sm:px-0">
                  <div className="space-y-3.5" aria-hidden>
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={`comment-skeleton-${index}`} className="flex space-x-2.5">
                        <div className="h-6 w-6 animate-pulse rounded-full bg-gray-200/80 sm:h-7 sm:w-7 dark:bg-white/12" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="h-2.5 w-28 animate-pulse rounded bg-gray-200/80 dark:bg-white/12" />
                          <div className="h-2.5 w-11/12 animate-pulse rounded bg-gray-200/70 dark:bg-white/10" />
                          <div className="h-2.5 w-8/12 animate-pulse rounded bg-gray-200/60 dark:bg-white/10" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            const hasVisibleThreadComments = filteredComments.some(isVisibleInCommentsThread);

            if (!hasVisibleThreadComments && !verifiedReplyPin) {
              return (
                <div className="flex h-full min-h-[9rem] items-center justify-center px-4 text-center">
                  <div className="flex max-w-[18rem] flex-col items-center gap-2 text-gray-500/85 dark:text-white/55">
                    <MessageCircle className="h-4 w-4 opacity-60" aria-hidden />
                    <p className="text-sm leading-relaxed">
                      What are you waiting for? Be the first to ID this track
                    </p>
                  </div>
                </div>
              );
            }

            const pinnedVerifiedReply = verifiedReplyPin?.comment ?? null;
            const pinnedReplyIsDeleted =
              pinnedVerifiedReply != null && isDeletedCommentBody(pinnedVerifiedReply.body);
            const isIdentificationPinnedComment = (c: (typeof filteredComments)[number]) =>
              (!!artistConfirmationCommentId && c.id === artistConfirmationCommentId) ||
              post.verifiedCommentId === c.id;
            const identificationClusterComments = filteredComments
              .filter(isIdentificationPinnedComment)
              .filter(isVisibleInCommentsThread);
            const remainingComments = filteredComments
              .filter((c) => !isIdentificationPinnedComment(c))
              .filter(isVisibleInCommentsThread);

            let renderTopLevelComment: (comment: (typeof filteredComments)[number]) => ReactNode =
              () => null;

            return (
              <>
                {pinnedVerifiedReply && !pinnedReplyIsDeleted && (
                  <div
                    data-testid="pinned-verified-reply"
                    className={cn("flex items-start space-x-2", COMMENTS_NORMAL_ROW_CLASS)}
                    {...bindMarkIdLongPressHandlers(
                      pinnedVerifiedReply.id,
                      pinnedVerifiedReply.body,
                    )}
                  >
                    <button
                      type="button"
                      className="relative flex-shrink-0 p-0"
                      aria-label={
                        pinnedVerifiedReply.user.username
                          ? `View profile ${formatUsernameDisplay(pinnedVerifiedReply.user.username)}`
                          : "View profile"
                      }
                      onClick={(e) => {
                        openCommentAuthorPreview(e, pinnedVerifiedReply.user);
                      }}
                    >
                      <img
                        src={pinnedVerifiedReply.user.avatar_url || undefined}
                        alt=""
                        className={`avatar-media h-6 w-6 rounded-full border-2 sm:h-7 sm:w-7 ${isDefaultAvatarUrl(pinnedVerifiedReply.user.avatar_url) ? "avatar-default-media" : ""} ${
                          pinnedVerifiedReply.user.account_type === "artist" &&
                          pinnedVerifiedReply.user.verified_artist
                            ? "border-[#FFD700] " + goldAvatarGlowShadowClass
                            : "border-transparent"
                        }`}
                      />
                    </button>
                    <div className="relative min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <div className="flex items-center space-x-1">
                          <span
                            data-mark-id-long-press-ignore="true"
                            className={`cursor-pointer text-xs font-medium hover:underline sm:text-[13px] ${
                              pinnedVerifiedReply.user.account_type === "artist" &&
                              pinnedVerifiedReply.user.verified_artist
                                ? "text-[#FFD700]"
                                : "text-gray-900 dark:text-white"
                            }`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openCommentAuthorPreview(e, pinnedVerifiedReply.user);
                            }}
                          >
                            {formatUsernameDisplay(pinnedVerifiedReply.user.username)}
                          </span>
                          <UserRoleInlineIcons
                            verifiedArtist={
                              pinnedVerifiedReply.user.account_type === "artist" &&
                              pinnedVerifiedReply.user.verified_artist === true
                            }
                            moderator={!!pinnedVerifiedReply.user.moderator}
                          />
                        </div>
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-white/10 dark:text-white/70">
                          {verifiedReplyPin?.parentAuthorUsername
                            ? `Reply to ${formatUsernameDisplay(verifiedReplyPin.parentAuthorUsername)}`
                            : "Reply in thread"}
                        </span>
                        <CommentsPostIdentificationPill post={post} testIdPrefix="badge-pinned" />
                        <span className="whitespace-nowrap text-[11px] text-gray-500 sm:text-xs dark:text-white/40">
                          {formatTimeAgo(pinnedVerifiedReply.createdAt)}
                        </span>
                        <Pin className={COMMENTS_PIN_ICON_CLASS} aria-hidden />
                      </div>
                      <p
                        className="mt-0.5 text-[13px] leading-snug text-gray-700 sm:text-sm dark:text-white/85"
                        onPointerDown={handleCommentBodyPointerDown}
                      >
                        {highlightArtistMentions(pinnedVerifiedReply.body, pinnedVerifiedReply.tagStatus)}
                      </p>
                    </div>
                  </div>
                )}
                {(() => {
            renderTopLevelComment = (comment: (typeof filteredComments)[number]) => {
              const visibleReplies = visibleRepliesForComment(comment);
              const commentIsDeleted = isDeletedCommentBody(comment.body);
              if (commentIsDeleted && visibleReplies.length === 0) {
                return null;
              }
              const isOwnComment = !!contextUser?.id && comment.userId === contextUser.id;
              const isVerifiedComment = post.verifiedCommentId === comment.id; // artist-selected community comment
              const isArtistConfirmationComment = !!artistConfirmationCommentId && comment.id === artistConfirmationCommentId; // system/artist confirmation comment
              // Only treat tagged comments specially before artist verification; once verified, rely solely on the selected + confirmation comments
              const isTaggedSuggestion =
                !commentIsDeleted &&
                !isArtistVerifiedPost &&
                artistVerifiedBy &&
                ((comment as any).artistTag ?? (comment as any).artist_tag) === artistVerifiedBy;

              const isPinnedIdentificationComment =
                isArtistConfirmationComment || isVerifiedComment;
              const highlightClass = commentIsDeleted
                ? ""
                : isTaggedSuggestion
                  ? COMMENTS_TAGGED_ROW_CLASS
                  : COMMENTS_NORMAL_ROW_CLASS;
              return (
                <div
                  key={comment.id}
                  data-comment-id={comment.id}
                  className={cn("flex items-start space-x-2", highlightClass)}
                  {...bindMarkIdLongPressHandlers(comment.id, comment.body)}
                >
                  {commentIsDeleted ? (
                    <div className="relative flex-shrink-0 p-0" aria-hidden>
                      <img
                        src={getDefaultAvatarPublicUrl("user")}
                        alt=""
                        className="avatar-media avatar-default-media h-6 w-6 rounded-full border-2 border-transparent sm:h-7 sm:w-7"
                      />
                    </div>
                  ) : (
                  <button
                    type="button"
                    className="relative flex-shrink-0 p-0"
                    aria-label={
                      comment.user.username
                        ? `View profile ${formatUsernameDisplay(comment.user.username)}`
                        : "View profile"
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openCommentAuthorPreview(e, comment.user);
                    }}
                  >
                    <img
                      src={comment.user.avatar_url || undefined}
                      alt=""
                      className={`avatar-media h-6 w-6 rounded-full border-2 sm:h-7 sm:w-7 ${isDefaultAvatarUrl(comment.user.avatar_url) ? "avatar-default-media" : ""} ${
                        comment.user.account_type === "artist" && comment.user.verified_artist
                          ? "border-[#FFD700] " + goldAvatarGlowShadowClass
                          : "border-transparent"
                      }`}
                    />
                  </button>
                  )}
                  <div className="relative min-w-0 flex-1">
                <div className="flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                <div className="relative">
                {commentIsDeleted ? (
                  <p className="text-[13px] italic leading-snug text-gray-400 sm:text-sm dark:text-white/45">
                    {DELETED_COMMENT_DISPLAY}
                  </p>
                ) : (
                <>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <div className="flex items-center space-x-1">
                    <span 
                      data-mark-id-long-press-ignore="true"
                      className={`text-xs font-medium cursor-pointer hover:underline sm:text-[13px] ${
                        comment.user.account_type === 'artist' && comment.user.verified_artist
                          ? "text-[#FFD700]"
                          : "text-gray-900 dark:text-white"
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openCommentAuthorPreview(e, comment.user);
                      }}
                    >
                      {formatUsernameDisplay(comment.user.username)}
                    </span>
                    <UserRoleInlineIcons
                      verifiedArtist={
                        comment.user.account_type === "artist" && comment.user.verified_artist === true
                      }
                      moderator={!!comment.user.moderator}
                    />
                  </div>
                  {/* Artist identified badge: match post-level identified treatment */}
                  {!commentIsDeleted && isArtistConfirmationComment && isArtistVerifiedPost && !isVerifiedComment && (
                    <span
                      className={COMMENTS_IDENTIFIED_PILL_CLASS}
                      style={COMMENTS_IDENTIFIED_PILL_STYLE}
                      data-testid={`badge-artist-verified-${comment.id}`}
                    >
                      <GoldVerifiedTick className="h-3 w-3 shrink-0 text-[#FFD700]" />
                      Identified
                    </span>
                  )}
                  {/* Tagged artist - user's comment that tagged the artist (secondary, no verified badge, only pre-artist verification) */}
                  {!commentIsDeleted && isTaggedSuggestion && !isVerifiedComment && !isArtistVerifiedPost && (
                    <div
                      className="flex items-center space-x-1 rounded-full bg-amber-100 px-1.5 py-0.5 dark:bg-amber-500/18 dark:ring-1 dark:ring-amber-400/25"
                      data-testid={`badge-tagged-artist-${comment.id}`}
                    >
                      <span className="text-xs text-amber-800 font-medium dark:text-amber-200">Tagged artist</span>
                    </div>
                  )}
                  {/* Community identified badge: keep community source icon, match post-level identified styling */}
                  {!commentIsDeleted &&
                    (post.verificationStatus === "community" || post.verificationStatus === "community_approved") &&
                    post.verifiedCommentId === comment.id &&
                    !((post as any).isVerifiedArtist ?? (post as any).is_verified_artist) && (
                    <span
                      className={COMMENTS_IDENTIFIED_PILL_CLASS}
                      style={COMMENTS_IDENTIFIED_PILL_STYLE}
                      data-testid={`badge-community-identified-${comment.id}`}
                    >
                      <Users className="h-3 w-3 shrink-0" />
                      Identified
                    </span>
                  )}
                  {/* Moderator / anonymous identified badge: match post-level identified treatment */}
                  {!commentIsDeleted &&
                    isVerifiedComment &&
                    post.verificationStatus === "identified" &&
                    !((post as any).isVerifiedArtist ?? (post as any).is_verified_artist) && (
                    <span
                      className={COMMENTS_IDENTIFIED_PILL_CLASS}
                      style={COMMENTS_IDENTIFIED_PILL_STYLE}
                      data-testid={
                        ((post as any).isArtistVerifiedAnonymous ??
                        (post as any).is_artist_verified_anonymous)
                          ? `badge-artist-verified-anonymous-${comment.id}`
                          : `badge-identified-${comment.id}`
                      }
                      aria-label={
                        ((post as any).isArtistVerifiedAnonymous ??
                        (post as any).is_artist_verified_anonymous)
                          ? ANONYMOUS_IDENTIFIED_A11Y_LABEL
                          : undefined
                      }
                      title={
                        ((post as any).isArtistVerifiedAnonymous ??
                        (post as any).is_artist_verified_anonymous)
                          ? ANONYMOUS_IDENTIFIED_A11Y_LABEL
                          : undefined
                      }
                    >
                      {((post as any).isArtistVerifiedAnonymous ??
                      (post as any).is_artist_verified_anonymous) ? (
                        <EyeOff className="h-3 w-3 shrink-0 text-white" aria-hidden />
                      ) : (
                        <Check className="h-3 w-3 shrink-0 text-white" />
                      )}
                      {IDENTIFIED_PILL_LABEL}
                    </span>
                  )}
                  {/* Artist-selected verified comment: same identified treatment as post-level artist state */}
                  {!commentIsDeleted && isVerifiedComment && isArtistVerifiedPost && (
                    <span
                      className={COMMENTS_IDENTIFIED_PILL_CLASS}
                      style={COMMENTS_IDENTIFIED_PILL_STYLE}
                    >
                      <GoldVerifiedTick className="h-3 w-3 shrink-0 text-[#FFD700]" />
                      Identified
                    </span>
                  )}
                  {/* Denied Tag Badge */}
                  {comment.tagStatus === "denied" && (
                    <div className="flex items-center space-x-1 rounded-full bg-red-50 px-1.5 py-0.5 dark:bg-red-950/55 dark:ring-1 dark:ring-red-500/25">
                      <XCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
                      <span className="text-xs text-red-600 font-medium dark:text-red-400">Denied</span>
                    </div>
                  )}
                  <span className="whitespace-nowrap text-[11px] text-gray-500 sm:text-xs dark:text-white/40">
                    {formatTimeAgo(comment.createdAt)}
                  </span>
                  {isPinnedIdentificationComment ? (
                    <Pin className={COMMENTS_PIN_ICON_CLASS} aria-hidden />
                  ) : null}
                </div>
                  <p
                    className="mt-0.5 text-[13px] leading-snug text-gray-700 sm:text-sm dark:text-white/85"
                    onPointerDown={handleCommentBodyPointerDown}
                  >
                    {highlightArtistMentions(comment.body, comment.tagStatus)}
                  </p>
                </>
                )}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  {!commentIsDeleted ? (
                    <>
                      <button
                        className="text-[11px] text-gray-500 hover:text-gray-700 sm:text-xs dark:text-white/40 dark:hover:text-white/70"
                        onPointerDown={(e) => {
                          e.preventDefault();
                        }}
                        onClick={() => activateReplyTarget(comment.id, comment.user.username)}
                        data-testid={`reply-button-${comment.id}`}
                      >
                        Reply
                      </button>
                      {reviewingArtistForIdActions &&
                      onRequestArtistConfirmId &&
                      isCommentEligibleForArtistConfirmId(comment, reviewingArtistForIdActions) ? (
                        <button
                          type="button"
                          className="text-[11px] font-medium text-[#0a83ff] hover:text-[#3b9bff] sm:text-xs dark:text-[#5babff] dark:hover:text-[#7cbcff]"
                          data-testid={`confirm-id-button-${comment.id}`}
                          onPointerDown={(e) => {
                            e.preventDefault();
                          }}
                          onClick={() => onRequestArtistConfirmId(comment.id)}
                        >
                          Confirm ID
                        </button>
                      ) : null}
                      <DropdownMenu>                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="-my-1.5 inline-flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-ring dark:focus-visible:ring-offset-[color:var(--dark)] sm:h-8 sm:w-8"
                              aria-label="Comment actions"
                              data-testid={`comment-actions-trigger-${comment.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" aria-hidden />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            sideOffset={6}
                            alignOffset={-4}
                            collisionPadding={16}
                            className={commentActionsDropdownClass}
                          >
                            {isOwnComment ? (
                              <DropdownMenuItem
                                className="cursor-pointer text-sm text-red-700 focus:bg-red-50 focus:text-red-800 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-800 dark:text-red-400 dark:focus:bg-red-950/40 dark:focus:text-red-300 dark:data-[highlighted]:bg-red-950/40 dark:data-[highlighted]:text-red-300"
                                onSelect={() => requestDeleteComment(comment.id)}
                                data-testid={`delete-button-${comment.id}`}
                              >
                                <Trash2 className="h-4 w-4 shrink-0" />
                                Delete comment
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="cursor-pointer text-sm text-gray-800 focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900 dark:text-popover-foreground dark:focus:bg-muted dark:focus:text-foreground dark:data-[highlighted]:bg-muted dark:data-[highlighted]:text-foreground"
                                onSelect={() => {
                                  setReportingComment({ id: comment.id, userId: comment.userId });
                                  setShowReportModal(true);
                                }}
                                data-testid={`report-button-${comment.id}`}
                              >
                                <Flag className="h-4 w-4 shrink-0 text-red-600" />
                                Report comment
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                  ) : null}
                  {/* Toggle replies button */}
                  {visibleReplies.length > 0 && (() => {
                    const totalReplies = visibleReplies.length;
                    const visibleCount = visibleReplyCountByParent[comment.id] ?? 0;

                    if (visibleCount === 0) {
                      return (
                        <button
                          className={COMMENTS_THREAD_LINK_CLASS}
                          onClick={() =>
                            setVisibleReplyCountByParent((prev) => ({
                              ...prev,
                              [comment.id]: Math.min(REPLY_BATCH_SIZE, totalReplies),
                            }))
                          }
                          data-testid={`toggle-replies-${comment.id}`}
                        >
                          Show replies ({totalReplies})
                        </button>
                      );
                    }

                    return (
                      <button
                        className={COMMENTS_THREAD_LINK_CLASS}
                        onClick={() =>
                          setVisibleReplyCountByParent((prev) => ({
                            ...prev,
                            [comment.id]: 0,
                          }))
                        }
                        data-testid={`hide-replies-${comment.id}`}
                      >
                        Hide replies
                      </button>
                    );
                  })()}
                </div>
                  </div>
                  {!commentIsDeleted ? (
                    <div className="mt-0.5 flex w-8 shrink-0 flex-col items-center">
                      <button
                        type="button"
                        className={cn(
                          COMMENTS_LIKE_BUTTON_CLASS,
                          comment.userVote === "upvote"
                            ? COMMENTS_LIKE_BUTTON_LIKED_CLASS
                            : COMMENTS_LIKE_BUTTON_UNLIKED_CLASS,
                        )}
                        onClick={() => handleToggleCommentLike(comment.id)}
                        data-testid={`button-like-${comment.id}`}
                      >
                        <Heart
                          className="h-3 w-3"
                          fill={comment.userVote === "upvote" ? "currentColor" : "none"}
                        />
                      </button>
                      <span
                        className={`text-[11px] leading-none sm:text-xs ${
                          comment.userVote === "upvote"
                            ? "text-pink-600 dark:text-pink-400"
                            : "text-gray-500 dark:text-white/40"
                        }`}
                      >
                        {comment.voteScore ?? 0}
                      </span>
                    </div>
                  ) : null}
                </div>
                
                {/* Show replies progressively */}
                {visibleReplies.length > 0 &&
                  (visibleReplyCountByParent[comment.id] ?? 0) > 0 && (
                  <div className="ml-7 mt-2 space-y-2.5 border-l-2 border-gray-100 pl-2.5 dark:border-border">
                    {visibleReplies
                      .slice(0, visibleReplyCountByParent[comment.id] ?? 0)
                      .map((reply) => {
                        const replyIsDeleted = isDeletedCommentBody(reply.body);
                        const isOwnReply = !!contextUser?.id && reply.userId === contextUser.id;
                        const isVerifiedReply = post.verifiedCommentId === reply.id;
                        const isArtistConfirmationReply =
                          !!artistConfirmationCommentId && reply.id === artistConfirmationCommentId;
                        return (
                        <div
                          key={reply.id}
                          data-comment-id={reply.id}
                          className="flex items-start space-x-2"
                          {...bindMarkIdLongPressHandlers(reply.id, reply.body)}
                        >
                          <button
                            type="button"
                            className="relative flex-shrink-0 p-0"
                            aria-label={
                              reply.user.username
                                ? `View profile ${formatUsernameDisplay(reply.user.username)}`
                                : "View profile"
                            }
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openCommentAuthorPreview(e, reply.user);
                            }}
                          >
                            <img
                              src={reply.user.avatar_url || undefined}
                              alt=""
                              className={`avatar-media w-6 h-6 rounded-full border-2 ${isDefaultAvatarUrl(reply.user.avatar_url) ? "avatar-default-media" : ""} ${
                                reply.user.account_type === "artist" && reply.user.verified_artist
                                  ? "border-[#FFD700] " + goldAvatarGlowShadowClass
                                  : "border-transparent"
                              }`}
                            />
                          </button>
                          <div className="relative min-w-0 flex-1">
                            <div className="flex items-start gap-1">
                              <div className="min-w-0 flex-1">
                            <div className="relative">
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <div className="flex items-center space-x-1">
                              <span 
                                data-mark-id-long-press-ignore="true"
                                className={`text-xs font-medium cursor-pointer hover:underline ${
                                  reply.user.account_type === 'artist' && reply.user.verified_artist
                                    ? "text-[#FFD700]"
                                    : "text-gray-900 dark:text-white"
                                }`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openCommentAuthorPreview(e, reply.user);
                                }}
                              >
                                {formatUsernameDisplay(reply.user.username)}
                              </span>
                              <UserRoleInlineIcons
                                verifiedArtist={
                                  reply.user.account_type === "artist" && reply.user.verified_artist === true
                                }
                                moderator={!!reply.user.moderator}
                              />
                            </div>
                            {!replyIsDeleted && isArtistConfirmationReply && isArtistVerifiedPost && !isVerifiedReply && (
                              <span
                                className={COMMENTS_IDENTIFIED_PILL_CLASS}
                      style={COMMENTS_IDENTIFIED_PILL_STYLE}
                                data-testid={`badge-artist-verified-${reply.id}`}
                              >
                                <GoldVerifiedTick className="h-2.5 w-2.5 shrink-0 text-[#FFD700]" />
                                Identified
                              </span>
                            )}
                            {!replyIsDeleted &&
                              (post.verificationStatus === "community" ||
                                post.verificationStatus === "community_approved") &&
                              isVerifiedReply &&
                              !((post as any).isVerifiedArtist ?? (post as any).is_verified_artist) && (
                                <span
                                  className={COMMENTS_IDENTIFIED_PILL_CLASS}
                      style={COMMENTS_IDENTIFIED_PILL_STYLE}
                                  data-testid={`badge-community-identified-${reply.id}`}
                                >
                                  <Users className="h-2.5 w-2.5 shrink-0" />
                                  Identified
                                </span>
                              )}
                            {!replyIsDeleted &&
                              isVerifiedReply &&
                              post.verificationStatus === "identified" &&
                              !((post as any).isVerifiedArtist ?? (post as any).is_verified_artist) && (
                                <span
                                  className={COMMENTS_IDENTIFIED_PILL_CLASS}
                      style={COMMENTS_IDENTIFIED_PILL_STYLE}
                                  data-testid={
                                    ((post as any).isArtistVerifiedAnonymous ??
                                    (post as any).is_artist_verified_anonymous)
                                      ? `badge-artist-verified-anonymous-${reply.id}`
                                      : `badge-identified-${reply.id}`
                                  }
                                  aria-label={
                                    ((post as any).isArtistVerifiedAnonymous ??
                                    (post as any).is_artist_verified_anonymous)
                                      ? ANONYMOUS_IDENTIFIED_A11Y_LABEL
                                      : undefined
                                  }
                                  title={
                                    ((post as any).isArtistVerifiedAnonymous ??
                                    (post as any).is_artist_verified_anonymous)
                                      ? ANONYMOUS_IDENTIFIED_A11Y_LABEL
                                      : undefined
                                  }
                                >
                                  {((post as any).isArtistVerifiedAnonymous ??
                                  (post as any).is_artist_verified_anonymous) ? (
                                    <EyeOff className="h-2.5 w-2.5 shrink-0 text-white" aria-hidden />
                                  ) : (
                                    <Check className="h-2.5 w-2.5 shrink-0 text-white" />
                                  )}
                                  {IDENTIFIED_PILL_LABEL}
                                </span>
                              )}
                            {/* Verified by Artist Badge for Reply */}
                            {reply.isVerifiedByArtist && (
                              <div className="flex items-center space-x-1 rounded-full bg-green-50 px-1.5 py-0.5 dark:bg-green-500/16 dark:ring-1 dark:ring-green-400/25">
                                <CheckCircle className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />
                                <span className="text-xs font-medium text-green-600 dark:text-green-400">Verified</span>
                              </div>
                            )}
                            {/* Denied Tag Badge for Reply */}
                            {reply.tagStatus === "denied" && (
                              <div className="flex items-center space-x-1 rounded-full bg-red-50 px-1.5 py-0.5 dark:bg-red-950/55 dark:ring-1 dark:ring-red-500/25">
                                <XCircle className="w-2.5 h-2.5 text-red-600 dark:text-red-400" />
                                <span className="text-xs font-medium text-red-600 dark:text-red-400">Denied</span>
                              </div>
                            )}
                            <span className="whitespace-nowrap text-xs text-gray-500 dark:text-white/40">
                              {formatTimeAgo(reply.createdAt)}
                            </span>
                            {isVerifiedReply || isArtistConfirmationReply ? (
                              <Pin className={COMMENTS_PIN_ICON_CLASS} aria-hidden />
                            ) : null}
                          </div>
                          {replyIsDeleted ? (
                            <p className="mt-0.5 text-xs italic text-gray-400 dark:text-white/45">
                              {DELETED_COMMENT_DISPLAY}
                            </p>
                          ) : (
                            <p
                              className="mt-0.5 text-xs text-gray-700 dark:text-white/80"
                              onPointerDown={handleCommentBodyPointerDown}
                            >
                              {highlightArtistMentions(reply.body, reply.tagStatus)}
                            </p>
                          )}
                            </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            {!replyIsDeleted ? (
                              <>
                                {!commentIsDeleted ? (
                                  <button
                                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-white/40 dark:hover:text-white/70"
                                    onPointerDown={(e) => {
                                      e.preventDefault();
                                    }}
                                    onClick={() => activateReplyTarget(comment.id, reply.user.username)}
                                    data-testid={`reply-button-${reply.id}`}
                                  >
                                    Reply
                                  </button>
                                ) : null}
                                {reviewingArtistForIdActions &&
                                onRequestArtistConfirmId &&
                                !replyIsDeleted &&
                                isCommentEligibleForArtistConfirmId(
                                  reply,
                                  reviewingArtistForIdActions,
                                ) ? (
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-[#0a83ff] hover:text-[#3b9bff] dark:text-[#5babff] dark:hover:text-[#7cbcff]"
                                    data-testid={`confirm-id-button-${reply.id}`}
                                    onPointerDown={(e) => {
                                      e.preventDefault();
                                    }}
                                    onClick={() => onRequestArtistConfirmId(reply.id)}
                                  >
                                    Confirm ID
                                  </button>
                                ) : null}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="-my-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                                      aria-label="Reply actions"
                                      data-testid={`comment-actions-trigger-${reply.id}`}
                                    >
                                      <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    sideOffset={6}
                                    alignOffset={-4}
                                    collisionPadding={16}
                                    className={commentActionsDropdownClass}
                                  >
                                    {isOwnReply ? (
                                      <DropdownMenuItem
                                        className="cursor-pointer text-sm text-red-700 focus:bg-red-50 focus:text-red-800 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-800 dark:text-red-400 dark:focus:bg-red-950/40 dark:data-[highlighted]:bg-red-950/40"
                                        onSelect={() => requestDeleteComment(reply.id)}
                                        data-testid={`delete-button-${reply.id}`}
                                      >
                                        <Trash2 className="h-4 w-4 shrink-0" />
                                        Delete comment
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        className="cursor-pointer text-sm text-gray-800 focus:bg-gray-100 focus:text-gray-900 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900 dark:text-popover-foreground dark:focus:bg-muted dark:data-[highlighted]:bg-muted"
                                        onSelect={() => {
                                          setReportingComment({ id: reply.id, userId: reply.userId });
                                          setShowReportModal(true);
                                        }}
                                        data-testid={`report-button-${reply.id}`}
                                      >
                                        <Flag className="h-4 w-4 shrink-0 text-red-600" />
                                        Report comment
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </>
                            ) : null}
                          </div>
                              </div>
                              {!replyIsDeleted ? (
                                <div className="mt-0.5 flex w-8 shrink-0 flex-col items-center">
                                  <button
                                    type="button"
                                    className={cn(
                                      COMMENTS_LIKE_BUTTON_CLASS,
                                      reply.userVote === "upvote"
                                        ? COMMENTS_LIKE_BUTTON_LIKED_CLASS
                                        : COMMENTS_LIKE_BUTTON_UNLIKED_CLASS,
                                    )}
                                    onClick={() => handleToggleCommentLike(reply.id)}
                                    data-testid={`button-like-${reply.id}`}
                                  >
                                    <Heart
                                      className="h-3 w-3"
                                      fill={reply.userVote === "upvote" ? "currentColor" : "none"}
                                    />
                                  </button>
                                  <span
                                    className={`text-xs leading-none ${
                                      reply.userVote === "upvote"
                                        ? "text-pink-600 dark:text-pink-400"
                                        : "text-gray-500 dark:text-white/40"
                                    }`}
                                  >
                                    {reply.voteScore ?? 0}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                        </div>
                      </div>
                        );
                      })}
                    {(visibleReplyCountByParent[comment.id] ?? 0) <
                      visibleReplies.length && (
                      <button
                        type="button"
                        className={COMMENTS_THREAD_LINK_CLASS}
                        onClick={() =>
                          setVisibleReplyCountByParent((prev) => ({
                            ...prev,
                            [comment.id]: Math.min(
                              visibleReplies.length,
                              (prev[comment.id] ?? 0) + REPLY_BATCH_SIZE,
                            ),
                          }))
                        }
                        data-testid={`show-more-replies-${comment.id}`}
                      >
                        Show more replies
                      </button>
                    )}
                  </div>
                )}
                </div>
              </div>
              );
            };

            return (
              <>
                {(() => {
                  const anonTitleLabel = anonymousTrackTitleLabel;
                  const isAnonymousIdentified = isAnonymousIdentifiedPost;
                  if (!isAnonymousIdentified) return null;
                  return (
                    <div
                      className="mb-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 dark:border-white/10 dark:bg-white/[0.05]"
                      data-testid="anonymous-identification-title-row"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                          <CommentsPostIdentificationPill
                            post={post}
                            testIdPrefix="badge-anonymous-title"
                          />
                          {anonTitleLabel ? (
                            <p
                              className="min-w-0 text-[13px] font-medium leading-snug text-gray-800 sm:text-sm dark:text-white/90"
                              data-testid="anonymous-identification-title-label"
                            >
                              {anonTitleLabel}
                            </p>
                          ) : null}
                        </div>
                        <StatInfoPopover
                          label={ANONYMOUS_ID_INFO_TITLE}
                          modal
                          side="bottom"
                          align="end"
                          className="relative z-10 h-8 w-8 shrink-0 text-white/50 hover:text-white/80 dark:text-white/50 dark:hover:text-white/80"
                          contentClassName={cn(
                            alertDialogStackZ,
                            "border-border bg-popover text-popover-foreground shadow-xl",
                          )}
                          content={
                            <div
                              className="space-y-1.5"
                              data-testid="anonymous-identification-info-content"
                            >
                              <p className="text-sm font-medium text-foreground">
                                {ANONYMOUS_ID_INFO_TITLE}
                              </p>
                              <p className="text-sm leading-relaxed text-muted-foreground">
                                {ANONYMOUS_ID_INFO_BODY}
                              </p>
                            </div>
                          }
                        />
                      </div>
                      {ownsAnonymousClaim ? (
                        <button
                          type="button"
                          className={cn(
                            APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS,
                            "mt-2 flex h-9 w-full items-center justify-center rounded-md text-sm font-medium",
                          )}
                          data-testid="button-reveal-anonymous-id"
                          onClick={() => setShowRevealIdConfirm(true)}
                        >
                          Reveal ID
                        </button>
                      ) : null}
                    </div>
                  );
                })()}
                {identificationClusterComments.map((c) => renderTopLevelComment(c))}
              </>
            );
            })()}
                {remainingComments.map((c) => renderTopLevelComment(c))}
              </>
            );
          })()}
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-white to-transparent dark:from-[#141a2e]"
        />
        </div>

        {/* Comment Input */}
        <div
          data-comments-composer
          className="relative z-20 px-3.5 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-2 sm:px-4 sm:pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] sm:pt-2.5"
        >
          {/* Reply indicator */}
          {replyingTo && (
            <div className="mb-2 rounded-lg border border-white/10 bg-white/[0.04] p-2.5 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-white/55">Replying to</span>
                  <span className="text-xs font-medium text-white/85">{formatUsernameDisplay(replyingTo.username)}</span>
                </div>
                <button 
                  onClick={() => {
                    setReplyingTo(null);
                    setNewComment('');
                  }}
                  className="text-white/40 hover:text-white/70"
                  data-testid="cancel-reply"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          <div className="relative">
            {/* @mention autocomplete */}
            {showMentionAutocompleteDropdown && (
              <div className="absolute bottom-full left-0 right-0 z-10 mb-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-border dark:bg-popover dark:shadow-black/40">
                {showMentionSearchLoadingRow ? (
                  <div className="px-3 py-2.5 text-xs text-gray-500 dark:text-muted-foreground">
                    Searching…
                  </div>
                ) : null}
                {showMentionSearchEmptyRow ? (
                  <div className="px-3 py-2.5 text-xs text-gray-500 dark:text-muted-foreground">
                    No users found
                  </div>
                ) : null}
                {mentionSuggestions.map((suggestion) => {
                  const isVerifiedArtistSuggestion = suggestion.verified_artist === true;
                  const isPinnedCurrentArtist =
                    suggestion.isPinnedSelf &&
                    suggestion.username?.toLowerCase() === normalizedContextUsername;
                  const isDeniedOnPost = suggestion.disabled === true;
                  const avatarSrc = suggestion.avatar_url ?? undefined;
                  return (
                  <button
                    key={suggestion.userId}
                    type="button"
                    disabled={isDeniedOnPost}
                    aria-disabled={isDeniedOnPost}
                    onPointerDown={(e) => {
                      e.preventDefault();
                    }}
                    onClick={() => handleMentionSelect(suggestion)}
                    className={`flex w-full items-center space-x-3 border-b border-gray-100 p-2.5 text-left last:border-b-0 dark:border-border ${
                      isDeniedOnPost
                        ? "cursor-not-allowed opacity-55"
                        : isPinnedCurrentArtist
                          ? "border-l-2 border-l-[#FFD700]/70 bg-amber-50/90 hover:bg-amber-100/90 dark:border-l-[#FFD700]/60 dark:bg-amber-950/40 dark:hover:bg-amber-950/55"
                          : "hover:bg-gray-50 dark:hover:bg-muted"
                    }`}
                    data-testid={`mention-option-${suggestion.userId}`}
                  >
                    <img
                      src={avatarSrc}
                      alt={formatUsernameDisplay(suggestion.username) || suggestion.username || ""}
                      className={`avatar-media w-8 h-8 rounded-full ${isDefaultAvatarUrl(avatarSrc) ? "avatar-default-media" : ""}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-sm font-medium ${
                            isDeniedOnPost
                              ? "text-gray-500 dark:text-white/45"
                              : isVerifiedArtistSuggestion
                                ? "text-yellow-600 dark:text-yellow-500"
                                : "text-gray-900 dark:text-white"
                          }`}
                        >
                          {formatUsernameDisplay(suggestion.username)}
                        </span>
                        {isVerifiedArtistSuggestion && !isDeniedOnPost ? (
                          <GoldVerifiedTick className="h-3 w-3 shrink-0 text-[#FFD700]" />
                        ) : null}
                      </div>
                      {isDeniedOnPost ? (
                        <span className="mt-0.5 block text-xs text-gray-500 dark:text-muted-foreground">
                          {suggestion.disabledReason ?? ARTIST_DENIED_MENTION_HINT}
                        </span>
                      ) : isPinnedCurrentArtist ? (
                        <div className="mt-0.5 space-y-0.5">
                          <span className="block text-xs text-gray-600 dark:text-white/75">
                            Tag yourself if this is your ID
                          </span>
                          <span className="block text-[10px] font-medium uppercase tracking-wide text-amber-700/80 dark:text-amber-400/80">
                            Artist ID tag
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-muted-foreground">
                          {formatUsernameDisplay(suggestion.username)}
                        </span>
                      )}
                    </div>
                  </button>
                  );
                })}
              </div>
            )}
            
            <form onSubmit={handleSubmit}>
              {/* 2E: equal outer pad + equal gap-x; send Ø optically matches avatar outer. */}
              <div className={COMMENTS_COMPOSER_ROW_CLASS}>
                <label
                  htmlFor={composerFieldId}
                  className={`flex ${COMMENTS_COMPOSER_AVATAR_BOX_CLASS} flex-shrink-0 cursor-text touch-manipulation items-center justify-center`}
                  onPointerDown={(e) => {
                    if (addCommentMutation.isPending) return;
                    e.preventDefault();
                    commentInputRef.current?.focus({ preventScroll: true });
                  }}
                >
                  <img
                    src={userProfileImage || undefined}
                    alt=""
                    className={`avatar-media pointer-events-none ${COMMENTS_COMPOSER_AVATAR_BOX_CLASS} rounded-full border-2 ${isDefaultAvatarUrl(userProfileImage) ? "avatar-default-media" : ""} ${
                      verifiedArtist
                        ? "border-[#FFD700] " + goldAvatarGlowShadowClass
                        : "border-gray-200 dark:border-border"
                    }`}
                  />
                </label>
                <Textarea
                  id={composerFieldId}
                  ref={commentInputRef}
                  value={newComment}
                  onChange={handleCommentChange}
                  onKeyDown={handleComposerKeyDown}
                  onFocus={() => {
                    logKeyboardTiming("composer:focus");
                    if (!nativeKeyboardLayoutActive) {
                      logKeyboardTiming("composer:focus:before-sync");
                      viewportHostVvSyncRef.current?.();
                      logKeyboardTiming("composer:focus:after-sync");
                      logKeyboardTiming("composer:focus:raf-scheduled:1");
                      requestAnimationFrame(() => {
                        logKeyboardTiming("composer:focus:raf-fired:1-before-sync");
                        viewportHostVvSyncRef.current?.();
                        logKeyboardTiming("composer:focus:raf-fired:1-after-sync");
                        logKeyboardTiming("composer:focus:raf-scheduled:2");
                        requestAnimationFrame(() => {
                          logKeyboardTiming("composer:focus:raf-fired:2-before-sync");
                          viewportHostVvSyncRef.current?.();
                          logKeyboardTiming("composer:focus:raf-fired:2-after-sync");
                        });
                      });
                    } else {
                      logKeyboardTiming("composer:focus:vv-sync-skipped-native-ios");
                    }
                    if (commentsKeyboardDebugEnabled()) {
                      queueMicrotask(() =>
                        logCommentsKeyboardSnapshot("textarea-focus", { postId: post.id }),
                      );
                      if (!nativeKeyboardLayoutActive) {
                        logKeyboardTiming("composer:focus:timeout-scheduled", { delayMs: 350 });
                        window.setTimeout(() => {
                          logKeyboardTiming("composer:focus:timeout-fired", { delayMs: 350 });
                          logCommentsKeyboardSnapshot("textarea-focus+~350ms", { postId: post.id });
                        }, 350);
                      } else {
                        logKeyboardTiming("composer:focus:timeout-skipped-native-ios");
                      }
                    }
                  }}
                  onBlur={() => {
                    logKeyboardTiming("composer:blur");
                    if (!nativeKeyboardLayoutActive) {
                      logKeyboardTiming("composer:blur:before-sync");
                      viewportHostVvSyncRef.current?.();
                      logKeyboardTiming("composer:blur:after-sync");
                      logKeyboardTiming("composer:blur:raf-scheduled:1");
                      requestAnimationFrame(() => {
                        logKeyboardTiming("composer:blur:raf-fired:1-before-sync");
                        viewportHostVvSyncRef.current?.();
                        logKeyboardTiming("composer:blur:raf-fired:1-after-sync");
                        logKeyboardTiming("composer:blur:raf-scheduled:2");
                        requestAnimationFrame(() => {
                          logKeyboardTiming("composer:blur:raf-fired:2-before-sync");
                          viewportHostVvSyncRef.current?.();
                          logKeyboardTiming("composer:blur:raf-fired:2-after-sync");
                        });
                      });
                    } else {
                      logKeyboardTiming("composer:blur:vv-sync-skipped-native-ios");
                    }
                    if (commentsKeyboardDebugEnabled()) {
                      queueMicrotask(() =>
                        logCommentsKeyboardSnapshot("textarea-blur", { postId: post.id }),
                      );
                    }
                  }}
                  placeholder={
                    replyingTo
                      ? `Replying to ${formatUsernameDisplay(replyingTo.username)}...`
                      : shouldShowArtistSelfTagPlaceholder
                        ? "Tag yourself if this is your ID..."
                        : "What do you think?"
                  }
                  className="block max-h-28 min-h-[44px] min-w-0 flex-1 resize-none overflow-y-auto rounded-2xl border-gray-300 px-3 py-[11px] text-sm leading-5 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/35 dark:ring-offset-[#141a2e]"
                  disabled={addCommentMutation.isPending}
                  data-testid="comment-input"
                  maxLength={INPUT_LIMITS.commentBody}
                  rows={1}
                  enterKeyHint="send"
                  autoComplete="on"
                  autoCorrect="on"
                  spellCheck={true}
                />
                <button
                  type="submit"
                  disabled={
                    !newComment.trim() ||
                    newComment.length > INPUT_LIMITS.commentBody ||
                    addCommentMutation.isPending
                  }
                  className={COMMENTS_COMPOSER_SEND_BUTTON_CLASS}
                  aria-label="Send comment"
                  data-testid="comment-submit"
                >
                  <CommentsComposerSendArrow className={COMMENTS_COMPOSER_SEND_ICON_CLASS} />
                </button>
              </div>
              {newComment.length > INPUT_LIMITS.commentBody && (
                <p className="mt-1 text-right text-[11px] text-red-500 dark:text-red-400">
                  Comment is too long. Keep it under {INPUT_LIMITS.commentBody} characters.
                </p>
              )}
            </form>
          </div>
        </div>

      </DrawerContent>
    </Drawer>
        {userProfilePopup}
    </>
  );
}
