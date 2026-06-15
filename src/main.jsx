import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    window.__LIBSCOPE_LAST_RENDER_ERROR__ = {
      message: error?.message || String(error),
      stack: error?.stack || '',
      componentStack: info?.componentStack || ''
    };
    console.error('LIBscope render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
          <section className="w-full max-w-lg rounded-lg border border-rose-100 bg-white p-6 shadow-sm">
            <p className="text-sm font-extrabold text-rose-600">화면을 다시 그리는 중 문제가 발생했습니다.</p>
            <p className="mt-2 text-sm text-slate-600">
              데이터를 다시 불러오면 대부분 복구됩니다. 문제가 반복되면 현재 선택한 자치구나 도서관명을 알려주세요.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              다시 불러오기
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
