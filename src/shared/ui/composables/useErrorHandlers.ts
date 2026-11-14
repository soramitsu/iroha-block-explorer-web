import { useNotifications } from './notifications';
import { ZodError } from 'zod';
import { useI18n } from 'vue-i18n';

export const useErrorHandlers = () => {
  const notifications = useNotifications();
  const { t } = useI18n();

  function handleUnknownError(error: unknown) {
    console.error(error);

    if (error instanceof ZodError) {
      notifications.error(t('errors.unknownSchema'));
      return;
    }

    notifications.error(t('errors.unexpected'));
  }

  return { handleUnknownError };
};
