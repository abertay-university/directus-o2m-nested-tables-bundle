<script lang="ts" setup>
import type { Field, LogicalFilterAND, PrimaryKey, Relation } from '@directus/types';
import { useApi, useStores } from '@directus/extensions-sdk';
import { formatTitle } from '@directus/format-title';
import { DisplayItem } from '../composables/use-relation-multiple';
import { RelationO2M } from '../composables/use-relation-o2m';
import { computed, ref, toRefs, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Draggable from 'vuedraggable';

const props = withDefaults(
	// M2O inside a M2O
	defineProps<{
        primaryKey: PrimaryKey;
        items: Record<string,any>[];
        customFilter?: LogicalFilterAND;
        element?: DisplayItem;
        currentTab?: string | number | null;
        tabs?: (string | number)[];
        allowDrag: boolean;
        tablePrimaryKeyField: Field | null;
        tableSortField?: string | null;
        aggregation?: string | null;
        tableFields: string[];
        emptyColumns: Record<string | number, any> | null;
        relationInfo: RelationO2M;
        tableRelation?: Relation[];
        disabled: boolean;
        deleteAllowed?: boolean;
        createAllowed?: boolean;
        enableCreate?: boolean;
        refresh: () => Promise<void>;
        getItemEdits: (item: DisplayItem) => {};
	}>(),
	{
        items: () => [],
        disabled: false,
        deleteAllowed: false,
        createAllowed: true,
        enableCreate: true,
    }
);

const { aggregation, relationInfo, tablePrimaryKeyField } = toRefs(props);

const tableSortField = computed(() => {
    return props.tableRelation ? props.tableRelation[0]?.meta?.sort_field : props.tableSortField;
});

const tableCollection = computed(() => {
    return props.tableRelation ? props.tableRelation[0]?.collection : relationInfo.value.relatedCollection.collection;
});

const tableReverseField = computed(() => {
    return props.tableRelation ? props.tableRelation[0]?.field! : relationInfo.value.reverseJunctionField.field;
});

const api = useApi();
const { useFieldsStore } = useStores();
const fieldStore = useFieldsStore();
const { t } = useI18n();

const tableItems = ref(props.items);

watch(() => props.items, () => {
    tableItems.value = props.items;
});
const tableDisabled = computed(() => {
    return (props.element && props.element.$type === 'deleted') || props.disabled;
})
const currentlyEditingTable = ref<string | null>(null);
const tableEditsAtStart = ref<Record<string, any>>({});
const confirmDelete = ref<Record<string,any> | null>(null);
const deleting = ref<boolean>(false);
let newItem: boolean | PrimaryKey = false;

async function sortTableItems(items: Record<string,any>[]) {
	console.log('tableSortField', tableSortField.value);
	console.log('sortTableItems', items);
	if (!tableSortField.value) return;

	items.forEach(async (item, index) => {

		await api.patch(`/items/${tableCollection.value}/${item[tablePrimaryKeyField.value!.field]}`, {
			[tableSortField.value!]: index + 1,
		});
        tableItems.value[index] = item;
	});

	// await props.refresh();
}

function createTableItem({ id, aggregationValue }: { id: PrimaryKey, aggregationValue?: string | number }) {
	currentlyEditingTable.value = '+';
	tableEditsAtStart.value = aggregation.value && aggregationValue ? {
		[aggregation.value]: aggregationValue,
	} : {};
	newItem = id;
}

function editTableItem(item: DisplayItem) {
	console.log('editTableItem', item);
	if (!relationInfo.value) return;

	const relatedPkField = relationInfo.value.relatedPrimaryKeyField.field;

	newItem = false;
	tableEditsAtStart.value = props.getItemEdits(item);
	currentlyEditingTable.value = item[relatedPkField];
}

function renderHeader(field: string, collection?: string | null){
	if(!collection) return formatTitle(field);
	const fieldInfo: Field = fieldStore.getField(collection, field);
	if(fieldInfo && fieldInfo.name){
		return fieldInfo.name;
	} else {
		return formatTitle(field);
	}
}

async function stageTableEdits(item: Record<string, any>) {
	if (newItem) {
		await api.post(`/items/${tableCollection.value}`, {
			[tableReverseField.value]: newItem,
			...item,
		});
        await props.refresh();
        
	} else {
        var tableId = tablePrimaryKeyField.value!.field ?? 'id';
		api.patch(`/items/${tableCollection.value}/${item[tableId]}`, item);
        var index = tableItems.value.findIndex(i => i[tableId] == item[tableId]);
        var keys = Object.keys(item);
        keys.forEach(field => {
            tableItems.value[index]![field] = item[field];
        });
	}
	// props.refresh();
}

function deleteTableItem(item: Record<string,any>){
	deleting.value = true;
    var tableId = tablePrimaryKeyField.value!.field ?? 'id';
	api.delete(`/items/${tableCollection.value}/${item[tableId]}`);
    var index = tableItems.value.findIndex(i => i[tableId] == item[tableId]);
    tableItems.value.splice(index, 1);
	// props.refresh();
	confirmDelete.value = null;
	deleting.value = false;
}

function cancelEdit() {
	currentlyEditingTable.value = null;
}

</script>
<template>
    <div class="o2m-table" :class="{
        disabled: tableDisabled,
    }">
        <table>
            <thead v-if="tableItems.length > 0">
                <tr>
                    <th v-for="header in tableFields.filter((h) => emptyColumns && ((aggregation && ((currentTab && emptyColumns[currentTab]?.[h] > 0) || (tabs && tabs[0] && emptyColumns[tabs[0]]?.[h] > 0))) || emptyColumns?.[h] > 0))">{{ renderHeader(header, tableCollection) }}</th>
                    <th class="remove-table-item">&nbsp;</th>
                </tr>
            </thead>
            <draggable
                :model-value="tableItems"
                tag="tbody"
                :item-key="tablePrimaryKeyField!.field"
                handle=".table-drag-handle"
                :disabled="!allowDrag || tableDisabled"
                v-bind="{ 'force-fallback': true }"
                @update:model-value="sortTableItems($event)"
            >
                <template #item="{ element: item }">
                    <tr	@click.stop="element && element.$type === 'deleted' ? false : editTableItem(item)">
                        <td v-for="column, index in tableFields.filter((f) => emptyColumns && ((aggregation && ((currentTab && emptyColumns[currentTab]?.[f] > 0) || (tabs && tabs[0] && emptyColumns[tabs[0]]?.[f] > 0))) || emptyColumns?.[f] > 0))">
                            <div class="flex-cell">
                                <v-icon v-if="allowDrag && index === 0" name="drag_handle" class="table-drag-handle" left @click.stop="() => {}" />
                                <render-template
                                    :collection="tableCollection"
                                    :item="item"
                                    :template="`{{${column}}}`"
                                />
                            </div>
                        </td>
                        <td class="remove-table-item">
                            <v-remove
                                v-if="!tableDisabled && deleteAllowed"
                                @action="confirmDelete = item"
                            />
                        </td>
                    </tr>
                </template>
            </draggable>
        </table>
    </div>
    <v-button
        v-if="!tableDisabled && enableCreate && createAllowed && props.primaryKey != '+'"
        class="o2m-table-create"
        v-tooltip.bottom="t('create_item')"
        x-small
        full-width
        @click.stop="createTableItem({ id: primaryKey, aggregationValue: currentTab ?? tabs?.[0] })"
    >
        {{ t('create_item') }}
    </v-button>

    <drawer-item
        :disabled="tableDisabled"
        :active="currentlyEditingTable !== null"
        :collection="tableCollection"
        :primary-key="currentlyEditingTable || '+'"
        :edits="tableEditsAtStart"
        :circular-field="tableReverseField"
        @input="stageTableEdits"
        @update:active="cancelEdit"
    />

    <v-dialog v-model="confirmDelete" @esc="confirmDelete = null">
        <v-card>
            <v-card-title>{{ t('delete_item') }}</v-card-title>
            <v-card-text>
                <p>{{ t('delete_are_you_sure') }}</p>
            </v-card-text>
            <v-card-actions>
                <v-button secondary @click="confirmDelete = null">
                    {{ t('cancel') }}
                </v-button>
                <v-button v-if="confirmDelete" kind="danger" :loading="deleting" @click="deleteTableItem(confirmDelete)">
                    {{ t('delete_label') }}
                </v-button>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>
