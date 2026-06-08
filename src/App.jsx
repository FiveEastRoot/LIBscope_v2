/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import ReactECharts from 'echarts-for-react';
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
  Lightbulb,
  ChevronDown,
  BarChart3
} from 'lucide-react';
import libraryData from '../library_dong_mapping.json';
import cultureMetricsCsv from '../district_culture_enjoyment_metrics.csv?raw';

// 서울시 25개 자치구 목록 정렬
const guList = [...new Set(libraryData.libraries.map(lib => lib.gu))].sort();

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY || '05b872ee85af3352573dc4c52b709ddd';

const parseCsvLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
};

const parseCultureMetrics = (csvText) => {
  const lines = csvText.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]).map(header => header.replace(/^\uFEFF/, ''));
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? '';
      return row;
    }, {});
  });
};

const cultureMetricsRows = parseCultureMetrics(cultureMetricsCsv);

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const formatMetric = (value, unit = '개') => {
  const numericValue = toNumber(value);
  if (numericValue === null) return '-';
  return `${numericValue.toLocaleString()}${unit}`;
};

const formatCount = (value, unit = '') => {
  const numericValue = toNumber(value);
  if (numericValue === null) return '-';
  return `${numericValue.toLocaleString()}${unit}`;
};

const cultureMetricGroups = [
  {
    key: 'infrastructure',
    title: '문화시설 공급 기반',
    description: '자치구 내 공공 문화시설의 기본 공급 규모와 인구 대비 접근성을 함께 보는 지표입니다.',
    metrics: [
      { label: '공공문화시설', field: 'public_culture_facilities', unit: '개' },
      { label: '인구 10만 명당', field: 'public_culture_facilities_per100k', unit: '개' }
    ],
    color: 'blue'
  },
  {
    key: 'library',
    title: '도서관 문화 접근성',
    description: '도서관 기반 문화 접근성과 생활권 문화 프로그램 거점 가능성을 참고하는 지표입니다.',
    metrics: [
      { label: '전체 도서관', field: 'libraries_total', unit: '개' },
      { label: '인구 10만 명당', field: 'libraries_per100k', unit: '개' }
    ],
    color: 'indigo'
  },
  {
    key: 'performance',
    title: '공연·발표 공간 접근성',
    description: '공연 관람, 지역 예술활동, 발표회 운영과 관련된 공간 기반을 보여줍니다.',
    metrics: [
      { label: '공공공연장', field: 'public_performance_halls', unit: '개' },
      { label: '공연시설', field: 'public_performance_spaces', unit: '개' }
    ],
    color: 'emerald'
  },
  {
    key: 'exhibition',
    title: '전시·관람 자원',
    description: '박물관과 미술관 등 전시·관람형 문화자원의 분포를 확인하는 지표입니다.',
    metrics: [
      { label: '박물관·미술관', field: 'public_museums_galleries', unit: '개' },
      { label: '인구 10만 명당', field: 'public_museums_galleries_per100k', unit: '개' }
    ],
    color: 'rose'
  },
  {
    key: 'local',
    title: '생활문화 기반',
    description: '주민 참여형 문화활동, 교육, 동아리, 커뮤니티 운영 기반을 살펴보는 지표입니다.',
    metrics: [
      { label: '문화복지시설', field: 'local_culture_welfare_facilities', unit: '개' },
      { label: '생활문화센터', field: 'life_culture_centers', unit: '개' }
    ],
    color: 'amber'
  },
  {
    key: 'inclusive',
    title: '포용적 문화 접근성',
    description: '이동약자와 장애인의 문화시설 이용 여건을 참고하기 위한 보조 지표입니다.',
    metrics: [
      { label: '무장애 인증시설', field: 'barrier_free_indoor_culture_spaces', unit: '개' },
      { label: '인구 10만 명당', field: 'barrier_free_indoor_culture_spaces_per100k', unit: '개' }
    ],
    color: 'cyan'
  },
  {
    key: 'policy',
    title: '문화정책 기반',
    description: '자치구 문화정책의 제도화 수준과 최근 조례 갱신 활동을 참고하는 지표입니다.',
    metrics: [
      { label: '문화정책 조례', field: 'culture_policy_ordinance_count', unit: '건' },
      { label: '제·개정 건수', field: 'culture_policy_revision_count', unit: '건' }
    ],
    color: 'slate'
  }
];

