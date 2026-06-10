import { useNotifications } from './notifications';
import { ZodError } from 'zod';

interface MinimalZodIssue {
  code?: string
  message?: string
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export const useErrorHandlers = () => {
  const notifications = useNotifications();

  function handleUnknownError(error: unknown) {
    console.error(error);

    if (error instanceof ZodError) {
      const firstIssue = error.issues[0] as MinimalZodIssue | undefined;
      notifications.error(firstIssue?.code ?? firstIssue?.message ?? 'Unknown schema error');
      return;
    }

    const errorMessage = getErrorMessage(error);
    notifications.error(errorMessage);
  }

  return { handleUnknownError };
};
