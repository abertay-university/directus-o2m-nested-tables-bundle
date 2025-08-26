import { RelationO2M } from './use-relation-o2m';
import { fetchAll } from '../utils/fetch-all';
import { unexpectedError } from '../utils/unexpected-error';
import { ContentVersion, Filter, Item } from '@directus/types';
import { getEndpoint, toArray } from '@directus/utils';
import { clamp, cloneDeep, get, isEqual, merge } from 'lodash';
import { Ref, computed, ref, watch } from 'vue';

export type RelationQueryMultiple = {
	page: number;
	limit: number;
	fields: string[];
	search?: string;
	sort?: string[];
	filter?: Filter;
};

export type DisplayItem = {
	[key: string]: any;
	$index?: number;
	$type?: 'created' | 'updated' | 'deleted';
	$edits?: number;
};

export type ChangesItem = {
	create: Record<string, any>[];
	update: Record<string, any>[];
	delete: (string | number)[];
};

export function useRelationMultiple(
	value: Ref<Record<string, any> | any[] | undefined | null>,
	previewQuery: Ref<RelationQueryMultiple>,
	relation: Ref<RelationO2M | undefined>,
	itemId: Ref<string | number | null>,
	version: Ref<ContentVersion | null>,
    system: Record<string, any>,
) {
    const api = system.api;
	const loading = ref(false);
	const fetchedItems = ref<Record<string, any>[]>([]);
	const existingItemCount = ref(0);

	const { cleanItem, getPage, isLocalItem, getItemEdits } = useUtil();

	const targetPKField = computed(() => {
		if (!relation.value) return 'id';

		return relation.value.relatedPrimaryKeyField.field;
	});

	const fetchedItemsPKs = computed(() => {
		return fetchedItems.value.map((item) => item[targetPKField.value]);
	});

	const _value = computed<ChangesItem>({
		get() {
			if (!value.value || Array.isArray(value.value)) {
				return {
					create: [],
					update: [],
					delete: [],
				};
			}

			return value.value as ChangesItem;
		},
		set(newValue) {
			if (newValue.create.length === 0 && newValue.update.length === 0 && newValue.delete.length === 0) {
				const isVersion = version.value !== null;

				if (isVersion) {
					value.value = fetchedItemsPKs.value;
					return;
				}

				value.value = undefined;
				return;
			}

			value.value = newValue;
		},
	});

	// Fetch new items when the value gets changed by the external "save and stay"
	// We don't want to refresh when we ourself reset the value (when we have no more changes)
	watch(value, (newValue, oldValue) => {
		if (
			Array.isArray(newValue) &&
			oldValue &&
			(('create' in oldValue && Array.isArray(oldValue.create) && oldValue.create.length > 0) ||
				('update' in oldValue && Array.isArray(oldValue.update) && oldValue.update.length > 0) ||
				('delete' in oldValue && Array.isArray(oldValue.delete) && oldValue.delete.length > 0))
		) {
			updateFetchedItems();
		}
	});

	watch(
		[previewQuery, itemId, relation],
		(newData, oldData) => {
			if (!isEqual(newData, oldData)) {
				updateFetchedItems();
			}
		},
		{ immediate: true },
	);

	const { fetchedSelectItems, selected, isItemSelected, selectedOnPage } = useSelected();

	const totalItemCount = computed(() => {
		return existingItemCount.value + _value.value.create.length + selected.value.length;
	});

	const createdItems = computed(() => {

		const items = _value.value.create.map((item, index) => {
			return {
				...item,
				$type: 'created',
				$index: index,
			} as DisplayItem;
		});
        return items;
	});

	const displayItems = computed(() => {
		if (!relation.value) return [];

		const items: DisplayItem[] = fetchedItems.value.map((item: Record<string, any>) => {
			let edits;

			for (const [index, value] of _value.value.update.entries()) {
				if (typeof value === 'object' && value[targetPKField.value] === item[targetPKField.value]) {
					edits = { index, value };
					break;
				}
			}

			let updatedItem: Record<string, any> = cloneDeep(item);

			if (edits) {
				updatedItem = {
					...updatedItem,
					...edits.value,
				};

				updatedItem.$type = 'updated';
				updatedItem.$index = edits.index;
				updatedItem.$edits = edits.index;
			}

			const deleteIndex = _value.value.delete.findIndex((id) => id === item[targetPKField.value]);

			if (deleteIndex !== -1) {
				merge(updatedItem, { $type: 'deleted', $index: deleteIndex });
			}

			return updatedItem;
		});

		const fullSelectedOnPage = selectedOnPage.value.map((edit) => {
			const fetchedItem = fetchedSelectItems.value.find((item) => {
                return edit[targetPKField.value] === item[targetPKField.value];
			});

			if (!fetchedItem) return edit;
			return merge({}, fetchedItem, edit);
		});

		const newItems = getPage(existingItemCount.value + selected.value.length, createdItems.value);

		items.push(...fullSelectedOnPage, ...newItems);

		const sortField = (previewQuery.value.sort ?? toArray(relation.value.sortField))[0];

        console.log('items', items);

		if ((previewQuery.value.limit > 0 && totalItemCount.value > previewQuery.value.limit) || !sortField) return items;

		return items.sort((a, b) => {
			let left;
			let right;

			if (sortField.startsWith('-')) {
				const field = sortField.substring(1);
				left = get(b, field);
				right = get(a, field);
			} else {
				left = get(a, sortField);
				right = get(b, sortField);
			}

			return Number(left > right) - Number(right > left);
		});
	});

	const { remove } = useActions(_value);

	function useActions(target: Ref<Item>) {

		return { remove };

		function remove(...items: DisplayItem[]) {
			if (!relation.value) return;

			for (const item of items) {
				if (item.$type === undefined || item.$index === undefined) {
					target.value.delete.push(item[targetPKField.value]);
				} else if (item.$type === 'created') {
					target.value.create.splice(item.$index, 1);
				} else if (item.$type === 'updated') {
					if (isItemSelected(item)) {
						target.value.update.splice(item.$index, 1);
					} else {
						target.value.delete.push(item[targetPKField.value]);
					}
				} else if (item.$type === 'deleted') {
					target.value.delete.splice(item.$index, 1);
				}
			}

			updateValue();
		}

		function updateValue() {
			target.value = cloneDeep(target.value);
		}
	}

	async function updateFetchedItems() {
		if (!relation.value) return;

		if (itemId.value === undefined || itemId.value === '+') {
			fetchedItems.value = [];
			return;
		}

		const reverseJunctionField = relation.value.reverseJunctionField.field;
		const fields = new Set(previewQuery.value.fields);

        let targetCollection: string = relation.value.relatedCollection.collection;
		fields.add(relation.value.relatedPrimaryKeyField.field);

		if (relation.value.sortField) fields.add(relation.value.sortField);

		try {
			loading.value = true;

			if (itemId.value !== '+') {
				const filter: Filter = { _and: [{ [reverseJunctionField]: itemId.value } as Filter] };

				if (previewQuery.value.filter) {
					filter._and.push(previewQuery.value.filter);
				}
                
				const response = await api.get(getEndpoint(targetCollection), {
					params: {
						search: previewQuery.value.search,
						fields: Array.from(fields),
						filter,
						page: previewQuery.value.page,
						limit: previewQuery.value.limit,
						sort: previewQuery.value.sort,
					},
				});

				fetchedItems.value = response.data.data;
			}
		} catch (error) {
			unexpectedError(error, system);
		} finally {
			loading.value = false;
		}
	}

	watch(
		[previewQuery, itemId, relation],
		(newData, oldData) => {
			const [newPreviewQuery, newItemId, newRelation] = newData;
			const [oldPreviewQuery, oldItemId, oldRelation] = oldData;

			if (
				isEqual(newRelation, oldRelation) &&
				newPreviewQuery.filter === oldPreviewQuery?.filter &&
				newPreviewQuery.search === oldPreviewQuery?.search &&
				newItemId === oldItemId
			) {
				return;
			}

			updateItemCount();
		},
		{ immediate: true },
	);

	async function updateItemCount() {
		if (!relation.value) return;

		if (!itemId.value || itemId.value === '+') {
			existingItemCount.value = 0;
			return;
		}

		let targetCollection: string = relation.value.relatedCollection.collection;
		const reverseJunctionField = relation.value.reverseJunctionField.field;
		const filter: Filter = { _and: [{ [reverseJunctionField]: itemId.value } as Filter] };

		if (previewQuery.value.filter) {
			filter._and.push(previewQuery.value.filter);
		}

		const response = await api.get(getEndpoint(targetCollection), {
			params: {
				search: previewQuery.value.search,
				aggregate: {
					count: targetPKField.value,
				},
				filter,
			},
		});

		existingItemCount.value = Number(response.data.data[0].count[targetPKField.value]);
	}

	function useSelected() {
		const fetchedSelectItems = ref<Record<string, any>[]>([]);

		const selected = computed(() => {
			const info = relation.value;
			if (!info) return [];

			if (relation.value?.type === 'o2m') {
				return _value.value.update
					.map((item, index) => ({ ...item, $index: index, $type: 'updated' }) as DisplayItem)
					.filter(isItemSelected);
			}

			return _value.value.create
				.map((item, index) => ({ ...item, $index: index, $type: 'created' }) as DisplayItem)
				.filter(isItemSelected);
		});

		const selectedOnPage = computed(() => getPage(existingItemCount.value, selected.value));

		watch(
			selectedOnPage,
			(newVal, oldVal) => {
				if (
					newVal.length !== oldVal?.length ||
					!isEqual(newVal.map(getRelatedIDs), (oldVal ?? []).map(getRelatedIDs))
				) {
					loadSelectedDisplay();
				}
			},
			{ immediate: true },
		);

		return { fetchedSelectItems, selected, isItemSelected, selectedOnPage };

		function getRelatedIDs(item: DisplayItem): string | number | undefined {
            return item[relation.value?.relatedPrimaryKeyField.field!];
		}

		function isItemSelected(item: DisplayItem) {
			return relation.value !== undefined && item[relation.value.reverseJunctionField.field] !== undefined;
		}

		async function loadSelectedDisplay() {
            return loadSelectedDisplayO2M(relation.value!);
		}

		async function loadSelectedDisplayO2M(relation: RelationO2M) {
			if (selectedOnPage.value.length === 0) {
				fetchedSelectItems.value = [];
				return;
			}

			const fields = new Set(previewQuery.value.fields);
			fields.add(relation.relatedPrimaryKeyField.field);

			if (relation.sortField) fields.add(relation.sortField);

			const targetCollection = relation.relatedCollection.collection;

			fetchedSelectItems.value = await fetchAll(getEndpoint(targetCollection), {
				params: {
					fields: Array.from(fields),
					filter: {
						[targetPKField.value]: {
							_in: selectedOnPage.value.map(getRelatedIDs),
						},
					},
				},
			},
            system,
            );
		}
	}

	function useUtil() {
		function cleanItem(item: DisplayItem) {
			return Object.entries(item).reduce((acc, [key, value]) => {
				if (!key.startsWith('$')) acc[key] = value;
				return acc;
			}, {} as DisplayItem);
		}

		/**
		 * Returns if the item doesn't contain any actual changes and can be removed from the changes.
		 */
		function isEmpty(item: DisplayItem): boolean {
			if (item.$type !== 'updated' && item.$edits === undefined) return false;
			const topLevelKeys = Object.keys(item).filter((key) => !key.startsWith('$'));
            return topLevelKeys.length === 1 && topLevelKeys[0] === relation.value?.relatedPrimaryKeyField.field;
		}

		function isLocalItem(item: DisplayItem) {
			return item.$type !== undefined && (item.$type !== 'updated' || isItemSelected(item));
		}

		function getPage<T>(offset: number, items: T[]) {
			if (previewQuery.value.limit === -1) return items;
			const start = clamp((previewQuery.value.page - 1) * previewQuery.value.limit - offset, 0, items.length);
			const end = clamp(previewQuery.value.page * previewQuery.value.limit - offset, 0, items.length);
			return items.slice(start, end);
		}

		function getItemEdits(item: DisplayItem) {
			if ('$type' in item && item.$index !== undefined) {
				if (item.$type === 'created') {
					return {
						..._value.value.create[item.$index],
						$type: 'created',
						$index: item.$index,
					};
				} else if (item.$type === 'updated') {
					return {
						..._value.value.update[item.$index],
						$type: 'updated',
						$index: item.$index,
					};
				} else if (item.$type === 'deleted' && item.$edits !== undefined) {
					return {
						..._value.value.update[item.$edits],
						$type: 'deleted',
						$index: item.$index,
						$edits: item.$edits,
					};
				}
			}

			return {};
		}

		return { cleanItem, getPage, isLocalItem, getItemEdits, isEmpty };
	}

	async function refresh() {
		await updateFetchedItems();
	}

	return {
		// create,
		// update,
		remove,
		// select,
		displayItems,
		totalItemCount,
		loading,
		selected,
		fetchedSelectItems,
		fetchedItems,
		useActions,
		cleanItem,
		isItemSelected,
		isLocalItem,
		getItemEdits,
		refresh,
	};
}