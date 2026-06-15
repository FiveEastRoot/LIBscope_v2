import { Bot, Sparkles } from 'lucide-react';
import { getModelRecommendationBadges } from '../utils/modelBadges';

const interpretationToneClasses = {
  blue: {
    box: 'bg-blue-50/70 border-blue-100',
    icon: 'bg-white text-blue-600 border-blue-100',
    label: 'text-blue-700',
    dot: 'bg-blue-600',
    chip: 'bg-white/80 text-blue-700 border-blue-100',
    item: 'bg-white/80 border-blue-100 text-slate-700'
  },
  rose: {
    box: 'bg-rose-50/70 border-rose-100',
    icon: 'bg-white text-rose-600 border-rose-100',
    label: 'text-rose-700',
    dot: 'bg-rose-600',
    chip: 'bg-white/80 text-rose-700 border-rose-100',
    item: 'bg-white/80 border-rose-100 text-slate-700'
  },
  emerald: {
    box: 'bg-emerald-50/70 border-emerald-100',
    icon: 'bg-white text-emerald-600 border-emerald-100',
    label: 'text-emerald-700',
    dot: 'bg-emerald-600',
    chip: 'bg-white/80 text-emerald-700 border-emerald-100',
    item: 'bg-white/80 border-emerald-100 text-slate-700'
  },
  amber: {
    box: 'bg-amber-50/70 border-amber-100',
    icon: 'bg-white text-amber-600 border-amber-100',
    label: 'text-amber-700',
    dot: 'bg-amber-500',
    chip: 'bg-white/80 text-amber-700 border-amber-100',
    item: 'bg-white/80 border-amber-100 text-slate-700'
  },
  cyan: {
    box: 'bg-cyan-50/70 border-cyan-100',
    icon: 'bg-white text-cyan-600 border-cyan-100',
    label: 'text-cyan-700',
    dot: 'bg-cyan-600',
    chip: 'bg-white/80 text-cyan-700 border-cyan-100',
    item: 'bg-white/80 border-cyan-100 text-slate-700'
  },
  indigo: {
    box: 'bg-indigo-50/70 border-indigo-100',
    icon: 'bg-white text-indigo-600 border-indigo-100',
    label: 'text-indigo-700',
    dot: 'bg-indigo-600',
    chip: 'bg-white/80 text-indigo-700 border-indigo-100',
    item: 'bg-white/80 border-indigo-100 text-slate-700'
  }
};

function splitEvidenceMeaning(text) {
  const value = String(text || '').trim();
  const evidenceMatch = value.match(/근거\s*[:：]\s*([\s\S]*?)(?:\/\s*)?의미\s*[:：]\s*([\s\S]*)/);
  if (evidenceMatch) {
    return {
      evidence: evidenceMatch[1].trim().replace(/[./\s]+$/, ''),
      meaning: evidenceMatch[2].trim()
    };
  }

  const arrowParts = value.split(/\s*(?:→|=>)\s*/);
  if (arrowParts.length >= 2) {
    return {
      evidence: arrowParts[0].trim().replace(/[./\s]+$/, ''),
      meaning: arrowParts.slice(1).join(' → ').trim()
    };
  }

  return { evidence: null, meaning: value };
}

function formatSourceTypeLabel(value) {
  const key = String(value || '');
  const labels = {
    fixed_dataset: '조사 기준자료',
    fixed_fallback: '보조 기준자료',
    fixed_fallback_reference: '보조 기준자료',
    fixed_reference_baseline: '비교 기준자료',
    api_cached: '최근 수집자료',
    api_cached_current: '최근 수집자료',
    api_cached_current_static_baseline: '현재값과 비교 기준자료',
    api_cached_or_static_list: '목록형 기준자료',
    mixed_static_refreshable: '복합 기준자료',
    unavailable: '자료 대기'
  };
  return labels[key] || key.replace(/_/g, ' ');
}

