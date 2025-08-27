<script setup lang="ts">
import type { ContentVersion, Filter, PrimaryKey, Relation } from '@directus/types';
import type { Sort } from '../types';
import { useApi, useCollection, useExtensions, useStores } from '@directus/extensions-sdk';
import { addRelatedPrimaryKeyToFields } from '../utils/add-related-primary-key-to-fields';
import { adjustFieldsForDisplays } from '../utils/adjusts-fields-for-displays';
import { deepMap, getFieldsFromTemplate } from '@directus/utils';
// @ts-expect-error format-title dependancy
import { formatTitle } from '@directus/format-title';
import { render } from 'micromustache';
import { getItemRoute } from '../utils/get-route';
import { parseFilter } from '../utils/parse-filter';
import { DisplayItem, RelationQueryMultiple, useRelationMultiple } from '../composables/use-relation-multiple';
import { useRelationO2M } from '../composables/use-relation-o2m';
import { useRelationPermissionsO2M } from '../composables/use-relation-permissions';
import { get, isEmpty } from 'lodash-es';
import { computed, inject, ref, toRefs } from 'vue';
import { useI18n } from 'vue-i18n';
import Draggable from 'vuedraggable';
import O2MTable from '../o2m-table/table.vue';

const props = withDefaults(
	// M2O inside a M2O
	defineProps<{
		value?: (number | string | Record<string, any>)[] | Record<string, any>;
		primaryKey: string | number;
		collection: string;
		field: string;
		width: string;
		disabled?: boolean;
		title?: string | null;
		description?: string | null;
		table_field?: string | null;
		aggregation?: string | null;
		fields?: Array<string>;
		enableCreate?: boolean;
		enableSelect?: boolean;
		filter?: Filter | null;
		enableLink?: boolean;
		sort?: string;
		sortDirection?: '+' | '-';
		version: ContentVersion;
	}>(),
	{
		value: () => [],
		title: null,
		description: null,
		aggregation: null,
		fields: () => ['id'],
		disabled: false,
		enableCreate: true,
		enableSelect: true,
		filter: null,
		enableLink: false,
	},
);

const emit = defineEmits(['input']);
const { t } = useI18n();

const currentTab = ref<string|null>(null);

const { collection, field, primaryKey, version, table_field: tableField, fields: tableFields, aggregation } = toRefs(props);
const system = { api: useApi(), stores: useStores(), extensions: useExtensions() };
const api = system.api;
const { useRelationsStore } = system.stores;
const relationsStore = useRelationsStore();
const { relationInfo } = useRelationO2M(collection, field, system);
const tableRelation: Relation[] = relationsStore.getRelationsForField(relationInfo.value?.relatedCollection.collection, tableField.value);
const { info: tableInfo, primaryKeyField: tablePrimaryKeyField, sortField: tableSortField } = useCollection(tableRelation[0]?.collection!);

const value = computed({
	get: () => props.value,
	set: (val) => {
		emit('input', val);
	},
});

const templateWithDefaults = computed(() => {
	return (
		props.title ||
		relationInfo.value?.relatedCollection.meta?.display_template ||
		`{{${relationInfo.value?.relatedPrimaryKeyField.field}}}`
	);
});

const fields = computed(() => {
	if (!relationInfo.value) return [];
	let combinedFields: string[] = [...getFieldsFromTemplate(templateWithDefaults.value)];
	if(props.description){
		combinedFields.push(props.description);
	}
	if(tableFields.value){
		combinedFields.push(...tableFields.value.map((f) => `${tableField.value}.${f}`));
	}
	if(tableRelation[0]?.meta?.sort_field){
		combinedFields.push(`${tableField.value}.${tableRelation[0]?.meta?.sort_field}`);
	}
	else if(tableSortField.value){
		combinedFields.push(`${tableField.value}.${tableSortField.value}`);
	}
	if(aggregation.value){
		combinedFields.push(`${tableField.value}.${aggregation.value}`);
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
		page: 1,
		limit: -1,
	};

	if (!relationInfo.value) {
		return q;
	}

	if (manualSort.value) {
		q.sort = [`${manualSort.value.desc ? '-' : ''}${manualSort.value.by}`];
	}

	return q;
});

