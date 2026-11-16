import type { EntityType } from '../types';

export const TYPE_COLORS: Record<EntityType, { fill: string; soft: string; text: string }> = {
  PERSON: { fill: '#6366f1', soft: '#eef2ff', text: '#3730a3' },
  ORG: { fill: '#0284c7', soft: '#e0f2fe', text: '#075985' },
  TECHNOLOGY: { fill: '#059669', soft: '#d1fae5', text: '#065f46' },
  PRODUCT: { fill: '#d97706', soft: '#fef3c7', text: '#92400e' },
  LOCATION: { fill: '#e11d48', soft: '#ffe4e6', text: '#9f1239' },
  OTHER: { fill: '#64748b', soft: '#f1f5f9', text: '#334155' },
};

export const TYPE_LABELS: Record<EntityType, string> = {
  PERSON: 'Person',
  ORG: 'Organization',
  TECHNOLOGY: 'Technology',
  PRODUCT: 'Product',
  LOCATION: 'Location',
  OTHER: 'Other',
};

export const relLabel = (r: string) => r.replace(/_/g, ' ');

export const CONFIDENCE_STYLES = {
  high: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  medium: 'bg-amber-100 text-amber-800 ring-amber-200',
  low: 'bg-rose-100 text-rose-800 ring-rose-200',
} as const;
