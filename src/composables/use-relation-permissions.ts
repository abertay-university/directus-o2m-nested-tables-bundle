import { computed, Ref } from 'vue';
import { useCollectionPermissions } from './use-collection-permissions';
import { RelationO2M } from './use-relation-o2m';

export function useRelationPermissionsO2M(info: Ref<RelationO2M | undefined>, system: Record<string, any>) {
	const relatedPermissions = useCollectionPermissions(computed(() => info.value?.relatedCollection.collection ?? null), system);

	const deleteAllowed = computed(() => {
		if (info.value?.relation.meta?.one_deselect_action === 'delete') {
			return relatedPermissions?.deleteAllowed;
		}

		return relatedPermissions?.updateAllowed;
	});

	return {
		createAllowed: relatedPermissions?.createAllowed,
		updateAllowed: relatedPermissions?.updateAllowed,
		deleteAllowed,
	};
}