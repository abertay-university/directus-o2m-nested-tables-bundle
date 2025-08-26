import type { RequestError } from '../types';
import type { APIError } from '../types';
import { useI18n } from 'vue-i18n';

let store: any;

export function unexpectedError(error: unknown, system: Record<string, any>): void {
	const { useNotificationsStore } = system.stores;

	if (!store)
		store = useNotificationsStore();

	const code =
        (error as RequestError).response?.data?.errors?.[0]?.extensions?.code || (error as APIError)?.extensions?.code || 'UNKNOWN';

	console.warn(error);

	store.add({
		title: useI18n().t(`errors.${code}`),
		type: 'error',
		code,
		dialog: true,
		error,
	});
}