const {
	// create,
	// update,
	remove,
	// select,
	displayItems,
	// totalItemCount,
	loading,
	selected,
	isItemSelected,
	isLocalItem,
	getItemEdits,
	refresh,
} = useRelationMultiple(value, query, relationInfo, primaryKey, version, system);

const tabs = computed<string[]>(() => {
	let tabs: string[] = [];
	if(displayItems.value.length > 0 && displayItems.value[0]){
		displayItems.value.forEach((t) => {
			if(tableField.value && tableField.value in t){
				t[tableField.value].forEach((g: Record<string, any>) => {
					if(aggregation.value && aggregation.value in g && !tabs.includes(g[aggregation.value])){
						tabs.push(g[aggregation.value])
					}
				});
			}
		});
	}
	return tabs.sort();
});

function emptyColumns(items: Record<string, any>[]){
	if(loading.value) return null;
	let emptyColumns: Record<string|number, any> = {};
	tableFields.value.forEach((f) => {
		if(aggregation.value){
			Object.values(tabs.value).forEach((t) => {
				if(!(t in emptyColumns)){
					emptyColumns[t] = {};
				}
				emptyColumns[t][f] = 0;
			});
		} else {
			emptyColumns[f] = 0;
		}
	});

	if(items.length > 0){
		items.forEach((t) => {
			tableFields.value.forEach((key: string) => {
				let value = get(t, key);
				if(aggregation.value){
					if(!!value){
						emptyColumns[t[aggregation.value]][key] += 1;
					}
				} else {
					if(!!value){
						emptyColumns[key] += 1;
					}
				}
			});
		});
		// console.log('emptyColumns', emptyColumns);
		return emptyColumns;
	} else {
		return null;
	}
}

const { createAllowed, deleteAllowed, updateAllowed } = useRelationPermissionsO2M(relationInfo, system);

const allowDrag = computed(
	() => relationInfo.value?.sortField !== undefined && !props.disabled,
);

async function sortItems(items: DisplayItem[]) {
	const info = relationInfo.value;
	const sortField = info?.sortField;
	if (!info || !sortField) return;

	items.forEach(async (item, index) => {
		const relatedId = item?.[info.relatedPrimaryKeyField.field];

		await api.patch(`/items/${info.relatedCollection.collection}/${relatedId}`, {
			[sortField]: index + 1,
		});
	});

	await refresh();
	// console.log('sortedItems', sortedItems);
	// update(...sortedItems);
}

const selectedPrimaryKeys = computed(() => {
	if (!relationInfo.value) return [];

	const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;

	return selected.value.map((item) => item[relatedPkField]);
});

const currentlyEditing = ref<string | null>(null);
const selectModalActive = ref(false);
const editsAtStart = ref<Record<string, any>>({});
let newItem: boolean | PrimaryKey = false;

function createItem() {
	currentlyEditing.value = '+';
	editsAtStart.value = {};
	newItem = true;
}

function editItem(item: DisplayItem) {
	if (!relationInfo.value) return;
	if (item.$type === 'deleted') return;

	const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;

	newItem = false;
	editsAtStart.value = getItemEdits(item);

	if (item?.$type === 'created' && !isItemSelected(item)) {
		currentlyEditing.value = '+';
	} else {
		currentlyEditing.value = item[relatedPkField];
	}
}

async function stageEdits(item: Record<string, any>) {
	// console.log('Save Changes', {
	// 	[relationInfo.value?.reverseJunctionField.field!]: props.primaryKey,
	// 	...item,
	// });
	if (newItem) {
		await api.post(`/items/${relationInfo.value?.relatedCollection.collection}`, {
			[relationInfo.value?.reverseJunctionField.field!]: props.primaryKey,
			...item,
		});
		await refresh();
	} else {
		var tableId = relationInfo.value!.relatedPrimaryKeyField.field ?? 'id';
		api.patch(`/items/${relationInfo.value?.relatedCollection.collection}/${item[tableId]}`, item);
        var index = displayItems.value.findIndex(i => i[tableId] == item[tableId]);
        var keys = Object.keys(item);
        keys.forEach(field => {
            displayItems.value[index]![field] = item[field];
        });
	}
	
}

