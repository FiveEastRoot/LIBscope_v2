/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { 
  Building, 
  MapPin, 
  Users, 
  BookOpen, 
  Calendar, 
  GraduationCap, 
  Award,
  ChevronRight,
  Home,
  BarChart3,
  Bot,
  Shield,
  Theater,
  School,
  MapPinned,
  Sparkles,
  FileText,
  Download
} from 'lucide-react';
import libraryData from '../library_dong_mapping.json';
import MetricInterpretationPanel from './components/MetricInterpretationPanel';
import PopulationModeToggle from './components/PopulationModeToggle';
import ResponsiveEChart from './components/ResponsiveEChart';
import {
  cultureColorClasses,
  cultureEnjoymentReference2024,
  cultureMetricGroups,
  cultureMetricsRows,
  getCultureReferenceHighlightClass
} from './data/cultureMetrics';
import {
  aggregateNationalityComposition,
  buildSocialSafetySections,
  getAgeChartOption,
  getCultureAccessBarOption,
  getCultureCompositionOption,
  getGenderChartOption,
  getPopulationSourceLabel,
  getSocialIndicatorSourceLabel,
  getStackedBarOption,
  getTopCompositionItems
} from './utils/dashboardMetrics';
import { formatCount, formatMetric } from './utils/formatters';
import { getModelRecommendationBadges } from './utils/modelBadges';

// 서울시 25개 자치구 목록 정렬
const guList = [...new Set(libraryData.libraries.map(lib => lib.gu))].sort();

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY || '05b872ee85af3352573dc4c52b709ddd';
const KAKAO_SDK_SCRIPT_ID = 'kakao-map-sdk';
let kakaoMapSdkPromise = null;

