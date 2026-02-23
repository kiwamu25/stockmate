type FilterOption = {
  value: string;
  label: string;
};

type FilterBarProps = {
  typeValue: string;
  onTypeChange: (value: string) => void;
  typeOptions: FilterOption[];
  keywordValue?: string;
  onKeywordChange?: (value: string) => void;
  keywordPlaceholder?: string;
  direction?: "row" | "column";
};

export default function FilterBar({
  typeValue,
  onTypeChange,
  typeOptions,
  keywordValue,
  onKeywordChange,
  keywordPlaceholder = "keyword",
  direction = "row",
}: FilterBarProps) {
  const containerClass =
    direction === "column" ? "flex flex-col items-start gap-3" : "flex flex-wrap items-end gap-3";
  const inputWidthClass = direction === "column" ? "w-full" : "w-64";
  const selectWidthClass = direction === "column" ? "w-full" : "w-52";

  return (
    <div className={containerClass}>
      {onKeywordChange && (
        <label className="text-xs font-semibold text-gray-700">
          Keyword
          <input
            className={`mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal ${inputWidthClass}`}
            value={keywordValue ?? ""}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder={keywordPlaceholder}
          />
        </label>
      )}
      <label className="text-xs font-semibold text-gray-700">
        Type
        <select
          className={`mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal ${selectWidthClass}`}
          value={typeValue}
          onChange={(e) => onTypeChange(e.target.value)}
        >
          {typeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