function selectTable(items: (string | number)[] | null){
	if(!relationInfo.value) return;
	items!.forEach(async (item) => {
		await api.patch(`/items/${relationInfo.value?.relatedCollection.collection}/${item}`, {
			[relationInfo.value?.reverseJunctionField.field!]: props.primaryKey
		});
		await refresh();
	});
}

function cancelEdit() {
	currentlyEditing.value = null;
}

function deleteItem(item: DisplayItem) {
	remove(item);
}

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

	if (selectedPrimaryKeys.value.length > 0) {
		filter._and.push({
			[relationInfo.value.relatedPrimaryKeyField.field]: {
				_nin: selectedPrimaryKeys.value,
			},
		});
	}

	if (props.primaryKey !== '+') filter._and.push(selectFilter);

	return filter;
});

function getLinkForItem(item: DisplayItem) {
	if (relationInfo.value) {
		const primaryKey = get(item, relationInfo.value.relatedPrimaryKeyField.field);

		return getItemRoute(relationInfo.value.relatedCollection.collection, primaryKey);
	}

	return null;
}

// console.log('tableRelation',tableRelation);
// console.log('relationInfo', relationInfo.value);
// console.log('tableInfo', tableInfo.value);
// console.log('tablePrimaryKeyField', tablePrimaryKeyField.value);
// console.log('tableSortField', tableSortField.value);

</script>
<template>
	<v-notice v-if="!relationInfo" type="warning">
		{{ t('relationship_not_setup') }}
	</v-notice>
	<v-notice v-else-if="relationInfo.relatedCollection.meta?.singleton" type="warning">
		{{ t('no_singleton_relations') }}
	</v-notice>
	<v-notice v-else-if="props.primaryKey == '+'">
        Save changes before creating new records.
    </v-notice>
	<div v-else class="one-to-many">
		<div class="actions" v-if="props.primaryKey != '+'">
			<v-button
				v-if="!disabled && enableSelect && updateAllowed"
				v-tooltip.bottom="t('add_existing')"
				rounded
				small
				icon
				:secondary="enableCreate"
				@click="selectModalActive = true"
			>
				<v-icon name="playlist_add" />
			</v-button>

			<v-button
				v-if="!disabled && enableCreate && createAllowed"
				v-tooltip.bottom="t('create_item')"
				rounded
				small
				icon
				@click="createItem"
			>
				<v-icon name="add" />
			</v-button>
		</div>
		<v-progress-circular v-if="!displayItems || loading" indeterminate />
		<v-notice v-else-if="displayItems.length === 0">
			{{ t('no_items') }}
		</v-notice>
		<draggable
			v-else
			:model-value="displayItems"
			tag="v-list"
			item-key="id"
			handle=".drag-handle"
			:disabled="!allowDrag"
			v-bind="{ 'force-fallback': true }"
			@update:model-value="sortItems($event)"
		>
			<template #item="{ element }">
				<v-list-item
					block
					:disabled="disabled"
					class="o2m-list"
					:class="{
						deleted: element.$type === 'deleted'
					}"
				>
					<div class="o2m-list-container">
						<div class="o2m-list-title" @click="editItem(element)">
							<v-icon v-if="allowDrag" name="drag_handle" class="drag-handle" left @click.stop="() => {}" />

							<render-template
								:collection="relationInfo.relatedCollection.collection"
								:item="element"
								:template="templateWithDefaults"
							/>

							<div class="spacer" />

							<div class="item-actions" v-if="props.primaryKey != '+'">
								<router-link
									v-if="enableLink && element.$type !== 'created'"
									v-tooltip="t('navigate_to_item')"
									:to="getLinkForItem(element)!"
									class="item-link"
									@click.stop
								>
									<v-icon name="launch" />
								</router-link>

								<v-remove
									v-if="!disabled && (deleteAllowed || isLocalItem(element))"
									:item-type="element.$type"
									:item-info="relationInfo"
									:item-is-local="isLocalItem(element)"
									:item-edits="getItemEdits(element)"
									@action="deleteItem(element)"
								/>
							</div>
						</div>
						<div class="o2m-list-content">
							<div class="o2m-list-description" v-if="description && element[description]">
								<div v-if="element[description].includes('</')" v-html="element[description]"></div>
								<p v-else>{{ element[description] }}</p>
							</div>
							<div v-if="aggregation && tabs.length > 1" class="o2m-tabs">
								<label>{{ formatTitle(aggregation) }}:</label>
								<button v-for="option in tabs" @click.stop="currentTab = option" :class="{
									active: option === currentTab || (!currentTab && option === tabs[0])
								}">
									<render-template
										:collection="tableRelation[0]?.collection"
										:item="{[aggregation]: option}"
										:template="`{{${aggregation}}}`"
									/>
								</button>
							</div>
							<O2MTable
								:primary-key="element[relationInfo!.relatedPrimaryKeyField.field]"
								:items="(element[tableField!] as Record<string,any>[]).filter((i) => i[aggregation!] === currentTab || (!currentTab && i[aggregation!] === tabs[0]))"
								:element="element"
								:current-tab="currentTab"
								:tabs="tabs"
								:allow-drag="allowDrag"
								:table-primary-key-field="tablePrimaryKeyField"
								:table-sort-field="tableSortField"
								:aggregation
								:table-fields="tableFields"
								:empty-columns="emptyColumns(element[tableField!])"
								:relation-info="relationInfo"
								:table-relation="tableRelation"
								:disabled
								:delete-allowed="deleteAllowed"
								:create-allowed="createAllowed"
								:enable-create="enableCreate"
								:refresh="refresh"
								:get-item-edits="getItemEdits"
							/>
						</div>
					</div>
				</v-list-item>
			</template>
		</draggable>

		<drawer-item
			:disabled="disabled"
			:active="currentlyEditing !== null"
			:collection="relationInfo.relatedCollection.collection"
			:primary-key="currentlyEditing || '+'"
			:edits="editsAtStart"
			:circular-field="relationInfo.reverseJunctionField.field"
			@input="stageEdits"
			@update:active="cancelEdit"
		/>

		<drawer-collection
			v-if="!disabled"
			v-model:active="selectModalActive"
			:collection="relationInfo.relatedCollection.collection"
			:filter="customFilter"
			multiple
			@input="selectTable"
		/>
	</div>
