import type { Relation } from '@directus/types';
import { defineInterface, useStores } from '@directus/extensions-sdk';
import { computed } from 'vue';
import InterfaceComponent from './interface.vue';
import { PreviewSVG } from '../preview';

export default defineInterface({
	id: 'o2m-content',
	name: 'O2M Content View',
	icon: 'box',
	description: 'View more content from o2m items',
	component: InterfaceComponent,
	types: ['alias'],
	localTypes: ['o2m'],
	group: 'relational',
	relational: true,
	options: ({ relations, field: { meta } }) => {
		const { useRelationsStore } = useStores();
		const relationStore = useRelationsStore();
		const collection = relations.o2m?.collection;
		const options = meta?.options ?? {};
		const table_collection = computed(() => {
			if(!collection || !options['table_field']) return null;
			const relations: Relation[] = relationStore.getRelationsForField(collection, options['table_field']);
			return relations[0]?.collection;
		});

		return [
			{
				field: 'title',
				name: '$t:display_template',
				meta: {
					interface: 'system-display-template',
					options: {
						collectionName: collection,
					},
					width: 'full',
				},
			},
			{
				field: 'description',
				name: 'Description',
				meta: {
					interface: 'system-field',
					options: {
						collectionName: collection,
						typeAllowList: ['string','text'],
					},
					width: 'full',
				},
			},
			{
				field: 'table_field',
				name: 'Table Field',
				meta: {
					interface: 'system-field',
					options: {
						collectionName: collection,
						typeAllowList: ['alias'],
					},
					width: 'half',
				},
			},
			{
				field: 'fields',
				name: 'O2M Table Columns',
				meta: table_collection ? {
					interface: 'system-fields',
					options: {
						collectionName: table_collection,
					},
					width: 'full',
				} : {
					interface: 'presentation-notice',
					options: {
						text: 'Please select the table field first.',
					},
					width: 'full',
				},
			},
			{
				field: 'aggregation',
				name: '$t:aggregation',
				meta: table_collection ? {
					interface: 'system-field',
					options: {
						collectionName: table_collection,
					},
					width: 'half',
				} : {
					interface: 'presentation-notice',
					options: {
						text: 'Please select the table field first.',
					},
					width: 'full',
				},
			},
			{
				field: 'enableLink',
				name: '$t:item_link',
				schema: {
					default_value: false,
				},
				meta: {
					interface: 'boolean',
					options: {
						label: '$t:show_link_to_item',
					},
					width: 'half',
				},
			},
			{
				field: 'sort',
				name: '$t:sort',
				type: 'string',
				meta: {
					interface: 'system-field',
					options: {
						collectionName: collection,
					},
					width: 'half',
				},
			},
			{
				field: 'sortDirection',
				name: '$t:sort_direction',
				schema: {
					default_value: '+',
				},
				type: 'string',
				meta: {
					interface: 'select-dropdown',
					options: {
						choices: [
							{
								text: '$t:sort_asc',
								value: '+',
							},
							{
								text: '$t:sort_desc',
								value: '-',
							},
						],
					},
					width: 'half',
				},
			},
			{
				field: 'enableCreate',
				name: '$t:creating_items',
				schema: {
					default_value: true,
				},
				meta: {
					interface: 'boolean',
					options: {
						label: '$t:enable_create_button',
					},
					width: 'half',
				},
			},
			{
				field: 'enableSelect',
				name: '$t:selecting_items',
				schema: {
					default_value: true,
				},
				meta: {
					interface: 'boolean',
					options: {
						label: '$t:enable_select_button',
					},
					width: 'half',
				},
			},
			{
				field: 'filter',
				name: '$t:filter',
				type: 'json',
				meta: {
					interface: 'system-filter',
					options: {
						collectionName: collection,
					},
					conditions: [
						{
							rule: {
								enableSelect: {
									_eq: false,
								},
							},
							hidden: true,
						},
					],
				},
			},
		];
	},
	recommendedDisplays: ['related-values'],
	preview: PreviewSVG,
});
