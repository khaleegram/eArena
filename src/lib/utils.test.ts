import { describe, it, expect } from 'vitest';
import { cn, toDate } from './utils';
import { Timestamp } from 'firebase-admin/firestore';

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names correctly', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
      expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
      expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    });

    it('should handle conditional classes', () => {
      const isActive = true;
      expect(cn('base', isActive && 'active')).toBe('base active');
      expect(cn('base', !isActive && 'active')).toBe('base');
    });
  });

  describe('toDate', () => {
    it('should convert Date to Date', () => {
      const date = new Date('2024-01-01');
      expect(toDate(date)).toBe(date);
    });

    it('should convert string to Date', () => {
      const dateString = '2024-01-01T00:00:00.000Z';
      const result = toDate(dateString);
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe(dateString);
    });

    it('should convert Firestore Timestamp to Date', () => {
      const timestamp = Timestamp.fromDate(new Date('2024-01-01'));
      const result = toDate(timestamp);
      expect(result).toBeInstanceOf(Date);
    });

    it('should handle timestamp with toDate method', () => {
      const mockTimestamp = {
        toDate: () => new Date('2024-01-01'),
      };
      const result = toDate(mockTimestamp as any);
      expect(result).toBeInstanceOf(Date);
    });

    it('should return current date as fallback', () => {
      const invalid = {} as any;
      const result = toDate(invalid);
      expect(result).toBeInstanceOf(Date);
    });
  });
});