</template>
<style lang="css" scoped>
.actions {
	position: absolute;
	right: 0;
	top: -40px;
}
.actions .v-button {
	margin-left: 6px;
}
.item-actions, .item-actions ::v-deep(.v-icon) {
	--v-icon-color: var(--theme--form--field--input--foreground-subdued);
}
.v-list .v-list-item.deleted {
	--v-list-item-border-color: var(--danger-25);
	--v-list-item-border-color-hover: var(--danger-50);
	--v-list-item-background-color: var(--danger-10);
	--v-list-item-background-color-hover: var(--danger-25);
}
.v-list-item.o2m-list {
	height: auto;
}
.o2m-list-container {
	width: 100%;
}
.o2m-list-title {
	display: flex;
}
.o2m-list-title:hover {
	cursor: pointer;
}
.o2m-list-description {
	font-size: 0.9em;
	margin-top: -6px;
	margin-bottom: 12px;
}
.o2m-list-content {
	margin-top: 12px;
	margin-left: calc(var(--v-icon-size, 24px) + 8px);
}
.o2m-tabs {
	display: flex;
	justify-content: start;
	align-items: center;
	margin-bottom: 12px;
	font-size: 0.9em;
	font-weight: bold;
}
.o2m-tabs label {
	line-height: 2;
	margin-right: 10px;
}
.o2m-tabs button {
	border-bottom: var(--theme--border-width) solid var(--v-list-item-border-color, var(--theme--form--field--input--border-color));
	text-align: center;
	padding: 0 10px;
	line-height: 2;
}
.o2m-tabs button.active {
	border-bottom: var(--theme--border-width) solid var(--theme--primary);
}
.o2m-tabs button:hover {
	background-color: var(--theme--background-subdued);
	cursor: pointer;
}
.o2m-tabs button .render-template {
	padding: 0;
}
</style>