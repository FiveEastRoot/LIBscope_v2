import { lazy, Suspense, useEffect, useRef } from 'react';

const LazyReactECharts = lazy(() => import('echarts-for-react'));

function ResponsiveEChart({ option, style, className }) {
  const chartRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const resizeChart = () => {
      chartRef.current?.getEchartsInstance?.()?.resize();
    };

    resizeChart();
    const resizeTimer = window.setTimeout(resizeChart, 80);
    window.addEventListener('resize', resizeChart);

    let observer;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => resizeChart());
      observer.observe(containerRef.current);
    }

    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', resizeChart);
      observer?.disconnect();
    };
  }, [option]);

  return (
    <div ref={containerRef} className={`h-full w-full min-w-0 ${className || ''}`}>
      <Suspense
        fallback={
          <div className="flex h-full min-h-[160px] w-full items-center justify-center rounded-lg bg-slate-50 text-xs font-bold text-slate-400">
            차트 로딩 중
          </div>
        }
      >
        <LazyReactECharts
          ref={chartRef}
          option={option}
          style={{ height: '100%', width: '100%', ...style }}
          onChartReady={chart => chart?.resize?.()}
        />
      </Suspense>
    </div>
  );
}

export default ResponsiveEChart;
