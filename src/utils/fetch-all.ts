import { cloneDeep, set } from 'lodash-es';

export const fetchAll = async <T = unknown>(
	url: string,
	config: any,
    system: Record<string, any>,
	limit = Infinity,
): Promise<T[]> => {
    const api = system.api;
    const { useServerStore } = system.stores;
	let page = 1;
	let hasMore = true;

	const { info } = useServerStore();

	if (!info.queryLimit || info.queryLimit?.max === -1) {
		// do a single request if possible
		set(config, 'params.limit', -1);
		const { data } = await api.get(url, config);
		return data.data as T[];
	}

	const pageSize = info.queryLimit!.max;
	const result = [] as T[];

	while (result.length < limit && hasMore === true) {
		const configWithPagination = cloneDeep(config);
		set(configWithPagination, 'params.page', page);
		set(configWithPagination, 'params.limit', pageSize);

		const { data } = await api.get(url, configWithPagination);

		if (data.data.length === 0) {
			hasMore = false;
		} else {
			result.push(...data.data);
		}

		page++;
	}

	if (Number.isFinite(limit)) {
		return result.slice(0, limit);
	}

	return result;
};