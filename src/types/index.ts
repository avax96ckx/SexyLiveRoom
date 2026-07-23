export interface UserProfile {
  id: string;
  username: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  cover_url?: string;
  balance: number;
  is_admin: boolean;
  is_vip: boolean;
  vip_expires_at?: string;
  vip_plan?: string;
  is_business: boolean;
  blue_tick?: string;
  phone_visible: boolean;
  whatsapp?: string;
  referral_code?: string;
  referred_by?: string;
  referral_count: number;
  is_blocked: boolean;
  account_status: string;
  google_email?: string;
  created_at: string;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content?: string;
  media_url?: string;
  media_type?: string;
  read: boolean;
  deleted_by_sender: boolean;
  deleted_by_receiver: boolean;
  reply_to?: string;
  reactions: Record<string, string[]>;
  created_at: string;
  sender?: UserProfile;
  receiver?: UserProfile;
}

export interface RoomMessage {
  id: string;
  user_id: string;
  content?: string;
  media_url?: string;
  media_type?: string;
  reply_to?: string;
  reactions: Record<string, string[]>;
  is_deleted: boolean;
  created_at: string;
  user?: UserProfile;
}

export interface Notification {
  id: string;
  user_id?: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link?: string;
  action_label?: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  status: string;
  screenshot_url?: string;
  description?: string;
  admin_note?: string;
  plan_name?: string;
  created_at: string;
  converted_balance?: boolean;
  user?: UserProfile;
}

export interface ContentPost {
  sort_order?: number;
  id: string;
  type: string;
  section?: string;
  title?: string;
  description?: string;
  media_url?: string;
  media_urls?: string[];
  thumbnail_url?: string;
  price: number;
  is_free: boolean;
  region?: string;
  whatsapp?: string;
  phone?: string;
  location?: string;
  uploader_id?: string;
  box_position?: number;
  duration?: string;
  views: number;
  created_at: string;
  uploader?: UserProfile;
}

export interface VideoCategory {
  id: string;
  name: string;
  cover_url?: string;
  display_order: number;
  created_at: string;
}

export interface LiveOption {
  id: string;
  name: string;
  type: string;
  price: number;
  link?: string;
  cover_url?: string;
  whatsapp?: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface VipPlan {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  features: string[];
  is_active: boolean;
  display_order: number;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  price: number;
  type: string;
  is_active: boolean;
  display_order: number;
  image_url?: string;
  video_url?: string;
  action_link?: string;
}

export interface HomeBox {
  id: string;
  section: string;
  box_number: number;
  title?: string;
  image_url?: string;
  video_url?: string;
}

export interface AppSettings {
  [key: string]: string;
}

export interface Download {
  id: string;
  user_id: string;
  content_id?: string;
  content_url?: string;
  content_name?: string;
  content_type?: string;
  file_size: number;
  progress: number;
  status: string;
  created_at: string;
}

export interface SavedItem {
  id: string;
  user_id: string;
  content_id?: string;
  content_type?: string;
  content_url?: string;
  content_name?: string;
  thumbnail_url?: string;
  created_at: string;
}

export interface SupportMessage {
  id: string;
  user_id?: string;
  content: string;
  is_from_user: boolean;
  session_id?: string;
  created_at: string;
}

// Blue tick styles - expanded with many more colors and designs
export const BLUE_TICK_STYLES = [
  { id: 'blue',     label: 'Blue Verified',   color: '#1DA1F2' },
  { id: 'gold',     label: 'Gold VIP',        color: '#FFD700' },
  { id: 'pink',     label: 'Pink Premium',    color: '#FF1493' },
  { id: 'green',    label: 'Green Official',  color: '#00C853' },
  { id: 'purple',   label: 'Purple Elite',    color: '#9C27B0' },
  { id: 'red',      label: 'Red Star',        color: '#FF4444', gradient2: '#FF6B6B' },
  { id: 'orange',   label: 'Orange Creator',  color: '#FF6D00' },
  { id: 'silver',   label: 'Silver Verified', color: '#90A4AE', gradient2: '#E0E0E0' },
  { id: 'diamond',  label: 'Diamond Crystal', color: '#00B4D8', gradient2: '#90E0EF' },
  { id: 'rainbow',  label: 'Rainbow Special', color: '#FF0080', gradient2: '#7B2FF7' },
  { id: 'teal',     label: 'Teal Verified',   color: '#009688', gradient2: '#4DB6AC' },
  { id: 'crimson',  label: 'Crimson Elite',   color: '#B71C1C', gradient2: '#E53935' },
  { id: 'white',    label: 'White Pearl',     color: '#FFFFFF', gradient2: '#E0E0E0' },
  { id: 'black',    label: 'Black Dark',      color: '#212121', gradient2: '#424242' },
  { id: 'cyan',     label: 'Cyan Neon',       color: '#00E5FF', gradient2: '#00BCD4' },
  { id: 'lime',     label: 'Lime Fresh',      color: '#76FF03', gradient2: '#64DD17' },
  { id: 'amber',    label: 'Amber Warm',      color: '#FFAB00', gradient2: '#FF6F00' },
  { id: 'indigo',   label: 'Indigo Royal',    color: '#3949AB', gradient2: '#1A237E' },
  { id: 'rose',     label: 'Rose Elegant',    color: '#F06292', gradient2: '#E91E63' },
  { id: 'emerald',  label: 'Emerald Shine',   color: '#00E676', gradient2: '#1B5E20' },
  { id: 'sunset',   label: 'Sunset Glow',     color: '#FF6B35', gradient2: '#F7C59F' },
  { id: 'ocean',    label: 'Ocean Deep',      color: '#0277BD', gradient2: '#00ACC1' },
  { id: 'galaxy',   label: 'Galaxy Mix',      color: '#7B1FA2', gradient2: '#00BCD4' },
  { id: 'fire',     label: 'Fire Hot',        color: '#FF3D00', gradient2: '#FFD740' },
];

export const TANZANIA_REGIONS = [
  'Dar es Salaam', 'Mwanza', 'Arusha', 'Dodoma', 'Mbeya',
  'Morogoro', 'Tanga', 'Kahama', 'Tabora', 'Zanzibar',
  'Kigoma', 'Sumbawanga', 'Kasulo', 'Songea', 'Iringa',
  'Musoma', 'Shinyanga', 'Bukoba', 'Moshi', 'Lindi',
  'Mtwara', 'Singida', 'Babati', 'Njombe', 'Kilosa',
  'Bariadi', 'Geita', 'Simiyu', 'Rukwa', 'Katavi'
];