const loadKakaoMapSdk = () => {
  if (window.kakao?.maps) {
    return Promise.resolve(window.kakao);
  }

  if (kakaoMapSdkPromise) {
    return kakaoMapSdkPromise;
  }

  kakaoMapSdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(KAKAO_SDK_SCRIPT_ID);
    const finishLoad = () => {
      if (!window.kakao?.maps?.load) {
        reject(new Error('카카오 지도 SDK 객체가 준비되지 않았습니다.'));
        return;
      }
      window.kakao.maps.load(() => resolve(window.kakao));
    };

    if (existingScript) {
      existingScript.addEventListener('load', finishLoad, { once: true });
      existingScript.addEventListener('error', () => reject(new Error('카카오 지도 SDK 로드에 실패했습니다.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = KAKAO_SDK_SCRIPT_ID;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false&libraries=services`;
    script.async = true;
    script.onload = finishLoad;
    script.onerror = () => {
      kakaoMapSdkPromise = null;
      reject(new Error('카카오 지도 SDK 로드에 실패했습니다.'));
    };

    document.head.appendChild(script);
  });

  return kakaoMapSdkPromise;
};

const formatInsightGeneratedAt = (value) => {
  if (!value) return '생성일 확인 대기';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '생성일 확인 대기';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

function App() {
  const [activeTab, setActiveTab] = useState('district'); // 'district' | 'library'
  const [selectedGu, setSelectedGu] = useState('강남구');
  const [selectedLibrary, setSelectedLibrary] = useState('');
  const [librariesInGu, setLibrariesInGu] = useState([]);
  const [socialSafetyView, setSocialSafetyView] = useState('household');
  const [cultureReferenceView, setCultureReferenceView] = useState('general');
  const [educationCategory, setEducationCategory] = useState('elementary');
  const [educationPage, setEducationPage] = useState(0);
  const [publicPlaceCategory, setPublicPlaceCategory] = useState('all');
  const [publicPlacePage, setPublicPlacePage] = useState(0);
  
  // API 로딩 및 데이터 상태
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [districtData, setDistrictData] = useState(null);
  const [libraryDataDetail, setLibraryDataDetail] = useState(null);
  const [populationMode, setPopulationMode] = useState('resident');
  const [llmHarness, setLlmHarness] = useState(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState(null);
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [llmProviderMode, setLlmProviderMode] = useState('cache');
  const [llmRefreshNonce, setLlmRefreshNonce] = useState(0);

  // 지도 인스턴스 참조
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const markersRef = useRef([]);
  const circlesRef = useRef([]);

  // 자치구 변경 시 해당 자치구의 도서관 목록 필터링
  useEffect(() => {
    const filtered = libraryData.libraries.filter(lib => lib.gu === selectedGu).map(lib => lib.name).sort();
    setLibrariesInGu(filtered);
    if (filtered.length > 0) {
      setSelectedLibrary(filtered[0]);
    } else {
      setSelectedLibrary('');
    }
  }, [selectedGu]);

  // 자치구별 대시보드 데이터 조회
  const fetchDistrictData = async (guName) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/insight-api`, {
        params: { type: 'district', gu: guName }
      });
      setDistrictData(res.data);
    } catch (err) {
      console.error(err);
      setError('자치구 데이터를 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 개별 도서관 대시보드 데이터 조회
  const fetchLibraryData = async (guName, libName) => {
    if (!libName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/insight-api`, {
        params: { type: 'library', gu: guName, library: libName }
      });
      setLibraryDataDetail(res.data);
    } catch (err) {
      console.error(err);
      setError('도서관 데이터를 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 탭 또는 셀렉트박스 변경 시 데이터 갱신 트리거
  useEffect(() => {
    if (activeTab === 'district') {
      fetchDistrictData(selectedGu);
    } else if (activeTab === 'library' && selectedLibrary) {
      fetchLibraryData(selectedGu, selectedLibrary);
    }
  }, [activeTab, selectedGu, selectedLibrary]);

  useEffect(() => {
    setPublicPlaceCategory('all');
    setPublicPlacePage(0);
  }, [selectedLibrary]);

  useEffect(() => {
    setPublicPlacePage(0);
  }, [publicPlaceCategory]);

  useEffect(() => {
    setEducationPage(0);
  }, [educationCategory, selectedGu]);

  useEffect(() => {
    setReportPreviewOpen(false);
    setLlmProviderMode('cache');
  }, [selectedGu]);

  // 카카오 맵 SDK 동적 로딩
  useEffect(() => {
    let cancelled = false;
    loadKakaoMapSdk()
      .then(() => {
        if (cancelled) return;
        setMapLoaded(true);
        setMapError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('카카오 지도 SDK 로딩 경고:', err);
        setMapError('카카오 지도 SDK 로드에 실패했습니다. 키 유효성 및 도메인 설정을 확인하세요.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 개별 도서관 지도 렌더링 및 오버레이 설정
  useEffect(() => {
    if (activeTab !== 'library' || !mapLoaded || !libraryDataDetail || !mapContainerRef.current) return;

    try {
      if (!window.kakao || !window.kakao.maps || !window.kakao.maps.LatLng) {
        throw new Error('카카오 지도 객체(LatLng)가 로드되지 않았습니다.');
      }

      const { lat, lng } = libraryDataDetail.coordinates || {};
      if (!lat || !lng) {
        throw new Error('도서관 좌표 정보가 올바르지 않습니다.');
      }

      const container = mapContainerRef.current;
      
      // DOM 충돌 및 불일치 예방을 위해 매번 컨테이너를 비우고 새로 초기화
      container.innerHTML = '';
      
      const options = {
        center: new window.kakao.maps.LatLng(lat, lng),
        level: 5 // 확대 레벨
      };

      // 기존 마커 및 원 데이터 메모리 초기화
      markersRef.current = [];
      circlesRef.current = [];

      // 지도 신규 바인딩
      const map = new window.kakao.maps.Map(container, options);
      mapInstanceRef.current = map;

      // 1. 도서관 중심 마커 추가
      const libraryMarker = new window.kakao.maps.Marker({
        position: options.center,
        map: map,
        title: libraryDataDetail.library
      });
      markersRef.current.push(libraryMarker);

      // 2. 반경 써클 추가 (1km: 빨강, 2km: 파랑)
      const circle1km = new window.kakao.maps.Circle({
        center: options.center,
        radius: 1000,
        strokeWeight: 2,
        strokeColor: '#ef4444',
        strokeOpacity: 0.8,
        fillColor: '#ef4444',
        fillOpacity: 0.05
      });
      circle1km.setMap(map);
      circlesRef.current.push(circle1km);

      const circle2km = new window.kakao.maps.Circle({
        center: options.center,
        radius: 2000,
        strokeWeight: 2,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.8,
        fillColor: '#3b82f6',
        fillOpacity: 0.08
      });
      circle2km.setMap(map);
      circlesRef.current.push(circle2km);

      // 3. 주변 공공기관/문화시설 마커 표시
      const publicPlaces = libraryDataDetail.infrastructure.publicPlaces || [];
      publicPlaces.forEach(place => {
        if (!place.lat || !place.lng) return;
        const markerPosition = new window.kakao.maps.LatLng(place.lat, place.lng);
        const marker = new window.kakao.maps.Marker({
          position: markerPosition,
          map: map,
          title: place.name
        });
        
        // 인포윈도우 추가
        const infowindow = new window.kakao.maps.InfoWindow({
          content: `<div style="padding:5px;font-size:12px;color:#333;width:160px;text-align:center;"><b>${place.name}</b><br><span style="font-size:10px;color:#777;">${place.category || '시설'} · ${place.distance}m</span></div>`
        });
        window.kakao.maps.event.addListener(marker, 'mouseover', () => {
          infowindow.open(map, marker);
        });
        window.kakao.maps.event.addListener(marker, 'mouseout', () => {
          infowindow.close();
        });

        markersRef.current.push(marker);
      });

      // 4. 주변 문화행사 마커 표시
      const nearbyEvents = libraryDataDetail.infrastructure.nearbyEvents || [];
      nearbyEvents.forEach(event => {
        if (!event.lat || !event.lng) return;
        const markerPosition = new window.kakao.maps.LatLng(event.lat, event.lng);
        
        const marker = new window.kakao.maps.Marker({
          position: markerPosition,
          map: map,
          title: event.title
        });

        const infowindow = new window.kakao.maps.InfoWindow({
          content: `<div style="padding:5px;font-size:12px;color:#1e293b;width:180px;"><b>${event.title}</b><br><span style="font-size:10px;color:#059669;">${event.place}</span></div>`
        });
        window.kakao.maps.event.addListener(marker, 'click', () => {
          infowindow.open(map, marker);
        });
        window.kakao.maps.event.addListener(map, 'click', () => {
          infowindow.close();
        });

        markersRef.current.push(marker);
      });

      setMapError(null);
    } catch (err) {
      console.error('지도 렌더링 에러:', err);
      setMapError(err.message);
    }
  }, [activeTab, mapLoaded, libraryDataDetail]);

  const renderCompositionItems = (items) => (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.name}>
          <div className="flex items-center justify-between gap-3 text-xs font-bold">
            <span className="text-slate-700 truncate">{item.name}</span>
            <span className="text-slate-500 shrink-0">
              {item.value.toLocaleString()}명 · {item.ratio.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 bg-white rounded-full mt-2 overflow-hidden border border-slate-100">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${Math.min(item.ratio, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );

  const getPopulationByMode = (population) => {
    if (!population) return null;
    return population.modes?.[populationMode] || population;
  };

  const activeDistrictPopulation = districtData ? getPopulationByMode(districtData.population) : null;
  const activeLibraryPopulation = libraryDataDetail ? getPopulationByMode(libraryDataDetail.demographics) : null;
  const selectedCultureMetrics = useMemo(
    () => cultureMetricsRows.find(row => row.gu === selectedGu),
    [selectedGu]
  );
  const socialSafetySections = buildSocialSafetySections(districtData?.socialIndicators);
  const activeSocialSafetySection = socialSafetySections.find(section => section.key === socialSafetyView) || socialSafetySections[0];
  const activeSocialSafetyItems = getTopCompositionItems(activeSocialSafetySection?.data);
  const activeCultureReference = cultureEnjoymentReference2024.find(group => group.key === cultureReferenceView) || cultureEnjoymentReference2024[0];
  const educationCategories = [
    { key: 'elementary', label: '초등학교', color: 'text-blue-500', active: 'bg-blue-50 border-blue-200 text-blue-900', count: districtData?.cultureAndEducation?.schools?.elementary || 0 },
    { key: 'middle', label: '중학교', color: 'text-indigo-500', active: 'bg-indigo-50 border-indigo-200 text-indigo-900', count: districtData?.cultureAndEducation?.schools?.middle || 0 },
    { key: 'high', label: '고등학교', color: 'text-purple-500', active: 'bg-purple-50 border-purple-200 text-purple-900', count: districtData?.cultureAndEducation?.schools?.high || 0 },
    { key: 'university', label: '대학교', color: 'text-rose-500', active: 'bg-rose-50 border-rose-200 text-rose-900', count: districtData?.cultureAndEducation?.schools?.university || 0 }
  ];
  const activeEducationCategory = educationCategories.find(category => category.key === educationCategory) || educationCategories[0];
  const activeEducationList = districtData?.cultureAndEducation?.schoolDetails?.[activeEducationCategory.key] || [];
  const educationPageSize = 10;
  const educationTotalPages = Math.max(1, Math.ceil(activeEducationList.length / educationPageSize));
  const safeEducationPage = Math.min(educationPage, educationTotalPages - 1);
  const pagedEducationList = activeEducationList.slice(
    safeEducationPage * educationPageSize,
    safeEducationPage * educationPageSize + educationPageSize
  );
  const educationRangeStart = activeEducationList.length ? safeEducationPage * educationPageSize + 1 : 0;
  const educationRangeEnd = Math.min((safeEducationPage + 1) * educationPageSize, activeEducationList.length);
  const groupedPublicPlaces = useMemo(() => {
    const places = libraryDataDetail?.infrastructure?.publicPlaces || [];
    return places.reduce((groups, place) => {
      const key = place.category || '기타 기관';
      groups[key] = [...(groups[key] || []), place];
      return groups;
    }, {});
  }, [libraryDataDetail]);
  const sortedPublicPlaces = useMemo(
    () => [...(libraryDataDetail?.infrastructure?.publicPlaces || [])].sort((a, b) => Number(a.distance || 0) - Number(b.distance || 0)),
    [libraryDataDetail]
  );
  const publicPlaceCategories = useMemo(
    () => ['all', ...Object.keys(groupedPublicPlaces).sort()],
    [groupedPublicPlaces]
  );
  const filteredPublicPlaces = useMemo(
    () => publicPlaceCategory === 'all'
      ? sortedPublicPlaces
      : sortedPublicPlaces.filter(place => (place.category || '기타 기관') === publicPlaceCategory),
    [publicPlaceCategory, sortedPublicPlaces]
  );
  const publicPlacePageCount = Math.max(1, Math.ceil(filteredPublicPlaces.length / 5));
  const safePublicPlacePage = Math.min(publicPlacePage, publicPlacePageCount - 1);
  const visiblePublicPlaces = filteredPublicPlaces.slice(safePublicPlacePage * 5, safePublicPlacePage * 5 + 5);
  const insightCacheStatus = llmHarness?.cacheStatus;
  const sectionCacheStatus = llmHarness?.sectionCacheStatus;
  const insightCacheHit = Boolean(insightCacheStatus?.hit);
  const sectionCacheHit = Boolean(sectionCacheStatus?.hit);
  const insightCacheUnavailable = insightCacheStatus?.available === false;
  const insightCanGenerate = Boolean(insightCacheStatus?.canGenerate);
  const insightSnapshotStale = insightCacheStatus?.reason === 'latest_gu_cache_hit_snapshot_mismatch';
  const sectionSnapshotStale = Boolean(sectionCacheStatus?.staleSnapshot)
    || sectionCacheStatus?.reason === 'latest_section_cache_hit_snapshot_mismatch';
  const insightGeneratedAtLabel = formatInsightGeneratedAt(insightCacheStatus?.generatedAt);
    const normalizeInsightCardLabel = (label) => label === '검토 방향' ? '실행 방향' : label;
    const insightCards = insightCacheHit && Array.isArray(llmHarness?.insight?.cards)
      ? llmHarness.insight.cards.map(card => ({
        ...card,
        label: normalizeInsightCardLabel(card.label)
      }))
      : [];
  const insightCardToneByLabel = {
    '핵심 판단': {
      badge: 'border-blue-100 bg-blue-50 text-blue-700',
      dot: 'bg-blue-500',
      top: 'from-blue-300 via-[#167BD9] to-[#0031A7]'
    },
    '주의 지점': {
      badge: 'border-amber-100 bg-amber-50 text-amber-700',
      dot: 'bg-amber-500',
      top: 'from-amber-300 via-orange-300 to-blue-500'
    },
      '실행 방향': {
        badge: 'border-emerald-100 bg-emerald-50 text-emerald-700',
        dot: 'bg-emerald-500',
        top: 'from-emerald-300 via-cyan-300 to-[#167BD9]'
    }
  };
  const getInsightBullets = (item) => {
    if (Array.isArray(item?.bullets) && item.bullets.length > 0) {
      return item.bullets.slice(0, 4);
    }
    return String(item?.text || '')
      .split(/(?:\n+|[.!?。]\s+|다\.\s*|함\.\s*|됨\.\s*|필요\.\s*|가능\.\s*)/)
      .map(text => text.trim())
      .filter(Boolean)
      .slice(0, 4);
  };
  const insightDisplayMetaText = llmHarness
    ? `${llmHarness.mode === 'llm' ? 'AI 생성 인사이트' : '하네스 미리보기'}${
      llmHarness.mode === 'llm' && llmHarness.aiMeta
        ? ` · ${llmHarness.aiMeta.billingRoute === 'direct-provider-api' ? '직접 키 사용' : 'Gateway 사용'}`
        : llmHarness.fallbackReason
          ? ' · 생성 실패 후 미리보기 표시'
          : ''
    }${insightCacheHit ? ` · ${insightSnapshotStale ? '이전 생성본' : 'DB 저장본'} · ${insightGeneratedAtLabel}` : insightCacheStatus?.reason === 'cache_miss' ? ' · 저장된 인사이트 없음' : insightCacheUnavailable ? ' · 캐시 연결 대기' : ''}`
    : 'AI 인사이트 대기';
  const generatedInterpretations = (insightCacheHit || sectionCacheHit) ? llmHarness?.interpretations : null;
  const socialSafetyAiInsight = generatedInterpretations?.socialSafety;
  const socialSafetySegmentToneByKey = {
    household: 'amber',
    disability: 'rose',
    foreign: 'cyan'
  };
  const activeSocialSafetySegmentInsight = socialSafetyAiInsight?.segments?.[socialSafetyView] || null;
  const activeSocialSafetySegmentTone = socialSafetySegmentToneByKey[socialSafetyView] || 'indigo';
  const insightModelBadges = getModelRecommendationBadges(
    llmHarness?.insight?.modelRecommendation || {
      defaultModel: 'gpt-5.4-mini',
      costTierLabel: '균형',
      escalationModel: 'gpt-5.4 또는 claude-sonnet-4-6'
    }
  ).slice(0, 3);

  useEffect(() => {
    if (activeTab !== 'district' || !districtData) {
      setLlmHarness(null);
      setLlmError(null);
      setLlmLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLlmLoading(true);
    setLlmError(null);

    axios.post('/api/llm-harness', {
      type: 'district_screen',
      provider: llmProviderMode,
      forceGenerate: ['direct-openai', 'direct-gemini', 'direct-anthropic', 'openai', 'gemini', 'anthropic', 'netlify-ai-gateway'].includes(llmProviderMode),
      districtData,
      cultureMetrics: selectedCultureMetrics || {}
    })
      .then((res) => {
        if (cancelled) return;
        setLlmHarness(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setLlmHarness(null);
        setLlmError('LLM 하네스 조회에 실패했습니다. 로컬 함수 연결 상태 확인 필요.');
      })
      .finally(() => {
        if (!cancelled) setLlmLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, districtData, selectedCultureMetrics, llmProviderMode, llmRefreshNonce]);

  const downloadDistrictReportMarkdown = () => {
    const markdown = llmHarness?.report?.markdown;
    if (!markdown) return;

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selectedGu}-지역사회-인사이트-보고서.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F5F8FC] text-slate-900 font-sans">
      {/* 상단 고정 헤더 */}
      <header className="sticky top-0 bg-white/95 backdrop-blur border-b border-[#A7A9B4]/30 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-2 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center min-w-0">
            <img
              src="/brand/libscope-li-header-crop.png"
              alt="LIBscope Library Insight Dashboard"
              className="h-9 sm:h-11 w-auto max-w-[170px] sm:max-w-[320px] object-contain"
            />
          </div>

          <div className="flex space-x-1 bg-[#F5F8FC] p-1 rounded-xl border border-[#A7A9B4]/25">
            <button
              onClick={() => setActiveTab('district')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 ${
                activeTab === 'district' 
                  ? 'bg-white text-[#0031A7] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <BarChart3 size={16} />
                자치구별 현황
              </span>
            </button>
            <button
              onClick={() => setActiveTab('library')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 ${
                activeTab === 'library' 
                  ? 'bg-white text-[#0031A7] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Building size={16} />
                개별도서관별 현황
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 영역 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        
        {/* 상단 필터 컨트롤러 */}
        <section className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 mb-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full md:w-auto">
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-400 mb-1">자치구 선택</label>
              <select
                value={selectedGu}
                onChange={(e) => setSelectedGu(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-48"
              >
                {guList.map(gu => (
                  <option key={gu} value={gu}>{gu}</option>
                ))}
              </select>
            </div>

            {activeTab === 'library' && (
              <div className="flex flex-col">
                <label className="text-xs font-bold text-slate-400 mb-1">도서관 선택</label>
                <select
                  value={selectedLibrary}
                  onChange={(e) => setSelectedLibrary(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                >
                  {librariesInGu.map(lib => (
                    <option key={lib} value={lib}>{lib}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          <div className="flex flex-col items-stretch md:items-end gap-2 text-slate-500 text-sm font-semibold">
            <div className="flex items-center justify-start md:justify-end gap-1">
              <MapPin className="text-blue-500" size={18} />
              <span>선택 지역: 서울특별시 {selectedGu}</span>
              {activeTab === 'library' && selectedLibrary && (
                <>
                  <ChevronRight size={16} />
                  <span className="text-blue-600 font-bold">{selectedLibrary}</span>
                </>
              )}
            </div>
            {activeTab === 'district' && (
              <button
                type="button"
                onClick={() => setReportPreviewOpen(prev => !prev)}
                disabled={llmLoading || !insightCacheHit || !llmHarness?.report}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileText size={14} />
                {reportPreviewOpen ? '자치구 보고서 미리보기 닫기' : '자치구 보고서 미리보기'}
              </button>
            )}
          </div>
        </section>

        {/* 로딩 및 에러 처리 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-500 font-bold">지역 지표와 공공 데이터를 불러오는 중입니다...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl mb-8 font-semibold">
            ⚠️ {error} (로컬 Fallback 백업 데이터를 제공합니다.)
          </div>
        )}

        {/* -------------------- 탭 1: 자치구별 대시보드 뷰 -------------------- */}
        {!loading && activeTab === 'district' && districtData && (
          <div className="flex flex-col gap-6">

            {/* LLM 인사이트 프리뷰 영역 */}
            <section className="order-[10] relative overflow-hidden rounded-2xl border border-blue-200/70 bg-gradient-to-br from-[#001f75] via-[#0031A7] to-[#167BD9] p-4 text-white shadow-[0_22px_55px_rgba(0,49,167,0.24)] sm:p-6">
              <div
                className="pointer-events-none absolute inset-0 opacity-20"
                style={{ backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.18) 0 1px, transparent 1px 12px)' }}
              />
              <div className="relative">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="rounded-xl border border-white/25 bg-white/12 p-2.5 text-white shadow-sm sm:p-3">
                    <Bot size={22} />
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/12 px-2.5 py-1 text-[10px] font-black tracking-[0.14em] text-cyan-100">
                      <Sparkles size={12} />
                      AI 작성 영역
                    </span>
                    <h3 className="mt-2 font-extrabold text-lg sm:text-xl text-white">{selectedGu} 종합 인사이트</h3>
                    <p className="text-xs font-semibold leading-relaxed text-blue-100/90 mt-1">
                      인구, 복지, 문화, 도서관 입지 지표를 함께 묶어 지역 판단의 출발점을 정리합니다.
                    </p>
                    <p className="text-[10px] text-cyan-100/90 font-bold leading-relaxed mt-2">{insightDisplayMetaText}</p>
                  </div>
                </div>
                <div className="flex flex-col items-start lg:items-end gap-2">
                  <div className="hidden sm:flex flex-wrap justify-start lg:justify-end gap-2">
                    {insightModelBadges.map(badge => (
                      <span key={`insight-model-${badge.label}`} className="rounded-full border border-white/20 bg-white/12 px-3 py-1 text-[10px] font-extrabold text-blue-50 shadow-sm">
                        {badge.label} {badge.value}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {insightCacheHit ? (
                      <div className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-extrabold shadow-sm ${
                        insightSnapshotStale
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}>
                        <Calendar size={14} />
                        {insightSnapshotStale ? '이전 생성본' : '인사이트 생성일'} {insightGeneratedAtLabel}
                      </div>
                    ) : insightCanGenerate ? (
                      <button
                        type="button"
                        onClick={() => {
                          setLlmProviderMode('direct-openai');
                          setLlmRefreshNonce(prev => prev + 1);
                        }}
                        disabled={llmLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/50 bg-white px-3 py-2 text-xs font-extrabold text-blue-700 shadow-sm transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Sparkles size={14} />
                        내 키로 AI 생성
                      </button>
                    ) : (
                      <div className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-extrabold text-blue-50">
                        <Sparkles size={14} />
                        캐시 연결 확인 중
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {insightCards.length > 0 ? (
                <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-2.5 sm:gap-3">
                  {insightCards.map(item => {
                    const tone = insightCardToneByLabel[item.label] || insightCardToneByLabel['핵심 판단'];
                    return (
                    <div key={item.label} className="relative min-h-40 overflow-hidden rounded-xl border border-white/80 bg-white/95 p-4 text-slate-900 shadow-lg sm:p-5">
                      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tone.top}`} />
                      <div className="pointer-events-none absolute right-3 top-3 select-none text-[8px] font-black tracking-[0.18em] text-blue-100">
                        AI
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${tone.badge}`}>{item.label}</span>
                      <ul className="mt-3 space-y-2">
                        {getInsightBullets(item).map((bullet, index) => (
                          <li key={`${item.label}-${index}`} className="flex gap-2 text-xs sm:text-[13px] font-extrabold leading-relaxed text-slate-700">
                            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    );
                  })}
                </div>
              ) : !llmLoading && (
                <div className="mt-5 rounded-xl border border-dashed border-white/35 bg-white/12 px-4 py-4 text-xs font-bold leading-relaxed text-blue-50">
                  <span className="mb-2 inline-flex rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-cyan-100">
                    AI 인사이트 대기
                  </span>
                  <p>
                    {insightCanGenerate
                      ? '현재 지표 스냅샷에 저장된 종합 인사이트가 없습니다. 내 키로 AI 생성을 실행하면 전문 해석 결과가 DB에 저장되고 이후에는 생성일만 표시됩니다.'
                      : '현재 캐시 저장소 상태를 확인 중입니다. 저장 가능한 상태가 확인되면 AI 생성 버튼이 활성화됩니다.'}
                  </p>
                </div>
              )}

              {llmLoading && (
                <div className="mt-4 rounded-xl border border-white/20 bg-white/12 px-4 py-3 text-xs font-bold text-blue-50">
                  {llmProviderMode === 'cache' ? 'DB 캐시 확인 중...' : llmProviderMode === 'mock' ? 'mock LLM 하네스 생성 중...' : '직접 키로 AI 해석 생성 중...'}
                </div>
              )}

              {insightCacheUnavailable && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                  DB 캐시 테이블이 아직 연결되지 않아 생성 결과가 재사용되지 않을 수 있습니다. Supabase LLM 캐시 스키마 적용 후 자동 저장됩니다.
                </div>
              )}

              {(insightSnapshotStale || sectionSnapshotStale) && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-800">
                  현재 지표 스냅샷과 정확히 일치하는 AI 생성본이 없어 가장 최근 생성본을 표시 중입니다. 화면의 지표 값과 AI 문장의 일부 수치가 다를 수 있습니다.
                </div>
              )}

              {llmHarness?.fallbackReason && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                  직접 AI 호출 실패로 mock 결과를 표시합니다. {llmHarness.aiMeta?.error || ''}
                </div>
              )}

              {llmError && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                  {llmError}
                </div>
              )}

              {reportPreviewOpen && insightCacheHit && llmHarness?.report && (
                <div className="mt-6 rounded-2xl border border-white/70 bg-white/95 p-5 text-slate-900 shadow-xl">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
                    <div>
                      <p className="inline-flex items-center gap-1.5 rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-blue-700">
                        <Sparkles size={11} />
                        AI 보고서 초안
                      </p>
                      <h4 className="text-lg font-extrabold text-slate-900 mt-1">{llmHarness.report.title}</h4>
                      <p className="text-xs font-bold text-slate-500 mt-1">{llmHarness.report.subtitle}</p>
                    </div>
                    <button
                      type="button"
                      onClick={downloadDistrictReportMarkdown}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-extrabold text-blue-700 shadow-sm hover:bg-blue-50"
                    >
                      <Download size={14} />
                      Markdown 다운로드
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {llmHarness.report.sections.map(section => (
                      <div key={section.heading} className="rounded-xl border border-cyan-100 bg-gradient-to-br from-white to-cyan-50/45 p-4 shadow-sm">
                        <h5 className="text-sm font-extrabold text-slate-800">{section.heading}</h5>
                        <p className="text-xs font-bold text-slate-600 leading-relaxed mt-2">{section.body}</p>
                        <ul className="mt-3 list-disc space-y-2 pl-4">
                          {section.bullets.slice(0, 3).map((bullet, index) => (
                            <li key={`${section.heading}-${index}`} className="text-[11px] font-semibold text-slate-500 leading-relaxed">
                              {bullet}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              </div>
            </section>
            
            {/* 자치구 개요 카드 */}
            <div className="order-[20] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="order-1 bg-blue-50/40 rounded-xl shadow-sm border border-blue-200 p-4 sm:p-5 flex flex-col justify-between min-h-32 sm:h-36">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">구내 총 인구</p>
                    <h3 className="text-2xl font-extrabold text-slate-800 mt-1">
                      {formatCount(activeDistrictPopulation?.total, '명')}
                    </h3>
                  </div>
                  <div className="bg-blue-50 text-blue-600 p-3 rounded-xl">
                    <Users size={24} />
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-2">
                  출처: {getPopulationSourceLabel(activeDistrictPopulation)}
                </div>
              </div>

              <div className="order-3 bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 flex flex-col justify-between min-h-32 sm:h-36">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">공공도서관 수</p>
                    <h3 className="text-2xl font-extrabold text-blue-600 mt-1">
                      {formatCount(districtData.cultureAndEducation?.publicLibraryCount, '개관')}
                    </h3>
                  </div>
                  <div className="bg-indigo-50 text-indigo-600 p-3 rounded-xl">
                    <BookOpen size={24} />
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-2">
                  출처: 서울 열린데이터광장(공공도서관 현황)
                </div>
              </div>

              <div className="order-2 bg-rose-50/40 rounded-xl shadow-sm border border-rose-200 p-4 sm:p-5 flex flex-col justify-between min-h-32 sm:h-36">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">기초생활 수급률</p>
                    <h3 className="text-2xl font-extrabold text-slate-800 mt-1">
                      {formatCount(districtData.welfare?.recipientRate, '%')}
                    </h3>
                    <p className="text-[10px] text-rose-500 font-semibold">
                      서울 평균: {formatCount(districtData.welfare?.seoulAvgRecipientRate, '%')}
                    </p>
                  </div>
                  <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl">
                    <Award size={24} />
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-2">
                  출처: 서울 열린데이터광장(기초생활수급자 현황, 주민등록인구 분모)
                </div>
              </div>

              <div className="order-4 bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 flex flex-col justify-between min-h-32 sm:h-36">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">당월 문화행사 수</p>
                    <h3 className="text-2xl font-extrabold text-emerald-700 mt-1">
                      {formatCount(districtData.cultureAndEducation?.liveCultureEventsMonth, '건')}
                    </h3>
                  </div>
                  <div className="bg-amber-50 text-amber-600 p-3 rounded-xl">
                    <Calendar size={24} />
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-2">
                  출처: 서울 열린데이터광장(문화행사 정보 API)
                </div>
              </div>
            </div>

            {/* 인구 구조 분석 (ECharts) */}
            <div className="order-[30] grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 lg:col-span-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <h4 className="font-extrabold text-lg text-slate-800 flex items-center gap-2"><Users size={20} className="text-blue-600" />연령대별 인구 분포</h4>
                    <PopulationModeToggle populationMode={populationMode} onChange={setPopulationMode} />
                  </div>
                  <p className="text-xs text-slate-400 mb-4">0-9세는 하늘색, 10-64세는 노랑, 65세 이상은 빨강으로 구분합니다.</p>
                </div>
                <div className="h-80">
                  <ResponsiveEChart
                    option={getAgeChartOption(activeDistrictPopulation?.ageDistribution)} 
                    style={{ height: '100%', width: '100%' }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-2 text-right">
                  출처: {getPopulationSourceLabel(activeDistrictPopulation)}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800 mb-6">👫 성별 비율</h4>
                </div>
                <div className="h-80">
                  <ResponsiveEChart
                    option={getGenderChartOption(activeDistrictPopulation?.genderRatio)} 
                    style={{ height: '100%', width: '100%' }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-2 text-right">
                  출처: {getPopulationSourceLabel(activeDistrictPopulation)}
                </div>
              </div>
            </div>

            <MetricInterpretationPanel
              packet={generatedInterpretations?.population}
              tone="blue"
              loading={llmLoading}
              error={llmError}
              className="order-[40]"
              variant="strip"
              pendingTitle="인구구조 해석"
              staleSnapshot={sectionSnapshotStale}
            />

            {/* 문화 역량·향유 지표 섹션 */}
            {selectedCultureMetrics && (
              <div className="order-[60] bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-6">
                  <div>
                    <h4 className="font-extrabold text-lg text-slate-800 flex items-center gap-2"><Theater size={20} className="text-rose-600" />문화 역량·향유 지표</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      자치구 문화 기반과 서울시 문화향유 참고값을 함께 보며 문화 접근성의 맥락을 확인합니다.
                    </p>
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium lg:text-right">
                    출처: 2023 서울문화지표 조사연구 / 기준연도 {selectedCultureMetrics.year}
                  </div>
                </div>

                <div className="mb-5 flex flex-wrap gap-2">
                  <span className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1.5 text-[11px] font-extrabold text-rose-700">
                    자치구 직접 지표: 시설 수·접근성·정책 기반
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-extrabold text-slate-600">
                    서울시 참고값: 집단별 문화향유 기준선
                  </span>
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-extrabold text-blue-700">
                    LLM 연결: 공급 기반과 향유 기준의 결합 해석
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
                  <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {cultureMetricGroups.map(group => (
                      <div key={group.key} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 min-h-44 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <h5 className="font-extrabold text-sm text-slate-800">{group.title}</h5>
                            <span className={`shrink-0 text-[10px] font-extrabold px-2 py-1 rounded-full border ${cultureColorClasses[group.color]}`}>
                              지표
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed mt-2">{group.description}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-4">
                          {group.metrics.map(metric => (
                            <div key={metric.field} className="bg-white border border-slate-100 rounded-xl p-3">
                              <p className="text-[10px] font-bold text-slate-400">{metric.label}</p>
                              <p className="text-lg font-extrabold text-slate-800 mt-1">
                                {formatMetric(selectedCultureMetrics[metric.field], metric.unit)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-6">
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                      <h5 className="font-extrabold text-sm text-slate-800 mb-1">문화자원 구성</h5>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        시설 유형이 어느 자원에 상대적으로 집중되어 있는지 확인하는 참고 차트입니다.
                      </p>
                      <div className="h-72 mt-2">
                        <ResponsiveEChart option={getCultureCompositionOption(selectedCultureMetrics)} style={{ height: '100%', width: '100%' }} />
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                      <h5 className="font-extrabold text-sm text-slate-800 mb-1">인구 대비 접근성</h5>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        인구 10만 명당 기준으로 서로 다른 문화자원을 나란히 비교합니다.
                      </p>
                      <div className="h-64 mt-2">
                        <ResponsiveEChart option={getCultureAccessBarOption(selectedCultureMetrics)} style={{ height: '100%', width: '100%' }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className={`border rounded-2xl p-4 ${activeCultureReference.theme.panel}`}>
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
                      <div>
                        <h5 className={`font-extrabold text-sm ${activeCultureReference.theme.text}`}>서울시 문화향유 참고값</h5>
                        <p className={`text-xs leading-relaxed mt-1 ${activeCultureReference.theme.subText}`}>
                          자치구별 직접 순위가 아니라, 집단별 문화향유 기준값을 LLM 인사이트 해석에 보조로 제공합니다.
                        </p>
                      </div>
                      <span className={`text-[10px] font-extrabold border rounded-full px-3 py-1 shrink-0 ${activeCultureReference.theme.chip}`}>
                        2024 서울시민 문화향유 실태조사
                      </span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                      {cultureEnjoymentReference2024.map(group => {
                        const isActive = activeCultureReference.key === group.key;
                        return (
                          <button
                            key={group.key}
                            type="button"
                            onClick={() => setCultureReferenceView(group.key)}
                            className={`min-w-32 rounded-xl border px-4 py-2 text-sm font-extrabold transition-colors ${
                              isActive ? group.theme.active : group.theme.inactive
                            }`}
                          >
                            {group.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 mb-3">
                      <p className={`text-[10px] font-bold ${activeCultureReference.theme.text}`}>{activeCultureReference.denominator}</p>
                      <div className="flex flex-wrap gap-2 text-[10px] font-bold text-slate-500">
                        <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-1">10% 미만: 낮은 응답/희소 항목</span>
                        <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-1">50% 초과: 높은 응답 항목</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {activeCultureReference.items.map(item => (
                        <div
                          key={`${activeCultureReference.key}-${item.label}-${item.value}`}
                          className={`relative overflow-hidden rounded-xl border p-3 text-current ${getCultureReferenceHighlightClass(item, activeCultureReference.theme)}`}
                        >
                          {item.unit === '%' && item.value > 50 && (
                            <>
                              <div className={`pointer-events-none absolute left-0 top-0 h-full w-1 ${activeCultureReference.theme.highRail}`} />
                              <div className={`pointer-events-none absolute left-0 right-0 top-0 h-0.5 ${activeCultureReference.theme.highTopLine}`} />
                            </>
                          )}
                          {item.unit === '%' && item.value < 10 && (
                            <div className={`pointer-events-none absolute bottom-0 left-3 h-1 w-16 rounded-t-full ${activeCultureReference.theme.lowMarker}`} />
                          )}
                          <div className="relative">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className={`text-[10px] font-extrabold ${activeCultureReference.theme.text}`}>{activeCultureReference.label}</p>
                              <p className="text-xs font-bold text-slate-700 mt-1">{item.label}</p>
                            </div>
                            <p className={`text-lg font-extrabold shrink-0 ${
                              item.unit === '%' && item.value > 50
                                ? `rounded-full border px-2 py-0.5 ${activeCultureReference.theme.highValue}`
                                : item.unit === '%' && item.value < 10
                                  ? `rounded-full border px-2 py-0.5 ${activeCultureReference.theme.lowValue}`
                                : 'text-slate-900'
                            }`}>
                              {item.value.toFixed(1)}{item.unit}
                            </p>
                          </div>
                          {item.unit === '%' && (
                            <div className={`h-2 rounded-full mt-3 overflow-hidden ${activeCultureReference.theme.barBg}`}>
                              <div className={`h-full rounded-full ${activeCultureReference.theme.bar}`} style={{ width: `${Math.min(item.value, 100)}%` }} />
                            </div>
                          )}
                          <p className={`text-[10px] mt-2 leading-relaxed ${activeCultureReference.theme.baseText}`}>분모: {item.base}</p>
                          <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">{item.note}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <MetricInterpretationPanel
                    packet={generatedInterpretations?.culture}
                    tone="rose"
                    loading={llmLoading}
                    error={llmError}
                    variant="strip"
                    pendingTitle="문화 역량·향유 해석"
                    staleSnapshot={sectionSnapshotStale}
                  />
                </div>
              </div>
            )}

            {/* 교육 인프라 분석 */}
            <div className="order-[70] grid grid-cols-1 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-5">
                    <div>
                      <h4 className="font-extrabold text-lg text-slate-800 flex items-center gap-2"><School size={20} className="text-indigo-600" />교육기관 인프라</h4>
                      <p className="text-xs text-slate-400 mt-1">학교급을 선택하면 해당 자치구 내 학교명과 주소를 목록으로 확인합니다.</p>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium lg:text-right">
                      출처: 서울 열린데이터광장(나이스 학교 정보 및 대학 전문대학 DB API)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {educationCategories.map(category => {
                      const isActive = activeEducationCategory.key === category.key;
                      return (
                        <button
                          key={category.key}
                          type="button"
                          onClick={() => {
                            setEducationCategory(category.key);
                            setEducationPage(0);
                          }}
                          className={`text-left rounded-xl border p-4 transition-colors ${
                            isActive ? category.active : 'bg-slate-50 border-slate-100 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <GraduationCap className={`${category.color} mb-2`} size={24} />
                          <span className="text-xs font-bold opacity-70">{category.label}</span>
                          <p className="text-2xl font-extrabold mt-1">{formatCount(category.count, '개교')}</p>
                        </button>
                      );
                    })}
                  </div>

                  <div className={`mt-5 rounded-xl border p-4 ${activeEducationCategory.active}`}>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                      <div>
                        <p className="text-[10px] font-extrabold opacity-70">선택 교육기관</p>
                        <h5 className="text-base font-extrabold mt-1">{activeEducationCategory.label} 목록</h5>
                      </div>
                      <span className="text-xs font-extrabold">{activeEducationList.length || activeEducationCategory.count}개교</span>
                    </div>

                    {activeEducationList.length > 0 ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          {pagedEducationList.map((school, index) => (
                            <div
                              key={`${school.name}-${safeEducationPage}-${index}`}
                              className="min-h-16 rounded-lg border border-white/70 bg-white px-3 py-2.5"
                            >
                              <p className="text-sm font-extrabold text-slate-800 truncate">{school.name || '-'}</p>
                              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-2">{school.address || '주소 정보 없음'}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <p className="text-[10px] font-bold opacity-70">
                            {educationRangeStart}-{educationRangeEnd} / {activeEducationList.length}개교 표시
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEducationPage(prev => Math.max(0, prev - 1))}
                              disabled={safeEducationPage === 0}
                              className="rounded-lg border border-white/70 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-slate-50"
                            >
                              이전
                            </button>
                            <span className="min-w-14 text-center text-xs font-extrabold opacity-70">
                              {safeEducationPage + 1}/{educationTotalPages}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEducationPage(prev => Math.min(educationTotalPages - 1, prev + 1))}
                              disabled={safeEducationPage >= educationTotalPages - 1}
                              className="rounded-lg border border-white/70 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-slate-50"
                            >
                              다음
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-white/70 bg-white/80 px-4 py-8 text-center">
                        <p className="text-sm font-extrabold text-slate-600">상세 학교 목록 대기</p>
                        <p className="text-xs text-slate-400 mt-1">현재 응답에는 개수만 제공됩니다. API 상세 목록이 수신되면 학교명과 주소가 표시됩니다.</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-5">
                    <MetricInterpretationPanel
                      packet={generatedInterpretations?.education}
                      tone="indigo"
                      loading={llmLoading}
                      error={llmError}
                      variant="strip"
                      pendingTitle="교육 인프라 해석"
                      staleSnapshot={sectionSnapshotStale}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 사회안전망 대상자 구성 분석 */}
            {activeSocialSafetySection && (
              <section className="order-[80] bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-6">
                  <div>
                    <h4 className="font-extrabold text-lg text-slate-800 flex items-center gap-2"><Shield size={20} className="text-blue-600" />사회안전망 대상자 구성 분석</h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium lg:text-right">
                    출처: {getSocialIndicatorSourceLabel(districtData.socialIndicators)}
                  </span>
                </div>

                <div className="mb-5">
                  <MetricInterpretationPanel
                    packet={socialSafetyAiInsight}
                    tone="indigo"
                    loading={llmLoading}
                    error={llmError}
                    variant="strip"
                    pendingTitle="사회안전망 종합 해석"
                    pendingMessage="가구·장애·외국인 구성 해석이 생성되면 이 영역에 종합 판단이 표시됩니다."
                    staleSnapshot={sectionSnapshotStale}
                  />
                </div>

                <div className="flex gap-3 overflow-x-auto pb-2 mb-5">
                  {socialSafetySections.map(section => {
                    const topItem = getTopCompositionItems(section.data, 1)[0];
                    const isActive = activeSocialSafetySection.key === section.key;
                    return (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => setSocialSafetyView(section.key)}
                        className={`min-w-52 flex-1 text-left rounded-xl border p-3.5 transition-colors ${
                          isActive
                            ? section.theme.active
                            : section.theme.inactive
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-extrabold">{section.label}</span>
                          <span className={`text-[10px] font-extrabold px-2 py-1 rounded-full ${
                            isActive ? section.theme.pill : 'bg-slate-50 text-slate-500'
                          }`}>
                            {Object.keys(section.data).length}개 항목
                          </span>
                        </div>
                        {topItem && (
                          <p className="text-xs font-bold mt-3 opacity-80 truncate">
                            최상위: {topItem.name} {topItem.value.toLocaleString()}명
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>

                {activeSocialSafetySection.key === 'foreign' ? (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {[
                      {
                        title: '외국인 주민 유형',
                        description: '외국국적동포, 기타외국인, 외국인주민자녀(출생), 외국인근로자, 결혼이민자, 한국국적취득자, 유학생 기준 구성입니다.',
                        label: '외국인 주민',
                        data: activeSocialSafetySection.residentData,
                        otherItems: []
                      },
                      {
                        title: '외국인 국적 유형',
                        description: '등록외국인을 국적 기준으로 나눈 구성입니다.',
                        label: '국적',
                        ...(() => {
                          const nationality = aggregateNationalityComposition(activeSocialSafetySection.nationalityData);
                          return { data: nationality.chartData, otherItems: nationality.otherItems };
                        })()
                      }
                    ].filter(panel => panel.data && Object.keys(panel.data).length > 0).map(panel => (
                      <div key={panel.title} className={`min-w-0 border rounded-2xl p-5 ${activeSocialSafetySection.theme.panel}`}>
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-4">
                          <div>
                            <h5 className={`font-extrabold text-base ${activeSocialSafetySection.theme.text}`}>{panel.title}</h5>
                            <p className="text-xs text-slate-500 leading-relaxed mt-1">{panel.description}</p>
                          </div>
                          <span className={`text-[10px] font-extrabold rounded-full px-3 py-1 ${activeSocialSafetySection.theme.pill}`}>
                            100% 누적 구성
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                          {getTopCompositionItems(panel.data, 3).map(item => (
                            <div key={`${panel.title}-${item.name}`} className={`rounded-lg border px-3 py-2 ${activeSocialSafetySection.theme.item}`}>
                              <p className={`text-[10px] font-bold ${activeSocialSafetySection.theme.text}`}>{item.name}</p>
                              <p className="text-sm font-extrabold text-slate-800 mt-0.5">{item.value.toLocaleString()}명</p>
                            </div>
                          ))}
                        </div>
                        <div className="h-40 w-full min-w-0">
                          <ResponsiveEChart
                            option={getStackedBarOption(panel.label, panel.data)}
                            style={{ height: '100%', width: '100%' }}
                          />
                        </div>
                        <div className={`mt-5 border rounded-xl p-4 ${activeSocialSafetySection.theme.item}`}>
                          <h6 className={`font-extrabold text-sm mb-4 ${activeSocialSafetySection.theme.text}`}>상세 항목</h6>
                          {renderCompositionItems(getTopCompositionItems(panel.data, 8))}
                          {panel.otherItems.length > 0 && (
                            <p className="text-[10px] leading-relaxed text-slate-400 mt-4">
                              기타 국적 포함: {panel.otherItems.slice(0, 12).map(item => `${item.name} ${item.value.toLocaleString()}명`).join(', ')}
                              {panel.otherItems.length > 12 ? ` 외 ${panel.otherItems.length - 12}개` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {(!activeSocialSafetySection.residentData || Object.keys(activeSocialSafetySection.residentData).length === 0) && (
                      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                        <h5 className="font-extrabold text-base text-amber-800">외국인 주민 유형 데이터 대기</h5>
                        <p className="text-xs text-amber-900/70 leading-relaxed mt-2">
                          현재 fallback 응답에는 국적 데이터만 포함되어 있습니다. KOSIS 외국인 주민 유형 데이터가 Supabase에 반영되면
                          외국국적동포, 기타외국인, 외국인주민자녀(출생), 외국인근로자, 결혼이민자, 한국국적취득자, 유학생 구성이 표시됩니다.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`min-w-0 border rounded-2xl p-5 ${activeSocialSafetySection.theme.panel}`}>
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-4">
                      <div>
                        <h5 className={`font-extrabold text-base ${activeSocialSafetySection.theme.text}`}>{activeSocialSafetySection.title}</h5>
                        <p className="text-xs text-slate-500 leading-relaxed mt-1">{activeSocialSafetySection.description}</p>
                      </div>
                      <span className={`text-[10px] font-extrabold rounded-full px-3 py-1 ${activeSocialSafetySection.theme.pill}`}>
                        100% 누적 구성
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_2fr] gap-5">
                      <div className="space-y-4">
                        <div>
                          <p className={`text-[10px] font-extrabold ${activeSocialSafetySection.theme.text}`}>대표 수치</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2">
                          {activeSocialSafetyItems.slice(0, 3).map(item => (
                            <div key={`${activeSocialSafetySection.key}-${item.name}`} className={`rounded-lg border px-3 py-2 ${activeSocialSafetySection.theme.item}`}>
                              <p className={`text-[10px] font-bold ${activeSocialSafetySection.theme.text}`}>{item.name}</p>
                              <p className="text-sm font-extrabold text-slate-800 mt-0.5">{item.value.toLocaleString()}명</p>
                            </div>
                          ))}
                        </div>
                        {activeSocialSafetySection.key === 'disability' && (
                          <p className="text-[10px] text-slate-500 leading-relaxed">
                            장애 대분류는 신체/운동, 감각/의사소통, 내부기관/만성, 발달, 정신, 기타 기준으로 세부 유형을 묶은 값입니다.
                          </p>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="h-44 w-full min-w-0">
                          <ResponsiveEChart
                            option={getStackedBarOption(activeSocialSafetySection.label, activeSocialSafetySection.data)}
                            style={{ height: '100%', width: '100%' }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className={`mt-5 border rounded-xl p-4 ${activeSocialSafetySection.theme.item}`}>
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-4">
                        <div>
                          <h5 className={`font-extrabold text-sm ${activeSocialSafetySection.theme.text}`}>상세 항목</h5>
                        </div>
                        <span className={`text-[10px] font-extrabold rounded-full px-3 py-1 ${activeSocialSafetySection.theme.pill}`}>
                          {Object.keys(activeSocialSafetySection.data).length}개 항목
                        </span>
                      </div>
                      {renderCompositionItems(activeSocialSafetyItems)}
                    </div>
                  </div>
                )}

                <div className="mt-5">
                  <MetricInterpretationPanel
                    packet={activeSocialSafetySegmentInsight}
                    tone={activeSocialSafetySegmentTone}
                    variant="strip"
                    pendingTitle={`${activeSocialSafetySection.label} 해석`}
                    pendingMessage="선택한 대상자 구성에 대한 인사이트가 생성되면 이 영역에 표시됩니다."
                    staleSnapshot={sectionSnapshotStale}
                  />
                </div>
              </section>
            )}

          </div>
        )}

        {/* -------------------- 탭 2: 개별도서관별 대시보드 뷰 -------------------- */}
        {!loading && activeTab === 'library' && libraryDataDetail && (
          <div className="space-y-8">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-start gap-4">
                <div className="bg-indigo-50 text-indigo-600 p-3 rounded-xl border border-indigo-100">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h3 className="font-extrabold text-xl text-slate-900">{libraryDataDetail.library} 입지 요약</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    반경 2km 인구, 수급자 규모, 주변 공공기관·문화시설을 함께 보며 서비스 협력 가능성을 확인합니다.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <span className="text-[10px] font-extrabold text-blue-600">이용권역</span>
                  <p className="text-sm font-bold text-slate-700 mt-2">
                    반경 2km 내 {formatCount(activeLibraryPopulation?.total, '명')} 규모의 잠재 이용권역을 봅니다.
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <span className="text-[10px] font-extrabold text-rose-600">복지 수요</span>
                  <p className="text-sm font-bold text-slate-700 mt-2">
                    인접 행정동 평균 수급자수 {libraryDataDetail.welfare.avgRecipientCount.toLocaleString()}명을 기준으로 접근 지원 필요성을 검토합니다.
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <span className="text-[10px] font-extrabold text-emerald-600">협력 자원</span>
                  <p className="text-sm font-bold text-slate-700 mt-2">
                    주변 공공기관·문화시설 {libraryDataDetail.infrastructure.publicPlaces?.length || 0}곳과 문화행사 {libraryDataDetail.infrastructure.nearbyEvents?.length || 0}건을 함께 확인합니다.
                  </p>
                </div>
              </div>
            </section>
            
            {/* 개요 정보 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between h-36">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">도서관 반경 2km 총인구</p>
                    <h3 className="text-2xl font-extrabold text-slate-800 mt-1">
                      {formatCount(activeLibraryPopulation?.total, '명')}
                    </h3>
                  </div>
                  <div className="bg-blue-50 text-blue-600 p-3 rounded-xl">
                    <Users size={24} />
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-2">
                  출처: {getPopulationSourceLabel(activeLibraryPopulation)}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between h-36">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">반경 내 평균 수급자수</p>
                    <h3 className="text-2xl font-extrabold text-blue-600 mt-1">
                      {libraryDataDetail.welfare.avgRecipientCount.toLocaleString()}명
                    </h3>
                    <p className="text-[10px] text-rose-500 font-semibold">
                      서울 평균: {libraryDataDetail.welfare.seoulAvgRecipientCount.toLocaleString()}명
                    </p>
                  </div>
                  <div className="bg-indigo-50 text-indigo-600 p-3 rounded-xl">
                    <Home size={24} />
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-2">
                  출처: 행정동 기초생활수급자 통계 (BOM 백업)
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between h-36">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">소재지 주소</p>
                    <p className="text-xs font-bold text-slate-700 mt-2 line-clamp-2">
                      {libraryDataDetail.address}
                    </p>
                  </div>
                  <div className="bg-amber-50 text-amber-600 p-3 rounded-xl">
                    <MapPin size={24} />
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-2">
                  출처: 서울 열린데이터광장(공공도서관 현황)
                </div>
              </div>
            </div>

            {/* 인구 구조 분석 (2km 반경) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:col-span-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <h4 className="font-extrabold text-lg text-slate-800 flex items-center gap-2"><Users size={20} className="text-blue-600" />도서관 반경 2km 내 인구 분포</h4>
                    <PopulationModeToggle populationMode={populationMode} onChange={setPopulationMode} />
                  </div>
                </div>
                <div className="h-80">
                  <ResponsiveEChart
                    option={getAgeChartOption(activeLibraryPopulation?.ageDistribution)} 
                    style={{ height: '100%', width: '100%' }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-2 text-right">
                  출처: {getPopulationSourceLabel(activeLibraryPopulation)}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800 mb-4">👫 성별 비율</h4>
                </div>
                <div className="h-80">
                  <ResponsiveEChart
                    option={getGenderChartOption(activeLibraryPopulation?.genderRatio)} 
                    style={{ height: '100%', width: '100%' }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-2 text-right">
                  출처: {getPopulationSourceLabel(activeLibraryPopulation)}
                </div>
              </div>
            </div>

            {/* 지도 공간 분석 및 인프라 매핑 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:col-span-3 flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800 mb-2 flex items-center gap-2"><MapPinned size={20} className="text-blue-600" />{libraryDataDetail.library} 주변 입지 분석</h4>
                  <p className="text-xs text-slate-400 mb-4">
                    빨간색 원: 1km 반경 (문화행사 연동) | 파란색 원: 2km 반경 (공공기관 연동)
                  </p>
                </div>
                <div 
                  ref={mapContainerRef} 
                  className="w-full bg-slate-100 rounded-xl border border-slate-200 flex-grow relative"
                  style={{ minHeight: '450px' }}
                >
                  {mapError && (
                    <div className="absolute inset-0 bg-slate-900/90 text-white p-6 flex flex-col justify-center items-center rounded-xl z-10">
                      <div className="bg-rose-500/20 text-rose-100 p-5 rounded-xl border border-rose-400/30 max-w-md text-center">
                        <p className="font-extrabold text-lg">지도 정보를 불러오지 못했습니다</p>
                        <p className="text-xs mt-2 text-rose-100/80">{mapError}</p>
                        <p className="text-xs mt-3 text-slate-300 leading-relaxed">
                          주변 공공기관·문화시설 목록과 행정동 정보는 계속 확인할 수 있습니다. 지도 도메인 설정은 관리자 환경에서 점검이 필요합니다.
                        </p>
                      </div>
                    </div>
                  )}
                  {!mapLoaded && !mapError && (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-slate-400 font-semibold">카카오 지도 모듈을 로딩하는 중...</p>
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-3 text-right">
                  출처: 카카오 맵 API SDK
                </div>

                <div className="mt-6 border-t border-slate-100 pt-5">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
                    <h5 className="font-extrabold text-base text-slate-800 flex items-center gap-2"><Building size={18} className="text-indigo-600" />주변 공공기관·문화시설 정보 (2km 이내)</h5>
                    <span className="text-[10px] font-bold text-slate-400">
                      출처: 카카오 Local API (공공기관/문화시설 카테고리 검색)
                    </span>
                  </div>
                  {sortedPublicPlaces.length > 0 ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {Object.entries(groupedPublicPlaces).map(([category, places]) => {
                          const nearest = [...places].sort((a, b) => Number(a.distance || 0) - Number(b.distance || 0))[0];
                          const tone = category === '문화시설'
                            ? 'bg-rose-50 border-rose-100 text-rose-700'
                            : 'bg-indigo-50 border-indigo-100 text-indigo-700';
                          return (
                            <div key={category} className={`rounded-xl border p-4 ${tone}`}>
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-extrabold">{category}</p>
                                <span className="text-lg font-extrabold">{places.length}곳</span>
                              </div>
                              {nearest && (
                                <p className="text-[10px] font-bold mt-2 opacity-80">
                                  최근접: {nearest.name} · {nearest.distance.toLocaleString()}m
                                </p>
                              )}
                            </div>
                          );
                        })}
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-slate-700">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-extrabold">전체 검색 결과</p>
                            <span className="text-lg font-extrabold">{sortedPublicPlaces.length}곳</span>
                          </div>
                          <p className="text-[10px] font-bold mt-2 text-slate-500">
                            유형 필터를 적용해 5곳씩 거리순으로 표시합니다.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {publicPlaceCategories.map(category => {
                          const isActive = publicPlaceCategory === category;
                          const count = category === 'all'
                            ? sortedPublicPlaces.length
                            : groupedPublicPlaces[category]?.length || 0;
                          return (
                            <button
                              key={category}
                              type="button"
                              onClick={() => setPublicPlaceCategory(category)}
                              className={`rounded-lg border px-3 py-2 text-xs font-extrabold transition-colors ${
                                isActive
                                  ? 'bg-slate-900 border-slate-900 text-white'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {category === 'all' ? '전체' : category}
                              <span className={`ml-2 ${isActive ? 'text-white/70' : 'text-slate-400'}`}>{count}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
                        <div className="hidden md:grid grid-cols-[120px_1fr_90px] gap-3 bg-slate-50 px-4 py-2 text-[10px] font-extrabold text-slate-400">
                          <span>유형</span>
                          <span>기관명 / 주소</span>
                          <span className="text-right">거리</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {visiblePublicPlaces.map((place, idx) => (
                            <div key={`${place.name}-${idx}`} className="grid grid-cols-1 md:grid-cols-[120px_1fr_90px] gap-2 md:gap-3 px-4 py-3 items-center hover:bg-slate-50/70">
                              <span className={`w-fit rounded-full px-2 py-1 text-[10px] font-extrabold ${
                                place.category === '문화시설'
                                  ? 'bg-rose-50 text-rose-600'
                                  : 'bg-indigo-50 text-indigo-600'
                              }`}>
                                {place.category || '기타 기관'}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{place.name}</p>
                                <p className="text-xs text-slate-400 truncate mt-0.5">{place.address}</p>
                              </div>
                              <p className="text-xs font-extrabold text-slate-600 md:text-right">
                                {place.distance.toLocaleString()}m
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <p className="text-[10px] text-slate-400">
                          {filteredPublicPlaces.length === 0
                            ? '선택한 유형의 기관이 없습니다.'
                            : `${filteredPublicPlaces.length}곳 중 ${safePublicPlacePage * 5 + 1}-${Math.min(safePublicPlacePage * 5 + visiblePublicPlaces.length, filteredPublicPlaces.length)} 표시`}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPublicPlacePage(page => Math.max(0, page - 1))}
                            disabled={publicPlacePage === 0}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                          >
                            이전
                          </button>
                          <span className="text-xs font-extrabold text-slate-500">
                            {safePublicPlacePage + 1} / {publicPlacePageCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPublicPlacePage(page => Math.min(publicPlacePageCount - 1, page + 1))}
                            disabled={publicPlacePage >= publicPlacePageCount - 1}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                          >
                            다음
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm font-semibold text-center py-10 bg-slate-50 border border-slate-100 rounded-xl">검색된 공공기관/문화시설이 없습니다.</p>
                  )}
                </div>
              </div>
            </div>
            {/* 하단 3분할 뷰: 행정동 / 행사 목록 상세 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800 mb-4">🏠 반경 2km 이내 행정동 목록</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {libraryDataDetail.dongs.map((dong, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center text-sm font-bold text-slate-700">
                        {dong}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-4 text-right">
                  출처: 서울시 공공도서관 반경 2km 행정동 매핑 데이터
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between" style={{ maxHeight: '350px' }}>
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800 mb-4 flex items-center gap-2"><Theater size={20} className="text-emerald-600" />주변 문화행사 상세정보 (2km / 자치구 내)</h4>
                  <div className="overflow-y-auto space-y-3 pr-2" style={{ maxHeight: '220px' }}>
                    {libraryDataDetail.infrastructure.nearbyEvents && libraryDataDetail.infrastructure.nearbyEvents.length > 0 ? (
                      libraryDataDetail.infrastructure.nearbyEvents.map((e, idx) => (
                        <div key={idx} className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                          <p className="font-bold text-sm text-slate-800">{e.title}</p>
                          <p className="text-xs text-slate-500 mt-1">장소: {e.place}</p>
                          <p className="text-xs text-slate-400 mt-0.5">📅 기간: {e.startDate} ~ {e.endDate}</p>
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full mt-2 inline-block">
                            {typeof e.distance === 'number' ? `도서관에서 ${e.distance.toLocaleString()}m` : e.distance}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 text-sm font-semibold text-center py-12">현재 진행 중인 문화행사가 없습니다.</p>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-3 mt-3 text-right">
                  출처: 서울 열린데이터광장(문화행사 정보 API)
                </div>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* 푸터 */}
      <footer className="bg-white border-t border-slate-200 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-400 text-xs font-semibold">
          <p>© 2026 LIBscope Dashboard. 서울특별시 공공도서관 및 행정동 생활인구 API(백업 포함) 연동 서비스.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
