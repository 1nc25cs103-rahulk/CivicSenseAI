export * from '../../shared/types.ts';

export interface OfflineDraftComplaint {
  localId: string;
  userId?: number;
  title: string;
  description: string;
  category: string;
  district: string;
  locality: string;
  location: string;
  latitude: number;
  longitude: number;
  incident_date: string;
  contact_info: string;
  affected_citizens: number;
  imageDataUrl?: string | null;
  imageName?: string | null;
  queuedAt: string;
}

export type CitizenTab = 'dashboard' | 'submit' | 'track';
export type AdminTab = 'overview' | 'management' | 'hotspots' | 'analytics' | 'insights';
