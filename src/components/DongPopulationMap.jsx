import { useEffect, useMemo, useState } from 'react';

const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 540;
const MAP_PADDING = 28;

const metricOptions = [
  { key: 'total', label: '전체 인구', group: 'total', valueLabel: '전체 인구' },
  { key: 'senior', label: '고령인구 수', group: 'senior', valueLabel: '고령인구' },
  { key: 'seniorRatio', label: '고령인구 비율', group: 'senior', valueLabel: '고령인구 비율', ratio: true },
  { key: 'childrenYouth', label: '유아·청소년 수', group: 'children', valueLabel: '유아·청소년' },
  { key: 'childrenYouthRatio', label: '유아·청소년 비율', group: 'children', valueLabel: '유아·청소년 비율', ratio: true },
  { key: 'youngMiddle', label: '청년·중장년 수', group: 'adult', valueLabel: '청년·중장년' },
  { key: 'youngMiddleRatio', label: '청년·중장년 비율', group: 'adult', valueLabel: '청년·중장년 비율', ratio: true }
];

const palettes = {
  total: ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb'],
  senior: ['#fff1f2', '#fecdd3', '#fb7185', '#e11d48'],
  children: ['#ecfdf5', '#a7f3d0', '#34d399', '#059669'],
  adult: ['#fffbeb', '#fde68a', '#facc15', '#ca8a04']
};

let boundaryPromise;
const loadBoundaries = () => {
  if (!boundaryPromise) {
    boundaryPromise = fetch('/data/seoul-hangjeongdong-full.geojson')
      .then(response => {
        if (!response.ok) throw new Error(`행정동 경계 데이터 요청 실패 (${response.status})`);
        return response.json();
      });
  }
  return boundaryPromise;
};

const getDongName = feature => String(feature?.properties?.adm_nm || '').trim().split(/\s+/).pop();

const getGeometryRings = geometry => {
  if (geometry?.type === 'Polygon') return geometry.coordinates || [];
  if (geometry?.type === 'MultiPolygon') return (geometry.coordinates || []).flatMap(polygon => polygon);
  return [];
};

const quantile = (sortedValues, probability) => {
  if (!sortedValues.length) return 0;
  const position = (sortedValues.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
};

const formatMetricValue = (value, ratio = false) => (
  ratio ? `${Number(value || 0).toFixed(1)}%` : `${Math.round(Number(value || 0)).toLocaleString()}명`
);

const getRingCentroid = points => {
  let twiceArea = 0;
  let x = 0;
  let y = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const cross = current[0] * next[1] - next[0] * current[1];
    twiceArea += cross;
    x += (current[0] + next[0]) * cross;
    y += (current[1] + next[1]) * cross;
  }

  if (Math.abs(twiceArea) < 0.001) {
    const average = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
    return [average[0] / points.length, average[1] / points.length];
  }

  return [x / (3 * twiceArea), y / (3 * twiceArea)];
};