function MetricInterpretationPanel({
  packet,
  tone = 'blue',
  loading = false,
  error = null,
  className = '',
  variant = 'panel',
  pendingTitle = '지표 해석',
  pendingMessage = '인사이트 생성 후 이 영역에 해석 결과가 표시됩니다.'
}) {
  const theme = interpretationToneClasses[tone] || interpretationToneClasses.blue;
  const isStrip = variant === 'strip';
  const modelBadges = getModelRecommendationBadges(packet?.modelRecommendation).slice(0, 3);
  const basisItems = [
    ...(packet?.analysisBasis?.comparison || []).slice(0, 2),
    ...(packet?.analysisBasis?.sourceTypes || []).slice(0, 2).map(item => `자료: ${formatSourceTypeLabel(item)}`)
  ].filter(Boolean);

  if (loading && !packet) {
    return (
      <div className={`relative overflow-hidden ${isStrip ? 'rounded-xl px-3 py-2 shadow-sm' : 'rounded-2xl px-3 py-2.5 shadow-[0_14px_35px_rgba(22,123,217,0.12)] sm:px-4 sm:py-3'} border border-cyan-200/80 bg-gradient-to-br from-cyan-50 via-white to-blue-50 ${className}`}>
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0031A7] via-[#167BD9] to-cyan-300" />
        <div className="flex items-center gap-3">
          <div className="hidden rounded-xl border border-white/70 bg-gradient-to-br from-[#0031A7] to-[#167BD9] p-2 text-white shadow-sm sm:flex">
            <Bot size={16} />
          </div>
          <div>
            <p className="text-[10px] font-black tracking-[0.16em] text-blue-700">AI 작성 영역</p>
            <p className="text-xs font-bold text-slate-600 mt-0.5">지표 해석 생성 상태 확인 중...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !packet) {
    return (
      <div className={`relative overflow-hidden ${isStrip ? 'rounded-xl px-3 py-2' : 'rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3'} border border-amber-200 bg-amber-50 shadow-sm ${className}`}>
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 to-orange-300" />
        <p className="text-[10px] font-black tracking-[0.16em] text-amber-700">AI 작성 영역</p>
        <p className="text-xs font-bold text-amber-900 mt-0.5">{error}</p>
      </div>
    );
  }

  if (!packet) {
    if (!isStrip) return null;
    return (
      <div className={`relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 shadow-sm sm:px-4 ${className}`}>
        <div className="absolute inset-y-0 left-0 w-1 bg-slate-300" />
        <div className="pl-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-black tracking-[0.12em] text-slate-500">
              <Sparkles size={10} />
              AI 해석 대기
            </span>
            <span className="text-[11px] font-black text-slate-600">{pendingTitle}</span>
          </div>
          <p className="mt-1.5 text-xs font-bold leading-relaxed text-slate-500">
            {pendingMessage}
          </p>
        </div>
      </div>
    );
  }

  if (isStrip) {
    return (
      <div className={`relative overflow-hidden rounded-xl border border-cyan-200/80 bg-white/95 px-3 py-3 shadow-[0_10px_26px_rgba(22,123,217,0.10)] sm:px-4 ${className}`}>
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#0031A7] via-[#167BD9] to-cyan-300" />
        <div className="pl-1.5">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[9px] font-black tracking-[0.12em] text-blue-700">
                  <Sparkles size={10} />
                  AI 해석
                </span>
                <span className={`text-[11px] font-black ${theme.label}`}>{packet.title}</span>
              </div>
              <p className="mt-1.5 text-xs font-extrabold leading-relaxed text-slate-800 sm:text-[13px]">
                {packet.summary}
              </p>
            </div>
            {modelBadges.length > 0 && (
              <div className="hidden shrink-0 flex-wrap justify-end gap-1.5 lg:flex">
                {modelBadges.map(badge => (
                  <span key={`${packet.title}-${badge.label}`} className={`rounded-full border px-2 py-0.5 text-[9px] font-extrabold ${theme.chip}`}>
                    {badge.label} {badge.value}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2 grid grid-cols-1 gap-1.5 md:grid-cols-3">
            {(packet.keyFindings || []).slice(0, 3).map((finding, index) => {
              const parsed = splitEvidenceMeaning(finding);
              return (
                <div key={`${packet.title}-strip-finding-${index}`} className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
                    <span className="text-[10px] font-black text-slate-400">근거 {index + 1}</span>
                  </div>
                  {parsed.evidence && (
                    <p className="text-[10px] font-extrabold leading-relaxed text-slate-500">{parsed.evidence}</p>
                  )}
                  <p className={`${parsed.evidence ? 'mt-1' : ''} text-[11px] font-bold leading-relaxed text-slate-700`}>
                    {parsed.meaning}
                  </p>
                </div>
              );
            })}
          </div>

          {(basisItems.length > 0 || (packet.cautions || []).length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
              {basisItems.slice(0, 3).map((basis, index) => (
                <span key={`${packet.title}-strip-basis-${index}`} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  <span className="mr-1 font-black text-slate-400">{basis.startsWith('자료:') ? '자료' : '비교'}</span>
                  {basis.replace(/^자료:\s*/, '')}
                </span>
              ))}
              {(packet.cautions || []).slice(0, 2).map((caution, index) => (
                <span key={`${packet.title}-strip-caution-${index}`} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  검토 {caution}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50 via-white to-blue-50 px-3 py-3 shadow-[0_14px_35px_rgba(22,123,217,0.12)] sm:px-4 ${className}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0031A7] via-[#167BD9] to-cyan-300" />
      <div className="pointer-events-none absolute right-4 top-3 select-none text-[9px] font-black tracking-[0.18em] text-blue-100">
        AI
      </div>
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-2.5">
        <div className="flex items-start gap-2.5">
          <div className="hidden rounded-xl border border-white/70 bg-gradient-to-br from-[#0031A7] to-[#167BD9] p-2 text-white shadow-sm sm:flex">
            <Bot size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-white/90 px-2 py-0.5 text-[9px] font-black tracking-[0.12em] text-blue-700">
                <Sparkles size={10} />
                AI 작성
              </span>
              <span className={`text-[11px] font-extrabold ${theme.label}`}>{packet.title}</span>
            </div>
            <div className="mt-1 rounded-xl border border-white/80 bg-white/70 px-2.5 py-2 shadow-sm">
              <p className="text-[10px] font-black tracking-[0.12em] text-slate-400">판단</p>
              <p className="text-xs sm:text-[13px] font-extrabold text-slate-800 leading-relaxed mt-0.5">{packet.summary}</p>
            </div>
          </div>
        </div>
        {modelBadges.length > 0 && (
          <div className="hidden sm:flex flex-wrap gap-1.5 shrink-0">
            {modelBadges.map(badge => (
              <span key={`${packet.title}-${badge.label}`} className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold shadow-sm ${theme.chip}`}>
                {badge.label} {badge.value}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
        {(packet.keyFindings || []).slice(0, 4).map((finding, index) => {
          const parsed = splitEvidenceMeaning(finding);
          return (
          <div key={`${packet.title}-finding-${index}`} className={`rounded-xl border px-2.5 py-2.5 shadow-sm ${theme.item}`}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${theme.chip}`}>근거 {String(index + 1).padStart(2, '0')}</span>
              {parsed.evidence && <span className="text-[9px] font-black tracking-[0.08em] text-slate-300">해석</span>}
            </div>
            {parsed.evidence && (
              <p className="text-[10px] font-extrabold leading-relaxed text-slate-500">{parsed.evidence}</p>
            )}
            <p className={`${parsed.evidence ? 'mt-1 border-t border-slate-100 pt-1.5' : ''} text-[11px] font-bold leading-relaxed text-slate-700`}>
              {parsed.meaning}
            </p>
          </div>
          );
        })}
      </div>

      {(packet.cautions || []).length > 0 && (
        <div className="hidden sm:flex mt-2 flex-wrap gap-2">
          {packet.cautions.slice(0, 2).map((caution, index) => (
            <span key={`${packet.title}-caution-${index}`} className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-[10px] font-bold text-slate-500">
              {caution}
            </span>
          ))}
        </div>
      )}

      {basisItems.length > 0 && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 border-t border-white/80 pt-2">
          {basisItems.slice(0, 4).map((basis, index) => (
            <div key={`${packet.title}-basis-${index}`} className="rounded-lg border border-white/80 bg-white/55 px-2 py-1.5 text-[10px] font-bold leading-relaxed text-slate-500">
              <span className="mr-1 font-black text-slate-400">{basis.startsWith('자료:') ? '자료' : '비교'}</span>
              {basis.replace(/^자료:\s*/, '')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MetricInterpretationPanel;
