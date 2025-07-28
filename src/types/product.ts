// Product data models for Klear Karma marketplace
// These interfaces define the structure for products related to alternative modalities,
// curated and verified by existing practitioners.

import { WorkerEnv } from './env';

export interface Product {
  id: string; // Unique identifier for the product
  name: string; // Product name (e.g., "Healing Crystal Set")
  description: string; // Detailed description of the product, its benefits, and usage
  price: number; // Price in USD, with two decimal places (e.g., 49.99)
  images: string[]; // Array of image URLs for product visuals
  categories: string[]; // Categories related to alternative modalities (e.g., ["crystals", "reiki"])
  curatorPractitionerId: string; // ID of the practitioner who curated this product
  verificationStatus: 'pending' | 'verified' | 'rejected'; // Status of practitioner verification
  verifiedAt?: string; // ISO timestamp of verification
  verificationNotes?: string; // Optional notes from verifier (e.g., reasons for rejection)
  stock: number; // Available stock quantity
  modality: string; // Associated alternative modality (e.g., "Reiki", "Acupuncture")
  createdAt: string; // ISO timestamp of creation
  updatedAt: string; // ISO timestamp of last update
  isActive: boolean; // Whether the product is active and visible in the marketplace
  ratings?: {
    average: number; // Average rating (0-5)
    count: number; // Number of ratings
  };
  // Additional metadata for SEO and search optimization
  tags?: string[]; // Tags for better searchability (e.g., ["energy healing", "wellness"])
}

export interface ProductCreationData {
  name: string;
  description: string;
  price: number;
  images: string[];
  categories: string[];
  curatorPractitionerId: string;
  stock: number;
  modality: string;
  tags?: string[];
}

export interface ProductUpdateData extends Partial<ProductCreationData> {
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  verificationNotes?: string;
  isActive?: boolean;
}

export interface ProductSearchParams {
  category?: string;
  priceMin?: number;
  priceMax?: number;
  verifiedOnly?: boolean;
  modality?: string;
  page?: number;
  limit?: number;
  sortBy?: 'price' | 'rating' | 'name';
  order?: 'asc' | 'desc';
}

// KV key helpers
export function getProductKey(id: string): string {
  return `product:${id}`;
}

export function getPractitionerProductsKey(practitionerId: string): string {
  return `practitioner_products:${practitionerId}`;
}

// Example usage in worker:
// await env.PRODUCTS_KV.put(getProductKey(product.id), JSON.stringify(product));