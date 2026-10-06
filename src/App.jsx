/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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
  Download,
  Search,
  Landmark,
  Library,
  Drama,
  GalleryVerticalEnd,
  UsersRound,
  Accessibility,
  ScrollText,
  Target
} from 'lucide-react';
import libraryData from '../library_dong_mapping.json';
import MetricInterpretationPanel from './components/MetricInterpretationPanel';
import PopulationModeToggle from './components/PopulationModeToggle';
import ResponsiveEChart from './components/ResponsiveEChart';
import DongPopulationMap from './components/DongPopulationMap';
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

const cultureEnjoymentAiReference2024 = cultureEnjoymentReference2024.map(({ key, label, denominator, items }) => ({
  key,
  label,
  denominator,
  items: items.map(({ label: itemLabel, value, unit, base, note }) => ({
    label: itemLabel,
    value,
    unit,
    base,
    note
  }))
}));

const cultureMetricIcons = {
  infrastructure: Landmark,
  library: Library,
  performance: Drama,
  exhibition: GalleryVerticalEnd,
  local: UsersRound,
  inclusive: Accessibility,
  policy: ScrollText
};

const educationMarkerColors = {
  elementary: '#3b82f6',
  middle: '#6366f1',
  high: '#a855f7',
  university: '#f43f5e'
};
const educationGradeLabels = {
  elementary: '초등학교',
  middle: '중학교',
  high: '고등학교',
  university: '대학교'
};
const cultureFacilityTypes = [
  { key: 'all', label: '전체 시설', color: '#0f766e' },
  { key: 'library', label: '도서관', color: '#059669' },
  { key: 'museum', label: '박물관·기념관', color: '#2563eb' },
  { key: 'exhibition', label: '미술관·전시', color: '#7c3aed' },
  { key: 'performance', label: '공연장·극장', color: '#e11d48' },
  { key: 'community', label: '문화센터·문화회관', color: '#d97706' },
  { key: 'other', label: '기타 문화시설', color: '#475569' }
];
const cultureFacilityColors = Object.fromEntries(cultureFacilityTypes.map(type => [type.key, type.color]));

const reportSectionThemes = [
  { icon: Target, accent: 'text-blue-700', iconBox: 'border-blue-200 bg-blue-50 text-blue-700', rule: 'border-blue-100', bullet: 'bg-blue-500' },
  { icon: Users, accent: 'text-cyan-700', iconBox: 'border-cyan-200 bg-cyan-50 text-cyan-700', rule: 'border-cyan-100', bullet: 'bg-cyan-500' },
  { icon: Landmark, accent: 'text-violet-700', iconBox: 'border-violet-200 bg-violet-50 text-violet-700', rule: 'border-violet-100', bullet: 'bg-violet-500' },
  { icon: GraduationCap, accent: 'text-indigo-700', iconBox: 'border-indigo-200 bg-indigo-50 text-indigo-700', rule: 'border-indigo-100', bullet: 'bg-indigo-500' },
  { icon: Shield, accent: 'text-rose-700', iconBox: 'border-rose-200 bg-rose-50 text-rose-700', rule: 'border-rose-100', bullet: 'bg-rose-500' },
  { icon: BookOpen, accent: 'text-emerald-700', iconBox: 'border-emerald-200 bg-emerald-50 text-emerald-700', rule: 'border-emerald-100', bullet: 'bg-emerald-500' }
];

const splitReportSentences = text => String(text || '')
  .trim()
  .split(/(?<=[.!?])\s+/)
  .filter(Boolean);

const splitReportBulletLines = text => String(text || '')
  .split(/\s*\/\s*/)
  .map(line => line.trim())
  .filter(Boolean);

const createEducationMarkerIcon = ({ selected = false, dimmed = false, color = '#4f46e5' } = {}) => {
  const size = selected ? 42 : 32;
  const background = dimmed ? '#94a3b8' : color;
  const opacity = dimmed ? 0.55 : 1;
  return L.divIcon({
    className: '',
    html: `<span aria-hidden="true" style="display:flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;border:${selected ? 3 : 2}px solid white;border-radius:9999px;background:${background};box-shadow:0 ${selected ? 7 : 4}px ${selected ? 18 : 12}px rgba(15,23,42,.${selected ? 38 : 28});font-size:${selected ? 20 : 16}px;opacity:${opacity}">🎓</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 2)]
  });
};

const createCultureFacilityMarkerIcon = ({ selected = false, dimmed = false, color = '#0f766e', typeKey = 'other' } = {}) => {
  const size = selected ? 42 : 32;
  const glyph = typeKey === 'library' ? '📚' : '🏛️';
  return L.divIcon({
    className: '',
    html: `<span aria-hidden="true" style="display:flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;border:${selected ? 3 : 2}px solid white;border-radius:9999px;background:${dimmed ? '#94a3b8' : color};box-shadow:0 ${selected ? 7 : 4}px ${selected ? 18 : 12}px rgba(15,23,42,.${selected ? 38 : 28});font-size:${selected ? 19 : 15}px;opacity:${dimmed ? 0.55 : 1}">${glyph}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 2)]
  });
};

const districtSectionTabs = [
  { key: 'overview', label: '종합' },
  { key: 'population', label: '인구' },
  { key: 'cultureEducation', label: '문화·교육' },
  { key: 'welfare', label: '생활·복지' }
];
const cultureEducationSubTabs = [
  { key: 'culture', number: '01·02', label: '문화 기반·향유·참여', icon: Theater, active: 'border-emerald-300 bg-emerald-600 text-white', iconColor: 'text-emerald-700' },
  { key: 'education', number: '03', label: '교육 환경', icon: GraduationCap, active: 'border-indigo-300 bg-indigo-600 text-white', iconColor: 'text-indigo-600' }
];

const sumPopulationAgeRange = (ageDistribution = {}, minAge, maxAge = null) => (
  Object.entries(ageDistribution).reduce((sum, [label, rawValue]) => {
    const range = String(label).match(/^(\d{1,3})[-~](\d{1,3})세$/);
    const over = String(label).match(/^(\d{1,3})세 이상$/);
    const startAge = range ? Number(range[1]) : over ? Number(over[1]) : null;
    if (startAge === null || startAge < minAge || (maxAge !== null && startAge > maxAge)) return sum;
    return sum + Number(rawValue || 0);
  }, 0)
);

const getSafeExternalUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

// 서울시 25개 자치구 목록 정렬
const guList = [...new Set(libraryData.libraries.map(lib => lib.gu))].sort();

function PopulationSource({ population, className = '' }) {
  const showDelayed = population?.source === 'SPOP_LOCAL_RESD_DONG' && population?.isDelayed;
  return (
    <div className={className}>
      <div>출처: {getPopulationSourceLabel(population)}</div>
      {showDelayed && (
        <div className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
          최근 정상값 대체 · 원천 제공 {population.dataLagDays}일 지연
        </div>
      )}
    </div>
  );
}

const publicPlaceMarkerColors = {
  PO3: '#4f46e5',
  CT1: '#e11d48'
};
const getPublicPlaceKey = place => `${place.name || ''}|${place.address || ''}|${place.categoryCode || place.category || ''}`;

