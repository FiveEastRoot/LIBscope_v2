import { useEffect, useRef, useState } from 'react';

const toSeriesItems = (option = {}) => {
  const series = Array.isArray(option.series) ? option.series : [];
  if (!series.length) return [];

  if (series.length > 1) {
    return series
      .map(item => ({
        name: item.name || '항목',
        value: Array.isArray(item.data) ? Number(item.data[0] || 0) : 0,
        color: item.itemStyle?.color
      }))
      .filter(item => Number.isFinite(item.value) && item.value > 0);
  }

  const first = series[0];
  const yAxisData = Array.isArray(option.yAxis?.data) ? option.yAxis.data : [];
  const xAxisData = Array.isArray(option.xAxis?.data) ? option.xAxis.data : [];
  return (first.data || [])
    .map((entry, index) => {
      const value = typeof entry === 'object' ? Number(entry.value || 0) : Number(entry || 0);
      return {
        name: entry?.name || yAxisData[index] || xAxisData[index] || first.name || `항목 ${index + 1}`,
        value,
        color: entry?.itemStyle?.color || entry?.color
      };
    })
    .filter(item => Number.isFinite(item.value) && item.value > 0);
};

function SimpleChartFallback({ option }) {
  const items = toSeriesItems(option).slice(0, 12);
  const maxValue = Math.max(...items.map(item => item.value), 1);

  if (!items.length) {
    return (
      <div className="flex h-full min-h-[160px] w-full items-center justify-center rounded-lg bg-slate-50 p-4 text-center text-xs font-bold text-slate-400">
        표시할 차트 데이터가 없습니다
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[160px] w-full flex-col justify-center gap-2 rounded-lg bg-slate-50/80 p-4">
      {items.map(item => {
        const width = Math.max(6, Math.min(100, (item.value / maxValue) * 100));
        return (
          <div key={item.name} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-[11px] font-bold">
              <span className="truncate text-slate-600">{item.name}</span>
              <span className="shrink-0 text-slate-500">{item.value.toLocaleString()}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${width}%`, backgroundColor: item.color || undefined }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResponsiveEChart({ option, style, className }) {
  const chartRef = useRef(null);
  const containerRef = useRef(null);
  const [chartError, setChartError] = useState(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !option) return undefined;

    let observer;
    let resizeTimer;
    let disposed = false;
    let cleanupResize = () => {};

    const renderChart = async () => {
      try {
        const echartsModule = await import('echarts');
        const echarts = echartsModule.default || echartsModule;
        if (disposed) return;

        let chart = chartRef.current;
        if (!chart) {
          chart = echarts.init(container);
          chartRef.current = chart;
        }
        chart.setOption(option, true);
        window.setTimeout(() => setChartError(null), 0);

        const resizeChart = () => {
          if (!disposed) chart?.resize();
        };

        resizeTimer = window.setTimeout(resizeChart, 80);
        window.addEventListener('resize', resizeChart);

        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(resizeChart);
          observer.observe(container);
        }

        cleanupResize = () => {
          window.clearTimeout(resizeTimer);
          window.removeEventListener('resize', resizeChart);
          observer?.disconnect();
        };
      } catch (error) {
        console.warn('Chart render warning:', error);
        window.setTimeout(() => setChartError(error), 0);
      }
    };

    renderChart();

    return () => {
      disposed = true;
      cleanupResize();
    };
  }, [option]);

  useEffect(() => () => {
    chartRef.current?.dispose();
    chartRef.current = null;
  }, []);

  return (
    <div ref={containerRef} className={`h-full w-full min-w-0 ${className || ''}`} style={style}>
      {chartError && <SimpleChartFallback option={option} />}
    </div>
  );
}

export default ResponsiveEChart;
