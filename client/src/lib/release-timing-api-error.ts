import { ApiRequestError } from "@/lib/apiDiagnostics";
import {
  INVALID_RELEASE_LOCAL_TIME_CODE,
  INVALID_RELEASE_LOCAL_TIME_MESSAGE,
  INVALID_RELEASE_TIMEZONE_CODE,
  INVALID_RELEASE_TIMEZONE_MESSAGE,
  EXACT_RELEASE_TIME_REQUIRED_CODE,
  EXACT_RELEASE_TIME_REQUIRED_MESSAGE,
  RELEASE_TIMING_LOCKED_CODE,
  RELEASE_TIMING_LOCKED_MESSAGE,
  RELEASE_TITLE_LOCKED_CODE,
  RELEASE_TITLE_LOCKED_MESSAGE,
} from "@shared/release-timing";

function parseApiErrorBody(error: ApiRequestError): {
  code: string | null;
  message: string | null;
} {
  const body = error.responseBody || "";
  try {
    const start = body.indexOf("{");
    if (start >= 0) {
      const json = JSON.parse(body.slice(start));
      return {
        code: typeof json.code === "string" ? json.code : null,
        message: typeof json.message === "string" ? json.message : null,
      };
    }
  } catch {
    /* ignore */
  }
  return { code: null, message: null };
}

/** Map Exact timing API 400s and post-live timing/title lock 409s to toast copy. */
export function releaseTimingApiErrorToast(
  error: unknown,
): { title: string; description: string } | null {
  if (!(error instanceof ApiRequestError)) return null;

  if (error.status === 409) {
    const { code, message } = parseApiErrorBody(error);
    if (code === RELEASE_TIMING_LOCKED_CODE) {
      return {
        title: "Schedule locked",
        description:
          message ||
          "This release is now live, so its schedule can no longer be changed.",
      };
    }
    if (code === RELEASE_TITLE_LOCKED_CODE) {
      return {
        title: "Title locked",
        description:
          message ||
          RELEASE_TITLE_LOCKED_MESSAGE,
      };
    }
    return null;
  }

  if (error.status !== 400) return null;
  const { code, message } = parseApiErrorBody(error);
  if (code === INVALID_RELEASE_LOCAL_TIME_CODE) {
    return {
      title: "Time not available",
      description: message || INVALID_RELEASE_LOCAL_TIME_MESSAGE,
    };
  }
  if (code === INVALID_RELEASE_TIMEZONE_CODE) {
    return {
      title: "Timezone required",
      description: message || INVALID_RELEASE_TIMEZONE_MESSAGE,
    };
  }
  if (code === EXACT_RELEASE_TIME_REQUIRED_CODE) {
    return {
      title: "Release time required",
      description: message || EXACT_RELEASE_TIME_REQUIRED_MESSAGE,
    };
  }
  return null;
}

export {
  RELEASE_TIMING_LOCKED_CODE,
  RELEASE_TIMING_LOCKED_MESSAGE,
  RELEASE_TITLE_LOCKED_CODE,
  RELEASE_TITLE_LOCKED_MESSAGE,
};
