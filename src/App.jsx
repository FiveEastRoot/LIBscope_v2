import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactECharts from 'echarts-for-react';
import { 
  Building, 
  MapPin, 
  Users, 
  BookOpen, 
  Calendar, 
  Map as MapIcon, 
  GraduationCap, 
  Award,
  ChevronRight,
  Home
} from 'lucide-react';
import libraryData from '../library_dong_mapping.json';

// 서울시 25개 자치구 목록 정렬
const guList = [...new Set(libraryData.libraries.map(lib => lib.gu))].sort();

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY || '05b872ee85af3352573dc4c52b709ddd';

function App() {
  const [activeTab, setActiveTab] = useState('district'); // 'district' | 'library'
  const [selectedGu, setSelectedGu] = useState('강남구');
  const [selectedLibrary, setSelectedLibrary] = useState('');
  const [librariesInGu, setLibrariesInGu] = useState([]);
  
  // API 로딩 및 데이터 상태
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [districtData, setDistrictData] = useState(null);
  const [libraryDataDetail, setLibraryDataDetail] = useState(null);

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

      // 3. 주변 공공기관(PO3) 마커 표시
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
          content: `<div style="padding:5px;font-size:12px;color:#333;width:150px;text-align:center;"><b>${place.name}</b><br><span style="font-size:10px;color:#777;">${place.distance}m</span></div>`
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
    const categories = Object.keys(ageDistribution);
    const data = Object.values(ageDistribution);
    
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
      tooltip: { trigger: 'item' },
      legend: { bottom: '0%', left: 'center' },
      series: [
        {
          name: '성별 인구',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
          label: { show: true, formatter: '{b}\n({d}%)' },
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
    const keys = Object.keys(dataDict);
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

  const formatPopulationSourceDate = (rawDate) => {
    if (!rawDate) return null;
    return rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate;
  };

  const getPopulationSourceLabel = (population) => {
    if (!population) return '행정동 통계 (BOM 백업)';
    if (population.source === 'SPOP_LOCAL_RESD_DONG') {
      const dateText = formatPopulationSourceDate(population.referenceDate);
      return dateText
        ? `서울 열린데이터광장(행정동 생활인구 추정치, 기준일 ${dateText})`
        : '서울 열린데이터광장(행정동 생활인구 추정치)';
    }
    if (population.source === 'csv_fallback') {
      return '행정동 통계 (BOM 백업)';
    }
    return population.source;
  };

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
            
            {/* 자치구 개요 카드 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between h-36">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">구내 총 인구</p>
                    <h3 className="text-2xl font-extrabold text-slate-800 mt-1">
                      {districtData.population.total.toLocaleString()}명
                    </h3>
                  </div>
                  <div className="bg-blue-50 text-blue-600 p-3 rounded-xl">
                    <Users size={24} />
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-2">
                  출처: {getPopulationSourceLabel(districtData.population)}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between h-36">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">공공도서관 수</p>
                    <h3 className="text-2xl font-extrabold text-blue-600 mt-1">
                      {districtData.cultureAndEducation.publicLibraryCount}개관
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
                      {districtData.welfare.recipientRate.toFixed(2)}%
                    </h3>
                    <p className="text-[10px] text-rose-500 font-semibold">
                      서울 평균: {districtData.welfare.seoulAvgRecipientRate}%
                    </p>
                  </div>
                  <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl">
                    <Award size={24} />
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-2">
                  출처: 서울 열린데이터광장(기초생활수급자 현황)
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between h-36">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">당월 문화행사 수</p>
                    <h3 className="text-2xl font-extrabold text-emerald-700 mt-1">
                      {districtData.cultureAndEducation.liveCultureEventsMonth}건
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
                  <h4 className="font-extrabold text-lg text-slate-800">👥 연령대별 인구 분포 (65세 이상 강조)</h4>
                  <p className="text-xs text-slate-400 mb-4">65세 이상 연령대는 주황색으로 강조 표시됩니다.</p>
                </div>
                <div className="h-80">
                  <ReactECharts 
                    option={getAgeChartOption(districtData.population.ageDistribution)} 
                    style={{ height: '100%', width: '100%' }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-2 text-right">
                  출처: {getPopulationSourceLabel(districtData.population)}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800 mb-6">👫 성별 비율</h4>
                </div>
                <div className="h-80">
                  <ReactECharts 
                    option={getGenderChartOption(districtData.population.genderRatio)} 
                    style={{ height: '100%', width: '100%' }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-2 text-right">
                  출처: {getPopulationSourceLabel(districtData.population)}
                </div>
              </div>
            </div>

            {/* 취약계층 세부 구성 분석 */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h4 className="font-extrabold text-lg text-slate-800">🌐 사회안전망 대상자 유형 분석 (100% 누적 가구/장애/국적 구성)</h4>
                <span className="text-[10px] text-slate-400 font-medium">출처: 서울시 자치구 통계 (BOM 백업)</span>
              </div>
              
              <div className="space-y-8">
                <div>
                  <h5 className="text-sm font-bold text-slate-500 mb-2">🏠 가구 형태 비율</h5>
                  <div className="h-28">
                    <ReactECharts option={getStackedBarOption('가구', districtData.socialIndicators.householdTypes)} style={{ height: '100%' }} />
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-bold text-slate-500 mb-2">♿ 장애인 유형 구성</h5>
                  <div className="h-28">
                    <ReactECharts option={getStackedBarOption('장애', districtData.socialIndicators.disability)} style={{ height: '100%' }} />
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-bold text-slate-500 mb-2">🌍 다문화 국적 비율 (상위 국가군)</h5>
                  <div className="h-28">
                    <ReactECharts option={getStackedBarOption('다문화', districtData.socialIndicators.multicultural)} style={{ height: '100%' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* 문화 강좌 & 교육 인프라 분석 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800 mb-4">🏫 교육기관 인프라 (초·중·고·대학교 수)</h4>
                  <div className="grid grid-cols-4 gap-4 text-center mt-6">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <GraduationCap className="mx-auto text-blue-500 mb-2" size={32} />
                      <span className="text-slate-400 text-xs font-bold">초등학교</span>
                      <p className="text-2xl font-extrabold text-slate-800 mt-1">
                        {districtData.cultureAndEducation.schools.elementary}개교
                      </p>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <GraduationCap className="mx-auto text-indigo-500 mb-2" size={32} />
                      <span className="text-slate-400 text-xs font-bold">중학교</span>
                      <p className="text-2xl font-extrabold text-slate-800 mt-1">
                        {districtData.cultureAndEducation.schools.middle}개교
                      </p>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <GraduationCap className="mx-auto text-purple-500 mb-2" size={32} />
                      <span className="text-slate-400 text-xs font-bold">고등학교</span>
                      <p className="text-2xl font-extrabold text-slate-800 mt-1">
                        {districtData.cultureAndEducation.schools.high}개교
                      </p>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <GraduationCap className="mx-auto text-rose-500 mb-2" size={32} />
                      <span className="text-slate-400 text-xs font-bold">대학교</span>
                      <p className="text-2xl font-extrabold text-slate-800 mt-1">
                        {districtData.cultureAndEducation.schools.university || 0}개교
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-4 text-right">
                  출처: 서울 열린데이터광장(나이스 학교 정보 및 대학 전문대학 DB API)
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800 mb-4">🎨 문화 활동 및 운영 관심도 지표</h4>
                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center space-x-3">
                      <div className="text-indigo-600 bg-indigo-50 p-2 rounded-lg"><BookOpen size={20} /></div>
                      <div>
                        <p className="text-slate-400 text-xs font-bold">1만명당 강좌비율</p>
                        <p className="font-extrabold text-lg text-slate-800">{districtData.cultureAndEducation.lectureRate.toFixed(1)}회</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center space-x-3">
                      <div className="text-amber-600 bg-amber-50 p-2 rounded-lg"><Award size={20} /></div>
                      <div>
                        <p className="text-slate-400 text-xs font-bold">운영 관심도 점수</p>
                        <p className="font-extrabold text-lg text-slate-800">{districtData.cultureAndEducation.operationInterest.toFixed(1)}점</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center space-x-3">
                      <div className="text-emerald-600 bg-emerald-50 p-2 rounded-lg"><Users size={20} /></div>
                      <div>
                        <p className="text-slate-400 text-xs font-bold">강좌 참가자 비율</p>
                        <p className="font-extrabold text-lg text-slate-800">{districtData.cultureAndEducation.participationRate.toFixed(1)}명</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center space-x-3">
                      <div className="text-rose-600 bg-rose-50 p-2 rounded-lg"><Building size={20} /></div>
                      <div>
                        <p className="text-slate-400 text-xs font-bold">이용 관심도 점수</p>
                        <p className="font-extrabold text-lg text-slate-800">{districtData.cultureAndEducation.usageInterest.toFixed(1)}점</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-4 text-right">
                  출처: 서울시 자치구 문화 지표 (BOM 백업)
                </div>
              </div>
            </div>

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
                      {libraryDataDetail.demographics.total.toLocaleString()}명
                    </h3>
                  </div>
                  <div className="bg-blue-50 text-blue-600 p-3 rounded-xl">
                    <Users size={24} />
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-2">
                  출처: {getPopulationSourceLabel(libraryDataDetail.demographics)}
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
                  <h4 className="font-extrabold text-lg text-slate-800 mb-4">👥 도서관 반경 2km 내 인구 분포 (65세 이상 강조)</h4>
                </div>
                <div className="h-80">
                  <ReactECharts 
                    option={getAgeChartOption(libraryDataDetail.demographics.ageDistribution)} 
                    style={{ height: '100%', width: '100%' }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-2 text-right">
                  출처: {getPopulationSourceLabel(libraryDataDetail.demographics)}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800 mb-4">👫 성별 비율</h4>
                </div>
                <div className="h-80">
                  <ReactECharts 
                    option={getGenderChartOption(libraryDataDetail.demographics.genderRatio)} 
                    style={{ height: '100%', width: '100%' }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 font-medium mt-2 text-right">
                  출처: {getPopulationSourceLabel(libraryDataDetail.demographics)}
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
                    <h4 className="font-extrabold text-lg text-slate-800">🏢 주변 공공기관 정보 (2km 이내)</h4>
                  </div>
                  <div className="overflow-y-auto space-y-3 pr-2" style={{ maxHeight: '440px' }}>
                    {libraryDataDetail.infrastructure.publicPlaces && libraryDataDetail.infrastructure.publicPlaces.length > 0 ? (
                      libraryDataDetail.infrastructure.publicPlaces.map((place, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-start space-x-3">
                          <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg mt-0.5"><Building size={16} /></div>
                          <div>
                            <p className="font-bold text-sm text-slate-800">{place.name}</p>
                            <p className="text-xs text-slate-400 line-clamp-1">{place.address}</p>
                            <span className="text-[10px] bg-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded-full mt-1 inline-block">
                              {place.distance.toLocaleString()}m
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 text-sm font-semibold text-center py-20">검색된 공공기관이 없습니다.</p>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-3 mt-3 text-right">
                  출처: 카카오 Local API (공공기관 카테고리 검색)
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