function DongPopulationMap({ gu, rows, metric, onMetricChange, selectedDong, onSelectedDongChange, populationSource }) {
  const [boundaryData, setBoundaryData] = useState(null);
  const [boundaryError, setBoundaryError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadBoundaries()
      .then(data => {
        if (!cancelled) setBoundaryData(data);
      })
      .catch(error => {
        if (!cancelled) setBoundaryError(error.message);
      });
    return () => { cancelled = true; };
  }, []);

  const rowByName = useMemo(() => new Map((rows || []).map(row => [row.dong, row])), [rows]);
  const activeMetric = metricOptions.find(option => option.key === metric) || metricOptions[0];
  const palette = palettes[activeMetric.group];

  const features = useMemo(() => (
    (boundaryData?.features || []).filter(feature => (
      feature?.properties?.sggnm === gu && rowByName.has(getDongName(feature))
    ))
  ), [boundaryData, gu, rowByName]);

  const mapGeometry = useMemo(() => {
    const allCoordinates = features.flatMap(feature => getGeometryRings(feature.geometry).flat());
    if (!allCoordinates.length) return null;

    const longitudes = allCoordinates.map(point => Number(point[0]));
    const latitudes = allCoordinates.map(point => Number(point[1]));
    const minLongitude = Math.min(...longitudes);
    const maxLongitude = Math.max(...longitudes);
    const minLatitude = Math.min(...latitudes);
    const maxLatitude = Math.max(...latitudes);
    const longitudeFactor = Math.cos(((minLatitude + maxLatitude) / 2) * (Math.PI / 180));
    const longitudeSpan = (maxLongitude - minLongitude) * longitudeFactor;
    const scale = Math.min(
      (VIEWBOX_WIDTH - MAP_PADDING * 2) / Math.max(longitudeSpan, Number.EPSILON),
      (VIEWBOX_HEIGHT - MAP_PADDING * 2) / Math.max(maxLatitude - minLatitude, Number.EPSILON)
    );
    const renderedWidth = longitudeSpan * scale;
    const renderedHeight = (maxLatitude - minLatitude) * scale;
    const offsetX = (VIEWBOX_WIDTH - renderedWidth) / 2;
    const offsetY = (VIEWBOX_HEIGHT - renderedHeight) / 2;
    const project = point => [
      offsetX + (Number(point[0]) - minLongitude) * longitudeFactor * scale,
      offsetY + (maxLatitude - Number(point[1])) * scale
    ];

    return features.map(feature => {
      const projectedRings = getGeometryRings(feature.geometry).map(ring => ring.map(project));
      const largestRing = projectedRings.reduce((largest, ring) => {
        const width = Math.max(...ring.map(point => point[0])) - Math.min(...ring.map(point => point[0]));
        const height = Math.max(...ring.map(point => point[1])) - Math.min(...ring.map(point => point[1]));
        const area = width * height;
        return area > largest.area ? { ring, area } : largest;
      }, { ring: projectedRings[0] || [], area: -1 });
      const path = projectedRings.map(ring => (
        ring.map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ') + ' Z'
      )).join(' ');

      return {
        feature,
        name: getDongName(feature),
        path,
        centroid: getRingCentroid(largestRing.ring),
        labelArea: largestRing.area
      };
    });
  }, [features]);

  const metricValues = useMemo(() => (
    (rows || []).map(row => Number(row[activeMetric.key] || 0)).sort((a, b) => a - b)
  ), [rows, activeMetric.key]);
  const thresholds = useMemo(() => [0.25, 0.5, 0.75].map(value => quantile(metricValues, value)), [metricValues]);
  const getColor = value => palette[thresholds.filter(threshold => Number(value || 0) > threshold).length];
  const legendBounds = [metricValues[0] || 0, ...thresholds, metricValues[metricValues.length - 1] || 0];
  const fallbackRow = useMemo(() => (
    [...(rows || [])].sort((a, b) => Number(b[activeMetric.key] || 0) - Number(a[activeMetric.key] || 0))[0]
  ), [rows, activeMetric.key]);
  const selectedRow = rowByName.get(selectedDong) || fallbackRow;
  const effectiveSelectedDong = selectedRow?.dong || '';
  const selectedGeometry = mapGeometry?.find(item => item.name === effectiveSelectedDong);

  useEffect(() => {
    if (effectiveSelectedDong && effectiveSelectedDong !== selectedDong) {
      onSelectedDongChange(effectiveSelectedDong);
    }
  }, [effectiveSelectedDong, onSelectedDongChange, selectedDong]);

  return (
    <div className="border-b border-slate-100 bg-slate-50/40" aria-label="행정동별 인구 분포 지도와 정렬 기준">
      <div className="border-b border-slate-100 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2" role="group" aria-label="지도 표시 및 표 정렬 지표">
          {metricOptions.map(option => {
            const isActive = option.key === activeMetric.key;
            const activeClasses = {
              total: 'border-blue-500 bg-blue-500 text-white shadow-blue-100',
              senior: 'border-red-500 bg-red-500 text-white shadow-red-100',
              children: 'border-green-500 bg-green-500 text-white shadow-green-100',
              adult: 'border-yellow-400 bg-yellow-400 text-slate-900 shadow-yellow-100'
            };
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => onMetricChange(option.key)}
                className={`rounded-xl border px-3 py-2 text-xs font-extrabold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  isActive ? `${activeClasses[option.group]} shadow-sm` : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {boundaryError ? (
        <div className="px-6 py-12 text-center" role="alert">
          <p className="text-sm font-extrabold text-slate-700">행정동 경계 지도를 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{boundaryError}</p>
        </div>
      ) : !mapGeometry ? (
        <div className="px-6 py-12 text-center" aria-live="polite">
          <p className="text-sm font-extrabold text-slate-600">행정동 경계 지도를 준비하고 있습니다.</p>
        </div>
      ) : (
        <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_17rem] sm:p-6">
          <div className="min-w-0">
            <svg
              className="block h-auto w-full bg-white"
              viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
              role="img"
              aria-labelledby="dong-map-svg-title dong-map-svg-description"
            >
              <title id="dong-map-svg-title">{gu} 행정동별 {activeMetric.label} 분포</title>
              <desc id="dong-map-svg-description">행정동을 선택하면 해당 동의 인구 구성 상세값을 확인할 수 있습니다.</desc>
              <g aria-label="행정동 채움과 기본 경계">
              {mapGeometry.map(item => {
                const row = rowByName.get(item.name);
                const value = Number(row?.[activeMetric.key] || 0);
                const isSelected = item.name === effectiveSelectedDong;
                return (
                  <path
                    key={item.feature.properties.adm_cd2 || item.name}
                    d={item.path}
                    fill={getColor(value)}
                    fillRule="evenodd"
                    stroke="#cbd5e1"
                    strokeWidth="0.9"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className="cursor-pointer transition-[filter] hover:brightness-95 focus:outline-none focus-visible:brightness-90"
                    role="button"
                    tabIndex={0}
                    aria-current={isSelected ? 'true' : undefined}
                    aria-label={`${item.name} ${activeMetric.valueLabel} ${formatMetricValue(value, activeMetric.ratio)}`}
                    onClick={() => onSelectedDongChange(item.name)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectedDongChange(item.name);
                      }
                    }}
                  >
                    <title>{item.name} · {formatMetricValue(value, activeMetric.ratio)}</title>
                  </path>
                );
              })}
              </g>

              {selectedGeometry && (
                <path
                  d={selectedGeometry.path}
                  fill="none"
                  fillRule="evenodd"
                  stroke="#ffffff"
                  strokeWidth="6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                  aria-hidden="true"
                />
              )}
              {selectedGeometry && (
                <path
                  d={selectedGeometry.path}
                  fill="none"
                  fillRule="evenodd"
                  stroke={palette[palette.length - 1]}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                  aria-hidden="true"
                />
              )}

              <g aria-hidden="true">
              {mapGeometry
                .filter(item => item.labelArea >= 900 || item.name === effectiveSelectedDong)
                .map(item => (
                  <text
                    key={`label-${item.feature.properties.adm_cd2 || item.name}`}
                    x={item.centroid[0]}
                    y={item.centroid[1] + 4}
                    textAnchor="middle"
                    className="pointer-events-none fill-slate-700 text-[11px] font-extrabold [paint-order:stroke] [stroke-width:3px] [stroke:white]"
                  >
                    {item.name}
                  </text>
                ))}
              </g>
            </svg>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3" aria-label="지도 범례">
              <span className="text-[11px] font-extrabold text-slate-600">{activeMetric.label}</span>
              {palette.map((color, index) => (
                <span key={color} className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                  <span className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
                  <span>{formatMetricValue(legendBounds[index], activeMetric.ratio)}–{formatMetricValue(legendBounds[index + 1], activeMetric.ratio)}</span>
                </span>
              ))}
            </div>
          </div>

          <aside aria-label="선택 행정동 상세정보">
            <div className="rounded-2xl border border-slate-200 border-t-4 bg-slate-50/70 p-4" style={{ borderTopColor: palette[palette.length - 1] }} aria-live="polite">
              <p className="text-[10px] font-black tracking-wider" style={{ color: palette[palette.length - 1] }}>선택 행정동</p>
              <p className="mt-1 text-xl font-black text-slate-900">{selectedRow?.dong || '선택 필요'}</p>
              {selectedRow && (
                <dl className="mt-4 divide-y divide-slate-100 border-y border-slate-100 text-xs">
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="font-semibold text-slate-500">전체 인구</dt><dd className="font-extrabold tabular-nums text-slate-800">{selectedRow.total.toLocaleString()}명</dd></div>
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="font-semibold text-slate-500">고령인구</dt><dd className="font-extrabold tabular-nums text-slate-800">{selectedRow.senior.toLocaleString()}명 · {selectedRow.seniorRatio.toFixed(1)}%</dd></div>
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="font-semibold text-slate-500">유아·청소년</dt><dd className="font-extrabold tabular-nums text-slate-800">{selectedRow.childrenYouth.toLocaleString()}명 · {selectedRow.childrenYouthRatio.toFixed(1)}%</dd></div>
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="font-semibold text-slate-500">청년·중장년</dt><dd className="font-extrabold tabular-nums text-slate-800">{selectedRow.youngMiddle.toLocaleString()}명 · {selectedRow.youngMiddleRatio.toFixed(1)}%</dd></div>
                </dl>
              )}
            </div>
          </aside>
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 px-4 py-3 text-[10px] font-medium text-slate-500 sm:px-6">
        <span>{populationSource}</span>
        <span>경계: 서울 행정동 GeoJSON · 경계 기준 2021</span>
      </div>
    </div>
  );
}

export default DongPopulationMap;