const cultureColorClasses = {
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  rose: 'bg-rose-50 text-rose-600 border-rose-100',
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  cyan: 'bg-cyan-50 text-cyan-600 border-cyan-100',
  slate: 'bg-slate-100 text-slate-700 border-slate-200'
};

const foreignResidentTypeOrder = [
  '외국국적동포',
  '기타외국인',
  '외국인주민자녀(출생)',
  '외국인근로자',
  '결혼이민자',
  '한국국적취득자',
  '유학생'
];

const ageGroupOrder = [
  ...Array.from({ length: 20 }, (_, index) => `${index * 5}-${index * 5 + 4}세`),
  '100세 이상'
];

function PopulationModeToggle({ populationMode, onChange }) {
  return (
    <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
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

function App() {
  const [activeTab, setActiveTab] = useState('district'); // 'district' | 'library'
  const [selectedGu, setSelectedGu] = useState('강남구');
  const [selectedLibrary, setSelectedLibrary] = useState('');
  const [librariesInGu, setLibrariesInGu] = useState([]);
  const [isInsightExpanded, setIsInsightExpanded] = useState(false);
  const [socialSafetyView, setSocialSafetyView] = useState('household');
  
  // API 로딩 및 데이터 상태
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [districtData, setDistrictData] = useState(null);
  const [libraryDataDetail, setLibraryDataDetail] = useState(null);
  const [populationMode, setPopulationMode] = useState('resident');

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

  // 카카오 맵 SDK 동적 로딩
  useEffect(() => {
    if (window.kakao && window.kakao.maps) {
      setMapLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false&libraries=services`;
    script.async = true;
    
    script.onload = () => {
      window.kakao.maps.load(() => {
        setMapLoaded(true);
        setMapError(null);
      });
    };
    
    script.onerror = (err) => {
      console.error('카카오 지도 SDK 로딩 에러:', err);
      setMapError('카카오 지도 SDK 로드에 실패했습니다. 키 유효성 및 도메인 설정을 확인하세요.');
    };

    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
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

  // ECharts 옵션 제너레이터 - 연령대별 인구 분포
  const getAgeChartOption = (ageDistribution) => {
    if (!ageDistribution) return {};
    const categories = ageGroupOrder.filter(label => ageDistribution[label] !== undefined);
    const data = categories.map(label => ageDistribution[label]);
    
    // 고령층(65세 이상) 컬럼은 주황색, 나머지는 하늘색 강조
    const colors = categories.map(cat => {
      const ageNum = parseInt(cat.replace(/[^0-9]/g, ''));
      return ageNum >= 65 ? '#ff9f43' : '#54a0ff';
    });

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: categories, axisLabel: { interval: 0, rotate: 30 } },
      yAxis: { type: 'value' },
      series: [
        {
          name: '인구수',
          type: 'bar',
          data: data.map((val, idx) => ({
            value: val,
            itemStyle: { color: colors[idx] }
          }))
        }
      ]
    };
  };

  // ECharts 옵션 제너레이터 - 성별 비율 도넛 차트
  const getGenderChartOption = (genderRatio) => {
    if (!genderRatio) return {};
    return {
      tooltip: { trigger: 'item', confine: true },
      legend: {
        bottom: 0,
        left: 'center',
        itemWidth: 18,
        itemHeight: 10,
        textStyle: { color: '#64748b', fontSize: 11, fontWeight: 700 }
      },
      series: [
        {
          name: '성별 인구',
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '46%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          labelLine: { show: false },
          data: [
            { value: genderRatio.male, name: '남성', itemStyle: { color: '#8ed6fb' } },
            { value: genderRatio.female, name: '여성', itemStyle: { color: '#fac4d5' } }
          ]
        }
      ]
    };
  };

  // ECharts 옵션 제너레이터 - 100% 누적 바 차트 (다문화, 장애인, 가구 유형 비율용)
  const getStackedBarOption = (title, dataDict) => {
    if (!dataDict || Object.keys(dataDict).length === 0) return {};
    const keys = Object.keys(dataDict).sort((a, b) => Number(dataDict[b] || 0) - Number(dataDict[a] || 0));
    const total = Object.values(dataDict).reduce((a, b) => a + b, 0);

    const seriesData = keys.map(key => ({
      name: key,
      type: 'bar',
      stack: 'total',
      label: {
        show: true,
        formatter: (params) => {
          const pct = (params.value / total) * 100;
          return pct > 5 ? `${pct.toFixed(1)}%` : '';
        }
      },
      emphasis: { focus: 'series' },
      data: [dataDict[key]]
    }));

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: '0%', left: 'center' },
      grid: { left: '3%', right: '3%', top: '10%', bottom: '20%', containLabel: true },
      xAxis: { type: 'value', max: total, show: false },
      yAxis: { type: 'category', data: [title], show: false },
      series: seriesData
    };
  };

  const getOrderedComposition = (dataDict, order) => {
    if (!dataDict) return {};
    return order.reduce((result, key) => {
      const value = Number(dataDict[key] || 0);
      if (value > 0) result[key] = value;
      return result;
    }, {});
  };

  const getForeignDataBundle = (socialIndicators) => {
    const legacyMulticultural = socialIndicators?.multicultural || {};
    const residentSource = socialIndicators?.foreignResidents || legacyMulticultural;
    const residentData = getOrderedComposition(residentSource, foreignResidentTypeOrder);
    const multiculturalLooksLikeResidentTypes = Object.keys(residentData).length > 0;
    const nationalityData = socialIndicators?.registeredForeignerNationalities
      || socialIndicators?.nationalityComposition
      || (multiculturalLooksLikeResidentTypes ? {} : legacyMulticultural);
    return { residentData, nationalityData };
  };

  const buildSocialSafetySections = (socialIndicators) => {
    if (!socialIndicators) return [];
    const { residentData: foreignResidentTypeData, nationalityData: foreignNationalityData } = getForeignDataBundle(socialIndicators);
    return [
      {
        key: 'household',
        label: '가구',
        title: '가구 형태 구성',
        description: '사회안전망 대상자의 가구 형태가 어떤 유형에 집중되어 있는지 확인합니다.',
        data: socialIndicators.householdTypes
      },
      {
        key: 'disability',
        label: '장애',
        title: '장애인 대분류 구성',
        description: '장애 유형을 대분류 기준으로 묶어 대상자 구성을 간결하게 봅니다.',
        data: socialIndicators.disabilityGroups || socialIndicators.disability
      },
      {
        key: 'foreign',
        label: '외국인',
        title: '외국인 관련 구성',
        description: '외국인 주민 유형과 등록외국인 국적 구성을 함께 확인합니다.',
        data: Object.keys(foreignResidentTypeData).length > 0 ? foreignResidentTypeData : foreignNationalityData,
        residentData: foreignResidentTypeData,
        nationalityData: foreignNationalityData
      }
    ].filter(section => section.data && Object.keys(section.data).length > 0);
  };

  const getTopCompositionItems = (dataDict, limit = 5) => {
    if (!dataDict) return [];
    const total = Object.values(dataDict).reduce((sum, value) => sum + Number(value || 0), 0);
    if (!total) return [];
    return Object.entries(dataDict)
      .sort(([, a], [, b]) => Number(b || 0) - Number(a || 0))
      .slice(0, limit)
      .map(([name, value]) => ({
        name,
        value: Number(value || 0),
        ratio: (Number(value || 0) / total) * 100
      }));
  };

  const aggregateNationalityComposition = (dataDict, { minValue = 100 } = {}) => {
    if (!dataDict) return { chartData: {}, otherItems: [] };
    const sortedItems = Object.entries(dataDict)
      .map(([name, value]) => ({ name, value: Number(value || 0) }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);

    const visibleItems = [];
    const otherItems = [];
    sortedItems.forEach((item) => {
      if (item.value > minValue) {
        visibleItems.push(item);
      } else {
        otherItems.push(item);
      }
    });

    const chartData = Object.fromEntries(visibleItems.map(item => [item.name, item.value]));
    const otherTotal = otherItems.reduce((sum, item) => sum + item.value, 0);
    if (otherTotal > 0) chartData['기타 국적'] = otherTotal;
    return { chartData, otherItems };
  };

  const renderCompositionItems = (items) => (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.name}>
          <div className="flex items-center justify-between gap-3 text-xs font-bold">
            <span className="text-slate-700 truncate">{item.name}</span>
            <span className="text-slate-500 shrink-0">{item.value.toLocaleString()}명</span>
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

  const getCultureCompositionOption = (cultureMetrics) => {
    if (!cultureMetrics) return {};
    const data = [
      { name: '도서관', value: toNumber(cultureMetrics.libraries_total), itemStyle: { color: '#4f8ee8' } },
      { name: '공연시설', value: toNumber(cultureMetrics.public_performance_spaces), itemStyle: { color: '#2bbf8a' } },
      { name: '전시시설', value: toNumber(cultureMetrics.public_museums_galleries), itemStyle: { color: '#f27b9a' } },
      { name: '생활문화', value: toNumber(cultureMetrics.local_culture_welfare_facilities), itemStyle: { color: '#f4b84f' } },
      { name: '무장애 인증', value: toNumber(cultureMetrics.barrier_free_indoor_culture_spaces), itemStyle: { color: '#35b8c8' } }
    ].filter(item => item.value !== null && item.value > 0);

    return {
      tooltip: { trigger: 'item', confine: true },
      legend: {
        type: 'scroll',
        bottom: 0,
        left: 'center',
        itemWidth: 14,
        itemHeight: 9,
        textStyle: { color: '#64748b', fontSize: 11, fontWeight: 700 }
      },
      series: [
        {
          name: '문화자원 구성',
          type: 'pie',
          radius: ['46%', '70%'],
          center: ['50%', '43%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          labelLine: { show: false },
          data
        }
      ]
    };
  };

  const getCultureAccessBarOption = (cultureMetrics) => {
    if (!cultureMetrics) return {};
    const data = [
      { name: '공공문화시설', value: toNumber(cultureMetrics.public_culture_facilities_per100k), color: '#4f8ee8' },
      { name: '도서관', value: toNumber(cultureMetrics.libraries_per100k), color: '#6366f1' },
      { name: '공연장', value: toNumber(cultureMetrics.public_performance_halls_per100k), color: '#2bbf8a' },
      { name: '전시시설', value: toNumber(cultureMetrics.public_museums_galleries_per100k), color: '#f27b9a' },
      { name: '무장애 인증', value: toNumber(cultureMetrics.barrier_free_indoor_culture_spaces_per100k), color: '#35b8c8' }
    ].filter(item => item.value !== null);

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true },
      grid: { left: '3%', right: '4%', top: '10%', bottom: '10%', containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { color: '#64748b', fontSize: 11 }
      },
      yAxis: {
        type: 'category',
        data: data.map(item => item.name),
        axisLabel: { color: '#475569', fontSize: 11, fontWeight: 700 }
      },
      series: [
        {
          name: '인구 10만 명당',
          type: 'bar',
          barWidth: 16,
          data: data.map(item => ({
            value: item.value,
            itemStyle: { color: item.color, borderRadius: [0, 8, 8, 0] }
          }))
        }
      ]
    };
  };

  const formatPopulationSourceDate = (rawDate) => {
    if (!rawDate) return null;
    return rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate;
  };

  const getPopulationSourceLabel = (population) => {
    if (!population) return '행정동 통계 (BOM 백업)';
    if (population.source === 'resident_registration_csv_fallback') {
      return '주민등록인구 통계 (BOM 백업)';
    }
    if (population.source === 'SPOP_LOCAL_RESD_DONG') {
      const dateText = formatPopulationSourceDate(population.referenceDate);
      return dateText
        ? `서울 열린데이터광장(행정동 생활인구 추정치, 기준일 ${dateText})`
        : '서울 열린데이터광장(행정동 생활인구 추정치)';
    }
    if (population.source === 'living_population_unavailable') {
      return '생활인구 API 조회 대기';
    }
    if (population.source === 'csv_fallback') {
      return '행정동 통계 (BOM 백업)';
    }
    return population.source;
  };

  const getSocialIndicatorSourceLabel = (socialIndicators) => {
    if (!socialIndicators) return '사회안전망 구성 데이터';
    const dateText = formatPopulationSourceDate(socialIndicators.referenceDate);
    if (socialIndicators.sourceLabel) {
      return dateText ? `${socialIndicators.sourceLabel} (기준 ${dateText})` : socialIndicators.sourceLabel;
    }
    if (socialIndicators.source === 'kosis_social_safety_composition') {
      return dateText ? `KOSIS 사회안전망 구성 (기준 ${dateText})` : 'KOSIS 사회안전망 구성';
    }
    if (socialIndicators.source === 'csv_social_safety_fallback') {
      return '서울시 자치구 통계 (CSV 백업)';
    }
    return socialIndicators.source || '사회안전망 구성 데이터';
  };

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* 상단 고정 헤더 */}
      <header className="sticky top-0 bg-white border-b border-slate-200 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
              <BookOpen size={24} />
            </div>
            <span className="font-extrabold text-2xl tracking-tight text-blue-600">LIBscope</span>
            <span className="text-slate-400 font-medium">| 도서관 정책 의사결정 대시보드</span>
          </div>

          <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('district')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${
                activeTab === 'district' 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📊 자치구별 현황
            </button>
            <button
              onClick={() => setActiveTab('library')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${
                activeTab === 'library' 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏛️ 개별도서관별 현황
            </button>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 영역 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* 상단 필터 컨트롤러 */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4 w-full md:w-auto">
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-400 mb-1">자치구 선택</label>
              <select
                value={selectedGu}
                onChange={(e) => setSelectedGu(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
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
          
          <div className="text-slate-500 text-sm font-semibold flex items-center gap-1">
            <MapPin className="text-blue-500" size={18} />
            <span>선택 지역: 서울특별시 {selectedGu}</span>
            {activeTab === 'library' && selectedLibrary && (
              <>
                <ChevronRight size={16} />
                <span className="text-blue-600 font-bold">{selectedLibrary}</span>
              </>
            )}
          </div>
        </section>

        {/* 로딩 및 에러 처리 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-500 font-bold">실시간 공공 API 데이터를 연동 중입니다...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl mb-8 font-semibold">
            ⚠️ {error} (로컬 Fallback 백업 데이터를 제공합니다.)
          </div>
        )}

        {/* -------------------- 탭 1: 자치구별 대시보드 뷰 -------------------- */}
        {!loading && activeTab === 'district' && districtData && (
          <div className="space-y-8">

            {/* LLM 인사이트 프리뷰 영역 */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="bg-blue-50 text-blue-600 p-3 rounded-xl border border-blue-100">
                    <Lightbulb size={24} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-xl text-slate-900">{selectedGu} 종합 인사이트</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      LLM 연결 전 테스트 영역입니다. 연결 후 인구, 복지, 문화, 도서관 입지 지표를 종합해 생성됩니다.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInsightExpanded(prev => !prev)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-extrabold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {isInsightExpanded ? '접기' : '펼치기'}
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${isInsightExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[
                  '선택 지역의 인구 구조와 복지 수요를 함께 검토해 도서관 서비스 우선순위를 정리합니다.',
                  '문화시설, 생활문화 기반, 주변 공공기관 정보를 결합해 지역 내 협력 가능 지점을 탐색합니다.',
                  '최종 보고서는 수치 비교보다 정책 판단에 필요한 맥락과 실행 후보를 중심으로 구성됩니다.'
                ].map((sentence, index) => (
                  <div key={sentence} className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                    <span className="text-[10px] font-extrabold text-blue-600">PREVIEW {index + 1}</span>
                    <p className="text-sm font-bold text-slate-700 leading-relaxed mt-2">{sentence}</p>
                  </div>
                ))}
              </div>

              {isInsightExpanded && (
                <div className="mt-4 bg-blue-50/60 border border-blue-100 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 size={18} className="text-blue-600" />
                    <h4 className="font-extrabold text-sm text-blue-800">확장 인사이트 보고서 영역</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-blue-950/70 leading-relaxed">
                    <p>지역 요약, 주요 지표 변화, 서울 평균 대비 차이를 문단형 보고서로 보여줄 영역입니다.</p>
                    <p>인구·고령층·외국인 주민·장애인·수급자 구성과 문화·교육 인프라를 함께 묶습니다.</p>
                    <p>LLM 연결 후에는 근거 지표, 해석, 정책 실행 후보를 접힌 블록 안에서 확장 표시합니다.</p>
                  </div>
                </div>
              )}
            </section>
            
            {/* 자치구 개요 카드 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between h-36">
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

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between h-36">
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

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between h-36">
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

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between h-36">
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:col-span-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <h4 className="font-extrabold text-lg text-slate-800">👥 연령대별 인구 분포 (65세 이상 강조)</h4>
                    <PopulationModeToggle populationMode={populationMode} onChange={setPopulationMode} />
                  </div>
                  <p className="text-xs text-slate-400 mb-4">65세 이상 연령대는 주황색으로 강조 표시됩니다.</p>
                </div>
                <div className="h-80">
                  <ReactECharts 
                    option={getAgeChartOption(activeDistrictPopulation?.ageDistribution)} 
                    style={{ height: '100%', width: '100%' }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-2 text-right">
                  출처: {getPopulationSourceLabel(activeDistrictPopulation)}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800 mb-6">👫 성별 비율</h4>
                </div>
                <div className="h-80">
                  <ReactECharts 
                    option={getGenderChartOption(activeDistrictPopulation?.genderRatio)} 
                    style={{ height: '100%', width: '100%' }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-2 text-right">
                  출처: {getPopulationSourceLabel(activeDistrictPopulation)}
                </div>
              </div>
            </div>

            {/* 문화 역량·향유 지표 테스트 섹션 */}
            {selectedCultureMetrics && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-6">
                  <div>
                    <h4 className="font-extrabold text-lg text-slate-800">🎭 문화 역량·향유 지표 테스트</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      인사이트 문장 생성 전, 자치구 문화 지표를 별도 섹션으로 읽기 위한 화면 구성안입니다.
                    </p>
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium lg:text-right">
                    출처: 2023 서울문화지표 조사연구 / 기준연도 {selectedCultureMetrics.year}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
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
                        <ReactECharts option={getCultureCompositionOption(selectedCultureMetrics)} style={{ height: '100%', width: '100%' }} />
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                      <h5 className="font-extrabold text-sm text-slate-800 mb-1">인구 대비 접근성</h5>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        인구 10만 명당 기준으로 서로 다른 문화자원을 나란히 비교합니다.
                      </p>
                      <div className="h-64 mt-2">
                        <ReactECharts option={getCultureAccessBarOption(selectedCultureMetrics)} style={{ height: '100%', width: '100%' }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4">
                    <h5 className="font-extrabold text-sm text-blue-700 mb-2">서울시 문화향유 참고값</h5>
                    <p className="text-xs text-blue-900/70 leading-relaxed">
                      2024 서울시민 문화향유 실태조사의 축제·행사, 문화예술교육, 동호회, 소규모 지역행사 참여 의향 항목은
                      자치구별 직접 순위가 아니라 지표 해석을 보조하는 서울시 기준값으로 분리해 표시합니다.
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                    <h5 className="font-extrabold text-sm text-slate-800 mb-2">LLM 인사이트 연결 방식</h5>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      이 섹션은 지표와 해석 방향만 제공합니다. 최종 인사이트는 인구, 고령화, 외국인 주민, 장애인, 수급자,
                      도서관 반경 정보와 함께 LLM 서비스에서 종합 생성하는 구조로 분리합니다.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 교육 인프라 분석 */}
            <div className="grid grid-cols-1 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800 mb-4">🏫 교육기관 인프라 (초·중·고·대학교 수)</h4>
                  <div className="grid grid-cols-4 gap-4 text-center mt-6">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <GraduationCap className="mx-auto text-blue-500 mb-2" size={32} />
                      <span className="text-slate-400 text-xs font-bold">초등학교</span>
                      <p className="text-2xl font-extrabold text-slate-800 mt-1">
                        {formatCount(districtData.cultureAndEducation?.schools?.elementary, '개교')}
                      </p>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <GraduationCap className="mx-auto text-indigo-500 mb-2" size={32} />
                      <span className="text-slate-400 text-xs font-bold">중학교</span>
                      <p className="text-2xl font-extrabold text-slate-800 mt-1">
                        {formatCount(districtData.cultureAndEducation?.schools?.middle, '개교')}
                      </p>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <GraduationCap className="mx-auto text-purple-500 mb-2" size={32} />
                      <span className="text-slate-400 text-xs font-bold">고등학교</span>
                      <p className="text-2xl font-extrabold text-slate-800 mt-1">
                        {formatCount(districtData.cultureAndEducation?.schools?.high, '개교')}
                      </p>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <GraduationCap className="mx-auto text-rose-500 mb-2" size={32} />
                      <span className="text-slate-400 text-xs font-bold">대학교</span>
                      <p className="text-2xl font-extrabold text-slate-800 mt-1">
                        {formatCount(districtData.cultureAndEducation?.schools?.university, '개교')}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-4 text-right">
                  출처: 서울 열린데이터광장(나이스 학교 정보 및 대학 전문대학 DB API)
                </div>
              </div>
            </div>

            {/* 사회안전망 대상자 구성 분석 */}
            {activeSocialSafetySection && (
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-6">
                  <div>
                    <h4 className="font-extrabold text-lg text-slate-800">🌐 사회안전망 대상자 구성 분석</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      구성 지표를 한 번에 모두 쌓기보다, 필요한 유형을 선택해 세부 비중을 확인합니다.
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium lg:text-right">
                    출처: {getSocialIndicatorSourceLabel(districtData.socialIndicators)}
                  </span>
                </div>

                <div className="flex gap-3 overflow-x-auto pb-2 mb-6">
                  {socialSafetySections.map(section => {
                    const topItem = getTopCompositionItems(section.data, 1)[0];
                    const isActive = activeSocialSafetySection.key === section.key;
                    return (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => setSocialSafetyView(section.key)}
                        className={`min-w-52 flex-1 text-left rounded-2xl border p-4 transition-colors ${
                          isActive
                            ? 'bg-blue-50 border-blue-200 text-blue-900'
                            : 'bg-slate-50 border-slate-100 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-extrabold">{section.label}</span>
                          <span className={`text-[10px] font-extrabold px-2 py-1 rounded-full ${
                            isActive ? 'bg-blue-100 text-blue-700' : 'bg-white text-slate-500'
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
                      <div key={panel.title} className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-4">
                          <div>
                            <h5 className="font-extrabold text-base text-slate-800">{panel.title}</h5>
                            <p className="text-xs text-slate-500 leading-relaxed mt-1">{panel.description}</p>
                          </div>
                          <span className="text-[10px] font-extrabold text-slate-500 bg-white border border-slate-100 rounded-full px-3 py-1">
                            100% 누적 구성
                          </span>
                        </div>
                        <div className="h-40">
                          <ReactECharts
                            option={getStackedBarOption(panel.label, panel.data)}
                            style={{ height: '100%', width: '100%' }}
                          />
                        </div>
                        <div className="mt-5 bg-white border border-slate-100 rounded-2xl p-4">
                          <h6 className="font-extrabold text-sm text-slate-800 mb-4">구성 항목</h6>
                          {renderCompositionItems(getTopCompositionItems(panel.data, 8))}
                          {panel.otherItems.length > 0 && (
                            <p className="text-[10px] leading-relaxed text-slate-400 mt-4">
                              기타 국적 포함: {panel.otherItems.map(item => `${item.name} ${item.value.toLocaleString()}명`).join(', ')}
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
                  <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                    <div className="xl:col-span-3 bg-slate-50 border border-slate-100 rounded-2xl p-5">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-4">
                        <div>
                          <h5 className="font-extrabold text-base text-slate-800">{activeSocialSafetySection.title}</h5>
                          <p className="text-xs text-slate-500 leading-relaxed mt-1">{activeSocialSafetySection.description}</p>
                        </div>
                        <span className="text-[10px] font-extrabold text-slate-500 bg-white border border-slate-100 rounded-full px-3 py-1">
                          100% 누적 구성
                        </span>
                      </div>
                      <div className="h-44">
                        <ReactECharts
                          option={getStackedBarOption(activeSocialSafetySection.label, activeSocialSafetySection.data)}
                          style={{ height: '100%', width: '100%' }}
                        />
                      </div>
                    </div>

                    <div className="xl:col-span-2 bg-slate-50 border border-slate-100 rounded-2xl p-5">
                      <h5 className="font-extrabold text-base text-slate-800 mb-4">상위 구성 항목</h5>
                      {renderCompositionItems(activeSocialSafetyItems)}
                    </div>
                  </div>
                )}
              </section>
            )}

          </div>
        )}

        {/* -------------------- 탭 2: 개별도서관별 대시보드 뷰 -------------------- */}
        {!loading && activeTab === 'library' && libraryDataDetail && (
          <div className="space-y-8">
            
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
                    <h4 className="font-extrabold text-lg text-slate-800">👥 도서관 반경 2km 내 인구 분포 (65세 이상 강조)</h4>
                    <PopulationModeToggle populationMode={populationMode} onChange={setPopulationMode} />
                  </div>
                </div>
                <div className="h-80">
                  <ReactECharts 
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
                  <ReactECharts 
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
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:col-span-2 flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800 mb-2">📍 {libraryDataDetail.library} 주변 입지 분석</h4>
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
                    <div className="absolute inset-0 bg-slate-900/95 text-white p-6 flex flex-col justify-center items-center rounded-xl z-10 overflow-y-auto">
                      <div className="bg-rose-500/20 text-rose-300 p-4 rounded-xl border border-rose-500/30 mb-4 max-w-md text-center">
                        <p className="font-extrabold text-lg">⚠️ 카카오 지도 로드 실패</p>
                        <p className="text-xs mt-1">{mapError}</p>
                      </div>
                      <div className="text-left text-xs text-slate-300 space-y-2 max-w-md bg-slate-800/80 p-4 rounded-xl border border-slate-700">
                        <p className="font-bold text-sm text-blue-400">🛠️ 해결 방법 가이드:</p>
                        <ol className="list-decimal pl-4 space-y-2">
                          <li>
                            <strong>카카오 디벨로퍼스 로그인</strong>: <a href="https://developers.kakao.com" target="_blank" rel="noreferrer" className="text-blue-400 underline">developers.kakao.com</a> 접속
                          </li>
                          <li>
                            <strong>도메인 등록 확인</strong>: [내 애플리케이션] &gt; [앱 설정] &gt; [플랫폼] &gt; [Web 플랫폼 등록] 메뉴 이동
                          </li>
                          <li>
                            <strong>도메인 주소 추가</strong>: 아래 주소들을 줄바꿈으로 모두 입력 후 저장:
                            <pre className="bg-slate-950 p-2 rounded text-[10px] text-emerald-400 font-mono mt-1">
                              http://localhost:3000&#10;http://localhost:5173&#10;http://127.0.0.1:3000&#10;http://127.0.0.1:5173
                            </pre>
                          </li>
                          <li>
                            <strong>앱 키 일치 확인</strong>: [앱 설정] &gt; [앱 키]의 <strong>JavaScript 키</strong>가 아래와 같은지 확인하세요:
                            <code className="block bg-slate-950 p-1 rounded text-[10px] text-amber-400 font-mono mt-1 select-all">{KAKAO_JS_KEY}</code>
                          </li>
                          <li>
                            <strong>브라우저 캐시 새로고침</strong>: 설정 완료 후 브라우저에서 <kbd className="bg-slate-700 px-1 rounded text-white font-sans text-[10px]">Ctrl + F5</kbd> (또는 강력 새로고침)를 눌러주세요.
                          </li>
                        </ol>
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
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between" style={{ maxHeight: '565px' }}>
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-extrabold text-lg text-slate-800">🏢 주변 공공기관·문화시설 정보 (2km 이내)</h4>
                  </div>
                  <div className="overflow-y-auto space-y-3 pr-2" style={{ maxHeight: '440px' }}>
                    {libraryDataDetail.infrastructure.publicPlaces && libraryDataDetail.infrastructure.publicPlaces.length > 0 ? (
                      libraryDataDetail.infrastructure.publicPlaces.map((place, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-start space-x-3">
                          <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg mt-0.5"><Building size={16} /></div>
                          <div>
                            <p className="font-bold text-sm text-slate-800">{place.name}</p>
                            <p className="text-xs text-slate-400 line-clamp-1">{place.address}</p>
                            {place.category && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 mr-1 inline-block ${
                                place.category === '문화시설'
                                  ? 'bg-rose-50 text-rose-600'
                                  : 'bg-indigo-50 text-indigo-600'
                              }`}>
                                {place.category}
                              </span>
                            )}
                            <span className="text-[10px] bg-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded-full mt-1 inline-block">
                              {place.distance.toLocaleString()}m
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 text-sm font-semibold text-center py-20">검색된 공공기관/문화시설이 없습니다.</p>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-3 mt-3 text-right">
                  출처: 카카오 Local API (공공기관/문화시설 카테고리 검색)
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
                  <h4 className="font-extrabold text-lg text-slate-800 mb-4">🎭 주변 문화행사 상세정보 (2km / 자치구 내)</h4>
                  <div className="overflow-y-auto space-y-3 pr-2" style={{ maxHeight: '220px' }}>
                    {libraryDataDetail.infrastructure.nearbyEvents && libraryDataDetail.infrastructure.nearbyEvents.length > 0 ? (
                      libraryDataDetail.infrastructure.nearbyEvents.map((e, idx) => (
                        <div key={idx} className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                          <p className="font-bold text-sm text-slate-800">{e.title}</p>
                          <p className="text-xs text-slate-500 mt-1">📍 장소: {e.place}</p>
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
