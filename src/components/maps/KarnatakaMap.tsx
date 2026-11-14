import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { translateCategory, translateDistrict, translatePriority, translateStatus } from '../../lib/i18nHelpers.ts';
import type { Complaint } from '../../types/index.ts';

interface HotspotCluster {
  district: string;
  locality: string;
  latitude: number;
  longitude: number;
  count: number;
  criticalCount: number;
  maxPriority: number;
  topCategory: string;
}

interface KarnatakaMapProps {
  mode: 'picker' | 'hotspot';
  latitude?: number;
  longitude?: number;
  onLocationChange?: (lat: number, lng: number) => void;
  complaints?: Complaint[];
  hotspots?: HotspotCluster[];
  onSelectComplaint?: (complaint: Complaint) => void;
  heightClass?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: '#DC2626',
  High: '#EA580C',
  Medium: '#D97706',
  Low: '#0D9488',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const KarnatakaMap: React.FC<KarnatakaMapProps> = ({
  mode,
  latitude = 12.9716,
  longitude = 77.5946,
  onLocationChange,
  complaints = [],
  hotspots = [],
  onSelectComplaint,
  heightClass = 'h-80',
}) => {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const pickerMarkerRef = useRef<L.CircleMarker | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  const onSelectComplaintRef = useRef(onSelectComplaint);

  onLocationChangeRef.current = onLocationChange;
  onSelectComplaintRef.current = onSelectComplaint;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] =
      mode === 'picker' ? [latitude, longitude] : [14.2, 76.2];
    const initialZoom = mode === 'picker' ? 14 : 7;

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    if (mode === 'picker') {
      map.on('click', (e: L.LeafletMouseEvent) => {
        const lat = Number(e.latlng.lat.toFixed(5));
        const lng = Number(e.latlng.lng.toFixed(5));
        onLocationChangeRef.current?.(lat, lng);
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      pickerMarkerRef.current = null;
    };
  }, [mode]);

  // Update picker pin when coordinates change
  useEffect(() => {
    if (mode !== 'picker' || !mapRef.current || !layerGroupRef.current) return;
    const map = mapRef.current;
    const group = layerGroupRef.current;

    group.clearLayers();
    const marker = L.circleMarker([latitude, longitude], {
      radius: 10,
      color: '#0F294A',
      weight: 3,
      fillColor: '#0D9488',
      fillOpacity: 0.9,
    }).addTo(group);

    L.circle([latitude, longitude], {
      radius: 180,
      color: '#0D9488',
      weight: 1,
      fillColor: '#0D9488',
      fillOpacity: 0.12,
    }).addTo(group);

    marker.bindTooltip(
      t('map.selectedPin', { lat: latitude.toFixed(4), lng: longitude.toFixed(4) }),
      {
        direction: 'top',
      }
    );

    pickerMarkerRef.current = marker;
    map.setView([latitude, longitude], Math.max(map.getZoom(), 13), { animate: true });
  }, [mode, latitude, longitude, i18n.language, t]);

  // Update hotspot markers & cluster circles
  useEffect(() => {
    if (mode !== 'hotspot' || !mapRef.current || !layerGroupRef.current) return;
    const map = mapRef.current;
    const group = layerGroupRef.current;

    group.clearLayers();

    // Cluster rings first so individual markers remain clickable on top
    hotspots.forEach((spot) => {
      if (spot.count < 2) return;
      const ringColor = spot.criticalCount > 0 ? '#DC2626' : '#EA580C';
      L.circle([spot.latitude, spot.longitude], {
        radius: 1600 + spot.count * 650,
        color: ringColor,
        weight: 1.5,
        dashArray: '4 4',
        fillColor: ringColor,
        fillOpacity: 0.12,
      })
        .bindTooltip(
          t('map.activeComplaints', {
            locality: spot.locality,
            district: translateDistrict(t, spot.district),
            count: spot.count,
            category: translateCategory(t, spot.topCategory),
          }),
          { sticky: true }
        )
        .addTo(group);
    });

    complaints.forEach((c) => {
      const color = c.status === 'Resolved' ? '#16A34A' : PRIORITY_COLORS[c.priority_level] ?? '#2563EB';
      const radius = c.priority_level === 'Critical' ? 9 : c.priority_level === 'High' ? 8 : 6.5;

      const marker = L.circleMarker([c.latitude, c.longitude], {
        radius,
        color: '#FFFFFF',
        weight: 2,
        fillColor: color,
        fillOpacity: c.status === 'Resolved' ? 0.65 : 0.92,
      }).addTo(group);

      const popupDiv = document.createElement('div');
      popupDiv.className = 'min-w-[210px] space-y-1.5 text-slate-900';
      popupDiv.innerHTML = `
        <div style="font-size:11px;font-weight:600;color:#475569;">${escapeHtml(c.complaint_code)} · ${escapeHtml(translateDistrict(t, c.district))}</div>
        <div style="font-size:13px;font-weight:600;line-height:1.3;">${escapeHtml(c.title)}</div>
        <div style="font-size:11px;color:#334155;">${escapeHtml(translateCategory(t, c.category))}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:4px;font-size:11px;font-weight:600;">
          <span style="color:${color};">${escapeHtml(translatePriority(t, c.priority_level))} (${c.priority_score}/100)</span>
          <span style="color:#475569;">${escapeHtml(translateStatus(t, c.status))}</span>
        </div>
      `;

      if (onSelectComplaintRef.current) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = t('map.inspectComplaint');
        btn.style.cssText =
          'margin-top:6px;width:100%;padding:5px 8px;border-radius:6px;background:#0F294A;color:#fff;font-size:11px;font-weight:600;cursor:pointer;border:none;';
        btn.onclick = () => onSelectComplaintRef.current?.(c);
        popupDiv.appendChild(btn);
      }

      marker.bindPopup(popupDiv);
    });

    if (complaints.length > 0) {
      const bounds = L.latLngBounds(complaints.map((c) => [c.latitude, c.longitude] as [number, number]));
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.12), { maxZoom: 13 });
      }
    }
  }, [mode, complaints, hotspots, i18n.language, t]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div ref={containerRef} className={`w-full ${heightClass}`} />
      <div className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-md border border-slate-200 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
        {mode === 'picker' ? t('map.pickerHint') : t('map.hotspotHint')}
      </div>
    </div>
  );
};
