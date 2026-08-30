export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  governorate: string;
  city?: string;
  region?: string;
  placeType?: string;
  profileImageUrl?: string;
  profileImagePath?: string;
  userType: 'user';
  createdAt: string;
  updatedAt: string;
}

export interface Technician {
  phone: string; // PK
  id?: string;
  fullName: string;
  experience?: string;
  specialty?: string;
  governorate: string;
  area?: string;
  profileImageUrl?: string;
  walletBalance: number;
  totalEarnings?: number;
  todayEarnings: number;
  todayOrdersCount: number;
  lastEarningTimestamp?: string;
  rating: number;
  completedOrdersCount: number;
  isVerified?: boolean;
  userType: 'technician';
  createdAt: string;
  updatedAt: string;
  fcmToken?: string;
}

export interface ServiceRequest {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  userGovernorate: string;
  userRegion?: string;
  title: string;
  description: string;
  budget: string;
  price?: string;
  serviceType: string;
  scheduledDate?: string;
  images?: string[];
  taskImages?: string[];
  status: string;
  hasOffers: boolean;
  lastOfferTime?: string;
  technicianId?: string;
  technicianName?: string;
  acceptedPrice?: number;
  acceptedAt?: string;
  isPaid?: boolean;
  paidAt?: string;
  paymentMethod?: string;
  paidAmount?: number;
  finalPrice?: number;
  clientAccepted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Offer {
  id: string;
  requestId: string;
  technicianId: string;
  technicianName?: string;
  name?: string;
  price: number;
  rating?: number;
  reviewsCount?: number;
  experienceYears?: number;
  arrivalTime?: string;
  duration?: string;
  imagePath?: string;
  isVerified?: boolean;
  hasGreenArrivalTag?: boolean;
  warranty?: string;
  message?: string;
  provideMaterials?: boolean;
  priceIncludesMaterials?: boolean;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  createdAt: string;
  updatedAt: string;
}

export interface ChatRoom {
  id: string;
  clientId: string;
  technicianId: string;
  requestId: string;
  serviceType?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderType: 'user' | 'technician';
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  userType: 'user' | 'technician';
  title: string;
  body: string;
  type: 'request_update' | 'payment' | 'chat' | 'system' | 'promo' | 'verification';
  data: Record<string, any>;
  isRead: boolean;
  createdAt: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        phone: string;
        userType: 'user' | 'technician';
        jti: string;
      };
      requestId?: string;
    }
  }
}
