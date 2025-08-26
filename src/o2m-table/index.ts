import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';
import { PreviewSVG } from '../preview';

export default defineInterface({
	id: 'o2m-table',
	name: 'O2M Table',
	icon: 'box',
	description: 'A compact table for O2M items',
	component: InterfaceComponent,
	types: ['alias'],
	localTypes: ['o2m'],
	group: 'relational',
	relational: true,
	options: ({ relations }) => {
		const collection = relations.o2m?.collection;

		return [
			{
				field: 'fields',
				name: 'Table Columns',
				meta: {
					interface: 'system-fields',
					options: {
						collectionName: collection,
					},
					width: 'full',
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
