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
};

export default function FilterBar({
  typeValue,
  onTypeChange,
  typeOptions,
  keywordValue,
  onKeywordChange,
  keywordPlaceholder = "keyword",
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {onKeywordChange && (
        <label className="text-xs font-semibold text-gray-700">
          Keyword
          <input
            className="mt-1 w-64 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal"
            value={keywordValue ?? ""}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder={keywordPlaceholder}
          />
        </label>
      )}
      <label className="text-xs font-semibold text-gray-700">
        Type
        <select
          className="mt-1 w-52 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal"
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
