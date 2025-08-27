<script setup lang="ts">
import type { ContentVersion, Filter } from '@directus/types';
import type { Sort } from '../types';
import { useApi, useExtensions, useStores } from '@directus/extensions-sdk';
import { addRelatedPrimaryKeyToFields } from '../utils/add-related-primary-key-to-fields';
import { adjustFieldsForDisplays } from '../utils/adjusts-fields-for-displays';
import { formatItemsCountPaginated } from '../utils/format-items-count';
import { deepMap } from '@directus/utils';
import { render } from 'micromustache';
import { parseFilter } from '../utils/parse-filter';
import { RelationQueryMultiple, useRelationMultiple } from '../composables/use-relation-multiple';
import { useRelationO2M } from '../composables/use-relation-o2m';
import { useRelationPermissionsO2M } from '../composables/use-relation-permissions';
import { get, isEmpty } from 'lodash-es';
import { computed, inject, ref, toRefs, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import O2MTable from '../o2m-table/table.vue';

const props = withDefaults(
	defineProps<{
		value?: (number | string | Record<string, any>)[] | Record<string, any>;
		primaryKey: string | number;
		collection: string;
		field: string;
		width: string;
		disabled?: boolean;
		fields?: Array<string>;
		enableCreate?: boolean;
		enableSelect?: boolean;
		filter?: Filter | null;
		sort?: string;
		sortDirection?: '+' | '-';
		limit?: number;
		version: ContentVersion;
	}>(),
	{
		value: () => [],
		fields: () => ['id'],
		disabled: false,
		enableCreate: true,
		enableSelect: true,
		filter: null,
		limit: 15,
	},
);

const emit = defineEmits(['input']);
const { t, n } = useI18n();

const { collection, field, primaryKey, version, fields: tableFields } = toRefs(props);
const system = { api: useApi(), stores: useStores(), extensions: useExtensions() };
const { relationInfo } = useRelationO2M(collection, field, system);

const value = computed({
	get: () => props.value,
	set: (val) => {
		emit('input', val);
	},
});

const limit = ref(props.limit);
const page = ref(1);

const fields = computed(() => {
	if (!relationInfo.value) return [];
	let combinedFields: string[] = [];
	if(tableFields.value){
		combinedFields.push(...tableFields.value);
	}
	if(relationInfo.value.sortField){
		combinedFields.push(relationInfo.value.sortField);
	}
	let displayFields: string[] = adjustFieldsForDisplays(combinedFields, relationInfo.value.relatedCollection.collection, system);
	return addRelatedPrimaryKeyToFields(relationInfo.value.relatedCollection.collection, displayFields, system);
});

const manualSort = ref<Sort | null>(
	props.sort && !relationInfo.value?.sortField ? { by: props.sort, desc: props.sortDirection === '-' } : null,
);

const query = computed<RelationQueryMultiple>(() => {
	const q: RelationQueryMultiple = {
		fields: fields.value || ['id'],
		page: page.value,
		limit: limit.value,
	};

	if (!relationInfo.value) {
		return q;
	}

	if (manualSort.value) {
		q.sort = [`${manualSort.value.desc ? '-' : ''}${manualSort.value.by}`];
	}

	return q;
});

watch([limit], () => {
	page.value = 1;
});

const {
	displayItems,
	totalItemCount,
	loading,
	getItemEdits,
	refresh,
} = useRelationMultiple(value, query, relationInfo, primaryKey, version, system);

const emptyColumns = computed<Record<string|number,any> | null>(() => {
	if(loading.value) return null;
	let emptyColumns: Record<string|number, any> = {};
	tableFields.value.forEach((f) => {
		emptyColumns[f] = 0;
	});

	if(displayItems.value.length > 0 && displayItems.value[0]){
		displayItems.value.forEach((i) => {
			tableFields.value.forEach((key: string) => {
				let value = get(i, key);
				if(!!value){
					emptyColumns[key] += 1;
				}
			});
		});
		// console.log('emptyColumns', emptyColumns);
		return emptyColumns;
	} else {
		return null;
	}
});

const { createAllowed, deleteAllowed, updateAllowed } = useRelationPermissionsO2M(relationInfo, system);

const pageCount = computed(() => Math.ceil(totalItemCount.value / limit.value));

const showingCount = computed(() =>
	formatItemsCountPaginated({
		currentItems: totalItemCount.value,
		currentPage: page.value,
		perPage: limit.value,
		isFiltered: false,
		i18n: { t, n },
	}),
);

const allowDrag = computed(
	() => relationInfo.value?.sortField !== undefined && !props.disabled,
);

const values = inject('values', ref<Record<string, any>>({}));

const customFilter = computed(() => {
	const filter: Filter = {
		_and: [],
	};

	const customFilter = parseFilter(
		deepMap(props.filter, (val: any) => {
			if (val && typeof val === 'string') {
				return render(val, values.value);
			}

			return val;
		}),
		system,
	);

	if (!isEmpty(customFilter)) filter._and.push(customFilter);

	if (!relationInfo.value) return filter;

	const selectFilter: Filter = {
		_or: [
			{
				[relationInfo.value.reverseJunctionField.field]: {
					_neq: props.primaryKey,
				},
			},
			{
				[relationInfo.value.reverseJunctionField.field]: {
					_null: true,
				},
			},
		],
	};

	if (props.primaryKey !== '+') filter._and.push(selectFilter);

	return filter;
});

// console.log('relationInfo', relationInfo.value);

</script>
<template>
	<v-notice v-if="!relationInfo" type="warning">
		{{ t('relationship_not_setup') }}
	</v-notice>
	<v-notice v-else-if="relationInfo.relatedCollection.meta?.singleton" type="warning">
		{{ t('no_singleton_relations') }}
	</v-notice>
	<div v-else class="one-to-many">
		<v-progress-circular v-if="!displayItems || loading" indeterminate />
		<O2MTable
			v-else
			:primary-key="primaryKey"
			:items="displayItems"
			:custom-filter="customFilter"
			:allow-drag="allowDrag"
			:table-primary-key-field="relationInfo.relatedPrimaryKeyField"
			:table-sort-field="relationInfo.sortField"
			:table-fields="tableFields"
			:empty-columns="emptyColumns"
			:relation-info="relationInfo"
			:disabled
			:delete-allowed="deleteAllowed"
			:create-allowed="createAllowed"
			:enable-create="enableCreate"
			:refresh="refresh"
			:get-item-edits="getItemEdits"
		/>
		<template v-if="pageCount > 1">
			<v-pagination
				v-model="page"
				:length="pageCount"
				:total-visible="width.includes('half') ? 1 : 2"
				show-first-last
			/>

			<div class="spacer" />

			<div v-if="loading === false" class="per-page">
				<span>{{ t('per_page') }}</span>
				<v-select v-model="limit" :items="['10', '20', '30', '50', '100']" inline />
			</div>
		</template>
	</div>
</template>
<style lang="css" scoped>

</style>