/** Watch 的官方名称很长，列表里去掉重复的前缀和修饰词，其他品类保持原样。 */
export function compactProductName(name: string): string {
  if (!name.startsWith("Apple Watch ")) return name;
  return name
    .replace(/^Apple Watch\s+/, "")
    .replace(/\s+新外观(?=\s|$)/g, "")
    .replace(/(\d+)\s*毫米/g, "$1mm")
    .replace(/\s+/g, " ")
    .trim();
}

export function watchBandDescription(companionPart?: string): string | undefined {
  return companionPart ? `送货查询使用目录默认表带 ${companionPart}` : undefined;
}