const createLibraryAnalysisMarkerIcon = (kind = 'place', { categoryCode, selected = false, dimmed = false } = {}) => {
  const styles = {
    target: { color: '#1d4ed8', glyph: '📚', size: 42 },
    place: { color: publicPlaceMarkerColors[categoryCode] || '#64748b', glyph: '🏛️', size: 32 },
    event: { color: '#059669', glyph: '🎭', size: 34 }
  };
  const style = styles[kind] || styles.place;
  const size = selected ? style.size + 10 : style.size;
  const color = dimmed ? '#94a3b8' : style.color;
  return L.divIcon({
    className: '',
    html: `<span aria-hidden="true" style="display:flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;border:${selected ? 4 : 3}px solid white;border-radius:9999px;background:${color};box-shadow:0 ${selected ? 8 : 5}px ${selected ? 20 : 15}px rgba(15,23,42,.${selected ? 4 : 3});font-size:${size >= 40 ? 19 : 15}px;opacity:${dimmed ? 0.5 : 1}">${style.glyph}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 2)]
  });
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
  const [districtSectionTab, setDistrictSectionTab] = useState('overview');
  const [cultureEducationSubTab, setCultureEducationSubTab] = useState('culture');
  const [selectedGu, setSelectedGu] = useState('강남구');
  const [selectedLibrary, setSelectedLibrary] = useState('');
  const [librariesInGu, setLibrariesInGu] = useState([]);
  const [libraryTargetMode, setLibraryTargetMode] = useState('library');
  const [addressQuery, setAddressQuery] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState('');
  const [addressSearching, setAddressSearching] = useState(false);
  const [addressError, setAddressError] = useState(null);
  const libraryTargetModeRef = useRef('library');
  const sourceRequestRef = useRef(null);
  const [socialSafetyView, setSocialSafetyView] = useState('household');
  const [cultureReferenceView, setCultureReferenceView] = useState('general');
  const [educationCategory, setEducationCategory] = useState('elementary');
  const [educationPage, setEducationPage] = useState(0);
  const [selectedEducationSchoolKey, setSelectedEducationSchoolKey] = useState(null);
  const [cultureEventFilter, setCultureEventFilter] = useState('all');
  const [cultureEventCategory, setCultureEventCategory] = useState('all');
  const [cultureEventSort, setCultureEventSort] = useState('statusDate');
  const [cultureEventPage, setCultureEventPage] = useState(0);
  const [cultureFacilityCategory, setCultureFacilityCategory] = useState('all');
  const [cultureFacilityPage, setCultureFacilityPage] = useState(0);
  const [selectedCultureFacilityKey, setSelectedCultureFacilityKey] = useState(null);
  const [publicPlaceCategory, setPublicPlaceCategory] = useState('all');
  const [publicPlacePage, setPublicPlacePage] = useState(0);
  const [selectedPublicPlaceKey, setSelectedPublicPlaceKey] = useState(null);
  const [nearbyEventSourceFilter, setNearbyEventSourceFilter] = useState('all');
  
  // API 로딩 및 데이터 상태
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [districtData, setDistrictData] = useState(null);
  const [libraryDataDetail, setLibraryDataDetail] = useState(null);
  const [populationMode, setPopulationMode] = useState('resident');
  const [dongPopulationSort, setDongPopulationSort] = useState('total');
  const [selectedDongPopulation, setSelectedDongPopulation] = useState('');
  const [llmHarness, setLlmHarness] = useState(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState(null);
  const [exportingData, setExportingData] = useState(false);
  const [dataExportMessage, setDataExportMessage] = useState('');
  const [dataExportError, setDataExportError] = useState('');

  useEffect(() => {
    setDataExportMessage('');
    setDataExportError('');
  }, [activeTab, selectedGu, selectedLibrary, libraryTargetMode, resolvedAddress]);

  // 지도 인스턴스 참조
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const publicPlaceMarkerEntriesRef = useRef(new Map());
  const [mapError, setMapError] = useState(null);
  const educationMapContainerRef = useRef(null);
  const educationMapInstanceRef = useRef(null);
  const educationMarkerEntriesRef = useRef(new Map());
  const [educationMapError, setEducationMapError] = useState(null);
  const [educationMappedCount, setEducationMappedCount] = useState(0);
  const cultureFacilityMapContainerRef = useRef(null);
  const cultureFacilityMapInstanceRef = useRef(null);
  const cultureFacilityMarkerEntriesRef = useRef(new Map());
  const [cultureFacilityMapError, setCultureFacilityMapError] = useState(null);
  const [cultureFacilityMappedCount, setCultureFacilityMappedCount] = useState(0);

  useEffect(() => {
    if (!cultureEducationSubTabs.some(tab => tab.key === cultureEducationSubTab)) {
      setCultureEducationSubTab('culture');
    }
  }, [cultureEducationSubTab]);

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
    setDistrictData(null);
    sourceRequestRef.current?.abort();
    const controller = new AbortController();
    sourceRequestRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/insight-api`, {
        params: { type: 'district', gu: guName, cacheVersion: 'culture-events-kcisa-v7' },
        signal: controller.signal
      });
      if (sourceRequestRef.current !== controller) return;
      setDistrictData(res.data);
    } catch (err) {
      if (axios.isCancel(err) || sourceRequestRef.current !== controller) return;
      console.error(err);
      setError('자치구 데이터를 불러오는 데 실패했습니다.');
    } finally {
      if (sourceRequestRef.current === controller) setLoading(false);
    }
  };

  // 개별 도서관 대시보드 데이터 조회
  const fetchLibraryData = async (guName, libName) => {
    if (!libName) return;
    sourceRequestRef.current?.abort();
    const controller = new AbortController();
    sourceRequestRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/insight-api`, {
        params: { type: 'library', gu: guName, library: libName, cacheVersion: 'nearby-events-dual-source-v2' },
        signal: controller.signal
      });
      if (sourceRequestRef.current !== controller || libraryTargetModeRef.current !== 'library') return;
      setLibraryDataDetail(res.data);
    } catch (err) {
      if (axios.isCancel(err) || sourceRequestRef.current !== controller) return;
      console.error(err);
      setError('도서관 데이터를 불러오는 데 실패했습니다.');
    } finally {
      if (sourceRequestRef.current === controller) setLoading(false);
    }
  };

  const fetchLocationData = async ({ guName, lat, lng, address }) => {
    sourceRequestRef.current?.abort();
    const controller = new AbortController();
    sourceRequestRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/insight-api`, {
        params: { type: 'location', gu: guName, lat, lng, cacheVersion: 'nearby-events-dual-source-v2' },
        signal: controller.signal
      });
      if (sourceRequestRef.current !== controller || libraryTargetModeRef.current !== 'address') return;
      setLibraryDataDetail({
        ...res.data,
        address,
        targetLabel: '입력 위치'
      });
      setResolvedAddress(address);
    } catch (err) {
      if (axios.isCancel(err) || sourceRequestRef.current !== controller) return;
      console.error(err);
      setError(err.response?.data?.error || '입력 위치 데이터를 불러오는 데 실패했습니다.');
    } finally {
      if (sourceRequestRef.current === controller) setLoading(false);
    }
  };

  const handleAddressAnalysis = async (event) => {
    event.preventDefault();
    const query = addressQuery.trim();
    if (!query) {
      setAddressError('분석할 서울시 주소를 입력하세요.');
      return;
    }

    setAddressSearching(true);
    setAddressError(null);
    setError(null);
    setLibraryDataDetail(null);
    setResolvedAddress('');
    try {
      const response = await axios.get('/api/insight-api', {
        params: { type: 'geocode', address: query }
      });
      const { gu: guName, address: normalizedAddress, lat, lng } = response.data || {};

      if (!guList.includes(guName)) {
        throw new Error('서울시 25개 자치구에 해당하는 주소만 분석할 수 있습니다.');
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('주소의 좌표를 확인할 수 없습니다.');
      }

      setSelectedGu(guName);
      await fetchLocationData({ guName, lat, lng, address: normalizedAddress });
    } catch (err) {
      console.error(err);
      setAddressError(err.response?.data?.error || err.message || '주소 분석에 실패했습니다.');
    } finally {
      setAddressSearching(false);
    }
  };

  const changeLibraryTargetMode = (mode) => {
    sourceRequestRef.current?.abort();
    libraryTargetModeRef.current = mode;
    setLibraryTargetMode(mode);
    setLoading(false);
    setLibraryDataDetail(null);
    setResolvedAddress('');
    setAddressError(null);
    setError(null);
  };

  // 탭 또는 셀렉트박스 변경 시 데이터 갱신 트리거
  useEffect(() => {
    if (activeTab === 'district') {
      fetchDistrictData(selectedGu);
    } else if (activeTab === 'library' && libraryTargetMode === 'library' && selectedLibrary) {
      fetchLibraryData(selectedGu, selectedLibrary);
    }
  }, [activeTab, selectedGu, selectedLibrary, libraryTargetMode]);

  useEffect(() => {
    setPublicPlaceCategory('all');
    setPublicPlacePage(0);
    setSelectedPublicPlaceKey(null);
    setNearbyEventSourceFilter('all');
  }, [selectedLibrary, libraryTargetMode, resolvedAddress]);

  useEffect(() => {
    setPublicPlacePage(0);
    setSelectedPublicPlaceKey(null);
  }, [publicPlaceCategory]);

  useEffect(() => {
    setSelectedPublicPlaceKey(null);
  }, [publicPlacePage]);

  useEffect(() => {
    setEducationPage(0);
    setSelectedEducationSchoolKey(null);
  }, [educationCategory, selectedGu]);

  useEffect(() => {
    setSelectedEducationSchoolKey(null);
  }, [educationPage]);

  useEffect(() => {
    setCultureEventPage(0);
  }, [cultureEventFilter, cultureEventCategory, cultureEventSort, selectedGu]);

  useEffect(() => {
    setCultureEventCategory('all');
  }, [selectedGu]);

  useEffect(() => {
    setCultureFacilityPage(0);
    setSelectedCultureFacilityKey(null);
  }, [cultureFacilityCategory, selectedGu]);

  useEffect(() => {
    setSelectedCultureFacilityKey(null);
  }, [cultureFacilityPage]);

  // 개별 도서관 지도 렌더링 및 오버레이 설정
  useEffect(() => {
    const clearMap = () => {
      if (mapInstanceRef.current) mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      publicPlaceMarkerEntriesRef.current.clear();
    };

    if (activeTab !== 'library' || !libraryDataDetail || !mapContainerRef.current) {
      clearMap();
      return clearMap;
    }

    try {
      const { lat, lng } = libraryDataDetail.coordinates || {};
      const center = [Number(lat), Number(lng)];
      if (!center.every(Number.isFinite)) {
        throw new Error('기준 위치 좌표 정보가 올바르지 않습니다.');
      }

      const container = mapContainerRef.current;
      clearMap();
      container.innerHTML = '';
      const map = L.map(container, { scrollWheelZoom: true, minZoom: 12, maxZoom: 18 }).setView(center, 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        minZoom: 12,
        maxZoom: 18
      }).addTo(map);
      mapInstanceRef.current = map;

      const createPopupContent = (title, detail, accentClass) => {
        const content = document.createElement('div');
        const name = document.createElement('strong');
        name.className = 'block text-xs text-slate-900';
        name.textContent = title;
        const description = document.createElement('span');
        description.className = `mt-1 block text-[10px] font-bold ${accentClass}`;
        description.textContent = detail;
        content.append(name, description);
        return content;
      };

      L.circle(center, {
        radius: 1000,
        color: '#ef4444',
        weight: 2,
        opacity: 0.8,
        fillColor: '#ef4444',
        fillOpacity: 0.04
      }).addTo(map);
      const circle2km = L.circle(center, {
        radius: 2000,
        color: '#3b82f6',
        weight: 2,
        opacity: 0.8,
        fillColor: '#3b82f6',
        fillOpacity: 0.06
      }).addTo(map);

      L.marker(center, {
        title: libraryDataDetail.targetLabel || libraryDataDetail.library || '기준 위치',
        icon: createLibraryAnalysisMarkerIcon('target'),
        zIndexOffset: 1000
      }).addTo(map).bindPopup(createPopupContent(
        libraryDataDetail.targetLabel || libraryDataDetail.library || '기준 위치',
        '분석 기준 위치',
        'text-blue-700'
      ));

      const publicPlaces = libraryDataDetail.infrastructure.publicPlaces || [];
      publicPlaces.forEach(place => {
        const position = [Number(place.lat), Number(place.lng)];
        if (!position.every(Number.isFinite)) return;
        const placeKey = getPublicPlaceKey(place);
        const marker = L.marker(position, {
          title: place.name,
          icon: createLibraryAnalysisMarkerIcon('place', { categoryCode: place.categoryCode })
        }).addTo(map).bindPopup(createPopupContent(
          place.name || '주변 시설',
          `${place.category || '시설'} · ${Number(place.distance || 0).toLocaleString()}m`,
          place.categoryCode === 'CT1' ? 'text-rose-700' : 'text-indigo-700'
        ));
        marker.on('click', () => setSelectedPublicPlaceKey(placeKey));
        publicPlaceMarkerEntriesRef.current.set(placeKey, { marker, categoryCode: place.categoryCode });
      });

      const nearbyEvents = libraryDataDetail.infrastructure.nearbyEvents || [];
      nearbyEvents.forEach(event => {
        const position = [Number(event.lat), Number(event.lng)];
        if (!position.every(Number.isFinite)) return;
        L.marker(position, {
          title: event.title,
          icon: createLibraryAnalysisMarkerIcon('event')
        }).addTo(map).bindPopup(createPopupContent(
          event.title || '주변 문화행사',
          `${event.place || '장소 확인 필요'} · ${Number(event.distance || 0).toLocaleString()}m`,
          'text-emerald-700'
        ));
      });

      map.fitBounds(circle2km.getBounds(), { padding: [24, 24] });
      setMapError(null);
    } catch (err) {
      clearMap();
      console.error('지도 렌더링 에러:', err);
      setMapError(err.message);
    }

    return clearMap;
  }, [activeTab, libraryDataDetail]);

  useEffect(() => {
    publicPlaceMarkerEntriesRef.current.forEach(({ marker, categoryCode }, placeKey) => {
      const isSelected = selectedPublicPlaceKey === placeKey;
      marker.setIcon(createLibraryAnalysisMarkerIcon('place', {
        categoryCode,
        selected: isSelected,
        dimmed: Boolean(selectedPublicPlaceKey) && !isSelected
      }));
      marker.setZIndexOffset(isSelected ? 1000 : 0);
      if (isSelected) marker.openPopup();
      else marker.closePopup();
    });
  }, [selectedPublicPlaceKey]);

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
  const sortedDongPopulationRows = useMemo(() => (
    [...(activeDistrictPopulation?.dongBreakdown || [])]
      .map(row => {
        const total = Math.round(Number(row.total || 0));
        const childrenYouth = Math.round(sumPopulationAgeRange(row.ageDistribution, 0, 19));
        const youngMiddle = Math.round(sumPopulationAgeRange(row.ageDistribution, 20, 64));
        const senior = Math.round(sumPopulationAgeRange(row.ageDistribution, 65));
        const toRatio = value => total > 0 ? (value / total) * 100 : 0;

        return {
          ...row,
          total,
          childrenYouth,
          childrenYouthRatio: toRatio(childrenYouth),
          youngMiddle,
          youngMiddleRatio: toRatio(youngMiddle),
          senior,
          seniorRatio: toRatio(senior)
        };
      })
      .sort((a, b) => Number(b[dongPopulationSort] || 0) - Number(a[dongPopulationSort] || 0) || String(a.dong).localeCompare(String(b.dong), 'ko'))
  ), [activeDistrictPopulation, dongPopulationSort]);
  const selectedDongPopulationRowClass = ['senior', 'seniorRatio'].includes(dongPopulationSort)
    ? 'bg-red-100 ring-1 ring-inset ring-red-300 [&>*]:!bg-red-100'
    : ['childrenYouth', 'childrenYouthRatio'].includes(dongPopulationSort)
      ? 'bg-green-100 ring-1 ring-inset ring-green-300 [&>*]:!bg-green-100'
      : ['youngMiddle', 'youngMiddleRatio'].includes(dongPopulationSort)
        ? 'bg-yellow-100 ring-1 ring-inset ring-yellow-300 [&>*]:!bg-yellow-100'
        : 'bg-blue-100 ring-1 ring-inset ring-blue-300 [&>*]:!bg-blue-100';
  const isAddressTarget = libraryDataDetail?.targetType === 'address';
  const libraryTargetName = libraryDataDetail?.targetLabel || libraryDataDetail?.library || '기준 위치';
  const distanceOriginLabel = isAddressTarget ? '기준 위치' : '도서관';
  const selectedCultureMetrics = useMemo(
    () => cultureMetricsRows.find(row => row.gu === selectedGu),
    [selectedGu]
  );
  const socialSafetySections = buildSocialSafetySections(districtData?.socialIndicators);
  const activeSocialSafetySection = socialSafetySections.find(section => section.key === socialSafetyView) || socialSafetySections[0];
  const activeSocialSafetyItems = getTopCompositionItems(activeSocialSafetySection?.data);
  const activeCultureReference = cultureEnjoymentReference2024.find(group => group.key === cultureReferenceView) || cultureEnjoymentReference2024[0];
  const schoolTypeCategories = [
    { key: 'elementary', label: '초등학교', active: 'bg-blue-50 border-blue-200 text-blue-900', count: districtData?.cultureAndEducation?.schools?.elementary || 0 },
    { key: 'middle', label: '중학교', active: 'bg-indigo-50 border-indigo-200 text-indigo-900', count: districtData?.cultureAndEducation?.schools?.middle || 0 },
    { key: 'high', label: '고등학교', active: 'bg-purple-50 border-purple-200 text-purple-900', count: districtData?.cultureAndEducation?.schools?.high || 0 },
    { key: 'university', label: '대학교', active: 'bg-rose-50 border-rose-200 text-rose-900', count: districtData?.cultureAndEducation?.schools?.university || 0 }
  ];
  const educationCategories = [
    {
      key: 'all',
      label: '전체 학교',
      active: 'bg-slate-100 border-slate-300 text-slate-900',
      count: schoolTypeCategories.reduce((sum, category) => sum + category.count, 0)
    },
    ...schoolTypeCategories
  ];
  const activeEducationCategory = educationCategories.find(category => category.key === educationCategory) || educationCategories[0];
  const activeEducationList = useMemo(
    () => {
      const details = districtData?.cultureAndEducation?.schoolDetails || {};
      const keys = educationCategory === 'all'
        ? ['elementary', 'middle', 'high', 'university']
        : [educationCategory];
      return keys.flatMap(gradeKey => (
        (details[gradeKey] || []).map(school => ({ ...school, gradeKey }))
      ));
    },
    [districtData, educationCategory]
  );
  const educationPageSize = 10;
  const educationTotalPages = Math.max(1, Math.ceil(activeEducationList.length / educationPageSize));
  const safeEducationPage = Math.min(educationPage, educationTotalPages - 1);
  const pagedEducationList = useMemo(() => activeEducationList.slice(
    safeEducationPage * educationPageSize,
    safeEducationPage * educationPageSize + educationPageSize
  ), [activeEducationList, safeEducationPage]);
  const educationRangeStart = activeEducationList.length ? safeEducationPage * educationPageSize + 1 : 0;
  const educationRangeEnd = Math.min((safeEducationPage + 1) * educationPageSize, activeEducationList.length);
  const districtCultureEvents = useMemo(
    () => districtData?.cultureAndEducation?.cultureEvents || [],
    [districtData]
  );
  const cultureEventCounts = useMemo(() => {
    const categoryEvents = cultureEventCategory === 'all'
      ? districtCultureEvents
      : districtCultureEvents.filter(eventItem => eventItem.category === cultureEventCategory);
    return {
      all: categoryEvents.length,
      ongoing: categoryEvents.filter(eventItem => eventItem.status === 'ongoing').length,
      upcoming: categoryEvents.filter(eventItem => eventItem.status === 'upcoming').length
    };
  }, [cultureEventCategory, districtCultureEvents]);
  const cultureEventCategories = useMemo(() => {
    const statusEvents = cultureEventFilter === 'all'
      ? districtCultureEvents
      : districtCultureEvents.filter(eventItem => eventItem.status === cultureEventFilter);
    const counts = new Map();
    statusEvents.forEach(eventItem => {
      const category = eventItem.category || '기타';
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return [
      { key: 'all', label: '전체 유형', count: statusEvents.length },
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
        .map(([key, count]) => ({ key, label: key, count }))
    ];
  }, [cultureEventFilter, districtCultureEvents]);
  const filteredCultureEvents = useMemo(
    () => districtCultureEvents.filter(eventItem => (
      (cultureEventFilter === 'all' || eventItem.status === cultureEventFilter)
      && (cultureEventCategory === 'all' || eventItem.category === cultureEventCategory)
    )),
    [cultureEventFilter, cultureEventCategory, districtCultureEvents]
  );
  const sortedCultureEvents = useMemo(() => [...filteredCultureEvents].sort((a, b) => {
    const titleOrder = String(a.title || '').localeCompare(String(b.title || ''), 'ko');
    if (cultureEventSort === 'startAsc') {
      return String(a.startDate || '9999-12-31').localeCompare(String(b.startDate || '9999-12-31')) || titleOrder;
    }
    if (cultureEventSort === 'startDesc') {
      return String(b.startDate || '').localeCompare(String(a.startDate || '')) || titleOrder;
    }
    if (cultureEventSort === 'endAsc') {
      return String(a.endDate || a.startDate || '9999-12-31').localeCompare(String(b.endDate || b.startDate || '9999-12-31')) || titleOrder;
    }
    if (cultureEventSort === 'titleAsc') return titleOrder;
    if (cultureEventSort === 'categoryAsc') {
      return String(a.category || '').localeCompare(String(b.category || ''), 'ko') || titleOrder;
    }
    const statusOrder = Number(a.status !== 'ongoing') - Number(b.status !== 'ongoing');
    return statusOrder
      || String(a.startDate || '9999-12-31').localeCompare(String(b.startDate || '9999-12-31'))
      || titleOrder;
  }), [cultureEventSort, filteredCultureEvents]);
  const cultureEventPageSize = 8;
  const cultureEventPageCount = Math.max(1, Math.ceil(sortedCultureEvents.length / cultureEventPageSize));
  const safeCultureEventPage = Math.min(cultureEventPage, cultureEventPageCount - 1);
  const visibleCultureEvents = sortedCultureEvents.slice(
    safeCultureEventPage * cultureEventPageSize,
    safeCultureEventPage * cultureEventPageSize + cultureEventPageSize
  );
  const districtCultureFacilities = useMemo(() => {
    const kakaoFacilities = (districtData?.cultureAndEducation?.cultureFacilities || [])
      .filter(facility => facility.typeKey !== 'library');
    const internalLibraries = libraryData.libraries
      .filter(library => library.gu === selectedGu && Number.isFinite(Number(library.lat)) && Number.isFinite(Number(library.lng)))
      .map(library => ({
        id: `internal-library:${library.name}`,
        name: library.name,
        address: library.address || '',
        lat: Number(library.lat),
        lng: Number(library.lng),
        phone: '',
        placeUrl: '',
        categoryName: '내부 도서관 정보',
        typeKey: 'library',
        typeLabel: '도서관'
      }));
    return [...internalLibraries, ...kakaoFacilities];
  }, [districtData, selectedGu]);
  const cultureFacilityCategories = useMemo(() => cultureFacilityTypes.map(type => ({
    ...type,
    count: type.key === 'all'
      ? districtCultureFacilities.length
      : districtCultureFacilities.filter(facility => facility.typeKey === type.key).length
  })), [districtCultureFacilities]);
  const filteredCultureFacilities = useMemo(
    () => cultureFacilityCategory === 'all'
      ? districtCultureFacilities
      : districtCultureFacilities.filter(facility => facility.typeKey === cultureFacilityCategory),
    [cultureFacilityCategory, districtCultureFacilities]
  );
  const educationMapLibraries = useMemo(
    () => districtCultureFacilities.filter(facility => facility.typeKey === 'library'),
    [districtCultureFacilities]
  );
  const cultureFacilityMapFacilities = useMemo(
    () => cultureFacilityCategory === 'all' || cultureFacilityCategory === 'library'
      ? filteredCultureFacilities
      : [...educationMapLibraries, ...filteredCultureFacilities],
    [cultureFacilityCategory, educationMapLibraries, filteredCultureFacilities]
  );
  const fixedCultureFacilityLibraryCount = cultureFacilityCategory === 'all' || cultureFacilityCategory === 'library'
    ? 0
    : educationMapLibraries.length;
  const cultureFacilityPageSize = 8;
  const cultureFacilityPageCount = Math.max(1, Math.ceil(filteredCultureFacilities.length / cultureFacilityPageSize));
  const safeCultureFacilityPage = Math.min(cultureFacilityPage, cultureFacilityPageCount - 1);
  const visibleCultureFacilities = filteredCultureFacilities.slice(
    safeCultureFacilityPage * cultureFacilityPageSize,
    safeCultureFacilityPage * cultureFacilityPageSize + cultureFacilityPageSize
  );
  const cultureFacilityRangeStart = filteredCultureFacilities.length ? safeCultureFacilityPage * cultureFacilityPageSize + 1 : 0;
  const cultureFacilityRangeEnd = Math.min((safeCultureFacilityPage + 1) * cultureFacilityPageSize, filteredCultureFacilities.length);

  useEffect(() => {
    const clearEducationMap = () => {
      if (educationMapInstanceRef.current) {
        educationMapInstanceRef.current.remove();
      }
      educationMapInstanceRef.current = null;
      educationMarkerEntriesRef.current.clear();
    };

    if (
      activeTab !== 'district'
      || districtSectionTab !== 'cultureEducation'
      || cultureEducationSubTab !== 'education'
      || !educationMapContainerRef.current
      || activeEducationList.length === 0
    ) {
      clearEducationMap();
      setEducationMappedCount(0);
      return () => {
        clearEducationMap();
      };
    }

    try {
      const schoolsWithCoordinates = activeEducationList.filter(school => (
        Number.isFinite(Number(school.lat)) && Number.isFinite(Number(school.lng))
      ));
      if (schoolsWithCoordinates.length === 0) {
        throw new Error('현재 목록의 학교 위치 좌표가 준비되지 않았습니다. 데이터를 다시 불러와 주세요.');
      }

      clearEducationMap();
      educationMapContainerRef.current.innerHTML = '';
      const map = L.map(educationMapContainerRef.current, { scrollWheelZoom: true, minZoom: 11, maxZoom: 17 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        minZoom: 11,
        maxZoom: 17
      }).addTo(map);
      educationMapInstanceRef.current = map;

      const bounds = [];
      schoolsWithCoordinates.forEach(school => {
        const position = [Number(school.lat), Number(school.lng)];
        const schoolKey = `${school.name}|${school.address}`;
        const infoContent = document.createElement('div');
        const name = document.createElement('strong');
        name.className = 'block text-xs text-slate-900';
        name.textContent = school.name || '교육기관';
        const category = document.createElement('span');
        category.className = 'mt-1 block text-[10px] font-bold';
        category.style.color = educationMarkerColors[school.gradeKey] || '#475569';
        category.textContent = school.category || educationGradeLabels[school.gradeKey] || '학교';
        const address = document.createElement('span');
        address.className = 'mt-1 block text-[10px] leading-relaxed text-slate-500';
        address.textContent = school.address || '주소 정보 없음';
        infoContent.append(name, category, address);
        const marker = L.marker(position, {
          title: school.name,
          icon: createEducationMarkerIcon({ color: educationMarkerColors[school.gradeKey] })
        }).addTo(map).bindPopup(infoContent);
        marker.on('click', () => setSelectedEducationSchoolKey(schoolKey));
        educationMarkerEntriesRef.current.set(schoolKey, { marker, gradeKey: school.gradeKey });
        bounds.push(position);
      });

      educationMapLibraries.forEach(library => {
        const position = [Number(library.lat), Number(library.lng)];
        const infoContent = document.createElement('div');
        const name = document.createElement('strong');
        name.className = 'block text-xs text-slate-900';
        name.textContent = library.name || '도서관';
        const category = document.createElement('span');
        category.className = 'mt-1 block text-[10px] font-bold text-emerald-700';
        category.textContent = '도서관';
        const address = document.createElement('span');
        address.className = 'mt-1 block text-[10px] leading-relaxed text-slate-500';
        address.textContent = library.address || '주소 정보 없음';
        infoContent.append(name, category, address);
        L.marker(position, {
          title: library.name,
          icon: createCultureFacilityMarkerIcon({ color: cultureFacilityColors.library, typeKey: 'library' })
        }).addTo(map).bindPopup(infoContent);
        bounds.push(position);
      });

      if (bounds.length === 1) map.setView(bounds[0], 15);
      else map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
      setEducationMappedCount(schoolsWithCoordinates.length);
      setEducationMapError(null);
    } catch (err) {
      clearEducationMap();
      setEducationMappedCount(0);
      setEducationMapError(err.message || '교육기관 지도를 표시하지 못했습니다.');
    }

    return () => {
      clearEducationMap();
    };
  }, [activeTab, districtSectionTab, cultureEducationSubTab, activeEducationList, educationMapLibraries]);

  useEffect(() => {
    educationMarkerEntriesRef.current.forEach(({ marker, gradeKey }, schoolKey) => {
      const isSelected = selectedEducationSchoolKey === schoolKey;
      marker.setIcon(createEducationMarkerIcon({
        selected: isSelected,
        dimmed: Boolean(selectedEducationSchoolKey) && !isSelected,
        color: educationMarkerColors[gradeKey]
      }));
      marker.setZIndexOffset(isSelected ? 1000 : 0);
      if (isSelected) marker.openPopup();
      else marker.closePopup();
    });
  }, [selectedEducationSchoolKey]);

  useEffect(() => {
    const clearCultureFacilityMap = () => {
      if (cultureFacilityMapInstanceRef.current) cultureFacilityMapInstanceRef.current.remove();
      cultureFacilityMapInstanceRef.current = null;
      cultureFacilityMarkerEntriesRef.current.clear();
    };

    if (
      activeTab !== 'district'
      || districtSectionTab !== 'cultureEducation'
      || cultureEducationSubTab !== 'culture'
      || !cultureFacilityMapContainerRef.current
      || cultureFacilityMapFacilities.length === 0
    ) {
      clearCultureFacilityMap();
      setCultureFacilityMappedCount(0);
      return clearCultureFacilityMap;
    }

    try {
      const facilitiesWithCoordinates = cultureFacilityMapFacilities.filter(facility => (
        Number.isFinite(Number(facility.lat)) && Number.isFinite(Number(facility.lng))
      ));
      if (facilitiesWithCoordinates.length === 0) throw new Error('선택한 문화시설의 위치 좌표가 없습니다.');

      clearCultureFacilityMap();
      cultureFacilityMapContainerRef.current.innerHTML = '';
      const map = L.map(cultureFacilityMapContainerRef.current, { scrollWheelZoom: true, minZoom: 11, maxZoom: 17 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        minZoom: 11,
        maxZoom: 17
      }).addTo(map);
      cultureFacilityMapInstanceRef.current = map;

      const bounds = [];
      facilitiesWithCoordinates.forEach(facility => {
        const position = [Number(facility.lat), Number(facility.lng)];
        const facilityKey = String(facility.id || `${facility.name}|${facility.address}`);
        const infoContent = document.createElement('div');
        const name = document.createElement('strong');
        name.className = 'block text-xs text-slate-900';
        name.textContent = facility.name || '문화시설';
        const category = document.createElement('span');
        category.className = 'mt-1 block text-[10px] font-bold';
        category.style.color = cultureFacilityColors[facility.typeKey] || cultureFacilityColors.other;
        category.textContent = facility.typeLabel || '문화시설';
        const address = document.createElement('span');
        address.className = 'mt-1 block text-[10px] leading-relaxed text-slate-500';
        address.textContent = facility.address || '주소 정보 없음';
        infoContent.append(name, category, address);
        const marker = L.marker(position, {
          title: facility.name,
          icon: createCultureFacilityMarkerIcon({
            color: cultureFacilityColors[facility.typeKey] || cultureFacilityColors.other,
            typeKey: facility.typeKey
          })
        }).addTo(map).bindPopup(infoContent);
        marker.on('click', () => setSelectedCultureFacilityKey(facilityKey));
        cultureFacilityMarkerEntriesRef.current.set(facilityKey, { marker, typeKey: facility.typeKey });
        bounds.push(position);
      });

      if (bounds.length === 1) map.setView(bounds[0], 15);
      else map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
      setCultureFacilityMappedCount(facilitiesWithCoordinates.length);
      setCultureFacilityMapError(null);
    } catch (err) {
      clearCultureFacilityMap();
      setCultureFacilityMappedCount(0);
      setCultureFacilityMapError(err.message || '문화시설 지도를 표시하지 못했습니다.');
    }

    return clearCultureFacilityMap;
  }, [activeTab, districtSectionTab, cultureEducationSubTab, cultureFacilityMapFacilities]);

  useEffect(() => {
    cultureFacilityMarkerEntriesRef.current.forEach(({ marker, typeKey }, facilityKey) => {
      const isSelected = selectedCultureFacilityKey === facilityKey;
      marker.setIcon(createCultureFacilityMarkerIcon({
        selected: isSelected,
        dimmed: Boolean(selectedCultureFacilityKey) && !isSelected && typeKey !== 'library',
        color: cultureFacilityColors[typeKey] || cultureFacilityColors.other,
        typeKey
      }));
      marker.setZIndexOffset(isSelected ? 1000 : 0);
      if (isSelected) marker.openPopup();
      else marker.closePopup();
    });
  }, [selectedCultureFacilityKey]);
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
  const nearbyCultureEvents = libraryDataDetail?.infrastructure?.nearbyEvents || [];
  const nearbyEventSourceCounts = {
    all: nearbyCultureEvents.length,
    seoul: nearbyCultureEvents.filter(eventItem => String(eventItem.source || '').includes('seoul')).length,
    kcisa: nearbyCultureEvents.filter(eventItem => String(eventItem.source || '').includes('kcisa')).length
  };
  const filteredNearbyCultureEvents = nearbyEventSourceFilter === 'all'
    ? nearbyCultureEvents
    : nearbyCultureEvents.filter(eventItem => String(eventItem.source || '').includes(nearbyEventSourceFilter));
  const insightCacheStatus = llmHarness?.cacheStatus;
  const sectionCacheStatus = llmHarness?.sectionCacheStatus;
  const insightCacheHit = Boolean(insightCacheStatus?.hit);
  const sectionCacheHit = Boolean(sectionCacheStatus?.hit);
  const insightCacheUnavailable = insightCacheStatus?.available === false;
  const insightSnapshotStale = insightCacheStatus?.reason === 'latest_gu_cache_hit_snapshot_mismatch';
  const sectionSnapshotStale = Boolean(sectionCacheStatus?.staleSnapshot)
    || sectionCacheStatus?.reason === 'latest_section_cache_hit_snapshot_mismatch';
  const isSectionSnapshotStale = (sectionKey) => Boolean(sectionCacheStatus?.staleBySection?.[sectionKey])
    || Boolean(sectionCacheStatus?.staleSectionKeys?.includes?.(sectionKey))
    || (sectionSnapshotStale && !sectionCacheStatus?.staleBySection);
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
  const getReportCoreInterpretation = (sectionNumber) => (
    llmHarness?.report?.sections?.find(section => section.heading?.startsWith(`${sectionNumber}.`))?.body || ''
  );
  const insightModelBadges = getModelRecommendationBadges(
    llmHarness?.insight?.modelRecommendation || {
      defaultModel: 'gpt-5.6-luna',
      costTierLabel: '균형',
      escalationModel: 'gpt-5.6-terra'
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
      provider: 'cache',
      forceGenerate: false,
      districtData,
      cultureMetrics: selectedCultureMetrics
        ? {
            ...selectedCultureMetrics,
            cultureEnjoymentReference2024: cultureEnjoymentAiReference2024
          }
        : {}
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
  }, [activeTab, districtData, selectedCultureMetrics]);

  const dataExportScope = activeTab === 'district' ? 'district' : libraryTargetMode === 'address' ? 'address' : 'library';
  const dataExportSource = activeTab === 'district' ? districtData : libraryDataDetail;
  const dataMatchesSelection = dataExportSource?.gu === selectedGu && (dataExportScope === 'district'
    || (dataExportScope === 'library' && dataExportSource?.library === selectedLibrary && dataExportSource?.targetType === 'library')
    || (dataExportScope === 'address' && dataExportSource?.address === resolvedAddress && dataExportSource?.targetType === 'address'));
  const downloadLabel = dataExportScope === 'district' ? '자치구 데이터 다운로드' : dataExportScope === 'address' ? '선택 주소지 데이터 다운로드' : '도서관 데이터 다운로드';
  const downloadStatusData = async () => {
    if (!dataMatchesSelection || loading || error || addressSearching || exportingData) return;
    // Capture the selected screen before the lazy workbook library is loaded.
    const options = { scope: dataExportScope, data: dataExportSource, cultureMetrics: selectedCultureMetrics,
      cultureGroups: cultureMetricGroups, cultureReference: cultureEnjoymentAiReference2024, facilities: districtCultureFacilities,
      report: activeTab === 'district' && !llmLoading ? llmHarness : null,
      viewState: { populationMode, districtSectionTab, cultureEducationSubTab, cultureEventFilter, cultureEventCategory, cultureEventPage,
        cultureFacilityCategory, cultureFacilityPage, educationCategory, educationPage, publicPlaceCategory, publicPlacePage, nearbyEventSourceFilter },
      exportedAt: new Date() };
    setExportingData(true);
    setDataExportMessage('');
    setDataExportError('');
    try {
      const { downloadAnalysisWorkbook } = await import('./utils/analysisExport');
      const filename = await downloadAnalysisWorkbook(options);
      setDataExportMessage(`${filename} 다운로드 완료`);
    } catch (err) {
      console.error('현황 데이터 다운로드 실패', err);
      setDataExportError('다운로드 파일을 만들지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setExportingData(false);
    }
  };

  const downloadDistrictReportMarkdown = () => {
    const markdown = llmHarness?.report?.markdown;
    if (!markdown) return;

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selectedGu}-${llmHarness.reportMonth || '이전월'}-지역사회-인사이트-보고서.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleDistrictSectionTabKeyDown = (event, currentIndex) => {
    const lastIndex = districtSectionTabs.length - 1;
    let nextIndex;

    if (event.key === 'ArrowRight') nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    else if (event.key === 'ArrowLeft') nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = lastIndex;
    else return;

    event.preventDefault();
    const nextTab = districtSectionTabs[nextIndex];
    setDistrictSectionTab(nextTab.key);
    window.requestAnimationFrame(() => document.getElementById(`district-tab-${nextTab.key}`)?.focus());
  };

  const handleCultureEducationSubTabKeyDown = (event, currentIndex) => {
    const lastIndex = cultureEducationSubTabs.length - 1;
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    else if (event.key === 'ArrowLeft') nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = lastIndex;
    else return;
    event.preventDefault();
    const nextTab = cultureEducationSubTabs[nextIndex];
    setCultureEducationSubTab(nextTab.key);
    window.requestAnimationFrame(() => document.getElementById(`culture-education-tab-${nextTab.key}`)?.focus());
  };

  return (
    <div className="min-h-screen bg-[#F5F8FC] text-slate-900 font-sans">
      {/* 상단 고정 헤더 */}
      <header className="sticky top-0 bg-white/95 backdrop-blur border-b border-[#A7A9B4]/30 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-2 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="inline-flex min-w-0 items-baseline leading-none tracking-[-0.04em]" aria-label="LIBscope">
            <span className="text-2xl font-black text-[#075BD8] sm:text-3xl">LIB</span>
            <span className="text-xl font-extrabold text-[#3F8FEA] sm:text-2xl">scope</span>
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
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end md:min-w-0 md:flex-1">
            {activeTab === 'library' && (
              <div className="flex shrink-0 flex-col">
                <label className="text-xs font-bold text-slate-400 mb-1">기준 위치</label>
                <div className="flex shrink-0 rounded-xl border border-slate-300 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => changeLibraryTargetMode('library')}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-extrabold transition-colors ${libraryTargetMode === 'library' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    도서관 선택
                  </button>
                  <button
                    type="button"
                    onClick={() => changeLibraryTargetMode('address')}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-extrabold transition-colors ${libraryTargetMode === 'address' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    주소 입력
                  </button>
                </div>
              </div>
            )}

            {!(activeTab === 'library' && libraryTargetMode === 'address') && (
              <div className="flex shrink-0 flex-col">
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
            )}

            {activeTab === 'library' && (
              <>
                {libraryTargetMode === 'library' ? (
                  <div className="flex min-w-0 flex-1 flex-col sm:min-w-64">
                    <label className="text-xs font-bold text-slate-400 mb-1">도서관 선택</label>
                    <select
                      value={selectedLibrary}
                      onChange={(e) => setSelectedLibrary(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {librariesInGu.map(lib => (
                        <option key={lib} value={lib}>{lib}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <form onSubmit={handleAddressAnalysis} className="flex min-w-0 flex-1 flex-col sm:min-w-96">
                    <label htmlFor="library-address" className="text-xs font-bold text-slate-400 mb-1">서울시 도로명·지번 주소</label>
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                      <input
                        id="library-address"
                        type="text"
                        value={addressQuery}
                        onChange={(event) => setAddressQuery(event.target.value)}
                        maxLength={160}
                        placeholder="예: 서울 노원구 노원로34길 43"
                        className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-72"
                      />
                      <button
                        type="submit"
                        disabled={addressSearching || loading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Search size={15} />
                        {addressSearching ? '주소 확인 중' : '주소로 분석'}
                      </button>
                    </div>
                    {addressError && <p className="mt-1 text-xs font-bold text-rose-600">{addressError}</p>}
                    {!addressError && mapError && <p className="mt-1 text-xs font-bold text-rose-600">{mapError}</p>}
                  </form>
                )}
              </>
            )}
          </div>
          
          <div className="flex shrink-0 flex-col items-stretch gap-2 text-sm font-semibold text-slate-500 md:max-w-sm md:items-end">
            {!(activeTab === 'library' && libraryTargetMode === 'address') && (
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
            )}
            <button
              type="button"
              onClick={downloadStatusData}
              disabled={!dataMatchesSelection || loading || Boolean(error) || addressSearching || exportingData}
              title="전체 현황 데이터와 컬럼 정의·단위·출처·기준시점을 Excel 파일로 다운로드"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              {exportingData ? 'Excel 파일 만드는 중…' : downloadLabel}
            </button>
            <p className="text-xs font-medium text-slate-500">Excel · 전체 탭·목록과 컬럼 설명 포함</p>
          </div>
        </section>
        {dataExportMessage && <p role="status" className="mb-4 break-all text-sm font-semibold text-emerald-700">{dataExportMessage}</p>}
        {dataExportError && <p role="alert" className="mb-4 text-sm font-semibold text-rose-700">{dataExportError}</p>}

        {/* 로딩 및 에러 처리 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-500 font-bold">지역 지표와 공공 데이터를 불러오는 중입니다...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl mb-8 font-semibold">
            ⚠️ {error}
          </div>
        )}

        {/* -------------------- 탭 1: 자치구별 대시보드 뷰 -------------------- */}
        {!loading && activeTab === 'district' && districtData && (
          <div className="flex flex-col gap-6">

            <nav
              className="sticky top-[72px] z-40 -mx-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-sm backdrop-blur sm:top-[65px]"
              aria-label="자치구 현황 세부 영역"
            >
              <div className="flex min-w-max gap-1 sm:grid sm:min-w-0 sm:grid-cols-4" role="tablist" aria-label="자치구 현황 하위 탭">
                {districtSectionTabs.map((tab, index) => {
                  const isActive = districtSectionTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      id={`district-tab-${tab.key}`}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`district-panel-${tab.key}`}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => setDistrictSectionTab(tab.key)}
                      onKeyDown={event => handleDistrictSectionTabKeyDown(event, index)}
                      className={`min-w-24 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                        isActive
                          ? 'bg-[#0031A7] text-white shadow-sm'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </nav>

            <div
              id={`district-panel-${districtSectionTab}`}
              role="tabpanel"
              aria-labelledby={`district-tab-${districtSectionTab}`}
              className="flex flex-col gap-6"
            >

            {/* LLM 인사이트 프리뷰 영역 */}
            {districtSectionTab === 'overview' && (
              <>
            {/* 자치구 핵심 KPI */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
                <PopulationSource
                  population={activeDistrictPopulation}
                  className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-2"
                />
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
                  출처: 서울 열린데이터광장 · 한국문화정보원
                </div>
              </div>
            </div>

            <section className="relative overflow-hidden rounded-2xl border border-blue-200/70 bg-gradient-to-br from-[#001f75] via-[#0031A7] to-[#167BD9] p-4 text-white shadow-[0_22px_55px_rgba(0,49,167,0.24)] sm:p-6">
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
                    ) : (
                      <div className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-extrabold text-blue-50">
                        <Sparkles size={14} />
                        저장된 인사이트 확인 중
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
                    현재 지표 스냅샷에 저장된 종합 인사이트가 없습니다. 인사이트는 운영 갱신 후 이 영역에 표시됩니다.
                  </p>
                </div>
              )}

              {llmLoading && (
                <div className="mt-4 rounded-xl border border-white/20 bg-white/12 px-4 py-3 text-xs font-bold text-blue-50">
                  DB 캐시 확인 중...
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

              </div>
            </section>

            {insightCacheHit && llmHarness?.report && (
              <article className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[#fcfdff] text-slate-900 shadow-[0_18px_55px_rgba(15,23,42,0.09)]" aria-labelledby="district-report-title">
                <header className="border-b border-blue-100 bg-white px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-3xl">
                      <p className="inline-flex items-center gap-2 text-[10px] font-black tracking-[0.16em] text-blue-700">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-blue-200 bg-blue-50">
                          <FileText size={15} strokeWidth={1.8} />
                        </span>
                        AI 웹 리포트
                      </p>
                      <h4 id="district-report-title" className="mt-4 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{llmHarness.report.title}</h4>
                      <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">{llmHarness.report.subtitle}</p>
                      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-[11px] font-bold text-slate-500">
                        <span className="inline-flex items-center gap-1.5"><Sparkles size={13} className="text-blue-600" />AI 생성 인사이트</span>
                        <span className="inline-flex items-center gap-1.5"><Calendar size={13} className="text-emerald-600" />{insightGeneratedAtLabel}</span>
                        <span>기준 지역 · 서울특별시 {selectedGu}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={downloadDistrictReportMarkdown}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3.5 py-2.5 text-xs font-extrabold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      <Download size={14} strokeWidth={1.8} />
                      Markdown 다운로드
                    </button>
                  </div>
                </header>

                <nav className="overflow-x-auto border-b border-slate-200 bg-slate-50/80 px-5 sm:px-8 lg:px-10" aria-label="보고서 목차">
                  <ol className="flex min-w-max items-stretch gap-6">
                    {llmHarness.report.sections.map((section, index) => {
                      const theme = reportSectionThemes[index] || reportSectionThemes[0];
                      const SectionIcon = theme.icon;
                      return (
                        <li key={`toc-${section.heading}`}>
                          <a href={`#district-report-section-${index + 1}`} className={`inline-flex h-14 items-center gap-2 border-b-2 border-transparent text-xs font-extrabold transition-colors hover:border-current focus-visible:border-current focus-visible:outline-none ${theme.accent}`}>
                            <SectionIcon size={15} strokeWidth={1.8} />
                            <span>{String(index + 1).padStart(2, '0')}</span>
                            <span>{section.heading.replace(/^\d+\.\s*/, '')}</span>
                          </a>
                        </li>
                      );
                    })}
                  </ol>
                </nav>

                <div className="px-5 sm:px-8 lg:px-10">
                  {llmHarness.report.sections.map((section, index) => {
                    const theme = reportSectionThemes[index] || reportSectionThemes[0];
                    const SectionIcon = theme.icon;
                    return (
                      <section
                        key={section.heading}
                        id={`district-report-section-${index + 1}`}
                        className={`scroll-mt-40 border-b py-8 last:border-b-0 sm:py-10 ${theme.rule}`}
                      >
                        <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
                          <div>
                            <div className="flex items-center gap-3 lg:items-start">
                              <span className={`text-3xl font-light leading-none ${theme.accent}`}>{String(index + 1).padStart(2, '0')}</span>
                              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${theme.iconBox}`}>
                                <SectionIcon size={19} strokeWidth={1.7} />
                              </span>
                            </div>
                            <h5 className={`mt-4 text-base font-black leading-snug ${theme.accent}`}>{section.heading.replace(/^\d+\.\s*/, '')}</h5>
                          </div>

                          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:gap-10">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[10px] font-black tracking-[0.14em] text-slate-400">핵심 해석</p>
                                {llmHarness.aiMeta?.reportNarrativeModel && (
                                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[9px] font-extrabold text-violet-700">
                                    {llmHarness.aiMeta.reportNarrativeModel} 생성
                                  </span>
                                )}
                              </div>
                              <ul className="mt-3 max-w-[65ch] space-y-2.5 text-sm font-bold leading-7 text-slate-700">
                                {splitReportSentences(section.body).map((sentence, sentenceIndex) => (
                                  <li key={`${section.heading}-sentence-${sentenceIndex}`} className="flex items-start gap-3">
                                    <span className={`mt-[0.68rem] h-1.5 w-1.5 shrink-0 rounded-full ${theme.bullet}`} aria-hidden="true" />
                                    <span className="min-w-0 flex-1">{sentence}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="border-t border-slate-200 pt-5 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">
                              <p className={`text-[10px] font-black tracking-[0.14em] ${theme.accent}`}>근거와 시사점</p>
                              <ul className="mt-3 space-y-3">
                                {section.bullets.slice(0, 3).map((bullet, bulletIndex) => (
                                  <li key={`${section.heading}-${bulletIndex}`} className="flex gap-3 text-xs font-semibold leading-6 text-slate-600">
                                    <span className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${theme.bullet}`} />
                                    <span className="min-w-0 flex-1">
                                      {splitReportBulletLines(bullet).map((line, lineIndex) => (
                                        <span
                                          key={`${section.heading}-${bulletIndex}-line-${lineIndex}`}
                                          className={`block ${lineIndex > 0 ? 'mt-1.5 border-l border-slate-200 pl-3 text-slate-500' : ''}`}
                                        >
                                          {line}
                                        </span>
                                      ))}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </article>
            )}

              </>
            )}

            {/* 인구 구조 분석 (ECharts) */}
            {districtSectionTab === 'population' && (
              <>
            <MetricInterpretationPanel
              packet={generatedInterpretations?.population}
              tone="blue"
              loading={llmLoading}
              error={llmError}
              className="order-[20]"
              variant="strip"
              pendingTitle="인구구조 해석"
              staleSnapshot={isSectionSnapshotStale('population')}
              summaryText={getReportCoreInterpretation(2)}
            />

            <div className="order-[30] grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 lg:col-span-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <h4 className="font-extrabold text-lg text-slate-800 flex items-center gap-2"><Users size={20} className="text-blue-600" />연령대별 인구 분포</h4>
                    <PopulationModeToggle populationMode={populationMode} onChange={setPopulationMode} />
                  </div>
                  <p className="text-xs text-slate-400 mb-4">0-9세는 하늘색, 10-19세는 초록색, 20-64세는 노랑, 65세 이상은 빨강으로 구분합니다.</p>
                </div>
                <div className="h-80">
                  <ResponsiveEChart
                    option={getAgeChartOption(activeDistrictPopulation?.ageDistribution)}
                    style={{ height: '100%', width: '100%' }}
                  />
                </div>
                <PopulationSource
                  population={activeDistrictPopulation}
                  className="text-[10px] text-slate-400 font-medium mt-2 text-right"
                />
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
                <PopulationSource
                  population={activeDistrictPopulation}
                  className="text-[10px] text-slate-400 font-medium mt-2 text-right"
                />
              </div>
            </div>

            <section className="order-[35] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="dong-population-title">
              <div className="border-b border-slate-100 p-4 sm:p-6">
                <div>
                  <h4 id="dong-population-title" className="flex items-center gap-2 text-lg font-extrabold text-slate-800">
                    <MapPinned size={20} className="text-blue-600" />
                    행정동별 인구 구성
                  </h4>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    유아·청소년 0–19세 · 청년·중장년 20–64세 · 고령인구 65세 이상
                  </p>
                </div>
              </div>

              <DongPopulationMap
                gu={selectedGu}
                rows={sortedDongPopulationRows}
                metric={dongPopulationSort}
                onMetricChange={setDongPopulationSort}
                selectedDong={selectedDongPopulation}
                onSelectedDongChange={setSelectedDongPopulation}
                populationSource={`출처: ${getPopulationSourceLabel(activeDistrictPopulation)}`}
              />

              {sortedDongPopulationRows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] border-collapse text-left">
                    <thead className="bg-slate-50 text-xs font-extrabold text-slate-600">
                      <tr>
                        <th scope="col" className="w-16 px-4 py-3 text-center sm:px-6">순위</th>
                        <th scope="col" className="px-4 py-3 sm:px-6">행정동</th>
                        <th scope="col" className={`px-4 py-3 text-right ${dongPopulationSort === 'total' ? 'bg-blue-50 text-blue-700' : ''}`}>전체 인구</th>
                        <th scope="col" className={`px-4 py-3 text-right ${['childrenYouth', 'childrenYouthRatio'].includes(dongPopulationSort) ? 'bg-blue-50 text-blue-700' : ''}`}>유아·청소년</th>
                        <th scope="col" className={`px-4 py-3 text-right ${['youngMiddle', 'youngMiddleRatio'].includes(dongPopulationSort) ? 'bg-blue-50 text-blue-700' : ''}`}>청년·중장년</th>
                        <th scope="col" className={`px-4 py-3 text-right ${['senior', 'seniorRatio'].includes(dongPopulationSort) ? 'bg-blue-50 text-blue-700' : ''}`}>고령인구</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {sortedDongPopulationRows.map((row, index) => (
                        <tr
                          key={row.dong}
                          data-selected={row.dong === selectedDongPopulation ? 'true' : 'false'}
                          className={`transition-colors ${row.dong === selectedDongPopulation ? selectedDongPopulationRowClass : 'hover:bg-slate-50/80'}`}
                        >
                          <td className="px-4 py-3 text-center font-extrabold text-slate-400 sm:px-6">{index + 1}</td>
                          <th scope="row" className="px-4 py-3 font-extrabold text-slate-800 sm:px-6">{row.dong}</th>
                          <td className={`px-4 py-3 text-right font-bold tabular-nums ${dongPopulationSort === 'total' ? 'bg-blue-50/60 text-blue-800' : 'text-slate-700'}`}>{row.total.toLocaleString()}명</td>
                          <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${['childrenYouth', 'childrenYouthRatio'].includes(dongPopulationSort) ? 'bg-blue-50/60 text-blue-800' : 'text-slate-600'}`}>
                            {row.childrenYouth.toLocaleString()}명 <span className="text-xs opacity-70">· {row.childrenYouthRatio.toFixed(1)}%</span>
                          </td>
                          <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${['youngMiddle', 'youngMiddleRatio'].includes(dongPopulationSort) ? 'bg-blue-50/60 text-blue-800' : 'text-slate-600'}`}>
                            {row.youngMiddle.toLocaleString()}명 <span className="text-xs opacity-70">· {row.youngMiddleRatio.toFixed(1)}%</span>
                          </td>
                          <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${['senior', 'seniorRatio'].includes(dongPopulationSort) ? 'bg-blue-50/60 text-blue-800' : 'text-slate-600'}`}>
                            {row.senior.toLocaleString()}명 <span className="text-xs opacity-70">· {row.seniorRatio.toFixed(1)}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm font-extrabold text-slate-600">행정동별 세부 인구 데이터 준비 중</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">현재 선택한 인구 기준에서 행정동 단위 자료를 확인할 수 없습니다.</p>
                </div>
              )}

              <div className="border-t border-slate-100 px-4 py-3 sm:px-6">
                <PopulationSource population={activeDistrictPopulation} className="text-[10px] font-medium text-slate-500" />
              </div>
            </section>

              </>
            )}

            {/* 문화 역량·향유 지표 섹션 */}
            {districtSectionTab === 'cultureEducation' && (
              <>
            <nav className="order-[38] overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="문화·교육 주제 선택">
              <div className="grid min-w-[480px] grid-cols-2 gap-2" role="tablist" aria-label="문화·교육 하위 탭">
                {cultureEducationSubTabs.map((tab, index) => {
                  const isActive = cultureEducationSubTab === tab.key;
                  const TabIcon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      id={`culture-education-tab-${tab.key}`}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`culture-education-panel-${tab.key}`}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => setCultureEducationSubTab(tab.key)}
                      onKeyDown={event => handleCultureEducationSubTabKeyDown(event, index)}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                        isActive ? tab.active : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-white/20 text-white' : `bg-slate-50 ${tab.iconColor}`}`} aria-hidden="true">
                        <TabIcon size={17} />
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-[9px] font-black tracking-widest ${isActive ? 'text-white/75' : 'text-slate-400'}`}>{tab.number}</span>
                        <span className="block truncate text-xs font-extrabold sm:text-sm">{tab.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>

            {cultureEducationSubTab === 'culture' && (
            <section id="culture-education-panel-culture" role="tabpanel" aria-labelledby="culture-education-tab-culture" className="order-[40] space-y-4 overflow-hidden rounded-[1.75rem] border border-emerald-200/80 bg-emerald-50/45 p-3 shadow-sm sm:p-4">
              <header className="-mx-3 -mt-3 border-b border-emerald-700/25 bg-emerald-600 p-4 text-white shadow-sm sm:-mx-4 sm:-mt-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/15 px-2 text-xs font-black text-white">01</span>
                <div>
                  <h3 id="culture-foundation-group-title" className="flex items-center gap-2 text-base font-black text-white">
                    <Theater size={18} className="text-white" /> 문화 기반·향유
                  </h3>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-white/80">문화 공급 기반과 시민 향유 기준을 함께 확인하는 영역</p>
                </div>
              </div>
              </header>

              <MetricInterpretationPanel
                packet={generatedInterpretations?.culture}
                tone="emerald"
                loading={llmLoading}
                error={llmError}
                variant="strip"
                pendingTitle="자치구 문화 통합 해석"
                staleSnapshot={isSectionSnapshotStale('culture')}
                summaryText={getReportCoreInterpretation(3)}
              />

            {selectedCultureMetrics && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
                <div className="relative -mx-4 -mt-4 mb-6 overflow-hidden rounded-t-2xl border-b border-emerald-200 bg-gradient-to-r from-emerald-100 via-teal-50 to-white px-4 py-5 sm:-mx-6 sm:-mt-6 sm:px-6 sm:py-6 lg:flex lg:items-center lg:justify-between lg:gap-4">
                  <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-emerald-200/35" aria-hidden="true" />
                  <div className="relative flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm" aria-hidden="true"><Theater size={21} /></span>
                    <div>
                      <h4 className="text-lg font-extrabold text-emerald-950">문화 역량·향유 지표</h4>
                      <p className="mt-1 text-xs font-semibold text-emerald-900/65">
                        자치구 문화 기반과 서울시 문화향유 참고값을 함께 보며 문화 접근성의 맥락을 확인합니다.
                      </p>
                    </div>
                  </div>
                  <div className="relative mt-3 inline-flex rounded-full border border-emerald-200 bg-white/75 px-3 py-2 text-[10px] font-semibold text-emerald-700 lg:mt-0 lg:max-w-sm lg:text-right">
                    출처: 2023 서울문화지표 조사연구 / 기준연도 {selectedCultureMetrics.year}
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <h5 className="mb-1 text-sm font-extrabold text-slate-800">문화자원 구성</h5>
                    <p className="text-xs leading-relaxed text-slate-500">
                      시설 유형이 어느 자원에 상대적으로 집중되어 있는지 확인하는 참고 차트입니다.
                    </p>
                    <div className="mt-2 h-72">
                      <ResponsiveEChart option={getCultureCompositionOption(selectedCultureMetrics)} style={{ height: '100%', width: '100%' }} />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <h5 className="mb-1 text-sm font-extrabold text-slate-800">인구 대비 접근성</h5>
                    <p className="text-xs leading-relaxed text-slate-500">
                      인구 10만 명당 기준으로 서로 다른 문화자원을 나란히 비교합니다.
                    </p>
                    <div className="mt-2 h-72">
                      <ResponsiveEChart option={getCultureAccessBarOption(selectedCultureMetrics)} style={{ height: '100%', width: '100%' }} />
                    </div>
                  </div>
                </div>

                <details className="group rounded-2xl border border-emerald-200 bg-emerald-50/35">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-4 py-4 text-left transition-colors hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:px-5">
                    <span>
                      <span className="block text-sm font-extrabold text-emerald-950">세부 수치·AI 해석 근거</span>
                      <span className="mt-1 block text-xs font-semibold text-emerald-900/60">화면에서는 접어두지만 AI 해석에는 전체 지표가 그대로 전달됩니다.</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-2 text-[10px] font-extrabold text-emerald-700">
                      <span className="group-open:hidden">세부 지표 열기</span>
                      <span className="hidden group-open:inline">세부 지표 닫기</span>
                      <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden="true" />
                    </span>
                  </summary>

                  <div className="border-t border-emerald-100 p-4 sm:p-5">
                <div className="mb-5 flex flex-wrap gap-2">
                  <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[11px] font-extrabold text-emerald-700">
                    자치구 직접 지표: 시설 수·접근성·정책 기반
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-extrabold text-slate-600">
                    서울시 참고값: 집단별 문화향유 기준선
                  </span>
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-extrabold text-blue-700">
                    LLM 연결: 공급 기반과 향유 기준의 결합 해석
                  </span>
                </div>

                <div className="mb-5 grid grid-cols-1 gap-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {cultureMetricGroups.map(group => {
                      const CultureMetricIcon = cultureMetricIcons[group.key];
                      return (
                      <div key={group.key} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 min-h-44 flex flex-col justify-between">
                        <div className="flex items-start gap-3">
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${cultureColorClasses[group.color]}`} aria-hidden="true">
                            <CultureMetricIcon size={18} strokeWidth={1.8} />
                          </span>
                          <div className="min-w-0">
                            <h5 className="font-extrabold text-sm text-slate-800">{group.title}</h5>
                            <p className="text-xs text-slate-500 leading-relaxed mt-1.5">{group.description}</p>
                          </div>
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
                      );
                    })}
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
                  </div>
                </details>

              </div>
            )}
            </section>
            )}

            {cultureEducationSubTab === 'culture' && (
            <section aria-labelledby="culture-resources-group-title" className="order-[55] flex flex-col gap-4 overflow-hidden rounded-[1.75rem] border border-emerald-200/80 bg-emerald-50/45 p-3 shadow-sm sm:p-4">
              <header className="-mx-3 -mt-3 border-b border-emerald-700/25 bg-emerald-600 p-4 text-white shadow-sm sm:-mx-4 sm:-mt-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/15 px-2 text-xs font-black text-white">02</span>
                <div>
                  <h3 id="culture-resources-group-title" className="flex items-center gap-2 text-base font-black text-white">
                    <MapPinned size={18} className="text-white" /> 문화 참여·지역 자원
                  </h3>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-white/80">참여 가능한 문화행사와 생활권 문화시설을 탐색하는 영역</p>
                </div>
              </div>
              </header>

            <section className="order-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="culture-events-title">
              <div className="relative -mx-4 -mt-4 mb-5 overflow-hidden rounded-t-2xl border-b border-emerald-200 bg-gradient-to-r from-emerald-100 via-teal-50 to-white px-4 py-5 sm:-mx-6 sm:-mt-6 sm:px-6 sm:py-6 lg:flex lg:items-center lg:justify-between lg:gap-4">
                <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-emerald-200/35" aria-hidden="true" />
                <div className="relative flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm" aria-hidden="true"><Calendar size={21} /></span>
                  <div>
                    <h4 id="culture-events-title" className="text-lg font-extrabold text-emerald-950">진행 중·예정 문화행사</h4>
                    <p className="mt-1 text-xs font-semibold text-emerald-900/65">종료된 행사를 제외하고 {selectedGu}에서 참여 가능한 행사를 확인합니다.</p>
                  </div>
                </div>
                <span className="relative mt-3 inline-flex rounded-full border border-emerald-200 bg-white/75 px-3 py-2 text-[10px] font-semibold text-emerald-700 lg:mt-0">출처: 서울 열린데이터광장 · 한국문화정보원</span>
              </div>

              <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <span className="w-20 shrink-0 pt-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">진행 상태</span>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="문화행사 상태 필터">
                    {[
                      { key: 'all', label: '전체' },
                      { key: 'ongoing', label: '진행 중' },
                      { key: 'upcoming', label: '예정' }
                    ].map(option => {
                      const isActive = cultureEventFilter === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => setCultureEventFilter(option.key)}
                          className={`rounded-full border px-3 py-2 text-xs font-extrabold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                            isActive
                              ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50'
                          }`}
                        >
                          {option.label} {cultureEventCounts[option.key]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:items-start">
                  <span className="w-20 shrink-0 pt-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">행사 유형</span>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="문화행사 유형 필터">
                    {cultureEventCategories.map(category => {
                      const isActive = cultureEventCategory === category.key;
                      return (
                        <button
                          key={category.key}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => setCultureEventCategory(category.key)}
                          className={`rounded-full border px-3 py-2 text-xs font-extrabold transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                            isActive
                              ? 'border-teal-700 bg-teal-700 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50'
                          }`}
                        >
                          {category.label} {category.count}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:items-center">
                  <label htmlFor="culture-event-sort" className="w-20 shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">정렬 기준</label>
                  <select
                    id="culture-event-sort"
                    value={cultureEventSort}
                    onChange={event => setCultureEventSort(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 sm:w-64"
                  >
                    <option value="statusDate">진행 중 우선 · 시작일순</option>
                    <option value="startAsc">시작일 빠른순</option>
                    <option value="startDesc">시작일 늦은순</option>
                    <option value="endAsc">종료일 임박순</option>
                    <option value="titleAsc">행사명 가나다순</option>
                    <option value="categoryAsc">행사 유형순</option>
                  </select>
                </div>
              </div>

              {visibleCultureEvents.length > 0 ? (
                <>
                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="hidden grid-cols-[110px_minmax(0,1.5fr)_190px_minmax(180px,0.9fr)_140px_80px] gap-3 border-b border-slate-200 bg-slate-100 px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 lg:grid">
                      <span>상태·유형</span>
                      <span>행사명</span>
                      <span>일정</span>
                      <span>장소</span>
                      <span>주최·출처</span>
                      <span className="text-right">링크</span>
                    </div>
                    <div className="divide-y divide-slate-200" role="list" aria-label="문화행사 목록">
                      {visibleCultureEvents.map(eventItem => {
                        const eventUrl = getSafeExternalUrl(eventItem.link);
                        const isOngoing = eventItem.status === 'ongoing';
                        return (
                          <article
                            key={`${eventItem.title}-${eventItem.startDate}-${eventItem.place}`}
                            role="listitem"
                            className="grid grid-cols-1 gap-3 px-3 py-4 transition-colors hover:bg-emerald-50/50 sm:px-4 lg:grid-cols-[110px_minmax(0,1.5fr)_190px_minmax(180px,0.9fr)_140px_80px] lg:items-center"
                          >
                            <div className="flex flex-wrap items-center gap-1.5 lg:block lg:space-y-1.5">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                                isOngoing ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {isOngoing ? '진행 중' : '예정'}
                              </span>
                              <span className="inline-flex max-w-full rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 lg:block lg:w-fit lg:max-w-[100px] lg:truncate">{eventItem.category}</span>
                            </div>
                            <div className="min-w-0">
                              <h5 className="line-clamp-2 text-sm font-extrabold leading-snug text-slate-900">{eventItem.title}</h5>
                              {eventItem.target && (
                                <p className="mt-1 flex min-w-0 items-center gap-1 text-[10px] font-semibold text-slate-500">
                                  <Users size={12} className="shrink-0 text-blue-500" />
                                  <span className="truncate">{eventItem.target}</span>
                                </p>
                              )}
                            </div>
                            <p className="flex gap-2 text-xs font-semibold text-slate-600">
                              <Calendar size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                              <span>
                                <time dateTime={eventItem.startDate}>{eventItem.startDate || '일정 확인 필요'}</time>
                                {eventItem.endDate && eventItem.endDate !== eventItem.startDate ? ` – ${eventItem.endDate}` : ''}
                              </span>
                            </p>
                            <p className="flex min-w-0 gap-2 text-xs font-semibold text-slate-600">
                              <MapPin size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                              <span className="line-clamp-2">{eventItem.place}</span>
                            </p>
                            <div className="min-w-0">
                              <p className="truncate text-[10px] font-bold text-slate-600">{eventItem.organizer || '주최기관 확인 필요'}</p>
                              {eventItem.sourceLabel && <p className="mt-1 truncate text-[10px] font-semibold text-slate-400">{eventItem.sourceLabel}</p>}
                              {(eventItem.fee || eventItem.isFree) && <p className="mt-1 truncate text-[10px] font-extrabold text-emerald-700">{eventItem.fee || eventItem.isFree}</p>}
                            </div>
                            <div className="flex justify-end">
                              {eventUrl ? (
                                <a href={eventUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[10px] font-extrabold text-emerald-700 hover:text-emerald-900 hover:underline">
                                  상세 <ChevronRight size={12} />
                                </a>
                              ) : (
                                <span className="text-[10px] font-semibold text-slate-300">—</span>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[10px] font-bold text-slate-500">
                      {safeCultureEventPage * cultureEventPageSize + 1}-{Math.min((safeCultureEventPage + 1) * cultureEventPageSize, filteredCultureEvents.length)} / {filteredCultureEvents.length}건 표시
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCultureEventPage(previous => Math.max(0, previous - 1))}
                        disabled={safeCultureEventPage === 0}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        이전
                      </button>
                      <span className="min-w-14 text-center text-xs font-extrabold text-slate-600">{safeCultureEventPage + 1}/{cultureEventPageCount}</span>
                      <button
                        type="button"
                        onClick={() => setCultureEventPage(previous => Math.min(cultureEventPageCount - 1, previous + 1))}
                        disabled={safeCultureEventPage >= cultureEventPageCount - 1}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        다음
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                  <p className="text-sm font-extrabold text-slate-700">표시할 문화행사가 없습니다.</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">선택한 상태와 유형에 해당하는 행사가 API에 등록되면 이곳에 표시됩니다.</p>
                </div>
              )}
            </section>

            <section className="order-1 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="culture-facilities-title">
              <div className="relative -mx-4 -mt-4 mb-5 overflow-hidden rounded-t-2xl border-b border-teal-200 bg-gradient-to-r from-teal-100 via-emerald-50 to-white px-4 py-5 sm:-mx-6 sm:-mt-6 sm:px-6 sm:py-6 lg:flex lg:items-center lg:justify-between lg:gap-4">
                <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-teal-200/35" aria-hidden="true" />
                <div className="relative flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm" aria-hidden="true"><Landmark size={21} /></span>
                  <div>
                    <h4 id="culture-facilities-title" className="text-lg font-extrabold text-teal-950">자치구 문화시설 지도</h4>
                    <p className="mt-1 text-xs font-semibold text-teal-900/65">{selectedGu}의 문화시설을 유형별로 보고, 목록에서 선택한 시설의 위치를 강조합니다.</p>
                  </div>
                </div>
                <span className="relative mt-3 inline-flex rounded-full border border-teal-200 bg-white/75 px-3 py-2 text-[10px] font-semibold text-teal-700 lg:mt-0 lg:max-w-sm lg:text-right">문화시설: 카카오맵 장소검색 · 도서관: 내부 매핑 정보 · 지도 배경: OpenStreetMap</span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-7" role="group" aria-label="문화시설 유형 선택">
                {cultureFacilityCategories.map(category => {
                  const isActive = cultureFacilityCategory === category.key;
                  return (
                    <button
                      key={category.key}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setCultureFacilityCategory(category.key)}
                      className={`flex min-h-14 items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 ${
                        isActive
                          ? 'border-teal-300 bg-teal-50 text-teal-950 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-teal-200 hover:bg-teal-50/60'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: category.color }} aria-hidden="true" />
                        <span className="line-clamp-2 text-[11px] font-extrabold leading-tight">{category.label}</span>
                      </span>
                      <span className="shrink-0 text-sm font-black tabular-nums">{category.count}</span>
                    </button>
                  );
                })}
              </div>

              {cultureFacilityMapFacilities.length > 0 ? (
                <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                  <section className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-3" aria-labelledby="culture-facilities-map-title">
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h5 id="culture-facilities-map-title" className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
                          <MapPinned size={16} className="text-teal-700" />
                          {cultureFacilityCategories.find(category => category.key === cultureFacilityCategory)?.label} 위치
                        </h5>
                        <p className="mt-1 text-[10px] font-semibold text-slate-500">선택한 유형 전체를 표시하며, 도서관 마커는 유형과 관계없이 고정됩니다.</p>
                      </div>
                      <span className="text-[10px] font-extrabold text-teal-700">
                        마커 {cultureFacilityMappedCount}개 · 목록 {filteredCultureFacilities.length}개
                        {fixedCultureFacilityLibraryCount > 0 ? ` · 도서관 ${fixedCultureFacilityLibraryCount}개 고정` : ''}
                      </span>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1.5" aria-label="문화시설 유형별 마커 색상">
                      {cultureFacilityTypes.slice(1).filter(type => cultureFacilityCategories.find(category => category.key === type.key)?.count > 0).map(type => (
                        <span key={`culture-facility-legend-${type.key}`} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: type.color }} aria-hidden="true" />
                          {type.label}
                        </span>
                      ))}
                    </div>
                    <div className="relative h-80 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 2xl:h-auto 2xl:min-h-[34rem] 2xl:flex-1">
                      <div ref={cultureFacilityMapContainerRef} className="h-full min-h-80 w-full" role="region" aria-label={`${selectedGu} 문화시설 위치 지도`} />
                      {cultureFacilityMapError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/95 p-6 text-center">
                          <div>
                            <MapPin size={24} className="mx-auto text-slate-400" />
                            <p className="mt-2 text-xs font-extrabold text-slate-600">지도를 표시하지 못했습니다.</p>
                            <p className="mt-1 text-[10px] font-semibold leading-relaxed text-slate-500">{cultureFacilityMapError}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  <div className="min-w-0 space-y-3">
                    {visibleCultureFacilities.length > 0 ? (
                    <>
                    <div className="grid grid-cols-1 gap-3">
                      {visibleCultureFacilities.map(facility => {
                        const facilityKey = String(facility.id || `${facility.name}|${facility.address}`);
                        const isSelected = selectedCultureFacilityKey === facilityKey;
                        const placeUrl = getSafeExternalUrl(facility.placeUrl);
                        return (
                          <article key={facilityKey} className={`rounded-xl border p-3 transition-all ${isSelected ? 'border-teal-300 bg-teal-50 shadow-sm ring-2 ring-teal-100' : 'border-slate-200 bg-white'}`}>
                            <button
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => setSelectedCultureFacilityKey(facilityKey)}
                              className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-extrabold text-slate-800">{facility.name}</p>
                                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{facility.address || '주소 정보 없음'}</p>
                                </div>
                                <span className="shrink-0 rounded-full px-2 py-1 text-[9px] font-extrabold text-white" style={{ backgroundColor: cultureFacilityColors[facility.typeKey] || cultureFacilityColors.other }}>
                                  {facility.typeLabel || '문화시설'}
                                </span>
                              </div>
                            </button>
                            <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
                              <span className="truncate text-[10px] font-semibold text-slate-500">{facility.phone || facility.categoryName || '시설 정보 확인'}</span>
                              {placeUrl && (
                                <a href={placeUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[10px] font-extrabold text-teal-700 hover:text-teal-900">
                                  카카오맵 <ChevronRight size={12} />
                                </a>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[10px] font-bold text-slate-500">{cultureFacilityRangeStart}-{cultureFacilityRangeEnd} / {filteredCultureFacilities.length}개 시설 표시</p>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setCultureFacilityPage(previous => Math.max(0, previous - 1))} disabled={safeCultureFacilityPage === 0} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">이전</button>
                        <span className="min-w-14 text-center text-xs font-extrabold text-slate-600">{safeCultureFacilityPage + 1}/{cultureFacilityPageCount}</span>
                        <button type="button" onClick={() => setCultureFacilityPage(previous => Math.min(cultureFacilityPageCount - 1, previous + 1))} disabled={safeCultureFacilityPage >= cultureFacilityPageCount - 1} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">다음</button>
                      </div>
                    </div>
                    </>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
                        <p className="text-sm font-extrabold text-slate-700">선택한 유형의 문화시설이 없습니다.</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">도서관 마커는 지도에 계속 표시됩니다.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                  <p className="text-sm font-extrabold text-slate-700">표시할 문화시설이 없습니다.</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {districtData?.cultureAndEducation?.cultureFacilitySourceStatus === 'missing_key'
                      ? '서버의 카카오 REST API 키 설정을 확인해 주세요.'
                      : '카카오맵 장소검색 결과가 없거나 일시적으로 불러오지 못했습니다.'}
                  </p>
                </div>
              )}
            </section>
            </section>
            )}

            {/* 교육 인프라 분석 */}
            {cultureEducationSubTab === 'education' && (
            <section id="culture-education-panel-education" role="tabpanel" aria-labelledby="culture-education-tab-education" className="order-[70] space-y-4 overflow-hidden rounded-[1.75rem] border border-indigo-200/80 bg-indigo-50/45 p-3 shadow-sm sm:p-4">
              <header className="-mx-3 -mt-3 border-b border-indigo-700/25 bg-indigo-600 p-4 text-white shadow-sm sm:-mx-4 sm:-mt-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/15 text-sm font-black text-white">03</span>
                <div>
                  <h3 id="education-group-title" className="flex items-center gap-2 text-base font-black text-white">
                    <GraduationCap size={18} className="text-white" /> 교육 환경
                  </h3>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-white/80">학교 분포와 도서관 연계 가능성을 확인하는 영역</p>
                </div>
              </div>
              </header>

            <MetricInterpretationPanel
              packet={generatedInterpretations?.education}
              tone="indigo"
              loading={llmLoading}
              error={llmError}
              variant="strip"
              pendingTitle="교육 인프라 해석"
              staleSnapshot={isSectionSnapshotStale('education')}
              summaryText={getReportCoreInterpretation(4)}
            />

            <div className="grid grid-cols-1 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="relative -mx-4 -mt-4 mb-5 overflow-hidden rounded-t-2xl border-b border-indigo-200 bg-gradient-to-r from-indigo-100 via-violet-50 to-blue-50 px-4 py-5 sm:-mx-6 sm:-mt-6 sm:px-6 sm:py-6 lg:flex lg:items-center lg:justify-between lg:gap-4">
                    <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-indigo-200/35" aria-hidden="true" />
                    <div className="relative flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm" aria-hidden="true">
                        <School size={21} />
                      </span>
                      <div>
                        <h4 className="text-lg font-extrabold text-indigo-950">교육기관 인프라</h4>
                        <p className="mt-1 text-xs font-semibold text-indigo-900/65">학교급을 선택하면 해당 자치구 내 학교명과 주소를 목록으로 확인합니다.</p>
                      </div>
                    </div>
                    <span className="relative mt-3 inline-flex rounded-full border border-indigo-200 bg-white/75 px-3 py-2 text-[10px] font-semibold text-indigo-700 lg:mt-0 lg:max-w-sm lg:text-right">
                      출처: 서울 열린데이터광장(나이스 학교 정보 및 대학 전문대학 DB API)
                    </span>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                      <div className="shrink-0 lg:w-36">
                        <p className="text-xs font-extrabold text-slate-800">학교급 지도 필터</p>
                        <p className="mt-1 text-[10px] font-semibold text-slate-500">지도·목록 함께 변경</p>
                      </div>
                      <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="학교급 선택">
                        {educationCategories.map(category => {
                          const isActive = activeEducationCategory.key === category.key;
                          const markerColor = educationMarkerColors[category.key] || '#475569';
                          return (
                            <button
                              key={category.key}
                              type="button"
                              aria-pressed={isActive}
                              onClick={() => {
                                setEducationCategory(category.key);
                                setEducationPage(0);
                              }}
                              className={`flex min-h-14 items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                                isActive
                                  ? `${category.active} shadow-sm ring-2 ring-white`
                                  : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm'
                              }`}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white bg-white shadow-sm" aria-hidden="true">
                                  <GraduationCap size={17} style={{ color: markerColor }} />
                                </span>
                                <span className="truncate text-xs font-extrabold">{category.label}</span>
                              </span>
                              <span className="shrink-0 text-base font-black tabular-nums">{category.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-slate-900">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                      <div>
                        <p className="text-[10px] font-extrabold opacity-70">선택 교육기관</p>
                        <h5 className="text-base font-extrabold mt-1">{activeEducationCategory.label} 목록</h5>
                      </div>
                      <span className="text-xs font-extrabold">{activeEducationList.length || activeEducationCategory.count}개교</span>
                    </div>

                    {activeEducationList.length > 0 ? (
                      <div className="grid min-w-0 grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                        <section className="flex h-full min-w-0 flex-col rounded-xl border border-white/70 bg-white p-3" aria-labelledby="education-map-title">
                          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h6 id="education-map-title" className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
                                <MapPin size={16} className="text-indigo-600" />
                                {activeEducationCategory.label} 전체 위치
                              </h6>
                              <p className="mt-1 text-[10px] font-semibold text-slate-500">선택한 학교급 전체와 자치구 도서관 위치를 함께 표시합니다.</p>
                            </div>
                            <span className="text-[10px] font-extrabold text-indigo-700">학교 마커 {educationMappedCount}개 · 도서관 {educationMapLibraries.length}개</span>
                          </div>
                          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1.5" aria-label="학교급별 마커 색상">
                            {schoolTypeCategories.map(category => (
                              <span key={`education-map-legend-${category.key}`} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                                <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: educationMarkerColors[category.key] }} aria-hidden="true" />
                                {category.label}
                              </span>
                            ))}
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700">
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] ring-2 ring-white" aria-hidden="true">📚</span>
                              도서관
                            </span>
                          </div>
                          <div className="relative h-80 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 2xl:h-auto 2xl:min-h-[34rem] 2xl:flex-1">
                            <div
                              ref={educationMapContainerRef}
                              className="h-full min-h-80 w-full"
                              role="region"
                              aria-label={`${activeEducationCategory.label} 전체 위치 지도`}
                            />
                            {educationMapError && (
                              <div className="absolute inset-0 flex items-center justify-center bg-slate-50/95 p-6 text-center">
                                <div>
                                  <MapPin size={24} className="mx-auto text-slate-400" />
                                  <p className="mt-2 text-xs font-extrabold text-slate-600">지도를 표시하지 못했습니다.</p>
                                  <p className="mt-1 text-[10px] font-semibold leading-relaxed text-slate-500">{educationMapError}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </section>

                        <div className="min-w-0 space-y-3">
                          <div className="grid grid-cols-1 gap-3">
                            {pagedEducationList.map((school, index) => (
                              <button
                                key={`${school.name}-${safeEducationPage}-${index}`}
                                type="button"
                                onClick={() => setSelectedEducationSchoolKey(`${school.name}|${school.address}`)}
                                aria-pressed={selectedEducationSchoolKey === `${school.name}|${school.address}`}
                                className={`min-h-16 rounded-lg border px-3 py-2.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                                  selectedEducationSchoolKey === `${school.name}|${school.address}`
                                    ? 'border-indigo-300 bg-indigo-50 shadow-sm ring-2 ring-indigo-200'
                                    : 'border-white/70 bg-white hover:border-indigo-200 hover:bg-indigo-50/60'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-sm font-extrabold text-slate-800">{school.name || '-'}</p>
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    {educationCategory === 'all' && (
                                      <span className="rounded-full px-2 py-0.5 text-[9px] font-extrabold text-white" style={{ backgroundColor: educationMarkerColors[school.gradeKey] }}>
                                        {school.category || schoolTypeCategories.find(category => category.key === school.gradeKey)?.label}
                                      </span>
                                    )}
                                    {selectedEducationSchoolKey === `${school.name}|${school.address}` && (
                                      <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[9px] font-extrabold text-white">선택됨</span>
                                    )}
                                  </div>
                                </div>
                                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{school.address || '주소 정보 없음'}</p>
                              </button>
                            ))}
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                      </div>
                    ) : (
                      <div className="rounded-lg border border-white/70 bg-white/80 px-4 py-8 text-center">
                        <p className="text-sm font-extrabold text-slate-600">상세 학교 목록 대기</p>
                        <p className="text-xs text-slate-400 mt-1">현재 응답에는 개수만 제공됩니다. API 상세 목록이 수신되면 학교명과 주소가 표시됩니다.</p>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>
            </section>
            )}
              </>
            )}

            {/* 사회안전망 대상자 구성 분석 */}
            {districtSectionTab === 'welfare' && activeSocialSafetySection && (
              <>
              <MetricInterpretationPanel
                packet={socialSafetyAiInsight}
                tone="indigo"
                loading={llmLoading}
                error={llmError}
                className="order-[75]"
                variant="strip"
                pendingTitle="사회안전망 종합 해석"
                pendingMessage="가구·장애·외국인 구성 해석이 생성되면 이 영역에 종합 판단이 표시됩니다."
                staleSnapshot={isSectionSnapshotStale('socialSafety')}
                summaryText={getReportCoreInterpretation(5)}
              />

              <section className="order-[80] bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
                <div className={`-mx-4 -mt-4 mb-5 flex flex-col gap-3 rounded-t-2xl border-b p-4 text-white transition-colors duration-200 sm:-mx-6 sm:-mt-6 sm:p-6 lg:flex-row lg:items-start lg:justify-between ${activeSocialSafetySection.theme.header}`}>
                  <div>
                    <h4 className="flex items-center gap-2 text-lg font-extrabold text-white">
                      <Shield size={20} />사회안전망 대상자 구성 분석
                    </h4>
                  </div>
                  <span className="text-[10px] font-semibold text-white/85 lg:text-right">
                    출처: {getSocialIndicatorSourceLabel(districtData.socialIndicators)}
                  </span>
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

                <div className="mb-5">
                  <MetricInterpretationPanel
                    packet={activeSocialSafetySegmentInsight}
                    tone={activeSocialSafetySegmentTone}
                    variant="strip"
                    pendingTitle={`${activeSocialSafetySection.label} 해석`}
                    pendingMessage="선택한 대상자 구성에 대한 인사이트가 생성되면 이 영역에 표시됩니다."
                    staleSnapshot={isSectionSnapshotStale('socialSafety')}
                    showSummary={false}
                  />
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

              </section>
              </>
            )}

            </div>
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
                  <h3 className="font-extrabold text-xl text-slate-900">{libraryTargetName} 입지 요약</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    기준 위치 2km 내 행정동 중심점 기준 인구, 수급자 규모, 주변 공공기관·문화시설을 함께 확인합니다.
                  </p>
                  {libraryDataDetail.dongMatchMode === 'nearest_centroid_fallback' && (
                    <p className="mt-2 text-xs font-bold text-amber-700">
                      2km 안에 행정동 중심점이 없어 가장 가까운 행정동을 기준으로 인구·복지 지표를 제공합니다.
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <span className="text-[10px] font-extrabold text-blue-600">이용권역</span>
                  <p className="text-sm font-bold text-slate-700 mt-2">
                    기준 위치 인접 행정동의 {formatCount(activeLibraryPopulation?.total, '명')} 규모를 봅니다.
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
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">기준 위치 인접 행정동 인구</p>
                    <h3 className="text-2xl font-extrabold text-slate-800 mt-1">
                      {formatCount(activeLibraryPopulation?.total, '명')}
                    </h3>
                  </div>
                  <div className="bg-blue-50 text-blue-600 p-3 rounded-xl">
                    <Users size={24} />
                  </div>
                </div>
                <PopulationSource
                  population={activeLibraryPopulation}
                  className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-2"
                />
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between h-36">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">인접 행정동 평균 수급자수</p>
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
                  출처: {isAddressTarget ? '카카오 주소 검색 서비스' : '서울 열린데이터광장(공공도서관 현황)'}
                </div>
              </div>
            </div>

            {/* 인구 구조 분석 (2km 반경) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:col-span-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <h4 className="font-extrabold text-lg text-slate-800 flex items-center gap-2"><Users size={20} className="text-blue-600" />기준 위치 인접 행정동 인구 분포</h4>
                    <PopulationModeToggle populationMode={populationMode} onChange={setPopulationMode} />
                  </div>
                </div>
                <div className="h-80">
                  <ResponsiveEChart
                    option={getAgeChartOption(activeLibraryPopulation?.ageDistribution)} 
                    style={{ height: '100%', width: '100%' }}
                  />
                </div>
                <PopulationSource
                  population={activeLibraryPopulation}
                  className="text-[10px] text-slate-400 font-medium mt-2 text-right"
                />
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
                <PopulationSource
                  population={activeLibraryPopulation}
                  className="text-[10px] text-slate-400 font-medium mt-2 text-right"
                />
              </div>
            </div>

            {/* 지도 공간 분석 및 인프라 매핑 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:col-span-3 flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800 mb-2 flex items-center gap-2"><MapPinned size={20} className="text-blue-600" />{libraryTargetName} 주변 입지 분석</h4>
                  <p className="text-xs text-slate-400 mb-4">
                    빨간색 원: 1km 참고 범위 | 파란색 원: 2km 주변 시설·문화행사 검색 범위
                  </p>
                </div>
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2" aria-label="개별 도서관 지도 마커 범례">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-blue-700" aria-hidden="true" />📚 기준 도서관·입력 위치</span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-indigo-600" aria-hidden="true" />🏛️ 공공기관</span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-rose-600" aria-hidden="true" />🏛️ 문화시설</span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" aria-hidden="true" />🎭 주변 문화행사</span>
                </div>
                <div className="relative min-h-[450px] w-full flex-grow overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  <div
                    ref={mapContainerRef}
                    className="h-full min-h-[450px] w-full"
                    role="region"
                    aria-label={`${libraryTargetName} 주변 입지 지도`}
                  />
                  {mapError && (
                    <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center rounded-xl bg-slate-900/90 p-6 text-white">
                      <div className="bg-rose-500/20 text-rose-100 p-5 rounded-xl border border-rose-400/30 max-w-md text-center">
                        <p className="font-extrabold text-lg">지도 정보를 불러오지 못했습니다</p>
                        <p className="text-xs mt-2 text-rose-100/80">{mapError}</p>
                        <p className="text-xs mt-3 text-slate-300 leading-relaxed">
                          주변 공공기관·문화시설 목록과 행정동 정보는 계속 확인할 수 있습니다.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-3 text-right">
                  주변 시설 데이터: 카카오 Local REST API · 지도 배경: OpenStreetMap
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
                          {visiblePublicPlaces.map(place => {
                            const placeKey = getPublicPlaceKey(place);
                            const isSelected = selectedPublicPlaceKey === placeKey;
                            return (
                            <button
                              key={placeKey}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => setSelectedPublicPlaceKey(placeKey)}
                              className={`grid w-full grid-cols-1 items-center gap-2 px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-inset md:grid-cols-[120px_1fr_90px] md:gap-3 ${
                                isSelected
                                  ? place.category === '문화시설'
                                    ? 'bg-rose-50 ring-2 ring-inset ring-rose-200'
                                    : 'bg-indigo-50 ring-2 ring-inset ring-indigo-200'
                                  : 'hover:bg-slate-50/70'
                              }`}
                            >
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
                            </button>
                            );
                          })}
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
                  <h4 className="font-extrabold text-lg text-slate-800 mb-4">🏠 기준 위치 2km 이내 행정동 중심점 목록</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {libraryDataDetail.dongs.map((dong, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center text-sm font-bold text-slate-700">
                        {dong}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-4 text-right">
                  출처: 서울시 행정동 중심점 좌표 기반 거리 계산
                </div>
              </div>

              <div className="flex max-h-[430px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                  <h4 className="flex items-center gap-2 text-lg font-extrabold text-slate-800">
                    <Theater size={20} className="text-emerald-600" />
                    주변 문화행사 상세정보 (2km)
                  </h4>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">서울 열린데이터광장과 한국문화정보원 결과를 중복 제거 후 거리순으로 통합합니다.</p>
                  <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="주변 문화행사 데이터 원천 필터">
                    {[
                      { key: 'all', label: '전체' },
                      { key: 'seoul', label: '서울 열린데이터광장' },
                      { key: 'kcisa', label: '한국문화정보원' }
                    ].map(sourceOption => {
                      const isActive = nearbyEventSourceFilter === sourceOption.key;
                      return (
                        <button
                          key={sourceOption.key}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => setNearbyEventSourceFilter(sourceOption.key)}
                          className={`rounded-full border px-3 py-1.5 text-[10px] font-extrabold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                            isActive
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50'
                          }`}
                        >
                          {sourceOption.label} {nearbyEventSourceCounts[sourceOption.key]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 max-h-[250px] space-y-3 overflow-y-auto pr-2">
                    {filteredNearbyCultureEvents.length > 0 ? (
                      filteredNearbyCultureEvents.map((eventItem, index) => {
                        const eventUrl = getSafeExternalUrl(eventItem.link);
                        const isOngoing = eventItem.status === 'ongoing';
                        return (
                        <article key={`${eventItem.title}-${eventItem.startDate}-${eventItem.place}-${index}`} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-[9px] font-extrabold ${isOngoing ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                              {isOngoing ? '진행 중' : '예정'}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-extrabold text-slate-600">{eventItem.sourceLabel}</span>
                            <span className="text-[9px] font-bold text-slate-400">{eventItem.category}</span>
                          </div>
                          <p className="mt-2 text-sm font-bold text-slate-800">{eventItem.title}</p>
                          <p className="mt-1 text-xs text-slate-500">장소: {eventItem.place}</p>
                          <p className="mt-0.5 text-xs text-slate-400">📅 기간: {eventItem.startDate} ~ {eventItem.endDate}</p>
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              {typeof eventItem.distance === 'number' ? `${distanceOriginLabel}에서 ${eventItem.distance.toLocaleString()}m` : eventItem.distance}
                            </span>
                            {eventUrl && (
                              <a href={eventUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[10px] font-extrabold text-emerald-700 hover:text-emerald-900">
                                상세 보기 <ChevronRight size={12} />
                              </a>
                            )}
                          </div>
                        </article>
                        );
                      })
                    ) : (
                      <p className="py-12 text-center text-sm font-semibold text-slate-400">선택한 원천에서 확인된 주변 문화행사가 없습니다.</p>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-3 mt-3 text-right">
                  출처: 서울 열린데이터광장 · 한국문화정보원 / 좌표 간 직선거리 계산
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
          <p className="mt-2">
            문의·요청:{' '}
            <a
              href="mailto:geun9265@gmail.com"
              className="font-bold text-blue-600 underline decoration-blue-200 underline-offset-2 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              geun9265@gmail.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
