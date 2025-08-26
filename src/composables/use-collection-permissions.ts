import { ComputedRef } from 'vue';

export type UsableCollectionPermissions = {
	readAllowed: boolean;
	createAllowed: boolean;
	updateAllowed: boolean;
	deleteAllowed: boolean;
};

/** Permissions on collection level */
export function useCollectionPermissions(collection: ComputedRef<string | null>, system: Record<string, any>): UsableCollectionPermissions | void {
    if(!collection.value) return;
    const { usePermissionsStore } = system.stores;
    const permissionsStore = usePermissionsStore();
	const readAllowed = permissionsStore.hasPermission(collection.value, 'read');
	const createAllowed = permissionsStore.hasPermission(collection.value, 'create');
	const updateAllowed = permissionsStore.hasPermission(collection.value, 'update');
	const deleteAllowed = permissionsStore.hasPermission(collection.value, 'delete');

	return {
		readAllowed,
		createAllowed,
		updateAllowed,
		deleteAllowed,
	};
}