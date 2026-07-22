export function sortTablesForDrop(
	tables: string[],
	relationships: Array<{ child: string; parent: string }>,
): string[] {
	const childrenByParent = new Map<string, Set<string>>();
	for (const { child, parent } of relationships) {
		if (child === parent) continue;
		const children = childrenByParent.get(parent) ?? new Set<string>();
		children.add(child);
		childrenByParent.set(parent, children);
	}

	const ordered: string[] = [];
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (table: string) => {
		if (visited.has(table)) return;
		if (visiting.has(table)) {
			throw new Error(`순환 foreign key를 발견했습니다: ${table}`);
		}
		visiting.add(table);
		for (const child of childrenByParent.get(table) ?? []) visit(child);
		visiting.delete(table);
		visited.add(table);
		ordered.push(table);
	};
	for (const table of tables) visit(table);
	return ordered;
}
