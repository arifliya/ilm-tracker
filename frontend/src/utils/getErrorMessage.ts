import { AxiosError } from "axios";

/**
 * Extracts the most specific message available for an error thrown by an
 * `api` call: the backend's own message when present, a description of the
 * network failure when the request never got a response, or the given
 * fallback as a last resort.
 */
export const getErrorMessage = (err: unknown, fallback: string): string => {
  const axiosErr = err as AxiosError<{ message?: string }>;

  const serverMessage = axiosErr?.response?.data?.message;
  if (serverMessage) return serverMessage;

  if (axiosErr?.code === "ECONNABORTED") {
    return "The request timed out. Please try again.";
  }

  if (axiosErr?.request && !axiosErr?.response) {
    return "Unable to reach the server. Check your connection and try again.";
  }

  return fallback;
};
