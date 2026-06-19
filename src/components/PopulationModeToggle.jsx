function PopulationModeToggle({ populationMode, onChange }) {
  return (
    <div className="relative z-10 flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
      {[
        { key: 'resident', label: '주민등록' },
        { key: 'living', label: '생활인구' }
      ].map(option => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={`px-3 py-1.5 text-xs font-extrabold rounded-md transition-colors ${
            populationMode === option.key
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default PopulationModeToggle;