<style lang="css" scoped>
.o2m-table ::v-deep(.v-icon) {
	--v-icon-color: var(--theme--form--field--input--foreground-subdued);
}
.o2m-table {
	margin-bottom: 12px;
	width: 100%;
	border: var(--theme--border-width) solid var(--v-list-item-border-color, var(--theme--form--field--input--border-color));
	border-radius: 3px;
}

.o2m-table table {
	border-collapse: collapse;
	width: 100%;
}
.o2m-table tr th {
	font-weight: bold;
    text-align: left;
}
.o2m-table tr th, .o2m-table tr td {
	padding: 4px 10px;
	line-height: 1.2;
	border-right: var(--theme--border-width) solid var(--v-list-item-border-color, var(--theme--form--field--input--border-color));
	border-bottom: var(--theme--border-width) solid var(--v-list-item-border-color, var(--theme--form--field--input--border-color));
}
.o2m-table:not(.disabled) tbody tr:hover {
	background-color: var(--theme--background-subdued);
	cursor: pointer;
}
.o2m-table tr td .flex-cell {
    display: flex;
    align-items: center;
}
.o2m-table tr th:last-child, .o2m-table tr td:last-child {
	border-right: none;
}
.o2m-table tbody tr:last-child td {
	border-bottom: none;
}
.o2m-table tr .remove-table-item {
	width: 24px;
	max-width: 38px;
	padding: 0 6px;
}
.table-drag-handle:hover {
	cursor: grab;
}
.o2m-table-create {
	margin-top: -8px;
	margin-bottom: 12px;
	border: var(--theme--border-width) dashed var(--v-list-item-border-color, var(--theme--form--field--input--border-color));
	border-radius: 3px;
	background: transparent;
	--v-button-color: var(--theme--foreground);
	--v-button-color-hover: var(--theme--foreground-accent);
	--v-button-color-active: var(--theme--foreground-accent);
	--v-button-background-color: transparent;
	--v-button-background-color-hover: transparent;
	--v-button-background-color-active: transparent;
}

.o2m-table-create:hover {
	background-color: var(--theme--background-normal);
}
::v-deep(.sotable-fallback) {
    display: flex;
    width: 100%;
}
</style>